class BackendAPIService {
  constructor() {
    this.baseUrl = 'https://tab-ai-clustering.vercel.app';
    this.token = null;
  }

  async setAuthToken(token) {
    this.token = token;
    await browser.storage.local.set({ authToken: token });
  }

  async getAuthToken() {
    if (!this.token) {
      const result = await browser.storage.local.get('authToken');
      this.token = result.authToken;
    }
    return this.token;
  }

  async clearAuth() {
    this.token = null;
    await browser.storage.local.remove(['authToken', 'userProfile']);
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();
    
    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      ...options
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      
      if (response.status === 401) {
        // Token expired, clear auth
        await this.clearAuth();
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Authentication methods
  async register(email, password) {
    const result = await this.makeRequest('/auth/register', {
      method: 'POST',
      body: { email, password }
    });

    await this.setAuthToken(result.token);
    await browser.storage.local.set({ userProfile: result.user });
    
    return result;
  }

  async login(email, password) {
    const result = await this.makeRequest('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    await this.setAuthToken(result.token);
    await browser.storage.local.set({ userProfile: result.user });
    
    return result;
  }

  async getProfile() {
    const profile = await this.makeRequest('/auth/profile');
    await browser.storage.local.set({ userProfile: profile });
    return profile;
  }

  async logout() {
    await this.clearAuth();
  }

  // Main AI analysis method
  async analyzeTabs(tabs) {
    const result = await this.makeRequest('/api/analyze', {
      method: 'POST',
      body: { tabs }
    });

    // Store results locally for offline access
    await browser.storage.local.set({
      tabSummaries: result.results.summaries,
      clusters: result.results.clusters,
      lastAnalyzed: Date.now(),
      currentUsage: result.usage
    });

    return result;
  }

  // Subscription management
  async createSubscription(priceId) {
    return await this.makeRequest('/billing/subscribe', {
      method: 'POST',
      body: { priceId }
    });
  }

  async getBillingPortal() {
    return await this.makeRequest('/billing/portal', {
      method: 'POST'
    });
  }

  // Check if user is authenticated
  async isAuthenticated() {
    try {
      const token = await this.getAuthToken();
      if (!token) return false;
      
      await this.getProfile();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get cached user data
  async getCachedProfile() {
    const result = await browser.storage.local.get('userProfile');
    return result.userProfile;
  }

  async getCachedUsage() {
    const result = await browser.storage.local.get('currentUsage');
    return result.currentUsage;
  }

  // Pricing information
  async getPricing() {
    return {
      free: {
        name: 'Free',
        price: 0,
        usageLimit: 25,
        features: ['25 analyses/month', 'Basic clustering', 'Standard support']
      },
      pro: {
        name: 'Pro',
        price: 4.99,
        priceId: 'price_pro_monthly',
        usageLimit: 1000,
        features: ['1000 analyses/month', 'Priority processing', 'Email support']
      },
      business: {
        name: 'Business',
        price: 19.99,
        priceId: 'price_business_monthly', 
        usageLimit: -1, // Unlimited
        features: ['Unlimited analyses', 'Team features', 'Priority support', 'Custom integrations']
      }
    };
  }
}

const backendAPI = new BackendAPIService();