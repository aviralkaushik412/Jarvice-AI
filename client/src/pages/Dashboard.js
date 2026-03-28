import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  PhotoIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowRightIcon,
  StarIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData();
    }
  }, [authLoading]);

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/user/dashboard');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" className="min-h-screen" />;
  }

  const stats = dashboardData?.statistics || {
    total_chats: 0,
    total_interviews: 0,
    completed_interviews: 0,
    average_score: null,
    total_images: 0
  };

  const recentChats = dashboardData?.recent_chats || [];
  const recentInterviews = dashboardData?.recent_interviews || [];
  const recentImages = dashboardData?.recent_images || [];

  const quickActions = [
    {
      title: 'Start New Chat',
      description: 'Ask our AI assistant anything about interviews',
      icon: ChatBubbleLeftRightIcon,
      link: '/chat',
      color: 'bg-blue-500',
      textColor: 'text-blue-600'
    },
    {
      title: 'Mock Interview',
      description: 'Practice with personalized interview questions',
      icon: BriefcaseIcon,
      link: '/interview',
      color: 'bg-green-500',
      textColor: 'text-green-600'
    },
    {
      title: 'View History',
      description: 'Review your past chats and interviews',
      icon: ClockIcon,
      link: '/history',
      color: 'bg-purple-500',
      textColor: 'text-purple-600'
    }
  ];

  if (user?.subscription_status === 'premium') {
    quickActions.push({
      title: 'Generate Images',
      description: 'Create AI-generated images for your portfolio',
      icon: PhotoIcon,
      link: '/image-generate',
      color: 'bg-pink-500',
      textColor: 'text-pink-600'
    });
  }

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gradient">
            Welcome back, {user?.name}! 👋
          </h1>
          <p className="text-gray-300 mt-2">
            Ready to continue your interview preparation journey?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChatBubbleLeftRightIcon className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Total Chats</p>
                <p className="text-2xl font-semibold text-white">{stats.total_chats}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BriefcaseIcon className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Interviews</p>
                <p className="text-2xl font-semibold text-white">{stats.total_interviews}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Completed</p>
                <p className="text-2xl font-semibold text-white">{stats.completed_interviews}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-400">Avg Score</p>
                <p className="text-2xl font-semibold text-white">
                  {stats.average_score || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-white mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {quickActions.map((action, index) => (
                <Link
                  key={index}
                  to={action.link}
                  className="card hover:shadow-lg transition-shadow duration-200 group"
                >
                  <div className="flex items-start">
                    <div className={`flex-shrink-0 w-12 h-12 ${action.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                      <action.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="ml-4 flex-1">
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
                        {action.title}
                      </h3>
                      <p className="text-gray-300 mt-1">{action.description}</p>
                      <div className="flex items-center mt-3 text-primary-600 group-hover:text-primary-700">
                        <span className="text-sm font-medium">Get started</span>
                        <ArrowRightIcon className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-6">Recent Activity</h2>
            
            {recentChats.length > 0 && (
              <div className="card mb-6">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-400 mr-2" />
                  Recent Chats
                </h3>
                <div className="space-y-3">
                  {recentChats.slice(0, 3).map((chat, index) => (
                    <div key={index} className="border-l-4 border-blue-600 pl-3">
                      <p className="text-sm text-gray-200 truncate">{chat.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(chat.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
                <Link
                  to="/history"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-3 inline-flex items-center"
                >
                  View all chats
                  <ArrowRightIcon className="h-4 w-4 ml-1" />
                </Link>
              </div>
            )}

            {recentInterviews.length > 0 && (
              <div className="card mb-6">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <BriefcaseIcon className="h-5 w-5 text-green-400 mr-2" />
                  Recent Interviews
                </h3>
                <div className="space-y-3">
                  {recentInterviews.slice(0, 3).map((interview, index) => (
                    <div key={index} className="border-l-4 border-green-600 pl-3">
                      <p className="text-sm text-gray-200 truncate">
                        {interview.jd_text?.substring(0, 50)}...
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">
                          {interview.difficulty} • {interview.role_type}
                        </p>
                        {interview.score && (
                          <div className="flex items-center text-xs text-gray-400">
                            <StarIcon className="h-3 w-3 text-yellow-400 mr-1" />
                            {interview.score}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Link
                  to="/history"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-3 inline-flex items-center"
                >
                  View all interviews
                  <ArrowRightIcon className="h-4 w-4 ml-1" />
                </Link>
              </div>
            )}

            {user?.subscription_status === 'premium' && recentImages.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <PhotoIcon className="h-5 w-5 text-pink-400 mr-2" />
                  Recent Images
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {recentImages.slice(0, 4).map((image, index) => (
                    <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={image.image_url}
                        alt={image.prompt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                <Link
                  to="/image-generate"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-3 inline-flex items-center"
                >
                  Generate more images
                  <ArrowRightIcon className="h-4 w-4 ml-1" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {user?.subscription_status === 'free' && (
          <div className="mt-8 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Unlock Premium Features</h3>
                <p className="text-primary-100">
                  Get unlimited interviews, AI image generation, and advanced analytics.
                </p>
              </div>
              <Link
                to="/subscription"
                className="bg-white text-primary-600 hover:bg-gray-50 font-medium py-2 px-6 rounded-lg transition-colors duration-200"
              >
                Upgrade Now
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
