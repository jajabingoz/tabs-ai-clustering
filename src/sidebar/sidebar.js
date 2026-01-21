class SidebarManager {
  constructor() {
    this.clusters = [];
    this.tabSummaries = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadData();
    this.listenForUpdates();
  }

  bindEvents() {
    document.getElementById('refreshBtn').addEventListener('click', () => this.loadData());
    document.getElementById('exportBtn').addEventListener('click', () => this.toggleExportSection());
    document.getElementById('exportBookmarks').addEventListener('click', () => this.exportBookmarks());
    document.getElementById('exportText').addEventListener('click', () => this.exportText());
    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    
    // Add organize button handler if it exists
    const organizeBtn = document.getElementById('organizeBtn');
    if (organizeBtn) {
      organizeBtn.addEventListener('click', () => this.organizeTabs());
    }
  }

  listenForUpdates() {
    browser.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'analysis-started':
          this.showProgress('Starting analysis...', 0, message.data.total);
          break;
        case 'extraction-progress':
          this.showProgress('Extracting content...', message.data.current, message.data.total);
          break;
        case 'analysis-progress':
          this.showProgress('Analyzing tabs...', message.data.current, message.data.total);
          break;
        case 'analysis-complete':
          this.hideProgress();
          this.loadData();
          break;
      }
    });
  }

  showProgress(text, current, total) {
    let progressEl = document.getElementById('progressIndicator');
    if (!progressEl) {
      progressEl = document.createElement('div');
      progressEl.id = 'progressIndicator';
      progressEl.className = 'progress-indicator';
      document.querySelector('.sidebar-header').appendChild(progressEl);
    }
    const percent = Math.round((current / total) * 100);
    progressEl.innerHTML = `
      <div class="progress-text">${text} (${current}/${total})</div>
      <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
    `;
    progressEl.classList.remove('hidden');
  }

  hideProgress() {
    const progressEl = document.getElementById('progressIndicator');
    if (progressEl) {
      progressEl.classList.add('hidden');
    }
  }

  async loadData() {
    this.showLoading(true);
    
    try {
      const result = await browser.storage.local.get(['clusters', 'tabSummaries']);
      this.clusters = result.clusters || [];
      this.tabSummaries = result.tabSummaries || [];
      
      if (this.clusters.length === 0) {
        this.showEmptyState();
      } else {
        this.displayClusters();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showEmptyState();
    } finally {
      this.showLoading(false);
    }
  }

  showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
    document.getElementById('emptyState').classList.toggle('hidden', show);
    document.getElementById('clustersContainer').classList.toggle('hidden', show);
  }

  showEmptyState() {
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('clustersContainer').classList.add('hidden');
    document.getElementById('exportSection').classList.add('hidden');
  }

  displayClusters() {
    const container = document.getElementById('clustersContainer');
    container.innerHTML = '';
    document.getElementById('emptyState').classList.add('hidden');

    // Clusters are already sorted by priority from background.js
    this.clusters.forEach((cluster, index) => {
      const clusterDiv = document.createElement('div');
      clusterDiv.className = 'cluster-section';
      this.createClusterElement(cluster, clusterDiv);
      container.appendChild(clusterDiv);
    });

    this.bindTabEvents();
    document.getElementById('clustersContainer').classList.remove('hidden');
  }

  createClusterElement(cluster, clusterDiv) {
    const clusterTabs = cluster.tabIds.map(tabId => 
      this.tabSummaries.find(tab => tab.id === tabId)
    ).filter(tab => tab);

    // Create cluster header
    const header = document.createElement('div');
    header.className = 'cluster-header';
    
    const titleRow = document.createElement('div');
    titleRow.className = 'cluster-title-row';
    
    const title = document.createElement('div');
    title.className = 'cluster-title';
    title.textContent = cluster.name;
    
    // Show cluster priority badge
    if (cluster.clusterPriority) {
      const priorityBadge = document.createElement('span');
      priorityBadge.className = `priority-badge priority-${Math.round(cluster.clusterPriority)}`;
      priorityBadge.textContent = `P${cluster.clusterPriority.toFixed(1)}`;
      priorityBadge.title = 'Average cluster priority';
      titleRow.appendChild(title);
      titleRow.appendChild(priorityBadge);
    } else {
      titleRow.appendChild(title);
    }
    
    const description = document.createElement('div');
    description.className = 'cluster-description';
    description.textContent = cluster.description || '';
    
    const meta = document.createElement('div');
    meta.className = 'cluster-meta';
    meta.textContent = `${clusterTabs.length} tabs`;
    
    header.appendChild(titleRow);
    header.appendChild(description);
    header.appendChild(meta);
    
    // Create tab list - tabs are already sorted by priority within cluster
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    
    clusterTabs.forEach(tab => {
      if (tab) {
        this.createTabElement(tab, tabList);
      }
    });
    
    clusterDiv.appendChild(header);
    clusterDiv.appendChild(tabList);
  }

  createTabElement(tab, tabList) {
    const domain = new URL(tab.url).hostname;
    const favicon = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    
    const tabDiv = document.createElement('div');
    tabDiv.className = 'tab-item';
    tabDiv.dataset.tabId = tab.id;
    
    // Priority indicator
    const priorityDiv = document.createElement('div');
    priorityDiv.className = `tab-priority priority-${tab.priorityScore || 3}`;
    priorityDiv.textContent = tab.priorityScore || 3;
    priorityDiv.title = tab.priorityRationale || 'Priority score';
    
    // Tab content wrapper
    const contentDiv = document.createElement('div');
    contentDiv.className = 'tab-content';
    
    // Tab title with favicon
    const titleDiv = document.createElement('div');
    titleDiv.className = 'tab-title';
    
    const img = document.createElement('img');
    img.src = favicon;
    img.width = 16;
    img.height = 16;
    img.style.marginRight = '6px';
    img.style.verticalAlign = 'middle';
    img.onerror = () => { img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle fill="%23ccc" cx="8" cy="8" r="6"/></svg>'; };
    
    titleDiv.appendChild(img);
    titleDiv.appendChild(document.createTextNode(tab.title));
    
    // Tab URL
    const urlDiv = document.createElement('div');
    urlDiv.className = 'tab-url';
    urlDiv.textContent = tab.url;
    
    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(urlDiv);
    
    // Tab summary if available
    if (tab.summary) {
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'tab-summary';
      summaryDiv.textContent = tab.summary;
      contentDiv.appendChild(summaryDiv);
    }

    // Priority rationale tooltip
    if (tab.priorityRationale) {
      const rationaleDiv = document.createElement('div');
      rationaleDiv.className = 'tab-rationale';
      rationaleDiv.textContent = tab.priorityRationale;
      contentDiv.appendChild(rationaleDiv);
    }
    
    // Tab actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'tab-actions';
    
    ['focus', 'close', 'bookmark'].forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'tab-action';
      btn.dataset.action = action;
      btn.dataset.tabId = tab.id;
      btn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
      actionsDiv.appendChild(btn);
    });
    
    tabDiv.appendChild(priorityDiv);
    tabDiv.appendChild(contentDiv);
    tabDiv.appendChild(actionsDiv);
    tabList.appendChild(tabDiv);
  }

  async organizeTabs() {
    try {
      await browser.runtime.sendMessage({ type: 'organize-tabs' });
      this.showMessage('Tabs organized by cluster!');
    } catch (error) {
      console.error('Failed to organize tabs:', error);
    }
  }

  bindTabEvents() {
    document.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-action')) return;
        const tabId = parseInt(item.dataset.tabId);
        this.focusTab(tabId);
      });
    });

    document.querySelectorAll('.tab-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const tabId = parseInt(btn.dataset.tabId);
        
        switch (action) {
          case 'focus':
            this.focusTab(tabId);
            break;
          case 'close':
            this.closeTab(tabId);
            break;
          case 'bookmark':
            this.bookmarkTab(tabId);
            break;
        }
      });
    });
  }

  async focusTab(tabId) {
    try {
      await browser.tabs.update(tabId, { active: true });
      const tab = await browser.tabs.get(tabId);
      await browser.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      console.error('Failed to focus tab:', error);
    }
  }

  async closeTab(tabId) {
    try {
      await browser.tabs.remove(tabId);
      this.tabSummaries = this.tabSummaries.filter(tab => tab.id !== tabId);
      this.clusters.forEach(cluster => {
        cluster.tabIds = cluster.tabIds.filter(id => id !== tabId);
      });
      this.clusters = this.clusters.filter(cluster => cluster.tabIds.length > 0);
      
      await browser.storage.local.set({
        clusters: this.clusters,
        tabSummaries: this.tabSummaries
      });
      
      this.displayClusters();
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  }

  async bookmarkTab(tabId) {
    const tab = this.tabSummaries.find(t => t.id === tabId);
    if (!tab) return;

    try {
      await browser.bookmarks.create({
        title: tab.title,
        url: tab.url
      });
      this.showMessage('Bookmark created!');
    } catch (error) {
      console.error('Failed to create bookmark:', error);
    }
  }

  toggleExportSection() {
    const section = document.getElementById('exportSection');
    section.classList.toggle('hidden');
  }

  async exportBookmarks() {
    try {
      const bookmarkFolder = await browser.bookmarks.create({
        title: `TabsAI Clusters - ${new Date().toLocaleDateString()}`
      });

      for (const cluster of this.clusters) {
        const clusterFolder = await browser.bookmarks.create({
          title: cluster.name,
          parentId: bookmarkFolder.id
        });

        for (const tabId of cluster.tabIds) {
          const tab = this.tabSummaries.find(t => t.id === tabId);
          if (tab) {
            await browser.bookmarks.create({
              title: tab.title,
              url: tab.url,
              parentId: clusterFolder.id
            });
          }
        }
      }

      this.showMessage('Bookmarks exported successfully!');
    } catch (error) {
      console.error('Failed to export bookmarks:', error);
    }
  }

  exportText() {
    let text = `TabsAI Clusters - ${new Date().toLocaleDateString()}\n`;
    text += `Sorted by Priority Score (1=highest) → Cluster → Title\n\n`;
    
    this.clusters.forEach(cluster => {
      text += `## ${cluster.name}`;
      if (cluster.clusterPriority) {
        text += ` [Avg Priority: ${cluster.clusterPriority.toFixed(1)}]`;
      }
      text += '\n';
      text += `${cluster.description}\n\n`;
      
      cluster.tabIds.forEach(tabId => {
        const tab = this.tabSummaries.find(t => t.id === tabId);
        if (tab) {
          text += `[P${tab.priorityScore || 3}] ${tab.title}\n`;
          text += `  ${tab.url}\n`;
          if (tab.summary) {
            text += `  Summary: ${tab.summary}\n`;
          }
          if (tab.priorityRationale) {
            text += `  Priority: ${tab.priorityRationale}\n`;
          }
          text += '\n';
        }
      });
      text += '\n';
    });

    this.downloadFile('tabs-clusters.txt', text, 'text/plain');
  }

  exportJSON() {
    const data = {
      exportDate: new Date().toISOString(),
      clusters: this.clusters,
      tabSummaries: this.tabSummaries
    };

    this.downloadFile('tabs-clusters.json', JSON.stringify(data, null, 2), 'application/json');
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  showMessage(text) {
    // Simple message - could be enhanced with proper toast notifications
    console.log(text);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SidebarManager();
});