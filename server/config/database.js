const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'jarvice_ai',
  user: process.env.DB_USER || 'jarvice_user',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,
  application_name: 'jarvice_ai'
});

pool.on('connect', () => {
  console.log(' Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error(' Database connection error:', err);
  process.exit(-1);
});

const connectDB = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log(' Connected to PostgreSQL database');
  } catch (error) {
    console.error(' Database connection error:', error);
    process.exit(-1);
  }
};

module.exports = { pool, connectDB };
