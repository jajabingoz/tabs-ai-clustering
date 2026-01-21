require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');

const app = express();

// Database connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

  jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'not set';
  const hostname = dbUrl.includes('@') ? dbUrl.split('@')[1]?.split(':')[0] : 'unknown';
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: {
      node_env: process.env.NODE_ENV,
      db_hostname: hostname, // Show which hostname is being used
      db_configured: !!process.env.POSTGRES_URL,
      groq_configured: !!process.env.GROQ_API_KEY
    }
  });
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
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password, plan, usagethismonth, usagelimit) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, plan, usagethismonth, usagelimit`,
      [email, hashedPassword, 'free', 0, 25]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        plan: user.plan 
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageThisMonth: user.usagethismonth || 0,
        usageLimit: user.usagelimit || 25
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
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
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

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
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageThisMonth: user.usagethismonth || 0,
        usageLimit: user.usagelimit || 25
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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      usageThisMonth: user.usagethismonth || 0,
      usageLimit: user.usagelimit || 25,
      subscriptionStatus: user.subscriptionstatus,
      subscriptionEndDate: user.subscriptionenddate
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Tab Analysis endpoint
const GroqService = require('../services/groq');
const groqService = new GroqService();

app.post('/api/analyze', authenticateToken, async (req, res) => {
  try {
    const { tabs } = req.body;
    
    if (!tabs || !Array.isArray(tabs) || tabs.length === 0) {
      return res.status(400).json({ error: 'No tabs provided' });
    }

    // Check usage limit
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const usageThisMonth = user.usagethismonth || 0;
    const usageLimit = user.usagelimit || 25;

    if (usageLimit !== -1 && usageThisMonth >= usageLimit) {
      return res.status(429).json({ 
        error: 'Monthly usage limit reached',
        usage: { current: usageThisMonth, limit: usageLimit }
      });
    }

    // Analyze tabs with Groq
    const results = await groqService.analyzeTabs(tabs);

    // Update usage count
    await pool.query(
      'UPDATE users SET usagethismonth = usagethismonth + 1 WHERE id = $1',
      [req.user.userId]
    );

    // Log usage
    await pool.query(
      'INSERT INTO usage_logs (user_id, action, tabs_count) VALUES ($1, $2, $3)',
      [req.user.userId, 'analyze', tabs.length]
    );

    res.json({
      results,
      usage: {
        current: usageThisMonth + 1,
        limit: usageLimit
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed: ' + error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
