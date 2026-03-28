import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const VerifyEmail = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setStatus('error');
      setMessage('Invalid verification link');
    }
  }, [token]);

  const verifyEmail = async (verificationToken) => {
    try {
      const response = await axios.get(`/api/auth/verify/${verificationToken}`);
      setStatus('success');
      setMessage(response.data.message);
      toast.success('Email verified successfully!');
      
      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
    } catch (error) {
      console.error('Email verification error:', error);
      setStatus('error');
      setMessage(error.response?.data?.message || 'Failed to verify email');
      toast.error('Email verification failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-2xl">J</span>
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-white">
            Email Verification
          </h2>
        </div>

        <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {status === 'verifying' && (
            <div className="text-center">
              <LoadingSpinner size="lg" className="mb-4" />
              <p className="text-gray-400">Verifying your email address...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                Email Verified Successfully!
              </h3>
              <p className="text-gray-400 mb-6">
                {message || 'Your email has been verified. You can now access all features of Jarvice AI.'}
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full btn-primary"
                >
                  Go to Dashboard
                </button>
                <p className="text-sm text-gray-500">
                  You will be redirected automatically in a few seconds...
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Verification Failed
              </h3>
              <p className="text-gray-600 mb-6">
                {message || 'The verification link is invalid or has expired.'}
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full btn-primary"
                >
                  Go to Login
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="w-full btn-outline"
                >
                  Create New Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
