const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
      [userId, resumeUrl, resumeText, jd_text, focus_areas, difficulty, role_type]
    );

    const sessionId = result.rows[0].id;

    const questions = await generateInterviewQuestions(jd_text, resumeText, focus_areas, difficulty, role_type);

    await pool.query(
      'UPDATE interview_sessions SET questions_asked = $1 WHERE id = $2',
      [questions, sessionId]
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

    const { session_id, answer, question_index } = req.body;
    const userId = req.user.id;

    // Get session details
    const sessionResult = await pool.query(
      'SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2',
      [session_id, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    const session = sessionResult.rows[0];
    const questions = session.questions_asked || [];
    const answers = session.answers_given || [];

    answers[question_index] = answer;
    await pool.query(
      'UPDATE interview_sessions SET answers_given = $1 WHERE id = $2',
      [answers, session_id]
    );

    if (question_index >= questions.length - 1) {
      const feedback = await generateInterviewFeedback(questions, answers, session.jd_text, session.resume_text);
      
      const score = await calculateInterviewScore(questions, answers, session.jd_text);

      await pool.query(
        `UPDATE interview_sessions 
         SET feedback = $1, score = $2, completed_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [feedback, score, session_id]
      );

      return res.json({
        message: 'Interview completed!',
        completed: true,
        feedback: feedback,
        score: score,
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

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, jd_text, difficulty, role_type, score, created_at, completed_at,
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
    const prompt = `Generate 5-8 interview questions for a ${roleType || 'software developer'} position.
    
    Job Description: ${jdText}
    
    ${resumeText ? `Candidate Resume: ${resumeText}` : ''}
    
    Focus Areas: ${focusAreas.join(', ') || 'General technical and behavioral questions'}
    Difficulty Level: ${difficulty}
    
    Generate a mix of:
    - Technical questions relevant to the role
    - Behavioral questions (STAR method)
    - Problem-solving scenarios
    - Role-specific challenges
    
    Return only the questions as a JSON array of strings.`;

    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0]) {
      const text = response.data.candidates[0].content.parts[0].text;
      try {
        return JSON.parse(text);
      } catch {
        return text.split('\n').filter(q => q.trim().length > 0);
      }
    } else {
      throw new Error('Invalid response from Gemini API');
    }
  } catch (error) {
    console.error('Generate questions error:', error);
    return [
      "Tell me about yourself and your experience relevant to this role.",
      "What interests you most about this position?",
      "Describe a challenging project you worked on and how you overcame obstacles.",
      "How do you stay updated with the latest technologies in your field?",
      "Where do you see yourself in 5 years?"
    ];
  }
};

const generateInterviewFeedback = async (questions, answers, jdText, resumeText) => {
  try {
    const prompt = `Provide detailed feedback for this mock interview:

    Job Description: ${jdText}
    
    ${resumeText ? `Candidate Resume: ${resumeText}` : ''}
    
    Questions and Answers:
    ${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || 'No answer provided'}`).join('\n\n')}
    
    Provide feedback covering:
    1. Overall performance assessment
    2. Strengths demonstrated
    3. Areas for improvement
    4. Specific suggestions for each answer
    5. Recommendations for interview preparation
    6. Technical knowledge evaluation
    7. Communication skills assessment
    
    Be constructive, specific, and actionable.`;

    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0]) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response from Gemini API');
    }
  } catch (error) {
    console.error('Generate feedback error:', error);
    return "Thank you for completing the interview! We'll review your responses and provide detailed feedback shortly.";
  }
};

const calculateInterviewScore = async (questions, answers, jdText) => {
  try {
    const prompt = `Rate this interview performance on a scale of 1-100:

    Job Description: ${jdText}
    
    Questions and Answers:
    ${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] || 'No answer provided'}`).join('\n\n')}
    
    Consider:
    - Relevance of answers to questions
    - Technical accuracy
    - Communication clarity
    - Problem-solving approach
    - Professional presentation
    
    Return only a number between 1-100.`;

    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 10,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0]) {
      const text = response.data.candidates[0].content.parts[0].text;
      const score = parseInt(text.match(/\d+/)?.[0] || '75');
      return Math.max(1, Math.min(100, score));
    } else {
      return 75;
    }
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