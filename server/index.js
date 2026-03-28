const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB } = require('./config/database');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const interviewRoutes = require('./routes/interview');
const subscriptionRoutes = require('./routes/subscription');
const imageRoutes = require('./routes/image');
const userRoutes = require('./routes/user');

const app = express();
const { verifyEmailTransport } = require('./utils/email');

connectDB();

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3003',
      'http://localhost:3002',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('combined'));

app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  verifyEmailTransport();
});
