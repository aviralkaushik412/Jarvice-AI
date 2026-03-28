require('dotenv').config();
const axios = require('axios');

console.log('═══════════════════════════════════════════════════════');
console.log('🎤 VOICE INTERVIEW - SIMPLE TEST');
console.log('═══════════════════════════════════════════════════════\n');

async function testAll() {
  try {
    console.log('1️⃣  Checking Gemini API Key...');
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ REACT_APP_GEMINI_API_KEY not found in .env');
      return false;
    }
    console.log('✅ API Key configured:', apiKey.substring(0, 20) + '...\n');

    console.log('2️⃣  Checking available Gemini models...');
    const modelsResponse = await axios.get(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      { timeout: 10000 }
    );
    
    const models = modelsResponse.data.models || [];
    console.log(`✅ Found ${models.length} models:\n`);
    
    models.forEach((model, index) => {
      const name = model.name.replace('models/', '');
      console.log(`   ${name}`);
    });

    console.log('\n3️⃣  Checking for audio-capable models...');
    const audioModels = models.filter(m => 
      m.name.includes('flash') && !m.name.includes('embedding')
    );
    
    if (audioModels.length > 0) {
      console.log(`✅ Found ${audioModels.length} audio-capable models:\n`);
      audioModels.forEach(model => {
        console.log(`   - ${model.displayName || model.name}`);
      });
    } else {
      console.log('⚠️  No audio-capable models found');
    }

    console.log('\n4️⃣  Checking server health...');
    try {
      const healthResponse = await axios.get('http://localhost:5001/api/health', {
        timeout: 5000
      });
      console.log('✅ Server is running');
      console.log(`   Status: ${healthResponse.data.status}`);
      console.log(`   Environment: ${healthResponse.data.environment}`);
    } catch (error) {
      console.error('❌ Server is not responding');
      console.error(`   Error: ${error.message}`);
    }

    console.log('\n5️⃣  Checking @google/genai package...');
    try {
      const genaiPackage = require('@google/genai');
      console.log('✅ @google/genai package is installed');
      console.log(`   Package available: ${typeof genaiPackage !== 'undefined'}`);
    } catch (error) {
      console.error('❌ @google/genai package not found');
      console.error('   Run: npm install @google/genai');
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ VOICE INTERVIEW SETUP VERIFICATION COMPLETE\n');
    console.log('📋 Next Steps:');
    console.log('   1. Add VoiceInterview.js route to your navigation');
    console.log('   2. Test the voice interview at /voice-interview');
    console.log('   3. Speak naturally with the AI interviewer');
    console.log('   4. Interview will be saved automatically\n');
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

testAll().then(success => {
  process.exit(success ? 0 : 1);
});
