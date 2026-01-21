require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const Database = require('./database');
const GroqService = require('./services/groq');
const StripeService = require('./services/stripe');
const RateLimiter = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const db = new Database();
const groqService = new GroqService();
const stripeService = new StripeService();
const rateLimiter = new RateLimiter();

// Initialize database tables (non-blocking)
db.init().catch(err => {
  console.error('Database initialization failed:', err);
  // Continue anyway - endpoints will fail gracefully
});

// Middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['moz-extension://', 'chrome-extension://'],
  credentials: true
}));

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// User Registration
app.post('/auth/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await db.createUser({
      email,
      password: hashedPassword,
      plan: 'free',
      usageThisMonth: 0,
      usageLimit: 25
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        plan: user.plan 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageThisMonth: user.usageThisMonth,
        usageLimit: user.usageLimit
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Login
app.post('/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get user
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        plan: user.plan 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageThisMonth: user.usageThisMonth,
        usageLimit: user.usageLimit
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile
app.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      usageThisMonth: user.usageThisMonth,
      usageLimit: user.usageLimit,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionEndDate: user.subscriptionEndDate
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// AI Tab Analysis (Protected Route)
app.post('/api/analyze', 
  authenticateToken,
  rateLimiter.createLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 requests per 15 minutes
  async (req, res) => {
  try {
    const { tabs } = req.body;
    
    if (!tabs || !Array.isArray(tabs)) {
      return res.status(400).json({ error: 'Invalid tabs data' });
    }

    // Check usage limits
    const user = await db.getUserById(req.user.userId);
    if (user.usageThisMonth >= user.usageLimit) {
      return res.status(429).json({ 
        error: 'Monthly usage limit reached',
        usage: user.usageThisMonth,
        limit: user.usageLimit,
        upgradeUrl: `${process.env.FRONTEND_URL}/upgrade`
      });
    }

    // Process tabs with Groq AI
    const results = await groqService.analyzeTabs(tabs);
    
    // Update usage
    await db.incrementUsage(req.user.userId, tabs.length);

    // Log usage for analytics
    await db.logUsage({
      userId: req.user.userId,
      operation: 'analyze',
      tabCount: tabs.length,
      timestamp: new Date()
    });

    res.json({
      results,
      usage: {
        current: user.usageThisMonth + tabs.length,
        limit: user.usageLimit
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Stripe webhook for subscription updates
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripeService.constructEvent(req.body, sig);
    
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        stripeService.handleSubscriptionUpdate(event.data.object);
        break;
      case 'customer.subscription.deleted':
        stripeService.handleSubscriptionCanceled(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Create subscription
app.post('/billing/subscribe', authenticateToken, async (req, res) => {
  try {
    const { priceId } = req.body;
    const user = await db.getUserById(req.user.userId);
    
    const session = await stripeService.createSubscription(user.email, priceId);
    
    res.json({ 
      subscriptionUrl: session.url,
      sessionId: session.id 
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// Get billing portal
app.post('/billing/portal', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);
    
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const portalSession = await stripeService.createPortalSession(user.stripeCustomerId);
    
    res.json({ portalUrl: portalSession.url });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`Database configured: ${process.env.POSTGRES_URL ? 'Yes' : 'No'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    db.close().catch(console.error);
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`TabsAI Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});