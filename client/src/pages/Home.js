import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChatBubbleLeftRightIcon, 
  BriefcaseIcon, 
  SparklesIcon,
  ArrowRightIcon,
  StarIcon
} from '@heroicons/react/24/outline';

const Home = () => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'AI Chatbot',
      description: 'Get instant answers to interview questions and career guidance from our advanced AI assistant.',
      color: 'text-blue-600'
    },
    {
      icon: BriefcaseIcon,
      title: 'Mock Interviews',
      description: 'Practice with personalized mock interviews based on your resume and job requirements.',
      color: 'text-green-600'
    },
    {
      icon: SparklesIcon,
      title: 'AI Image Generation',
      description: 'Create professional images and visual content for your portfolio (Premium feature).',
      color: 'text-purple-600'
    }
  ];

  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Software Engineer',
      content: 'Jarvice AI helped me land my dream job at Google. The mock interviews were incredibly realistic and the feedback was spot-on.',
      rating: 5
    },
    {
      name: 'Michael Chen',
      role: 'Product Manager',
      content: 'The AI chatbot answered all my questions about product management interviews. Highly recommended!',
      rating: 5
    },
    {
      name: 'Emily Rodriguez',
      role: 'Data Scientist',
      content: 'The personalized interview questions based on my resume were exactly what I needed to prepare.',
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen">
      <section className="gradient-bg py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Master Your Next
              <span className="text-gradient"> Interview</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              AI-powered interview preparation with personalized mock interviews, 
              instant feedback, and career guidance to help you land your dream job.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn-primary text-lg px-8 py-3">
                  Go to Dashboard
                  <ArrowRightIcon className="w-5 h-5 ml-2 inline" />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn-primary text-lg px-8 py-3">
                    Get Started Free
                    <ArrowRightIcon className="w-5 h-5 ml-2 inline" />
                  </Link>
                  <Link to="/login" className="btn-outline text-lg px-8 py-3">
                    Sign In
                  </Link>
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              No credit card required • Free forever plan available
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Our AI-powered platform provides comprehensive interview preparation tools 
              to help you excel in any interview scenario.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="card text-center hover:shadow-lg transition-shadow duration-300">
                <div className={`w-16 h-16 mx-auto mb-4 ${feature.color} bg-opacity-10 rounded-full flex items-center justify-center`}>
                  <feature.icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              Get started in minutes and see results immediately
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Sign Up & Upload Resume
              </h3>
              <p className="text-gray-600">
                Create your account and upload your resume to get personalized interview questions.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Practice & Chat
              </h3>
              <p className="text-gray-600">
                Practice with mock interviews and chat with our AI assistant for instant guidance.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Get Feedback & Improve
              </h3>
              <p className="text-gray-600">
                Receive detailed feedback and track your progress to continuously improve.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Loved by Job Seekers
            </h2>
            <p className="text-xl text-gray-600">
              See what our users have to say about their success
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="card">
                <div className="flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <StarIcon key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-600 mb-4 italic">
                  "{testimonial.content}"
                </p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Ace Your Next Interview?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Join thousands of job seekers who have successfully landed their dream jobs 
            with Jarvice AI.
          </p>
          {isAuthenticated ? (
            <Link to="/dashboard" className="bg-white text-primary-600 hover:bg-gray-50 font-medium py-3 px-8 rounded-lg transition-colors duration-200 inline-flex items-center">
              Go to Dashboard
              <ArrowRightIcon className="w-5 h-5 ml-2" />
            </Link>
          ) : (
            <Link to="/register" className="bg-white text-primary-600 hover:bg-gray-50 font-medium py-3 px-8 rounded-lg transition-colors duration-200 inline-flex items-center">
              Start Free Today
              <ArrowRightIcon className="w-5 h-5 ml-2" />
            </Link>
          )}
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">J</span>
                </div>
                <span className="text-xl font-bold">Jarvice AI</span>
              </div>
              <p className="text-gray-400">
                AI-powered interview preparation platform helping job seekers succeed.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/chat" className="hover:text-white transition-colors">AI Chatbot</Link></li>
                <li><Link to="/interview" className="hover:text-white transition-colors">Mock Interviews</Link></li>
                <li><Link to="/subscription" className="hover:text-white transition-colors">Pricing</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/help" className="hover:text-white transition-colors">Help Center</Link></li>
                <li><Link to="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link to="/careers" className="hover:text-white transition-colors">Careers</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Jarvice AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
