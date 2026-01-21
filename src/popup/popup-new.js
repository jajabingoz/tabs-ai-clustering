class PopupManager {
  constructor() {
    this.isAnalyzing = false;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkAuthentication();
  }

  bindEvents() {
    // Auth form events
    document.getElementById('showRegisterBtn').addEventListener('click', () => this.showRegisterForm());
    document.getElementById('showLoginBtn').addEventListener('click', () => this.showLoginForm());
    document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
    document.getElementById('registerBtn').addEventListener('click', () => this.handleRegister());
    
    // Main interface events
    document.getElementById('analyzeButton').addEventListener('click', () => this.analyzeTabs());
    document.getElementById('organizeButton')?.addEventListener('click', () => this.organizeTabs());
    document.getElementById('upgradeBtn').addEventListener('click', () => this.handleUpgrade());
    
    // Enter key support
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    document.getElementById('regPassword').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleRegister();
    });
  }

  async checkAuthentication() {
    try {
      const isAuth = await backendAPI.isAuthenticated();
      
      if (isAuth) {
        await this.showMainInterface();
      } else {
        this.showAuthSection();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      this.showAuthSection();
    }
  }

  showAuthSection() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('mainInterface').classList.add('hidden');
  }

  showRegisterForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
  }

  showLoginForm() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
  }

  async handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      this.showMessage('Please enter email and password', 'error');
      return;
    }

    try {
      document.getElementById('loginBtn').disabled = true;
      document.getElementById('loginBtn').textContent = 'Signing in...';

      const result = await backendAPI.login(email, password);
      
      this.showMessage('Signed in successfully!', 'success');
      await this.showMainInterface();
      
    } catch (error) {
      console.error('Login failed:', error);
      this.showMessage(error.message || 'Login failed', 'error');
    } finally {
      document.getElementById('loginBtn').disabled = false;
      document.getElementById('loginBtn').textContent = 'Sign In';
    }
  }

  async handleRegister() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!email || !password) {
      this.showMessage('Please enter email and password', 'error');
      return;
    }

    if (password.length < 8) {
      this.showMessage('Password must be at least 8 characters', 'error');
      return;
    }

    try {
      document.getElementById('registerBtn').disabled = true;
      document.getElementById('registerBtn').textContent = 'Creating account...';

      const result = await backendAPI.register(email, password);
      
      this.showMessage('Account created successfully!', 'success');
      await this.showMainInterface();
      
    } catch (error) {
      console.error('Registration failed:', error);
      this.showMessage(error.message || 'Registration failed', 'error');
    } finally {
      document.getElementById('registerBtn').disabled = false;
      document.getElementById('registerBtn').textContent = 'Create Account';
    }
  }

  async showMainInterface() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('mainInterface').classList.remove('hidden');
    
    await this.loadUserStatus();
  }

  async loadUserStatus() {
    try {
      const profile = await backendAPI.getProfile();
      const usage = await backendAPI.getCachedUsage();
      
      // Update UI with user info
      document.getElementById('userPlan').textContent = profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1);
      
      const usageText = profile.usageLimit === -1 
        ? `${profile.usageThisMonth}/∞` 
        : `${profile.usageThisMonth}/${profile.usageLimit}`;
      document.getElementById('usageDisplay').textContent = usageText;
      
      // Show upgrade prompt if near or at limit
      if (profile.usageLimit !== -1 && profile.usageThisMonth >= profile.usageLimit) {
        document.getElementById('upgradePrompt').classList.remove('hidden');
        document.getElementById('analyzeButton').disabled = true;
        document.getElementById('analyzeButton').textContent = '🚫 Usage Limit Reached';
      } else if (profile.usageLimit !== -1 && profile.usageThisMonth >= profile.usageLimit * 0.8) {
        document.getElementById('upgradePrompt').classList.remove('hidden');
        document.querySelector('#upgradePrompt div div').textContent = `${profile.usageLimit - profile.usageThisMonth} analyses remaining`;
      }

      // Load existing data
      await this.loadStoredData();
      
    } catch (error) {
      console.error('Failed to load user status:', error);
    }
  }

  async loadStoredData() {
    try {
      const result = await browser.storage.local.get(['clusters', 'tabSummaries']);
      const clusters = result.clusters || [];
      
      if (clusters.length > 0) {
        document.getElementById('clusterCount').textContent = clusters.length;
        this.displayClusters(clusters);
        document.getElementById('statusSection').classList.remove('hidden');
      }
    } catch (error) {
      console.error('Failed to load stored data:', error);
    }
  }

  async analyzeTabs() {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    document.getElementById('analyzeButton').disabled = true;
    document.getElementById('analyzeButton').textContent = '⏳ Extracting...';
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('statusSection').classList.add('hidden');

    try {
      // Step 1: Extract tab data from browser
      const tabs = await this.sendMessage('extract-tabs');
      document.getElementById('tabCount').textContent = tabs.length;
      document.getElementById('analyzeButton').textContent = '🧠 Analyzing...';

      if (tabs.length === 0) {
        throw new Error('No tabs to analyze');
      }

      // Step 2: Send to backend for AI analysis with priority scoring
      const result = await backendAPI.analyzeTabs(tabs);
      
      // Step 3: Store results in background script
      await this.sendMessage('store-results', {
        summaries: result.results.summaries,
        clusters: result.results.clusters
      });
      
      // Update UI with results
      document.getElementById('clusterCount').textContent = result.results.clusters.length;
      document.getElementById('usageDisplay').textContent = 
        result.usage.limit === -1 ? `${result.usage.current}/∞` : `${result.usage.current}/${result.usage.limit}`;
      
      this.displayClusters(result.results.clusters, result.results.summaries);
      document.getElementById('statusSection').classList.remove('hidden');

      // Check if approaching limit
      if (result.usage.limit !== -1 && result.usage.current >= result.usage.limit * 0.9) {
        document.getElementById('upgradePrompt').classList.remove('hidden');
      }

      this.showMessage(`Analyzed ${tabs.length} tabs into ${result.results.clusters.length} clusters!`, 'success');

    } catch (error) {
      console.error('Analysis failed:', error);
      
      if (error.message.includes('limit reached')) {
        document.getElementById('upgradePrompt').classList.remove('hidden');
        this.showMessage('Monthly usage limit reached. Upgrade to continue!', 'error');
      } else if (error.message.includes('Authentication required')) {
        await this.checkAuthentication();
      } else {
        this.showMessage(error.message || 'Analysis failed', 'error');
      }
    } finally {
      this.isAnalyzing = false;
      document.getElementById('analyzeButton').disabled = false;
      document.getElementById('analyzeButton').textContent = '🧠 Analyze Tabs';
      document.getElementById('loading').classList.add('hidden');
    }
  }

  async handleUpgrade() {
    try {
      const pricing = await backendAPI.getPricing();
      const subscriptionResult = await backendAPI.createSubscription(pricing.pro.priceId);
      
      // Open subscription page in new tab
      browser.tabs.create({ url: subscriptionResult.subscriptionUrl });
      
    } catch (error) {
      console.error('Upgrade failed:', error);
      this.showMessage('Failed to start upgrade process', 'error');
    }
  }

  async organizeTabs() {
    try {
      await this.sendMessage('organize-tabs');
      this.showMessage('Tabs organized by cluster!', 'success');
    } catch (error) {
      this.showMessage('Failed to organize tabs', 'error');
    }
  }

  displayClusters(clusters, summaries = []) {
    const grid = document.getElementById('clustersGrid');
    grid.innerHTML = '';
    
    const tabMap = new Map(summaries.map(t => [t.id, t]));

    clusters.forEach(cluster => {
      const div = document.createElement('div');
      div.className = 'cluster-item';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'cluster-name';
      nameDiv.textContent = cluster.name;
      
      // Show cluster priority badge
      if (cluster.clusterPriority) {
        const badge = document.createElement('span');
        badge.className = `priority-badge priority-${Math.round(cluster.clusterPriority)}`;
        badge.textContent = `P${cluster.clusterPriority.toFixed(1)}`;
        nameDiv.appendChild(badge);
      }
      
      const countDiv = document.createElement('div');
      countDiv.className = 'cluster-count';
      countDiv.textContent = `${cluster.tabIds.length} tabs`;
      
      // Show tab previews with priority
      const previewDiv = document.createElement('div');
      previewDiv.className = 'cluster-preview';
      cluster.tabIds.slice(0, 3).forEach(id => {
        const tab = tabMap.get(id);
        if (tab) {
          const tabPreview = document.createElement('div');
          tabPreview.className = 'tab-preview';
          tabPreview.innerHTML = `<span class="mini-priority priority-${tab.priorityScore || 3}">${tab.priorityScore || 3}</span> ${(tab.title || '').slice(0, 25)}${(tab.title || '').length > 25 ? '...' : ''}`;
          previewDiv.appendChild(tabPreview);
        }
      });
      if (cluster.tabIds.length > 3) {
        const moreDiv = document.createElement('div');
        moreDiv.className = 'more-tabs';
        moreDiv.textContent = `+${cluster.tabIds.length - 3} more`;
        previewDiv.appendChild(moreDiv);
      }
      
      div.appendChild(nameDiv);
      div.appendChild(countDiv);
      div.appendChild(previewDiv);
      grid.appendChild(div);
    });
  }

  sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage({ type, ...data }, (response) => {
        if (browser.runtime.lastError) {
          reject(browser.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  showMessage(text, type = 'info') {
    // Simple message display - could be enhanced with proper toast notifications
    console.log(`${type.toUpperCase()}: ${text}`);
    
    // You could add a toast notification system here
    if (type === 'error') {
      // Show error styling
    } else if (type === 'success') {
      // Show success styling
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});