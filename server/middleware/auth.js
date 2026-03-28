const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, name, email, subscription_status, is_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requirePremium = (req, res, next) => {
  if (req.user.subscription_status !== 'premium') {
    return res.status(403).json({ 
      message: 'Premium subscription required',
      upgradeRequired: true 
    });
  }
  next();
};

const requireVerification = (req, res, next) => {
  if (!req.user.is_verified) {
    return res.status(403).json({ 
      message: 'Email verification required',
      verificationRequired: true 
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requirePremium,
  requireVerification
};
