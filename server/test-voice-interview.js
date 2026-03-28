const axios = require('axios');
const { pool } = require('./config/database');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';

let testToken = null;
let testUserId = null;

async function generateTestToken() {
  try {
    console.log('\n🔑 Generating test token...');
    
    const userResult = await pool.query(
      'SELECT id FROM users LIMIT 1'
    );
    
    if (userResult.rows.length === 0) {
      console.error('❌ No test user found. Please create a user first.');
      return null;
    }
    
    testUserId = userResult.rows[0].id;
    
    const jwt = require('jsonwebtoken');
    testToken = jwt.sign(
      { userId: testUserId, email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ Test token generated');
    console.log(`   User ID: ${testUserId}`);
    console.log(`   Token: ${testToken.substring(0, 50)}...`);
    
    return testToken;
  } catch (error) {
    console.error('❌ Error generating token:', error.message);
    return null;
  }
}

async function testSaveVoiceSession() {
  try {
    console.log('\n📝 Testing: POST /api/interview/save-voice-session');
    
    const testData = {
      transcription: [
        { speaker: 'Interviewer', text: 'Hello, tell me about yourself.' },
        { speaker: 'You', text: 'I have 5 years of experience in software development.' },
        { speaker: 'Interviewer', text: 'That sounds great! What technologies do you use?' },
        { speaker: 'You', text: 'I primarily work with React, Node.js, and PostgreSQL.' }
      ],
      metrics: {
        totalDuration: 120,
        questionsAsked: 2,
        answersGiven: 2,
        startTime: Date.now() - 120000,
        endTime: Date.now()
      },
      sessionId: `test_session_${Date.now()}`
    };
    
    const response = await axios.post(
      `${BASE_URL}/api/interview/save-voice-session`,
      testData,
      {
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Voice session saved successfully');
    console.log(`   Response:`, response.data);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error saving voice session:', error.response?.data || error.message);
    return null;
  }
}

async function testGetVoiceHistory() {
  try {
    console.log('\n📚 Testing: GET /api/interview/voice-history');
    
    const response = await axios.get(
      `${BASE_URL}/api/interview/voice-history?page=1&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      }
    );
    
    console.log('✅ Voice history retrieved successfully');
    console.log(`   Total sessions: ${response.data.pagination.total}`);
    console.log(`   Sessions on page: ${response.data.sessions.length}`);
    
    if (response.data.sessions.length > 0) {
      const session = response.data.sessions[0];
      console.log(`\n   Latest session:`);
      console.log(`   - Session ID: ${session.session_id}`);
      console.log(`   - Duration: ${session.duration}s`);
      console.log(`   - Questions: ${session.questions_count}`);
      console.log(`   - Answers: ${session.answers_count}`);
      console.log(`   - Created: ${session.created_at}`);
      console.log(`   - Transcription lines: ${session.transcription.length}`);
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error retrieving voice history:', error.response?.data || error.message);
    return null;
  }
}

async function testDatabaseSchema() {
  try {
    console.log('\n🗄️  Testing: Database Schema');
    
    // Check voice_interview_sessions table
    const tableResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'voice_interview_sessions' 
      ORDER BY ordinal_position
    `);
    
    console.log('✅ voice_interview_sessions table exists');
    console.log('   Columns:');
    tableResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'voice_interview_sessions'
    `);
    
    console.log('\n   Indexes:');
    indexResult.rows.forEach(row => {
      console.log(`   - ${row.indexname}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Error checking database schema:', error.message);
    return false;
  }
}

async function testGeminiAPIKey() {
  try {
    console.log('\n🔑 Testing: Gemini API Key Configuration');
    
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ REACT_APP_GEMINI_API_KEY not configured in .env');
      return false;
    }
    
    console.log('✅ Gemini API Key configured');
    console.log(`   Key: ${apiKey.substring(0, 20)}...`);
    
    // Try to verify the key by checking available models
    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        { timeout: 5000 }
      );
      
      console.log('✅ Gemini API Key is valid');
      console.log(`   Available models: ${response.data.models.length}`);
      
      // Check for live model
      const liveModel = response.data.models.find(m => 
        m.name.includes('gemini-2.5-flash-native-audio')
      );
      
      if (liveModel) {
        console.log(`   ✅ Live audio model available: ${liveModel.displayName}`);
      } else {
        console.log('   ⚠️  Live audio model not found in available models');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to verify Gemini API Key:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error testing Gemini API:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎤 VOICE INTERVIEW SYSTEM - COMPREHENSIVE TEST');
  console.log('═══════════════════════════════════════════════════════');
  
  try {
    // 1. Database Schema Test
    const schemaOk = await testDatabaseSchema();
    
    // 2. Gemini API Test
    const geminiOk = await testGeminiAPIKey();
    
    // 3. Generate Token
    const token = await generateTestToken();
    if (!token) {
      console.error('\n❌ Cannot proceed without valid token');
      process.exit(1);
    }
    
    // 4. Test Save Voice Session
    const saveResult = await testSaveVoiceSession();
    
    // 5. Test Get Voice History
    const historyResult = await testGetVoiceHistory();
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Database Schema: ${schemaOk ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Gemini API Key: ${geminiOk ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Save Voice Session: ${saveResult ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Get Voice History: ${historyResult ? 'PASS' : 'FAIL'}`);
    
    const allPass = schemaOk && geminiOk && saveResult && historyResult;
    console.log(`\n${allPass ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'}`);
    
    process.exit(allPass ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    process.exit(1);
  }
}

runAllTests();
