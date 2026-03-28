const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const verificationToken = uuidv4();

    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, verification_token) VALUES ($1, $2, $3, $4) RETURNING id, name, email, subscription_status, is_verified',
      [name, email, passwordHash, verificationToken]
    );

    const user = result.rows[0];

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      message: 'User created successfully. Please check your email for verification.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription_status: user.subscription_status,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT id, name, email, password_hash, subscription_status, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription_status: user.subscription_status,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE verification_token = $1 RETURNING id, name, email',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [resetToken, resetExpires, email]
    );

    try {
      await sendPasswordResetEmail(email, resetToken);
      res.json({ message: 'Password reset email sent' });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      res.status(500).json({ message: 'Failed to send reset email' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = $2',
      [passwordHash, token]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      subscription_status: req.user.subscription_status,
      is_verified: req.user.is_verified
    }
  });
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;