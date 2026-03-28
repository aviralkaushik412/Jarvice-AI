import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../config/axios';
import {
  CheckIcon,
  XMarkIcon,
  StarIcon,
  CreditCardIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

const Subscription = () => {
  const { user, updateUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [plansResponse, subscriptionResponse] = await Promise.all([
        axios.get('/api/subscription/plans'),
        axios.get('/api/subscription/status')
      ]);
      
      setPlans(plansResponse.data.plans);
      setSubscription(subscriptionResponse.data);
    } catch (error) {
      console.error('Error fetching subscription data:', error);
      toast.error('Failed to load subscription information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planId) => {
    if (planId === 'free') {
      toast.error('You are already on the free plan');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await axios.post('/api/subscription/checkout', {
        plan_id: planId,
        success_url: `${window.location.origin}/subscription?success=true`,
        cancel_url: `${window.location.origin}/subscription?canceled=true`
      });

      // Redirect to Stripe checkout
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error('Failed to start checkout process');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.')) {
      try {
        await axios.post('/api/subscription/cancel');
        toast.success('Subscription will be canceled at the end of the current period');
        fetchData(); // Refresh subscription status
      } catch (error) {
        console.error('Error canceling subscription:', error);
        toast.error('Failed to cancel subscription');
      }
    }
  };

  const getFeatureIcon = (feature) => {
    if (feature.includes('Unlimited') || feature.includes('Advanced') || feature.includes('Priority')) {
      return <SparklesIcon className="h-5 w-5 text-purple-500" />;
    }
    return <CheckIcon className="h-5 w-5 text-green-500" />;
  };

  const getPlanBadge = (planId) => {
    if (planId === 'premium') {
      return (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Unlock the full potential of Jarvice AI with our premium features
          </p>
        </div>

        {subscription && (
          <div className="mb-8">
            <div className={`card ${
              subscription.status === 'premium' 
                ? 'border-purple-200 bg-purple-50' 
                : 'border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-4 ${
                    subscription.status === 'premium' 
                      ? 'bg-purple-600' 
                      : 'bg-gray-600'
                  }`}>
                    <CreditCardIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Current Plan: {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                    </h3>
                    <p className="text-gray-600">
                      {subscription.status === 'premium' 
                        ? 'You have access to all premium features'
                        : 'Upgrade to unlock premium features'
                      }
                    </p>
                  </div>
                </div>
                {subscription.status === 'premium' && (
                  <button
                    onClick={handleCancel}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative card ${
                plan.id === 'premium' 
                  ? 'border-purple-200 shadow-lg scale-105' 
                  : 'border-gray-200'
              }`}
            >
              {getPlanBadge(plan.id)}
              
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-600">/{plan.interval}</span>
                </div>
                <p className="text-gray-600">
                  {plan.id === 'free' 
                    ? 'Perfect for getting started'
                    : 'Everything you need to succeed'
                  }
                </p>
              </div>

              <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Features</h4>
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      {getFeatureIcon(feature)}
                      <span className="ml-3 text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Limits</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Chat Messages:</span>
                    <span className="font-medium">
                      {plan.limits.chat_messages === -1 ? 'Unlimited' : plan.limits.chat_messages}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Interviews per Month:</span>
                    <span className="font-medium">
                      {plan.limits.interviews_per_month === -1 ? 'Unlimited' : plan.limits.interviews_per_month}
                    </span>
                  </div>
                  {plan.limits.image_generations && (
                    <div className="flex justify-between">
                      <span>Image Generations:</span>
                      <span className="font-medium">
                        {plan.limits.image_generations === -1 ? 'Unlimited' : plan.limits.image_generations}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isProcessing || (subscription && subscription.plan === plan.id)}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  plan.id === 'premium'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="sm" className="mr-2" />
                    Processing...
                  </div>
                ) : subscription && subscription.plan === plan.id ? (
                  'Current Plan'
                ) : plan.id === 'free' ? (
                  'Get Started'
                ) : (
                  'Upgrade Now'
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Can I change my plan anytime?
              </h3>
              <p className="text-gray-600">
                Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
              </p>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600">
                We accept all major credit cards (Visa, MasterCard, American Express) through our secure Stripe payment processor.
              </p>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Is there a free trial?
              </h3>
              <p className="text-gray-600">
                Yes! You can start with our free plan and upgrade anytime. No credit card required for the free plan.
              </p>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Can I cancel anytime?
              </h3>
              <p className="text-gray-600">
                Absolutely. You can cancel your subscription at any time. You'll continue to have access to premium features until the end of your current billing period.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <div className="card max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Need Help Choosing?
            </h3>
            <p className="text-gray-600 mb-4">
              Our support team is here to help you find the perfect plan for your needs.
            </p>
            <button className="btn-outline">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
