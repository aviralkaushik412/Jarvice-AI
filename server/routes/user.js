const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, name, email, subscription_status, is_verified, created_at
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM chats WHERE user_id = $1) as total_chats,
        (SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1) as total_interviews,
        (SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1 AND completed_at IS NOT NULL) as completed_interviews,
        (SELECT COUNT(*) FROM image_generations WHERE user_id = $1) as total_images
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription_status: user.subscription_status,
        is_verified: user.is_verified,
        created_at: user.created_at
      },
      statistics: {
        total_chats: parseInt(stats.total_chats),
        total_interviews: parseInt(stats.total_interviews),
        completed_interviews: parseInt(stats.completed_interviews),
        total_images: parseInt(stats.total_images)
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

router.put('/profile', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    const userId = req.user.id;

    if (email && email !== req.user.email) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ message: 'Email already taken by another user' });
      }
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, name, email, subscription_status, is_verified`;

    const result = await pool.query(query, values);

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

router.put('/password', [
  authenticateToken,
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

router.delete('/account', [
  authenticateToken,
  body('password').notEmpty().withMessage('Password required for account deletion')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const recentChats = await pool.query(
      `SELECT id, message, response, timestamp 
       FROM chats 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 5`,
      [userId]
    );

    const recentInterviews = await pool.query(
      `SELECT id, jd_text, difficulty, score, created_at, completed_at
       FROM interview_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    let recentImages = [];
    if (req.user.subscription_status === 'premium') {
      const imagesResult = await pool.query(
        `SELECT id, prompt, image_url, created_at 
         FROM image_generations 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 5`,
        [userId]
      );
      recentImages = imagesResult.rows;
    }

    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM chats WHERE user_id = $1) as total_chats,
        (SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1) as total_interviews,
        (SELECT COUNT(*) FROM interview_sessions WHERE user_id = $1 AND completed_at IS NOT NULL) as completed_interviews,
        (SELECT AVG(score) FROM interview_sessions WHERE user_id = $1 AND score IS NOT NULL) as avg_score,
        (SELECT COUNT(*) FROM image_generations WHERE user_id = $1) as total_images
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      recent_chats: recentChats.rows,
      recent_interviews: recentInterviews.rows,
      recent_images: recentImages,
      statistics: {
        total_chats: parseInt(stats.total_chats),
        total_interviews: parseInt(stats.total_interviews),
        completed_interviews: parseInt(stats.completed_interviews),
        average_score: stats.avg_score ? parseFloat(stats.avg_score).toFixed(1) : null,
        total_images: parseInt(stats.total_images)
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
