import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  PaperAirplaneIcon,
  TrashIcon,
  UserIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchChatHistory();
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChatHistory = async (pageNum = 1) => {
    try {
      setIsLoadingHistory(true);
      const response = await axios.get(`/api/chat/history?page=${pageNum}&limit=20`);
      const { chats, pagination } = response.data;
      
      if (pageNum === 1) {
        setMessages(chats.reverse());
      } else {
        setMessages(prev => [...chats.reverse(), ...prev]);
      }
      
      setHasMore(pagination.page < pagination.pages);
    } catch (error) {
      console.error('Error fetching chat history:', error);
      toast.error('Failed to load chat history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadMoreMessages = () => {
    if (hasMore && !isLoadingHistory) {
      setPage(prev => prev + 1);
      fetchChatHistory(page + 1);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || isLoading) return;

    const messageText = inputMessage; // Store the message before clearing

    const userMessage = {
      id: Date.now(),
      message: messageText,
      response: '',
      timestamp: new Date().toISOString(),
      isUser: true
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('📤 Sending message:', messageText);
      const response = await axios.post('/api/chat/send', {
        message: messageText
      });

      console.log('📥 API Response:', response.data);

      if (!response.data.response) {
        console.warn('⚠️ No response text in API response');
        toast.error('Received empty response from AI');
        setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        return;
      }

      const botMessage = {
        id: Date.now() + 1,
        message: messageText,
        response: response.data.response,
        timestamp: new Date().toISOString(),
        isUser: false
      };

      console.log('🤖 Bot message:', botMessage);
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      console.error('Error response:', error.response?.data);
      toast.error('Failed to send message. Please try again.');
      
      // Remove the user message if sending failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChatHistory = async () => {
    if (window.confirm('Are you sure you want to clear all chat history?')) {
      try {
        await axios.delete('/api/chat/history');
        setMessages([]);
        toast.success('Chat history cleared');
      } catch (error) {
        console.error('Error clearing chat history:', error);
        toast.error('Failed to clear chat history');
      }
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="glass rounded-t-xl shadow-sm border-b border-white/10 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-lg flex items-center justify-center mr-3">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
                <p className="text-sm text-gray-400">Ask me anything about interviews and career guidance</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChatHistory}
                className="flex items-center text-gray-500 hover:text-red-600 transition-colors"
                title="Clear chat history"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="glass shadow-sm border-x border-white/10 h-96 overflow-y-auto">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ChatBubbleLeftRightIcon className="h-12 w-12 mb-4 text-gray-500" />
              <p className="text-lg font-medium mb-2">Start a conversation</p>
              <p className="text-sm text-center max-w-md">
                Ask me anything about interview preparation, career advice, or job search tips.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {hasMore && (
                <div className="text-center">
                  <button
                    onClick={loadMoreMessages}
                    disabled={isLoadingHistory}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {isLoadingHistory ? 'Loading...' : 'Load more messages'}
                  </button>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div key={message.id || index} className="flex space-x-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.isUser ? 'bg-cyan-600' : 'bg-slate-700'
                  }`}>
                    {message.isUser ? (
                      <UserIcon className="h-5 w-5 text-white" />
                    ) : (
                      <ChatBubbleLeftRightIcon className="h-5 w-5 text-cyan-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-gray-100">
                        {message.isUser ? user?.name : 'AI Assistant'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(message.timestamp)}
                      </span>
                    </div>
                    
                    <div className={`rounded-lg p-3 ${
                      message.isUser 
                        ? 'bg-cyan-600 text-white' 
                        : 'bg-slate-700'
                    }`}>
                      <p className={`text-sm whitespace-pre-wrap ${
                        message.isUser ? 'text-white' : 'text-gray-50'
                      }`}>
                        {message.isUser ? message.message : message.response}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex space-x-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                    <ChatBubbleLeftRightIcon className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-slate-700 rounded-lg p-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="glass rounded-b-xl shadow-sm border-t border-white/10 p-6">
          <form onSubmit={sendMessage} className="flex space-x-4">
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message here..."
                className="input-field"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="btn-primary"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </form>
          
          <div className="mt-3 text-xs text-gray-400">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
