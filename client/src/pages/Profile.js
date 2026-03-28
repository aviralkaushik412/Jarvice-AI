import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  UserIcon,
  EnvelopeIcon,
  KeyIcon,
  TrashIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Profile = () => {
  const { user, updateUser, logout } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [deleteData, setDeleteData] = useState({
    password: ''
  });

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      const response = await axios.get('/api/user/profile');
      setProfileData(response.data);
      setFormData({
        name: response.data.user.name,
        email: response.data.user.email
      });
    } catch (error) {
      console.error('Error fetching profile data:', error);
      toast.error('Failed to load profile data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleDeleteChange = (e) => {
    const { name, value } = e.target;
    setDeleteData(prev => ({ ...prev, [name]: value }));
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    setIsUpdating(true);

    try {
      const response = await axios.put('/api/user/profile', formData);
      updateUser(response.data.user);
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);

    try {
      await axios.put('/api/user/password', {
        current_password: passwordData.currentPassword,
        password: passwordData.newPassword
      });
      
      toast.success('Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.')) {
      return;
    }

    setIsDeleting(true);

    try {
      await axios.delete('/api/user/account', {
        data: { password: deleteData.password }
      });
      
      toast.success('Account deleted successfully');
      logout();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error.response?.data?.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const stats = profileData?.statistics || {
    total_chats: 0,
    total_interviews: 0,
    completed_interviews: 0,
    total_images: 0
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gradient mb-2">Profile Settings</h1>
          <p className="text-gray-300">Manage your account settings and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="card">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserIcon className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">{user?.name}</h2>
                <p className="text-gray-300">{user?.email}</p>
                <div className={`mt-2 px-3 py-1 rounded-full text-sm font-medium ${
                  user?.subscription_status === 'premium'
                    ? 'bg-purple-900 text-purple-300'
                    : 'bg-gray-700 text-gray-200'
                }`}>
                  {user?.subscription_status === 'premium' ? 'Premium' : 'Free'} Plan
                </div>
              </div>

              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'profile'
                      ? 'bg-primary-900 text-primary-300'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Profile Information
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'password'
                      ? 'bg-primary-900 text-primary-300'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Change Password
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'stats'
                      ? 'bg-primary-900 text-primary-300'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Statistics
                </button>
                <button
                  onClick={() => setActiveTab('danger')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'danger'
                      ? 'bg-red-900 text-red-300'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  Danger Zone
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'profile' && (
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-6">Profile Information</h3>
                
                <form onSubmit={updateProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="input-field"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="input-field"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <div className="flex items-center">
                      {user?.is_verified ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                      ) : (
                        <XMarkIcon className="h-5 w-5 text-red-500 mr-2" />
                      )}
                      <span className={`text-sm ${
                        user?.is_verified ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {user?.is_verified ? 'Email verified' : 'Email not verified'}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUpdating ? (
                        <div className="flex items-center">
                          <LoadingSpinner size="sm" className="mr-2" />
                          Updating...
                        </div>
                      ) : (
                        'Update Profile'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'password' && (
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-6">Change Password</h3>
                
                <form onSubmit={changePassword} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className="input-field"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className="input-field"
                      required
                      minLength={6}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      className="input-field"
                      required
                      minLength={6}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isChangingPassword ? (
                        <div className="flex items-center">
                          <LoadingSpinner size="sm" className="mr-2" />
                          Changing...
                        </div>
                      ) : (
                        'Change Password'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-6">Your Statistics</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-400">{stats.total_chats}</div>
                    <div className="text-sm text-gray-400">Total Chats</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{stats.total_interviews}</div>
                    <div className="text-sm text-gray-400">Interviews</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{stats.completed_interviews}</div>
                    <div className="text-sm text-gray-400">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-pink-400">{stats.total_images}</div>
                    <div className="text-sm text-gray-400">Images Generated</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'danger' && (
              <div className="card border-red-900">
                <h3 className="text-lg font-semibold text-red-400 mb-6">Danger Zone</h3>
                
                <div className="bg-red-900/20 border border-red-900 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-red-400 mb-2">Delete Account</h4>
                  <p className="text-sm text-red-300 mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                    All your data including chats, interviews, and images will be permanently deleted.
                  </p>
                  
                  <form onSubmit={deleteAccount} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-red-300 mb-2">
                        Enter your password to confirm
                      </label>
                      <input
                        type="password"
                        name="password"
                        value={deleteData.password}
                        onChange={handleDeleteChange}
                        className="input-field border-red-300 focus:ring-red-500 focus:border-red-500"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isDeleting}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isDeleting ? (
                        <div className="flex items-center">
                          <LoadingSpinner size="sm" className="mr-2" />
                          Deleting...
                        </div>
                      ) : (
                        <>
                          <TrashIcon className="h-4 w-4 mr-2" />
                          Delete Account
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
