const express = require('express');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/send', [
  authenticateToken,
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { message } = req.body;
    const userId = req.user.id;

    console.log('📨 Received message from user', userId, ':', message);

    const geminiResponse = await callGeminiAPI(message);

    console.log('✅ Gemini response received:', geminiResponse.substring(0, 100) + '...');

    await pool.query(
      'INSERT INTO chats (user_id, message, response) VALUES ($1, $2, $3)',
      [userId, message, geminiResponse]
    );

    console.log('💾 Message saved to database');

    res.json({
      message: 'Message sent successfully',
      response: geminiResponse
    });
  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ 
      message: 'Failed to process message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, message, response, timestamp 
       FROM chats 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM chats WHERE user_id = $1',
      [userId]
    );

    res.json({
      chats: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].count),
        pages: Math.ceil(totalResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
});

router.delete('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query('DELETE FROM chats WHERE user_id = $1', [userId]);

    res.json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({ message: 'Failed to clear chat history' });
  }
});

const callGeminiAPI = async (message) => {
  try {
    console.log('🔄 Calling Gemini API...');
    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `You are Jarvice AI, an intelligent assistant specialized in interview preparation and career guidance. 
                   You help users with:
                   - Interview questions and answers
                   - Resume and CV advice
                   - Career development tips
                   - Mock interview practice
                   - Industry-specific guidance
                   
                   Be helpful, professional, and encouraging. Keep responses concise but informative.
                   
                   User message: ${message}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0]) {
      console.log('✅ Gemini API response received');
      return response.data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response from Gemini API');
    }
  } catch (geminiError) {
    console.error('❌ Gemini API error:', geminiError.message);
    if (geminiError.response) {  
      console.error('API Response:', geminiError.response.data);
    }
    
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('🔄 Falling back to OpenAI API...');
        return await callOpenAIAPI(message);
      } catch (openaiError) {
        console.error('❌ OpenAI API also failed:', openaiError.message);
      }
    }
    
    console.error('⚠️ Both APIs failed, returning fallback message');
    return `I'm currently experiencing technical difficulties with the AI service. However, I can help you with: 
1. General interview preparation tips
2. Resume review guidance
3. Common interview questions for your role
4. Career development advice

Please try again in a moment, or feel free to ask me specific questions about your interview preparation.`;
  }
};

const callOpenAIAPI = async (message) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are Jarvice AI, an intelligent assistant specialized in interview preparation and career guidance. 
You help users with:
- Interview questions and answers
- Resume and CV advice
- Career development tips
- Mock interview practice
- Industry-specific guidance

Be helpful, professional, and encouraging. Keep responses concise but informative.`
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.95
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Invalid response from OpenAI API');
    }
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    if (error.response?.data?.error) {
      console.error('API Error:', error.response.data.error);
      if (error.response.data.error.code === 'insufficient_quota') {
        throw new Error('OpenAI quota exceeded. Please check your billing details.');
      }
    }
    throw error;
  }
};

module.exports = router;