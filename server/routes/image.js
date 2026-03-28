const express = require('express');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, requirePremium } = require('../middleware/auth');

const router = express.Router();

router.post('/generate', [
  authenticateToken,
  requirePremium,
  body('prompt').trim().isLength({ min: 5, max: 500 }).withMessage('Prompt must be between 5 and 500 characters'),
  body('model').optional().isIn(['dall-e-2', 'dall-e-3']).withMessage('Invalid model specified')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { prompt, model = 'dall-e-3' } = req.body;
    const userId = req.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const usageResult = await pool.query(
      'SELECT COUNT(*) FROM image_generations WHERE user_id = $1 AND created_at >= $2',
      [userId, today]
    );

    const dailyUsage = parseInt(usageResult.rows[0].count);
    const dailyLimit = 10;

    if (dailyUsage >= dailyLimit) {
      return res.status(429).json({ 
        message: 'Daily image generation limit reached',
        limit: dailyLimit,
        used: dailyUsage
      });
    }

    const imageUrl = await generateImageWithOpenAI(prompt, model);

    await pool.query(
      'INSERT INTO image_generations (user_id, prompt, image_url, model) VALUES ($1, $2, $3, $4)',
      [userId, prompt, imageUrl, model]
    );

    res.json({
      message: 'Image generated successfully',
      image_url: imageUrl,
      prompt: prompt,
      model: model,
      usage: {
        daily_limit: dailyLimit,
        used_today: dailyUsage + 1,
        remaining: dailyLimit - dailyUsage - 1
      }
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ 
      message: 'Failed to generate image',
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
      `SELECT id, prompt, image_url, model, created_at 
       FROM image_generations 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM image_generations WHERE user_id = $1',
      [userId]
    );

    res.json({
      images: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].count),
        pages: Math.ceil(totalResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Image history error:', error);
    res.status(500).json({ message: 'Failed to fetch image history' });
  }
});

router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyResult = await pool.query(
      'SELECT COUNT(*) FROM image_generations WHERE user_id = $1 AND created_at >= $2',
      [userId, today]
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthlyResult = await pool.query(
      'SELECT COUNT(*) FROM image_generations WHERE user_id = $1 AND created_at >= $2',
      [userId, monthStart]
    );

    const totalResult = await pool.query(
      'SELECT COUNT(*) FROM image_generations WHERE user_id = $1',
      [userId]
    );

    const limits = req.user.subscription_status === 'premium' ? {
      daily: 10,
      monthly: 300,
      total: -1
    } : {
      daily: 0,
      monthly: 0,
      total: 0
    };

    res.json({
      usage: {
        daily: parseInt(dailyResult.rows[0].count),
        monthly: parseInt(monthlyResult.rows[0].count),
        total: parseInt(totalResult.rows[0].count)
      },
      limits: limits,
      remaining: {
        daily: Math.max(0, limits.daily - parseInt(dailyResult.rows[0].count)),
        monthly: Math.max(0, limits.monthly - parseInt(monthlyResult.rows[0].count))
      }
    });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({ message: 'Failed to fetch usage statistics' });
  }
});

const generateImageWithOpenAI = async (prompt, model) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: model,
        prompt: prompt,
        n: 1,
        size: model === 'dall-e-3' ? '1024x1024' : '512x512',
        quality: model === 'dall-e-3' ? 'standard' : undefined,
        style: model === 'dall-e-3' ? 'vivid' : undefined
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds timeout
      }
    );

    if (response.data && response.data.data && response.data.data[0]) {
      return response.data.data[0].url;
    } else {
      throw new Error('Invalid response from OpenAI API');
    }
  } catch (error) {
    console.error('OpenAI API error:', error);

    if (error.response) {
      const errorMessage = error.response.data?.error?.message || 'OpenAI API error';
      throw new Error(`OpenAI API error: ${errorMessage}`);
    } else if (error.request) {
      throw new Error('Failed to connect to OpenAI API');
    } else {
      throw new Error('Error calling OpenAI API');
    }
  }
};

module.exports = router;
