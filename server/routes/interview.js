const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const sanitizeQuestionString = (s) =>
  String(s)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();

const isQuestionJunk = (t) => {
  const x = sanitizeQuestionString(t);
  if (!x) return true;
  if (/^```/.test(x)) return true;
  if (/^[\[{}\]]$/.test(x)) return true;
  return false;
};

/** Gemini often wraps JSON in ```json fences; never use newline-split on that output */
const parseQuestionsFromModelText = (text) => {
  if (!text || !String(text).trim()) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, '');
  s = s.replace(/\r?\n?```\s*$/i, '');
  s = s.replace(/^```\s*\r?\n?/i, '');
  s = s.trim();
  const tryArray = (arr) => {
    if (!Array.isArray(arr)) return null;
    const out = arr
      .map((q) =>
        String(q)
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/g, '')
          .trim()
      )
      .filter((q) => q.length > 0 && !/^```/.test(q) && q !== '[' && q !== ']' && q !== '{' && q !== '}');
    return out.length ? out : null;
  };
  try {
    const parsed = JSON.parse(s);
    const got = tryArray(parsed);
    if (got) return got;
  } catch {
    /* try substring between [ ] */
  }
  const bracket = s.match(/\[[\s\S]*\]/);
  if (bracket) {
    try {
      const parsed = JSON.parse(bracket[0]);
      const got = tryArray(parsed);
      if (got) return got;
    } catch {
      /* ignore */
    }
  }
  return null;
};

const DEFAULT_INTERVIEW_QUESTIONS = [
  'Tell me about yourself and your experience relevant to this role.',
  'What interests you most about this position?',
  'Describe a challenging project you worked on and how you overcame obstacles.',
  'How do you stay updated with the latest technologies in your field?',
  'Where do you see yourself in 5 years?'
];

/** TEXT columns must use explicit JSON; raw JS arrays round-trip inconsistently in pg */
const normalizeQuestionsFromDb = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((q) => sanitizeQuestionString(q)).filter((q) => q && !isQuestionJunk(q));
  }
  if (typeof raw === 'string') {
    const fromModel = parseQuestionsFromModelText(raw);
    if (fromModel && fromModel.length) return fromModel;
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return [];
    }
    return trimmed
      .split('\n')
      .map((l) => l.replace(/^[\d.)\-*]+\s*/, '').trim())
      .filter((l) => l && !isQuestionJunk(l));
  }
  return [];
};

const answersFromDb = (raw, minLength) => {
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw.map((a) => (a == null || a === '' ? null : String(a)));
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        arr = parsed.map((a) => (a == null || a === '' ? null : String(a)));
      }
    } catch {
      arr = [];
    }
  }
  while (arr.length < minLength) arr.push(null);
  return arr;
};

const stringifyAnswersForDb = (answers) => JSON.stringify(answers);

const sanitizeInterviewScore = (n) => {
  const x = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return 75;
  return Math.max(1, Math.min(100, Math.round(x)));
};

const getGeminiGenerateContentUrl = () => {
  const configured = process.env.GEMINI_API_URL;
  if (configured) {
    return configured.split('?')[0];
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let interviewGenaiClient = null;
const getInterviewGenAI = () => {
  if (!GEMINI_API_KEY) return null;
  if (!interviewGenaiClient) {
    interviewGenaiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return interviewGenaiClient;
};

const geminiGenerateTextRest = async (prompt, generationConfig) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const response = await axios.post(
    `${getGeminiGenerateContentUrl()}?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: generationConfig || {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 90000 }
  );
  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !String(text).trim()) {
    throw new Error('Invalid or empty REST Gemini response');
  }
  return String(text).trim();
};

/** Prefer @google/genai (same as chat); fall back to REST if SDK fails */
const geminiGenerateText = async (prompt, generationConfig = {}) => {
  const cfg = {
    temperature: generationConfig.temperature ?? 0.7,
    topK: generationConfig.topK ?? 40,
    topP: generationConfig.topP ?? 0.95,
    maxOutputTokens: generationConfig.maxOutputTokens ?? 2048
  };
  const ai = getInterviewGenAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: cfg
      });
      const text = response.text && String(response.text).trim();
      if (text) return text;
    } catch (e) {
      console.error('Interview Gemini SDK error:', e.message);
    }
  }
  return geminiGenerateTextRest(prompt, cfg);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/resumes';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'));
    }
  }
});

router.post('/start', [
  authenticateToken,
  upload.single('resume'),
  body('jd_text').trim().notEmpty().withMessage('Job description is required'),
  body('focus_areas').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    }
    return Array.isArray(value);
  }).withMessage('Focus areas must be an array'),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty level'),
  body('role_type').optional().isString().withMessage('Role type must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { jd_text, focus_areas_raw = [], difficulty = 'intermediate', role_type } = req.body;
    const userId = req.user.id;
    
    let focus_areas = focus_areas_raw;
    if (typeof focus_areas_raw === 'string') {
      try {
        focus_areas = JSON.parse(focus_areas_raw);
      } catch (error) {
        focus_areas = [];
      }
    }
    
    let resumeText = '';
    let resumeUrl = '';

    if (req.file) {
      resumeUrl = `/uploads/resumes/${req.file.filename}`;
      resumeText = await extractTextFromFile(req.file.path, req.file.originalname);
    }

    const result = await pool.query(
      `INSERT INTO interview_sessions 
       (user_id, resume_url, resume_text, jd_text, focus_areas, difficulty, role_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id`,
      [
        userId,
        resumeUrl,
        resumeText,
        jd_text,
        JSON.stringify(Array.isArray(focus_areas) ? focus_areas : []),
        difficulty,
        role_type
      ]
    );

    const sessionId = result.rows[0].id;

    const questions = await generateInterviewQuestions(jd_text, resumeText, focus_areas, difficulty, role_type);

    await pool.query(
      'UPDATE interview_sessions SET questions_asked = $1 WHERE id = $2',
      [JSON.stringify(questions), sessionId]
    );

    res.json({
      message: 'Interview session started successfully',
      session_id: sessionId,
      questions: questions,
      instructions: {
        total_questions: questions.length,
        difficulty: difficulty,
        estimated_duration: `${questions.length * 3}-${questions.length * 5} minutes`
      }
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ 
      message: 'Failed to start interview session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.post('/answer', [
  authenticateToken,
  body('session_id').isInt().withMessage('Valid session ID required'),
  body('answer').trim().notEmpty().withMessage('Answer is required'),
  body('question_index').isInt().withMessage('Question index required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const session_id = parseInt(req.body.session_id, 10);
    const question_index = parseInt(req.body.question_index, 10);
    const answer = String(req.body.answer).trim();
    const userId = req.user.id;

    const sessionResult = await pool.query(
      'SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2',
      [session_id, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    const session = sessionResult.rows[0];
    const questions = normalizeQuestionsFromDb(session.questions_asked);
    if (!questions.length) {
      return res.status(400).json({ message: 'Interview has no questions' });
    }
    if (question_index < 0 || question_index >= questions.length) {
      return res.status(400).json({ message: 'Invalid question index' });
    }

    const answers = answersFromDb(session.answers_given, questions.length);
    answers[question_index] = answer;
    await pool.query(
      'UPDATE interview_sessions SET answers_given = $1 WHERE id = $2',
      [stringifyAnswersForDb(answers), session_id]
    );

    if (question_index >= questions.length - 1) {
      const feedback = await generateInterviewFeedback(questions, answers);

      const score = await calculateInterviewScore(questions, answers);

      const safeScore = sanitizeInterviewScore(score);
      await pool.query(
        `UPDATE interview_sessions 
         SET feedback = $1, score = $2, completed_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [feedback, safeScore, session_id]
      );

      return res.json({
        message: 'Interview completed!',
        completed: true,
        feedback: feedback,
        score: safeScore,
        next_question: null
      });
    }

    const nextQuestion = questions[question_index + 1];
    res.json({
      message: 'Answer recorded successfully',
      completed: false,
      next_question: nextQuestion,
      progress: {
        current: question_index + 1,
        total: questions.length,
        percentage: Math.round(((question_index + 1) / questions.length) * 100)
      }
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ message: 'Failed to submit answer' });
  }
});

router.post('/finish-early', [
  authenticateToken,
  body('session_id').isInt().withMessage('Valid session ID required'),
  body('question_index').isInt({ min: 0 }).withMessage('Valid question index required'),
  body('current_answer').optional({ values: 'falsy' }).isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const session_id = parseInt(req.body.session_id, 10);
    const question_index = parseInt(req.body.question_index, 10);
    const current_answer = req.body.current_answer;
    const userId = req.user.id;

    if (!Number.isFinite(session_id) || !Number.isFinite(question_index)) {
      return res.status(400).json({ message: 'Invalid session or question id' });
    }

    const r = await pool.query(
      'SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2',
      [session_id, userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    const session = r.rows[0];
    const questions = normalizeQuestionsFromDb(session.questions_asked);
    if (!questions.length) {
      return res.status(400).json({ message: 'Session has no questions' });
    }

    let answers = answersFromDb(session.answers_given, questions.length);
    const qIdx = parseInt(question_index, 10);
    const trimmed = current_answer && String(current_answer).trim();
    if (trimmed && qIdx >= 0 && qIdx < questions.length) {
      answers[qIdx] = trimmed;
    }

    for (let i = 0; i < questions.length; i++) {
      if (answers[i] == null || String(answers[i]).trim() === '') {
        answers[i] = '[Interview ended early — no answer]';
      }
    }

    await pool.query('UPDATE interview_sessions SET answers_given = $1 WHERE id = $2', [
      stringifyAnswersForDb(answers),
      session_id
    ]);

    const feedback = await generateInterviewFeedback(questions, answers);
    const score = sanitizeInterviewScore(await calculateInterviewScore(questions, answers));

    await pool.query(
      `UPDATE interview_sessions 
       SET feedback = $1, score = $2, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [feedback, score, session_id]
    );

    return res.json({
      message: 'Interview ended — feedback generated',
      completed: true,
      feedback,
      score
    });
  } catch (error) {
    console.error('Finish early error:', error);
    res.status(500).json({
      message: 'Failed to complete interview',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/** If last answer is saved but completed_at was not set (legacy bad rows), close the session */
router.post('/finalize', [
  authenticateToken,
  body('session_id').isInt().withMessage('Valid session ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const session_id = parseInt(req.body.session_id, 10);
    const userId = req.user.id;

    const sessionResult = await pool.query(
      'SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2',
      [session_id, userId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    const session = sessionResult.rows[0];
    if (session.completed_at) {
      return res.json({
        completed: true,
        feedback: session.feedback,
        score: session.score
      });
    }

    const questions = normalizeQuestionsFromDb(session.questions_asked);
    const answers = answersFromDb(session.answers_given, questions.length);
    const lastIdx = questions.length - 1;
    if (lastIdx < 0) {
      return res.status(400).json({ message: 'No questions in session' });
    }

    const lastAns = answers[lastIdx];
    if (lastAns == null || !String(lastAns).trim()) {
      return res.status(400).json({ message: 'Final question has no answer saved yet' });
    }

    const feedback = await generateInterviewFeedback(questions, answers);
    const score = sanitizeInterviewScore(await calculateInterviewScore(questions, answers));

    await pool.query(
      `UPDATE interview_sessions 
       SET feedback = $1, score = $2, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [feedback, score, session_id]
    );

    return res.json({
      completed: true,
      feedback,
      score
    });
  } catch (error) {
    console.error('Finalize session error:', error);
    res.status(500).json({
      message: 'Failed to finalize interview',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, jd_text, difficulty, role_type, score, feedback, created_at, completed_at,
              CASE WHEN completed_at IS NOT NULL THEN true ELSE false END as is_completed
       FROM interview_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1',
      [userId]
    );

    res.json({
      sessions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].count),
        pages: Math.ceil(totalResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Interview history error:', error);
    res.status(500).json({ message: 'Failed to fetch interview history' });
  }
});

router.get('/session/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM interview_sessions 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    const session = result.rows[0];
    res.json({
      session: {
        id: session.id,
        jd_text: session.jd_text,
        difficulty: session.difficulty,
        role_type: session.role_type,
        questions_asked: session.questions_asked,
        answers_given: session.answers_given,
        feedback: session.feedback,
        score: session.score,
        created_at: session.created_at,
        completed_at: session.completed_at,
        is_completed: session.completed_at !== null
      }
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ message: 'Failed to fetch interview session' });
  }
});

const extractTextFromFile = async (filePath, originalName) => {
  try {
    const ext = path.extname(originalName).toLowerCase();
    
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error('Failed to extract text from file');
  }
};

const generateInterviewQuestions = async (jdText, resumeText, focusAreas, difficulty, roleType) => {
  try {
    const areas = Array.isArray(focusAreas) ? focusAreas : [];
    const prompt = `Generate 5-8 interview questions for a ${roleType || 'software developer'} position.
    
    Job Description: ${jdText}
    
    ${resumeText ? `Candidate Resume: ${resumeText}` : ''}
    
    Focus Areas: ${areas.length ? areas.join(', ') : 'General technical and behavioral questions'}
    Difficulty Level: ${difficulty}
    
    Generate a mix of:
    - Technical questions relevant to the role
    - Behavioral questions (STAR method)
    - Problem-solving scenarios
    - Role-specific challenges
    
    Return only a JSON array of strings, with no markdown code fences or extra text.`;

    const text = await geminiGenerateText(prompt, {
      temperature: 0.8,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048
    });
    const parsed = parseQuestionsFromModelText(text);
    if (parsed && parsed.length) {
      return parsed;
    }
    console.warn('Interview questions: could not parse model output, using defaults');
    return [...DEFAULT_INTERVIEW_QUESTIONS];
  } catch (error) {
    console.error('Generate questions error:', error);
    return [...DEFAULT_INTERVIEW_QUESTIONS];
  }
};

const generateInterviewFeedback = async (questions, answers) => {
  try {
    const qaBlock = questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || 'No answer provided'}`)
      .join('\n\n');

    const prompt = `You are reviewing a mock interview. Base your feedback ONLY on the candidate's answers below (paired with each question).

Rules:
- Do NOT use, infer, or compare against any resume, CV, portfolio, or external profile.
- Do NOT score or judge the candidate on background, employers, or credentials not stated in the answers.
- Evaluate only clarity, relevance to the question, depth, structure, and communication in what they actually wrote or said.

Questions and answers:
${qaBlock}

Provide feedback covering:
1. Overall performance (from answers only)
2. Strengths visible in the answers
3. Areas for improvement
4. Specific suggestions per answer
5. How to prepare for similar questions (general tips)
6. Technical depth as shown in the answers (do not assume unstated expertise)
7. Communication quality in the answers

Be constructive, specific, and actionable.`;

    return await geminiGenerateText(prompt, {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048
    });
  } catch (error) {
    console.error('Generate feedback error:', error);
    return "Thank you for completing the interview! We'll review your responses and provide detailed feedback shortly.";
  }
};

const calculateInterviewScore = async (questions, answers) => {
  try {
    const qaBlock = questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || 'No answer provided'}`)
      .join('\n\n');

    const prompt = `Assign a single overall score from 1 to 100 for this mock interview.

Rules:
- Score ONLY from the quality of the answers below (vs the questions asked).
- Do NOT use resume, CV, job description, or any document outside this Q&A.
- Do not reward or penalize based on assumed background; judge only what appears in the answers.

Questions and answers:
${qaBlock}

Consider: relevance to each question, clarity, depth, structure, and reasoning in the text of the answers only.

Reply with one integer from 1 to 100 and nothing else.`;

    const text = await geminiGenerateText(prompt, {
      temperature: 0.3,
      topK: 20,
      topP: 0.8,
      maxOutputTokens: 32
    });
    const score = parseInt(String(text).match(/\d+/)?.[0] || '75', 10);
    return Math.max(1, Math.min(100, score));
  } catch (error) {
    console.error('Calculate score error:', error);
    return 75;
  }
};

router.post('/save-voice-session', authenticateToken, async (req, res) => {
  try {
    const { transcription, metrics, sessionId } = req.body;
    const userId = req.user.id;

    console.log('💾 Saving voice interview session:', sessionId);

    const sessionResult = await pool.query(
      `INSERT INTO interview_sessions 
       (user_id, voice_mode, session_id, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id, session_id`,
      [userId, true, sessionId]
    );

    const sessionDbId = sessionResult.rows[0].id;

    const transcriptionJson = JSON.stringify(transcription);
    const metricsJson = JSON.stringify(metrics);

    await pool.query(
      `INSERT INTO voice_interview_sessions 
       (session_db_id, user_id, transcription, metrics, duration, questions_count, answers_count) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionDbId,
        userId,
        transcriptionJson,
        metricsJson,
        metrics.totalDuration || 0,
        metrics.questionsAsked || 0,
        metrics.answersGiven || 0
      ]
    );

    console.log('✅ Voice interview session saved successfully');

    res.json({
      message: 'Interview session saved successfully',
      sessionId: sessionId,
      dbSessionId: sessionDbId,
      metrics: metrics
    });
  } catch (error) {
    console.error('❌ Error saving voice interview session:', error);
    res.status(500).json({
      message: 'Failed to save interview session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.get('/voice-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT id, session_id, transcription, metrics, duration, questions_count, answers_count, created_at
       FROM voice_interview_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM voice_interview_sessions WHERE user_id = $1',
      [userId]
    );

    res.json({
      sessions: result.rows.map(row => ({
        ...row,
        transcription: JSON.parse(row.transcription),
        metrics: JSON.parse(row.metrics)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].count),
        pages: Math.ceil(totalResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching voice interview history:', error);
    res.status(500).json({ message: 'Failed to fetch voice interview history' });
  }
});

module.exports = router;