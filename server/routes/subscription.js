const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'month',
      features: [
        'AI Chatbot Access',
        'Basic Interview Prep',
        'Chat History',
        'Email Support'
      ],
      limits: {
        chat_messages: 50,
        interviews_per_month: 3
      }
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 19.99,
      currency: 'usd',
      interval: 'month',
      features: [
        'Everything in Free',
        'Unlimited Chat Messages',
        'Unlimited Interviews',
        'AI Image Generation',
        'Advanced Interview Analytics',
        'Priority Support',
        'Custom Interview Scenarios'
      ],
      limits: {
        chat_messages: -1,
        interviews_per_month: -1,
        image_generations: 100
      }
    }
  ];

  res.json({ plans });
});

router.post('/checkout', [
  authenticateToken,
  body('plan_id').isIn(['premium']).withMessage('Invalid plan selected'),
  body('success_url').isURL().withMessage('Valid success URL required'),
  body('cancel_url').isURL().withMessage('Valid cancel URL required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { plan_id, success_url, cancel_url } = req.body;
    const userId = req.user.id;

    const existingSubscription = await pool.query(
      'SELECT id FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (existingSubscription.rows.length > 0) {
      return res.status(400).json({ message: 'User already has an active subscription' });
    }

    let customerId = await getOrCreateStripeCustomer(userId, req.user.email, req.user.name);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Jarvice AI Premium',
              description: 'Unlock unlimited AI features and advanced interview preparation',
            },
            unit_amount: 1999,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: {
        user_id: userId.toString(),
        plan_id: plan_id
      }
    });

    res.json({
      session_id: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT s.*, u.subscription_status 
       FROM subscriptions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: 'free',
        plan: 'free',
        features: ['AI Chatbot Access', 'Basic Interview Prep', 'Chat History'],
        limits: {
          chat_messages: 50,
          interviews_per_month: 3
        }
      });
    }

    const subscription = result.rows[0];
    res.json({
      status: subscription.status,
      plan: subscription.plan,
      current_period_end: subscription.end_date,
      stripe_subscription_id: subscription.stripe_subscription_id,
      features: subscription.plan === 'premium' ? [
        'AI Chatbot Access',
        'Unlimited Interviews',
        'AI Image Generation',
        'Advanced Analytics',
        'Priority Support'
      ] : [
        'AI Chatbot Access',
        'Basic Interview Prep',
        'Chat History'
      ],
      limits: subscription.plan === 'premium' ? {
        chat_messages: -1,
        interviews_per_month: -1,
        image_generations: 100
      } : {
        chat_messages: 50,
        interviews_per_month: 3
      }
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({ message: 'Failed to get subscription status' });
  }
});

router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    const subscriptionId = result.rows[0].stripe_subscription_id;

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
      ['canceled', subscriptionId]
    );

    res.json({ message: 'Subscription will be canceled at the end of the current period' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
});

const getOrCreateStripeCustomer = async (userId, email, name) => {
  try {
    const result = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].stripe_customer_id;
    }

    const customer = await stripe.customers.create({
      email: email,
      name: name,
      metadata: {
        user_id: userId.toString()
      }
    });

    return customer.id;
  } catch (error) {
    console.error('Create Stripe customer error:', error);
    throw error;
  }
};

const handleCheckoutCompleted = async (session) => {
  try {
    const userId = parseInt(session.metadata.user_id);
    const planId = session.metadata.plan_id;

    const subscription = await stripe.subscriptions.retrieve(session.subscription);

    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, stripe_customer_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        planId,
        'active',
        subscription.id,
        subscription.customer,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000)
      ]
    );

    await pool.query(
      'UPDATE users SET subscription_status = $1 WHERE id = $2',
      ['premium', userId]
    );

    console.log(`Subscription created for user ${userId}`);
  } catch (error) {
    console.error('Handle checkout completed error:', error);
  }
};

const handleSubscriptionUpdated = async (subscription) => {
  try {
    const status = subscription.status === 'active' ? 'active' : 'inactive';
    await pool.query(
      'UPDATE subscriptions SET status = $1, end_date = $2 WHERE stripe_subscription_id = $3',
      [status, new Date(subscription.current_period_end * 1000), subscription.id]
    );

    console.log(`Subscription ${subscription.id} updated to ${status}`);
  } catch (error) {
    console.error('Handle subscription updated error:', error);
  }
};

const handleSubscriptionDeleted = async (subscription) => {
  try {
    await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
      ['canceled', subscription.id]
    );

    const result = await pool.query(
      'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
      [subscription.id]
    );

    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE users SET subscription_status = $1 WHERE id = $2',
        ['free', result.rows[0].user_id]
      );
    }

    console.log(`Subscription ${subscription.id} canceled`);
  } catch (error) {
    console.error('Handle subscription deleted error:', error);
  }
};

const handlePaymentSucceeded = async (invoice) => {
  try {
    if (invoice.subscription) {
      await pool.query(
        'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
        ['active', invoice.subscription]
      );
    }
    console.log(`Payment succeeded for invoice ${invoice.id}`);
  } catch (error) {
    console.error('Handle payment succeeded error:', error);
  }
};

const handlePaymentFailed = async (invoice) => {
  try {
    if (invoice.subscription) {
      await pool.query(
        'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
        ['past_due', invoice.subscription]
      );
    }
    console.log(`Payment failed for invoice ${invoice.id}`);
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
};

module.exports = router;
