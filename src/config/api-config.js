// API Configuration
const API_CONFIG = {
  // Update this with your deployed backend URL
  PRODUCTION_API: 'https://your-backend.railway.app', // Replace with your actual URL
  
  // For local development
  DEVELOPMENT_API: 'http://localhost:3000',
  
  // Auto-detect environment
  getBaseUrl() {
    // For extension, always use production API
    return this.PRODUCTION_API;
  },
  
  // Feature flags
  FEATURES: {
    enableAnalytics: true,
    enableErrorReporting: true,
    showUpgradePrompts: true
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.API_CONFIG = API_CONFIG;
}