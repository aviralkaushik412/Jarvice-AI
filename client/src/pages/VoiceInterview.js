import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  MicrophoneIcon,
  StopIcon,
  SpeakerWaveIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
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
}

const VoiceInterview = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState('idle'); // idle, connecting, active, ended, error
  const [transcription, setTranscription] = useState([]);
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [interviewMetrics, setInterviewMetrics] = useState({
    startTime: null,
    endTime: null,
    totalDuration: 0,
    questionsAsked: 0,
    answersGiven: 0,
    averageResponseTime: 0
  });

  const sessionPromiseRef = useRef(null);
  const inputAudioContextRef = useRef(null);
  const outputAudioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);

  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  const nextStartTime = useRef(0);
  const audioSources = useRef(new Set());
  const questionCountRef = useRef(0);
  const answerCountRef = useRef(0);

  const addTranscription = useCallback((speaker, text) => {
    console.log(`[${speaker}]: ${text}`);
    setTranscription(prev => [...prev, { speaker, text, timestamp: new Date().toISOString() }]);
  }, []);

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up resources...');
    
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
  }, []);

  const saveInterviewSession = useCallback(async () => {
    try {
      const duration = interviewMetrics.endTime 
        ? (interviewMetrics.endTime - interviewMetrics.startTime) / 1000 
        : 0;

      const response = await axios.post('/api/interview/save-voice-session', {
        transcription,
        metrics: {
          ...interviewMetrics,
          totalDuration: duration,
          questionsAsked: questionCountRef.current,
          answersGiven: answerCountRef.current
        },
        sessionId
      });

      console.log('✅ Interview session saved:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error saving interview session:', error);
      toast.error('Failed to save interview session');
    }
  }, [transcription, interviewMetrics, sessionId]);

  const startInterview = async () => {
    console.log('🎤 Starting voice interview...');
    setStatus('connecting');
    setError(null);
    setTranscription([]);
    currentInputTranscription.current = '';
    currentOutputTranscription.current = '';
    questionCountRef.current = 0;
    answerCountRef.current = 0;

    const newSessionId = `session_${Date.now()}`;
    setSessionId(newSessionId);
    setInterviewMetrics(prev => ({
      ...prev,
      startTime: Date.now()
    }));

    try {
    
      const { GoogleGenAI, Modality } = await import('@google/genai');

      const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey });

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
          systemInstruction: `You are a professional and friendly interviewer conducting a mock interview for a ${user?.role_type || 'software engineering'} position. 
          
Guidelines:
- Ask one question at a time
- Start with a warm greeting
- Ask behavioral and technical questions
- Listen carefully to responses
- Ask follow-up questions when needed
- Be encouraging and professional
- After 5-7 questions, conclude the interview with feedback

Keep responses concise and natural.`
        },
        callbacks: {
          onopen: async () => {
            console.log('✅ Session opened');
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
              setStatus('active');
              toast.success('Interview started! Speak naturally.');
            } catch (err) {
              console.error('Error setting up audio:', err);
              setError('Failed to access microphone. Please check permissions.');
              setStatus('error');
            }
          },

          onmessage: async (message) => {
            try {
              // Handle input transcription
              if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscription.current += text;
              }

              // Handle output transcription
              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentOutputTranscription.current += text;
              }

              // Handle turn complete
              if (message.serverContent?.turnComplete) {
                const userInput = currentInputTranscription.current.trim();
                const modelOutput = currentOutputTranscription.current.trim();

                if (userInput) {
                  addTranscription('You', userInput);
                  answerCountRef.current++;
                }
                if (modelOutput) {
                  addTranscription('Interviewer', modelOutput);
                  questionCountRef.current++;
                }

                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }

              // Handle audio response
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
            console.error('❌ Session error:', e);
            setError(`Session error: ${e.message || 'Unknown error'}`);
            setStatus('error');
            cleanup();
          },

          onclose: () => {
            console.log('Session closed');
            if (status !== 'error') {
              setStatus('ended');
              setInterviewMetrics(prev => ({
                ...prev,
                endTime: Date.now()
              }));
            }
            cleanup();
          }
        }
      });

      await sessionPromiseRef.current;
    } catch (e) {
      console.error('❌ Failed to start interview:', e);
      setError(`Failed to start interview: ${e.message}`);
      setStatus('error');
      cleanup();
      toast.error('Failed to start interview. Please try again.');
    }
  };

  const endInterview = async () => {
    console.log('⏹ Ending interview...');
    if (status === 'active') {
      setStatus('ended');
      setInterviewMetrics(prev => ({
        ...prev,
        endTime: Date.now()
      }));
      cleanup();
      
      // Save session after a short delay
      setTimeout(() => {
        saveInterviewSession();
      }, 1000);
    }
  };


  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="card mb-6">
          <h1 className="text-3xl font-bold text-gradient mb-2">Voice Interview</h1>
          <p className="text-gray-300">
            Have a natural conversation with our AI interviewer. Speak clearly and naturally.
          </p>
        </div>

        {/* Main Interview Area */}
        <div className="card h-[500px] flex flex-col mb-6">
          {/* Transcription Area */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 p-4 bg-slate-800 rounded-lg">
            {transcription.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Interview transcription will appear here...</p>
              </div>
            ) : (
              transcription.map((item, index) => (
                <div key={index} className="flex flex-col">
                  <span
                    className={`font-bold text-sm mb-1 ${
                      item.speaker === 'You' ? 'text-cyan-400' : 'text-green-400'
                    }`}
                  >
                    {item.speaker}
                  </span>
                  <p className="text-gray-200 text-sm">{item.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Status and Error */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    status === 'active'
                      ? 'bg-green-500 animate-pulse'
                      : status === 'connecting'
                      ? 'bg-yellow-500 animate-pulse'
                      : status === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm font-semibold text-white capitalize">
                  Status: {status}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                Questions: {questionCountRef.current} | Answers: {answerCountRef.current}
              </span>
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-600 rounded-lg mb-3">
                <p className="text-sm text-red-300">⚠️ {error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="card">
          <div className="flex gap-4 justify-center">
            {status === 'idle' || status === 'ended' || status === 'error' ? (
              <button
                onClick={startInterview}
                disabled={status === 'connecting'}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                <MicrophoneIcon className="h-5 w-5" />
                {status === 'connecting' ? 'Connecting...' : 'Start Interview'}
              </button>
            ) : status === 'active' ? (
              <button
                onClick={endInterview}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                <StopIcon className="h-5 w-5" />
                End Interview
              </button>
            ) : (
              <div className="flex items-center gap-2 text-gray-400">
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                <span>Interview completed</span>
              </div>
            )}
          </div>

          {status === 'active' && (
            <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg text-center">
              <p className="text-sm text-blue-200">
                🎤 Microphone is active. Speak naturally and clearly.
              </p>
            </div>
          )}
        </div>

        {/* Interview Metrics */}
        {status === 'ended' && (
          <div className="card mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Interview Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-700 p-4 rounded-lg text-center">
                <p className="text-xs text-gray-400 mb-1">Duration</p>
                <p className="text-lg font-semibold text-white">
                  {interviewMetrics.endTime && interviewMetrics.startTime
                    ? Math.round((interviewMetrics.endTime - interviewMetrics.startTime) / 1000)
                    : 0}s
                </p>
              </div>
              <div className="bg-slate-700 p-4 rounded-lg text-center">
                <p className="text-xs text-gray-400 mb-1">Questions</p>
                <p className="text-lg font-semibold text-white">{questionCountRef.current}</p>
              </div>
              <div className="bg-slate-700 p-4 rounded-lg text-center">
                <p className="text-xs text-gray-400 mb-1">Answers</p>
                <p className="text-lg font-semibold text-white">{answerCountRef.current}</p>
              </div>
              <div className="bg-slate-700 p-4 rounded-lg text-center">
                <p className="text-xs text-gray-400 mb-1">Status</p>
                <p className="text-lg font-semibold text-green-400">✓ Completed</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceInterview;
