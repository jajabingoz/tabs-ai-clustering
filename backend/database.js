const { Pool } = require('pg');

class Database {
  constructor() {
    // Use Supabase connection string from environment
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.warn('WARNING: No database URL configured. Database features will be unavailable.');
      this.pool = null;
      return;
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async init() {
    if (!this.pool) {
      console.warn('Database not initialized - no connection string provided');
      return;
    }

    try {
      // Users table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          plan TEXT DEFAULT 'free',
          usageThisMonth INTEGER DEFAULT 0,
          usageLimit INTEGER DEFAULT 25,
          subscriptionStatus TEXT DEFAULT 'inactive',
          subscriptionEndDate DATE,
          stripeCustomerId TEXT,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Usage logs table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS usage_logs (
          id SERIAL PRIMARY KEY,
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          operation TEXT NOT NULL,
          tabCount INTEGER DEFAULT 1,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('Database initialized successfully with Supabase');
    } catch (error) {
      console.error('Database initialization error:', error.message);
    }
  }

  // User methods
  async createUser(userData) {
    try {
      const { email, password, plan = 'free', usageLimit = 25 } = userData;
      
      const result = await this.pool.query(
        `INSERT INTO users (email, password, plan, usageLimit)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, plan, usageThisMonth, usageLimit`,
        [email, password, plan, usageLimit]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  async getUserByEmail(email) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  async getUserById(id) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to get user by id: ${error.message}`);
    }
  }

  async updateUser(id, updates) {
    try {
      const fields = Object.keys(updates)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');
      
      const values = Object.values(updates);
      
      const result = await this.pool.query(
        `UPDATE users 
         SET ${fields}, updatedAt = CURRENT_TIMESTAMP 
         WHERE id = $${values.length + 1}
         RETURNING *`,
        [...values, id]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async incrementUsage(userId, count = 1) {
    try {
      const result = await this.pool.query(
        `UPDATE users 
         SET usageThisMonth = usageThisMonth + $1 
         WHERE id = $2
         RETURNING usageThisMonth, usageLimit`,
        [count, userId]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to increment usage: ${error.message}`);
    }
  }

  // Usage logging
  async logUsage(logData) {
    try {
      const { userId, operation, tabCount, timestamp } = logData;
      
      const result = await this.pool.query(
        `INSERT INTO usage_logs (userId, operation, tabCount, timestamp)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, operation, tabCount, timestamp]
      );
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to log usage: ${error.message}`);
    }
  }

  async getUserUsageStats(userId, days = 30) {
    try {
      const result = await this.pool.query(
        `SELECT 
           DATE(timestamp) as date,
           COUNT(*) as requests,
           SUM(tabCount) as totalTabs
         FROM usage_logs 
         WHERE userId = $1 
           AND timestamp >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(timestamp)
         ORDER BY date DESC`,
        [userId]
      );
      
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }
  }

  // Admin methods
  async getAllUsers(limit = 100, offset = 0) {
    try {
      const result = await this.pool.query(
        `SELECT id, email, plan, usageThisMonth, usageLimit, subscriptionStatus, createdAt 
         FROM users 
         ORDER BY createdAt DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  async getUsageAnalytics(days = 30) {
    try {
      const result = await this.pool.query(
        `SELECT 
           DATE(timestamp) as date,
           COUNT(DISTINCT userId) as activeUsers,
           COUNT(*) as totalRequests,
           SUM(tabCount) as totalTabsProcessed
         FROM usage_logs 
         WHERE timestamp >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(timestamp)
         ORDER BY date DESC`
      );
      
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get analytics: ${error.message}`);
    }
  }

  // Sync usage reset (run periodically)
  async resetMonthlyUsage() {
    try {
      await this.pool.query(
        `UPDATE users 
         SET usageThisMonth = 0 
         WHERE plan = 'free' 
           AND DATE_TRUNC('month', updatedAt) < DATE_TRUNC('month', CURRENT_TIMESTAMP)`
      );
      
      console.log('Monthly usage reset completed');
    } catch (error) {
      console.error('Failed to reset monthly usage:', error.message);
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
}

module.exports = Database;