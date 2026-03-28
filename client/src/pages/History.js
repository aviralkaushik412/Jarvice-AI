import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  ClockIcon,
  StarIcon,
  EyeIcon,
  TrashIcon,
  CalendarIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const History = () => {
  const [activeTab, setActiveTab] = useState('chats');
  const [chats, setChats] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'chats') {
        const response = await axios.get('/api/chat/history?page=1&limit=50');
        setChats(response.data.chats);
      } else {
        const response = await axios.get('/api/interview/history?page=1&limit=50');
        setInterviews(response.data.sessions);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };


  const clearChatHistory = async () => {
    if (window.confirm('Are you sure you want to clear all chat history?')) {
      try {
        await axios.delete('/api/chat/history');
        setChats([]);
        toast.success('Chat history cleared');
      } catch (error) {
        console.error('Error clearing chat history:', error);
        toast.error('Failed to clear chat history');
      }
    }
  };

  const viewItem = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };

  const renderChatItem = (chat) => (
    <div className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewItem(chat)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
          <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white truncate">
              {chat.message}
            </h3>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <ClockIcon className="h-4 w-4" />
              <span>{formatDate(chat.timestamp)}</span>
            </div>
          </div>
          <p className="text-sm text-gray-300 mt-1 line-clamp-2">
            {chat.response}
          </p>
        </div>
        <EyeIcon className="h-5 w-5 text-gray-500" />
      </div>
    </div>
  );

  const renderInterviewItem = (interview) => (
    <div className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => viewItem(interview)}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 w-10 h-10 bg-green-900 rounded-lg flex items-center justify-center">
          <BriefcaseIcon className="h-5 w-5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white truncate">
              {interview.jd_text?.substring(0, 50)}...
            </h3>
            <div className="flex items-center space-x-2">
              {interview.score && (
                <div className="flex items-center text-xs text-gray-400">
                  <StarIcon className="h-4 w-4 text-yellow-400 mr-1" />
                  <span>{interview.score}</span>
                </div>
              )}
              <div className="flex items-center space-x-1 text-xs text-gray-400">
                <ClockIcon className="h-4 w-4" />
                <span>{formatDate(interview.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
            <span className="capitalize">{interview.difficulty}</span>
            {interview.role_type && <span>• {interview.role_type}</span>}
            <span className={`px-2 py-1 rounded-full text-xs ${
              interview.is_completed 
                ? 'bg-green-900 text-green-300' 
                : 'bg-yellow-900 text-yellow-300'
            }`}>
              {interview.is_completed ? 'Completed' : 'In Progress'}
            </span>
          </div>
        </div>
        <EyeIcon className="h-5 w-5 text-gray-500" />
      </div>
    </div>
  );

  const renderModal = () => {
    if (!selectedItem) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-700">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                {activeTab === 'chats' ? 'Chat Details' : 'Interview Details'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-300"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {activeTab === 'chats' ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Your Message</h3>
                  <p className="text-gray-100 bg-slate-700 p-3 rounded-lg">
                    {selectedItem.message}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">AI Response</h3>
                  <p className="text-gray-100 bg-slate-700 p-3 rounded-lg whitespace-pre-wrap">
                    {selectedItem.response}
                  </p>
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {new Date(selectedItem.timestamp).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Job Description</h3>
                  <p className="text-gray-100 bg-slate-700 p-3 rounded-lg">
                    {selectedItem.jd_text}
                  </p>
                </div>
                
                {selectedItem.role_type && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Role Type</h3>
                    <p className="text-gray-100">{selectedItem.role_type}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Difficulty</h3>
                    <span className="capitalize text-gray-100">{selectedItem.difficulty}</span>
                  </div>
                  {selectedItem.score && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2">Score</h3>
                      <div className="flex items-center">
                        <StarIcon className="h-4 w-4 text-yellow-400 mr-1" />
                        <span className="text-gray-100">{selectedItem.score}/100</span>
                      </div>
                    </div>
                  )}
                </div>

                {selectedItem.feedback && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Feedback</h3>
                    <p className="text-gray-100 bg-slate-700 p-3 rounded-lg whitespace-pre-wrap">
                      {selectedItem.feedback}
                    </p>
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-400">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {new Date(selectedItem.created_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gradient mb-2">History</h1>
          <p className="text-gray-300">Review your past chats and interview sessions</p>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('chats')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'chats'
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5 inline mr-2" />
                Chats ({chats.length})
              </button>
              <button
                onClick={() => setActiveTab('interviews')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'interviews'
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                <BriefcaseIcon className="h-5 w-5 inline mr-2" />
                Interviews ({interviews.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {activeTab === 'chats' 
              ? `${chats.length} chat${chats.length !== 1 ? 's' : ''} found`
              : `${interviews.length} interview${interviews.length !== 1 ? 's' : ''} found`
            }
          </div>
          {activeTab === 'chats' && chats.length > 0 && (
            <button
              onClick={clearChatHistory}
              className="flex items-center text-red-600 hover:text-red-700 text-sm font-medium"
            >
              <TrashIcon className="h-4 w-4 mr-1" />
              Clear All Chats
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : activeTab === 'chats' ? (
          chats.length === 0 ? (
            <div className="text-center py-12">
              <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No chats yet</h3>
              <p className="text-gray-400 mb-4">Start a conversation with our AI assistant</p>
              <a href="/chat" className="btn-primary">Start Chatting</a>
            </div>
          ) : (
            <div className="space-y-4">
              {chats.map((chat, index) => (
                <div key={chat.id || index}>
                  {renderChatItem(chat)}
                </div>
              ))}
            </div>
          )
        ) : (
          interviews.length === 0 ? (
            <div className="text-center py-12">
              <BriefcaseIcon className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No interviews yet</h3>
              <p className="text-gray-400 mb-4">Start practicing with mock interviews</p>
              <a href="/interview" className="btn-primary">Start Interview</a>
            </div>
          ) : (
            <div className="space-y-4">
              {interviews.map((interview, index) => (
                <div key={interview.id || index}>
                  {renderInterviewItem(interview)}
                </div>
              ))}
            </div>
          )
        )}

        {/* Modal */}
        {showModal && renderModal()}
      </div>
    </div>
  );
};

export default History;
