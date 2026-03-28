const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const verifyEmailTransport = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email service connected successfully');
  } catch (error) {
    console.warn('⚠️ Email service not configured:', error.message);
  }
};

const sendVerificationEmail = async (email, token) => {
  const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Email - Jarvice AI',
    html: `
      <h2>Welcome to Jarvice AI!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Verify Email
      </a>
      <p>Or copy this link: ${verificationLink}</p>
      <p>This link will expire in 24 hours.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}`);
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, token) => {
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Reset Your Password - Jarvice AI',
    html: `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the link below to proceed:</p>
      <a href="${resetLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Reset Password
      </a>
      <p>Or copy this link: ${resetLink}</p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (email, name) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Welcome to Jarvice AI!',
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Thank you for joining Jarvice AI. We're excited to have you on board!</p>
      <p>You can now access all our features:</p>
      <ul>
        <li>AI-powered chat assistance</li>
        <li>Interview preparation</li>
        <li>Image generation (Premium)</li>
        <li>And much more!</li>
      </ul>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Happy learning!</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    throw error;
  }
};

module.exports = {
  verifyEmailTransport,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};
