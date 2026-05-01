import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  DocumentArrowUpIcon,
  BriefcaseIcon,
  ClockIcon,
  StarIcon,
  MicrophoneIcon,
  StopIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const sanitizeQuestionText = (s) =>
  String(s)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim();

const isJunkLine = (t) => {
  const x = sanitizeQuestionText(t);
  if (!x) return true;
  if (/^```/.test(x)) return true;
  if (/^[\[{}\]]$/.test(x)) return true;
  return false;
};

/** Parse Gemini-style JSON array; never split raw text by newlines (produces ```json lines). */
const parseQuestionsString = (raw) => {
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*\r?\n?/i, '');
  s = s.replace(/\r?\n?```\s*$/i, '');
  s = s.trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map(sanitizeQuestionText).filter((q) => q && !isJunkLine(q));
    }
  } catch {
    /* bracket slice */
  }
  const m = s.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        return parsed.map(sanitizeQuestionText).filter((q) => q && !isJunkLine(q));
      }
    } catch {
      /* ignore */
    }
  }
  return [];
};

/** API may return an array or a JSON/markdown string */
const normalizeInterviewQuestions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    let mapped = raw.map((q) => sanitizeQuestionText(q)).filter((q) => q && !isJunkLine(q));
    if (mapped.length === 1 && /[\[`]/.test(mapped[0])) {
      const inner = parseQuestionsString(mapped[0]);
      if (inner.length) return inner;
    }
    return mapped;
  }
  if (typeof raw === 'string') {
    const fromJson = parseQuestionsString(raw);
    if (fromJson.length) return fromJson;
  }
  return [];
};

const INTERVIEW_DRAFT_KEY = 'jarvice_interview_draft_v1';

const clearInterviewDraft = () => {
  try {
    sessionStorage.removeItem(INTERVIEW_DRAFT_KEY);
  } catch {
    /* ignore */
  }
};

const formatApiError = (err) => {
  const data = err?.response?.data;
  if (data?.errors?.length) {
    return data.errors.map((e) => e.msg || e.message || String(e)).join('. ');
  }
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.detail === 'string') return data.detail;
  return err?.message || 'Request failed';
};

const Interview = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(1); 
  const [formData, setFormData] = useState({
    resume: null,
    jd_text: '',
    focus_areas: [],
    difficulty: 'intermediate',
    role_type: ''
  });
  const [interviewData, setInterviewData] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingEarly, setIsEndingEarly] = useState(false);
  
  // Voice-related states
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [resumeText, setResumeText] = useState('');
  
  // Gemini Live API refs
  const sessionPromiseRef = useRef(null);
  const inputAudioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);
  const audioSources = useRef(new Set());
  const nextStartTime = useRef(0);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);


  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setVoiceTranscript(transcript);
        setCurrentAnswer(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast.error('Speech recognition error. Please try again.');
      };
    }

    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INTERVIEW_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft?.session_id || !draft?.interviewData?.questions?.length) return;
      const resume = window.confirm(
        'You have a mock interview in progress. Resume where you left off?'
      );
      if (resume) {
        const qLen = draft.interviewData.questions.length;
        const idx = Number.isFinite(draft.currentQuestion) ? draft.currentQuestion : 0;
        setInterviewData(draft.interviewData);
        setCurrentQuestion(Math.max(0, Math.min(idx, qLen - 1)));
        setAnswers(Array.isArray(draft.answers) ? draft.answers : []);
        setStep(2);
        toast.success('Interview restored from your last session');
      } else {
        clearInterviewDraft();
      }
    } catch {
      clearInterviewDraft();
    }
  }, []);

  useEffect(() => {
    if (step !== 2 || !interviewData?.session_id) return;
    try {
      sessionStorage.setItem(
        INTERVIEW_DRAFT_KEY,
        JSON.stringify({
          session_id: interviewData.session_id,
          interviewData,
          currentQuestion,
          answers
        })
      );
    } catch {
      /* ignore */
    }
  }, [step, interviewData, currentQuestion, answers]);

  // Speak text using speech synthesis
  const speakText = (text) => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel(); // Stop any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);

        if (isVoiceMode) {
          setTimeout(() => {
            startListening();
          }, 500);
        }
      };
      utterance.onerror = () => setIsSpeaking(false);
      
      synthesisRef.current.speak(utterance);
    }
  };

  // Start listening for user speech
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setVoiceTranscript('');
      setCurrentAnswer('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const focusAreaOptions = [
    'Technical Skills',
    'Problem Solving',
    'Communication',
    'Leadership',
    'Teamwork',
    'Project Management',
    'Analytical Thinking',
    'Creativity',
    'Time Management',
    'Adaptability'
  ];

  const difficultyOptions = [
    { value: 'beginner', label: 'Beginner', description: 'Entry-level questions' },
    { value: 'intermediate', label: 'Intermediate', description: 'Mid-level questions' },
    { value: 'advanced', label: 'Advanced', description: 'Senior-level questions' }
  ];

  // Extract text from resume file
  const extractResumeText = async (file) => {
    try {
      if (file.type === 'text/plain') {
        const text = await file.text();
        return text;
      } else if (file.type === 'application/pdf') {
        // For PDF, we'll send it to backend for extraction
        return '[PDF file - will be processed by backend]';
      } else if (file.type.includes('wordprocessingml') || file.type === 'application/msword') {
        // For DOCX/DOC, we'll send it to backend for extraction
        return '[Word document - will be processed by backend]';
      }
      return '';
    } catch (error) {
      console.error('Error extracting resume text:', error);
      return '';
    }
  };

  const onDrop = async (acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      const error = rejectedFiles[0].errors[0];
      if (error.code === 'file-too-large') {
        toast.error('File is too large. Maximum size is 10MB.');
      } else if (error.code === 'file-invalid-type') {
        toast.error('Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.');
      } else {
        toast.error('File upload failed. Please try again.');
      }
      return;
    }
    
    const file = acceptedFiles[0];
    if (file) {
      setFormData(prev => ({ ...prev, resume: file }));
      
      // Extract text from resume
      const text = await extractResumeText(file);
      setResumeText(text);
      
      toast.success(`Resume uploaded: ${file.name}`);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    noClick: false, // Allow clicking to open file dialog
    noKeyboard: false // Allow keyboard navigation
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFocusAreaToggle = (area) => {
    setFormData(prev => ({
      ...prev,
      focus_areas: prev.focus_areas.includes(area)
        ? prev.focus_areas.filter(a => a !== area)
        : [...prev.focus_areas, area]
    }));
  };

  // Gemini Live API helper functions
  const encode = (bytes) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decode = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (data, ctx, sampleRate, numChannels) => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const cleanupGeminiSession = () => {
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current
        .then(session => session.close())
        .catch(e => console.error('Error closing session:', e));
      sessionPromiseRef.current = null;
    }

    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    mediaStreamRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;

    for (const source of audioSources.current.values()) {
      source.stop();
    }
    audioSources.current.clear();
    nextStartTime.current = 0;
  };

  const startGeminiLiveInterview = async (interviewData) => {
    try {
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

      if (!apiKey) {
        toast.error('Gemini API key not configured');
        return;
      }

      const ai = new GoogleGenAI({ apiKey });

      // Build system prompt with context
      const systemPrompt = `You are a professional interviewer conducting a mock interview for a ${formData.role_type || 'software engineering'} position.

Job Description:
${formData.jd_text}

${resumeText && resumeText !== '[PDF file - will be processed by backend]' && resumeText !== '[Word document - will be processed by backend]' ? `Candidate Resume:
${resumeText}` : ''}

Focus Areas: ${formData.focus_areas.length > 0 ? formData.focus_areas.join(', ') : 'General'}
Difficulty Level: ${formData.difficulty}

Guidelines:
- Ask one question at a time
- Start with a warm greeting
- Ask behavioral and technical questions relevant to the role
- Listen carefully to responses
- Ask follow-up questions when needed
- Be encouraging and professional
- After 5-7 questions, conclude the interview with feedback
- Keep responses concise and natural`;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' }
            }
          },
          systemInstruction: systemPrompt
        },
        callbacks: {
          onopen: async () => {
            try {
              inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
              });
              outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
              });

              mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(
                mediaStreamRef.current
              );
              scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

              scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.map(f => f * 32768));
                const pcmBlob = {
                  data: encode(new Uint8Array(pcmData.buffer)),
                  mimeType: 'audio/pcm;rate=16000'
                };

                if (sessionPromiseRef.current) {
                  sessionPromiseRef.current
                    .then(session => {
                      session.sendRealtimeInput({ media: pcmBlob });
                    })
                    .catch(e => console.error('Error sending audio data:', e));
                }
              };

              mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
              scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
              toast.success('Voice interview started!');
            } catch (err) {
              console.error('Error setting up audio:', err);
              toast.error('Failed to access microphone');
            }
          },

          onmessage: async (message) => {
            try {
              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscription.current += text;
              }

              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentOutputTranscription.current += text;
              }

              if (message.serverContent?.turnComplete) {
                const userInput = currentInputTranscription.current.trim();
                const modelOutput = currentOutputTranscription.current.trim();

                if (userInput) {
                  setVoiceTranscript(prev => prev + `\n\nYou: ${userInput}`);
                  setAnswers(prev => [...prev, userInput]);
                }
                if (modelOutput) {
                  setVoiceTranscript(prev => prev + `\n\nInterviewer: ${modelOutput}`);
                }

                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }

              const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (base64Audio && outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  ctx,
                  24000,
                  1
                );
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.addEventListener('ended', () => {
                  audioSources.current.delete(source);
                });
                source.start(nextStartTime.current);
                nextStartTime.current += audioBuffer.duration;
                audioSources.current.add(source);
              }
            } catch (err) {
              console.error('Error processing message:', err);
            }
          },

          onerror: (e) => {
            console.error('Session error:', e);
            toast.error('Interview session error');
            cleanupGeminiSession();
          },

          onclose: () => {
            console.log('Session closed');
            cleanupGeminiSession();
          }
        }
      });

      await sessionPromiseRef.current;
    } catch (e) {
      console.error('Failed to start Gemini interview:', e);
      toast.error(`Failed to start voice interview: ${e.message}`);
    }
  };

  const startInterview = async () => {
    if (!formData.jd_text.trim()) {
      toast.error('Please enter a job description');
      return;
    }

    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      if (formData.resume) {
        formDataToSend.append('resume', formData.resume);
      }
      formDataToSend.append('jd_text', formData.jd_text);
      formDataToSend.append('focus_areas', JSON.stringify(formData.focus_areas));
      formDataToSend.append('difficulty', formData.difficulty);
      formDataToSend.append('role_type', formData.role_type);
      formDataToSend.append('resume_text', resumeText);
      formDataToSend.append('is_voice_mode', isVoiceMode);

      const response = await axios.post('/api/interview/start', formDataToSend, {
        // Do not set Content-Type — browser adds multipart boundary for FormData
        timeout: 180000
      });

      const questions = normalizeInterviewQuestions(response.data.questions);
      if (!questions.length) {
        toast.error('No interview questions were returned. Check API config and try again.');
        return;
      }

      setInterviewData({ ...response.data, questions });

      if (isVoiceMode) {
        setStep(2);
        toast.success('Voice interview starting...');
        startGeminiLiveInterview({ ...response.data, questions });
      } else {
        setStep(2);
        toast.success('Interview started successfully!');
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      toast.error('Failed to start interview. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer');
      return;
    }

    const qLen = interviewData.questions?.length ?? 0;
    const answerText = currentAnswer.trim();

    setIsSubmitting(true);
    try {
      const response = await axios.post('/api/interview/answer', {
        session_id: Number(interviewData.session_id),
        answer: answerText,
        question_index: Number(currentQuestion)
      });

      setAnswers((prev) => {
        const next = [...prev];
        while (next.length <= currentQuestion) next.push(undefined);
        next[currentQuestion] = answerText;
        return next;
      });
      setCurrentAnswer('');
      setVoiceTranscript('');

      if (response.data.completed) {
        setInterviewData((prev) => ({
          ...prev,
          feedback: response.data.feedback,
          score: response.data.score
        }));
        setStep(3);
        clearInterviewDraft();
        toast.success('Interview completed! Check your results.');
      } else {
        const wasLastQuestion = currentQuestion >= qLen - 1;
        if (wasLastQuestion) {
          try {
            const fin = await axios.post('/api/interview/finalize', {
              session_id: Number(interviewData.session_id)
            });
            setInterviewData((prev) => ({
              ...prev,
              feedback: fin.data.feedback,
              score: fin.data.score
            }));
            setStep(3);
            clearInterviewDraft();
            toast.success('Interview completed! Check your results.');
          } catch (finalizeErr) {
            console.error(finalizeErr);
            toast.error(
              `Results could not be generated: ${formatApiError(finalizeErr)}. Try "End & get feedback".`
            );
          }
        } else {
          setCurrentQuestion((prev) => Math.min(prev + 1, qLen - 1));
          toast.success('Answer submitted! Next question.');
          if (isVoiceMode && interviewData.questions?.length) {
            const questions = interviewData.questions;
            const nextQuestionIndex = currentQuestion + 1;
            if (questions[nextQuestionIndex]) {
              setTimeout(() => {
                speakText(`Question ${nextQuestionIndex + 1}: ${questions[nextQuestionIndex]}`);
              }, 1000);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error(formatApiError(error) || 'Failed to submit answer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetInterview = () => {
    clearInterviewDraft();
    stopSpeaking();
    stopListening();
    cleanupGeminiSession();
    setStep(1);
    setFormData({
      resume: null,
      jd_text: '',
      focus_areas: [],
      difficulty: 'intermediate',
      role_type: ''
    });
    setInterviewData(null);
    setCurrentQuestion(0);
    setAnswers([]);
    setCurrentAnswer('');
    setVoiceTranscript('');
    setIsEndingEarly(false);
  };

  const finishEarlyAndGetResults = async () => {
    if (!interviewData?.session_id) return;
    const ok = window.confirm(
      'End the interview now? Remaining questions will be marked as skipped and you will get feedback based on your answers so far.'
    );
    if (!ok) return;

    stopSpeaking();
    stopListening();
    cleanupGeminiSession();

    setIsEndingEarly(true);
    try {
      const res = await axios.post('/api/interview/finish-early', {
        session_id: Number(interviewData.session_id),
        question_index: Number(currentQuestion),
        ...(currentAnswer.trim() ? { current_answer: currentAnswer.trim() } : {})
      });
      const qList = interviewData.questions;
      const merged = qList.map((_, i) => {
        if (i < currentQuestion) {
          const a = answers[i];
          if (a != null && String(a).trim() !== '') return String(a);
          return '[Interview ended early — no answer]';
        }
        if (i === currentQuestion && currentAnswer.trim()) return currentAnswer.trim();
        return '[Interview ended early — no answer]';
      });
      setAnswers(merged);
      setInterviewData((prev) => ({
        ...prev,
        feedback: res.data.feedback,
        score: res.data.score
      }));
      setStep(3);
      clearInterviewDraft();
      toast.success('Results are ready.');
    } catch (e) {
      console.error(e);
      toast.error(formatApiError(e) || 'Could not finish interview. Try again.');
    } finally {
      setIsEndingEarly(false);
    }
  };

  const renderSetupStep = () => (
    <div className="max-w-4xl mx-auto px-4 relative z-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gradient mb-4">Mock Interview Setup</h1>
        <p className="text-gray-300">
          Upload your resume and provide job details to get personalized interview questions
        </p>
      </div>

      <div className="space-y-8">
        {/* Resume Upload */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Resume Upload (Optional)</h2>
          
          {formData.resume ? (
            <div className="border-2 border-emerald-500/40 bg-emerald-950/35 rounded-xl p-6 text-center">
              <DocumentArrowUpIcon className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
              <p className="text-sm font-medium text-emerald-100 mb-2">{formData.resume.name}</p>
              <p className="text-xs text-emerald-200/80 mb-4">
                {(formData.resume.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, resume: null }))}
                className="text-sm text-red-400 hover:text-red-300 font-medium"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : 'border-white/20 bg-slate-800/30 hover:border-cyan-500/50'
                }`}
              >
                <input {...getInputProps()} />
                <DocumentArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div>
                  <p className="text-lg font-medium text-gray-100 mb-2">
                    {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume here'}
                  </p>
                  <p className="text-sm text-gray-400 mb-2">or</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    Browse Files
                  </button>
                  <p className="text-xs text-gray-400 mt-2">PDF, DOC, DOCX, TXT (max 10MB)</p>
                </div>
              </div>
              
              {/* Hidden file input as backup */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    // Validate file size
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error('File is too large. Maximum size is 10MB.');
                      return;
                    }
                    
                    // Validate file type
                    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error('Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.');
                      return;
                    }
                    
                    setFormData(prev => ({ ...prev, resume: file }));
                    toast.success(`Resume uploaded: ${file.name}`);
                  }
                }}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Job Description */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Job Description *</h2>
          <textarea
            name="jd_text"
            value={formData.jd_text}
            onChange={handleInputChange}
            rows={6}
            className="input-field w-full rounded-xl min-h-[140px] text-gray-100 placeholder:text-gray-500"
            placeholder="Paste the job description here..."
            required
          />
        </div>

        {/* Role Type */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Role Type</h2>
          <input
            type="text"
            name="role_type"
            value={formData.role_type}
            onChange={handleInputChange}
            className="input-field w-full rounded-xl"
            placeholder="e.g., Software Engineer, Product Manager, Data Scientist"
          />
        </div>

        {/* Focus Areas */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Focus Areas</h2>
          <p className="text-gray-300 mb-4">Select areas you&apos;d like to focus on during the interview</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {focusAreaOptions.map((area) => (
              <button
                type="button"
                key={area}
                onClick={() => handleFocusAreaToggle(area)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  formData.focus_areas.includes(area)
                    ? 'bg-cyan-600 text-white border-cyan-400/50'
                    : 'bg-slate-800/80 text-gray-200 border-white/15 hover:bg-slate-700/80'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty Level */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Difficulty Level</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {difficultyOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setFormData((prev) => ({ ...prev, difficulty: option.value }))}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  formData.difficulty === option.value
                    ? 'border-cyan-500 bg-cyan-950/40 text-gray-100'
                    : 'border-white/15 bg-slate-800/50 text-gray-200 hover:border-white/25'
                }`}
              >
                <h3 className="font-medium text-white">{option.label}</h3>
                <p className="text-sm text-gray-400 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Mode Toggle */}
        <div className="card border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Interview Mode</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <button
              type="button"
              onClick={() => setIsVoiceMode(false)}
              className={`p-4 rounded-xl border-2 text-left transition-colors ${
                !isVoiceMode
                  ? 'border-cyan-500 bg-cyan-950/40 text-gray-100'
                  : 'border-white/15 bg-slate-800/50 text-gray-200 hover:border-white/25'
              }`}
            >
              <h3 className="font-medium text-white mb-1">📝 Text Mode</h3>
              <p className="text-sm text-gray-400">Type your answers to interview questions</p>
            </button>
            <button
              type="button"
              onClick={() => setIsVoiceMode(true)}
              className={`p-4 rounded-xl border-2 text-left transition-colors ${
                isVoiceMode
                  ? 'border-cyan-500 bg-cyan-950/40 text-gray-100'
                  : 'border-white/15 bg-slate-800/50 text-gray-200 hover:border-white/25'
              }`}
            >
              <h3 className="font-medium text-white mb-1">Voice Mode (Gemini Live)</h3>
              <p className="text-sm text-gray-400">Real-time conversation with AI interviewer</p>
            </button>
          </div>
          <p className="text-sm text-gray-400">
            {isVoiceMode
              ? 'Voice mode uses the Gemini Live API in the browser (microphone required).'
              : 'Text mode uses typed answers and server-generated feedback.'}
          </p>
        </div>

        {/* Start Button */}
        <div className="text-center">
          <button
            onClick={startInterview}
            disabled={isLoading || !formData.jd_text.trim()}
            className="btn-primary text-lg px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center">
                <LoadingSpinner size="sm" className="mr-2" />
                Starting Interview...
              </div>
            ) : (
              `Start ${isVoiceMode ? 'Voice' : 'Mock'} Interview`
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderInterviewStep = () => {
    const totalQ = interviewData.questions?.length || 0;
    const progressPct = totalQ ? Math.round(((currentQuestion + 1) / totalQ) * 100) : 0;
    const qText = interviewData.questions?.[currentQuestion];

    if (!qText) {
      return (
        <div className="max-w-4xl mx-auto px-4 relative z-10 text-center py-12 space-y-4">
          <p className="text-gray-200">
            This screen is out of sync (no question at this step). You can still end the interview and
            get feedback from answers saved on the server.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn-primary" onClick={finishEarlyAndGetResults}>
              End & get feedback
            </button>
            <button type="button" className="btn-secondary" onClick={resetInterview}>
              Exit interview
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto px-4 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gradient mb-4">Mock Interview</h1>
          {user?.name && (
            <p className="text-sm text-gray-400 -mt-2 mb-2">Signed in as {user.name}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-300">
            <div className="flex items-center">
              <ClockIcon className="h-5 w-5 mr-2 text-cyan-400" />
              Question {currentQuestion + 1} of {totalQ}
            </div>
            <div className="flex items-center">
              <BriefcaseIcon className="h-5 w-5 mr-2 text-cyan-400" />
              {interviewData.instructions?.difficulty || '—'}
            </div>
          </div>
          <div className="mt-4 max-w-xl mx-auto h-2 rounded-full bg-slate-800/80 overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="card border border-white/10">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-cyan-300/90 mb-3">
              Question {currentQuestion + 1}
            </h2>
            <div className="rounded-xl bg-slate-900/60 border border-white/10 p-4 sm:p-5">
              <p className="text-lg text-gray-100 leading-relaxed whitespace-pre-wrap">{qText}</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-200 mb-2">Your answer</label>

            {isVoiceMode ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={startListening}
                    disabled={isListening || isSpeaking}
                    className={`flex items-center px-6 py-3 rounded-xl font-medium transition-colors ${
                      isListening
                        ? 'bg-red-600 text-white'
                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <MicrophoneIcon className="w-5 h-5 mr-2" />
                    {isListening ? 'Listening…' : 'Start speaking'}
                  </button>

                  {isListening && (
                    <button
                      type="button"
                      onClick={stopListening}
                      className="flex items-center px-4 py-3 bg-slate-600 text-white rounded-xl font-medium hover:bg-slate-500"
                    >
                      <StopIcon className="w-5 h-5 mr-2" />
                      Stop mic
                    </button>
                  )}

                  {isSpeaking && (
                    <button
                      type="button"
                      onClick={stopSpeaking}
                      className="flex items-center px-4 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-500"
                    >
                      <StopIcon className="w-5 h-5 mr-2" />
                      Stop audio
                    </button>
                  )}
                </div>

                <div className="rounded-xl bg-slate-900/50 border border-white/10 p-4 min-h-[120px]">
                  <p className="text-gray-100 text-sm sm:text-base whitespace-pre-wrap">
                    {voiceTranscript || currentAnswer || (
                      <span className="text-gray-500">Your speech or typing will appear here…</span>
                    )}
                  </p>
                  {isListening && (
                    <div className="flex items-center mt-3 text-cyan-400 text-sm">
                      <span className="animate-pulse w-2 h-2 bg-cyan-400 rounded-full mr-2" />
                      Listening…
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Or type your answer</label>
                  <textarea
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    rows={4}
                    className="input-field w-full rounded-xl text-sm min-h-[100px]"
                    placeholder="Type here if you prefer not to use the microphone…"
                  />
                </div>
              </div>
            ) : (
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                rows={8}
                className="input-field w-full rounded-xl text-base min-h-[160px] leading-relaxed text-gray-100 placeholder:text-gray-400"
                placeholder="Type your answer here. Use multiple paragraphs if you need."
              />
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetInterview} className="btn-secondary text-sm">
                Exit interview
              </button>
              <button
                type="button"
                onClick={finishEarlyAndGetResults}
                disabled={isEndingEarly || isSubmitting}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-700 text-gray-100 border border-white/15 hover:bg-slate-600 disabled:opacity-50"
              >
                {isEndingEarly ? 'Generating results…' : 'End & get feedback'}
              </button>
            </div>
            <button
              type="button"
              onClick={submitAnswer}
              disabled={isSubmitting || !currentAnswer.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Submitting…
                </div>
              ) : currentQuestion === interviewData.questions.length - 1 ? (
                'Finish interview'
              ) : (
                'Next question'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderResultsStep = () => (
    <div className="max-w-4xl mx-auto px-4 relative z-10 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gradient mb-4">Interview results</h1>
        <p className="text-gray-300 max-w-xl mx-auto">
          Here is your score, written feedback, and a recap of every question and your answers.
        </p>
      </div>

      {interviewData.score != null && (
        <div className="card text-center border border-white/10">
          <div className="flex items-center justify-center mb-2">
            <StarIcon className="h-8 w-8 text-amber-400 mr-2" />
            <span className="text-4xl font-bold text-white">{interviewData.score}</span>
            <span className="text-xl text-gray-400 ml-1">/100</span>
          </div>
          <p className="text-gray-400 text-sm">Overall performance score</p>
        </div>
      )}

      <div className="card border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">Detailed feedback</h2>
        <div className="rounded-xl bg-slate-900/50 border border-white/10 p-4 sm:p-6">
          <div className="whitespace-pre-wrap text-gray-100 leading-relaxed text-sm sm:text-base">
            {interviewData.feedback || 'No feedback text was returned.'}
          </div>
        </div>
      </div>

      <div className="card border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">Question & answer recap</h2>
        <div className="space-y-6">
          {(interviewData.questions || []).map((question, index) => (
            <div
              key={index}
              className="border-l-4 border-cyan-500/60 pl-4 py-1"
            >
              <h3 className="font-medium text-cyan-200/90 mb-2 text-sm">Question {index + 1}</h3>
              <p className="text-gray-100 mb-3 whitespace-pre-wrap leading-relaxed">{question}</p>
              <div className="rounded-lg bg-slate-900/60 border border-white/10 p-3 sm:p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Your answer
                </p>
                <p className="text-gray-100 whitespace-pre-wrap text-sm sm:text-base leading-relaxed">
                  {answers[index] || 'No answer provided'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 pb-8">
        <button type="button" onClick={resetInterview} className="btn-primary">
          Start new interview
        </button>
        <button
          type="button"
          onClick={() => { window.location.href = '/history'; }}
          className="btn-outline"
        >
          View all interviews
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen gradient-bg py-8 relative z-10">
      {step === 1 && renderSetupStep()}
      {step === 2 && renderInterviewStep()}
      {step === 3 && renderResultsStep()}
    </div>
  );
};

export default Interview;
