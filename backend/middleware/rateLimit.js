const rateLimit = require('express-rate-limit');

class RateLimiter {
  createLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // Max requests per window
      keyGenerator = (req) => req.user?.userId || req.ip
    } = options;

    return rateLimit({
      windowMs,
      max,
      keyGenerator,
      message: {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 60000)} minutes.`
      },
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  // Premium users get higher limits
  createPremiumLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req) => {
        switch (req.user?.plan) {
          case 'business': return 1000;
          case 'pro': return 200;
          default: return 50;
        }
      },
      keyGenerator: (req) => `${req.user?.userId}-${req.user?.plan}`,
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded for your plan.'
      }
    });
  }
}

module.exports = RateLimiter;