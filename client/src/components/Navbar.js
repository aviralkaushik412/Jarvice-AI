import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Bars3Icon, 
  XMarkIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
    setIsProfileOpen(false);
  };

  const navigation = [
    { name: 'Home', href: '/', public: true },
    { name: 'Dashboard', href: '/dashboard', public: false },
    { name: 'Chat', href: '/chat', public: false },
    { name: 'Interview', href: '/interview', public: false },
    { name: '🎤 Voice Interview', href: '/voice-interview', public: false },
    { name: 'History', href: '/history', public: false },
  ];

  const filteredNavigation = navigation.filter(item => 
    isAuthenticated ? !item.public : item.public
  );

  return (
    <nav className="glass sticky top-0 z-50 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
              <span className="text-xl font-bold text-gradient">Jarvice AI</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            {filteredNavigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.href
                    ? 'text-cyan-400 bg-white/10'
                    : 'text-gray-300 hover:text-cyan-400 hover:bg-white/5'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-2 text-gray-300 hover:text-purple-400 transition-colors"
                >
                  <UserCircleIcon className="w-6 h-6" />
                  <span className="text-sm font-medium">{user?.name}</span>
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 glass rounded-xl shadow-lg py-1 z-50 border border-white/10">
                    <Link
                      to="/profile"
                      className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      <Cog6ToothIcon className="w-4 h-4 mr-3" />
                      Profile
                    </Link>
                    <Link
                      to="/subscription"
                      className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      <CreditCardIcon className="w-4 h-4 mr-3" />
                      Subscription
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4 mr-3" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="text-gray-300 hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn-primary"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-300 hover:text-purple-400 focus:outline-none focus:text-purple-400"
            >
              {isOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
              {filteredNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    location.pathname === item.href
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-700 hover:text-primary-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              
              {isAuthenticated ? (
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center px-3 py-2">
                    <UserCircleIcon className="w-6 h-6 text-gray-400 mr-3" />
                    <span className="text-sm font-medium text-gray-700">{user?.name}</span>
                  </div>
                  <Link
                    to="/profile"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
                    onClick={() => setIsOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    to="/subscription"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
                    onClick={() => setIsOpen(false)}
                  >
                    Subscription
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  <Link
                    to="/login"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-gray-50"
                    onClick={() => setIsOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="block px-3 py-2 rounded-md text-base font-medium text-white bg-primary-600 hover:bg-primary-700"
                    onClick={() => setIsOpen(false)}
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
