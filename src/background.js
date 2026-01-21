class TabManager {
  constructor() {
    this.tabs = new Map();
    this.tabSummaries = new Map();
    this.clusters = [];
    this.isAnalyzing = false;
  }

  async getAllTabs() {
    return new Promise((resolve) => {
      browser.tabs.query({}, (tabs) => {
        resolve(tabs.filter(tab => 
          !tab.url.startsWith('chrome://') && 
          !tab.url.startsWith('about:') &&
          !tab.url.startsWith('moz-extension://')
        ));
      });
    });
  }

  async extractTabContent(tab) {
    try {
      const results = await browser.tabs.executeScript(tab.id, {
        code: `
          ({
            title: document.title,
            url: window.location.href,
            metaDescription: document.querySelector('meta[name="description"]')?.content || '',
            headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5).map(h => h.textContent.trim()),
            textContent: document.body.innerText.slice(0, 2000)
          })
        `
      });
      return results[0];
    } catch (error) {
      return {
        title: tab.title,
        url: tab.url,
        metaDescription: '',
        headings: [],
        textContent: ''
      };
    }
  }

  async extractAllTabs() {
    // Only extract content, don't analyze (analysis done by backend)
    if (this.isAnalyzing) return [];
    
    this.isAnalyzing = true;
    const tabs = await this.getAllTabs();
    const tabData = [];

    this.broadcastUpdate('extraction-started', { total: tabs.length });

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const content = await this.extractTabContent(tab);
      tabData.push({
        id: tab.id,
        favIconUrl: tab.favIconUrl,
        ...content
      });
      this.broadcastUpdate('extraction-progress', { current: i + 1, total: tabs.length });
    }

    this.tabs = new Map(tabData.map(tab => [tab.id, tab]));
    this.isAnalyzing = false;
    this.broadcastUpdate('extraction-complete', { count: tabData.length });
    
    return tabData;
  }

  async storeResults(summaries, clusters) {
    // Store results from backend analysis
    this.tabSummaries = new Map(summaries.map(tab => [tab.id, tab]));
    this.clusters = clusters;
    
    await browser.storage.local.set({
      tabSummaries: summaries,
      clusters: clusters,
      lastAnalysis: Date.now()
    });
    
    this.broadcastUpdate('analysis-complete', { 
      tabCount: summaries.length,
      clusterCount: clusters.length 
    });
  }

  getSortedResults() {
    const results = [];
    for (const cluster of this.clusters) {
      for (const tabId of cluster.tabIds) {
        const tab = this.tabSummaries.get(tabId);
        if (tab) {
          results.push({
            ...tab,
            clusterName: cluster.name,
            clusterPriority: cluster.clusterPriority
          });
        }
      }
    }
    return results;
  }

  async organizeTabsIntoGroups() {
    const allTabs = await this.getAllTabs();
    const tabIndexMap = new Map(allTabs.map((tab, index) => [tab.id, index]));
    
    let targetIndex = 0;
    for (const cluster of this.clusters) {
      for (const tabId of cluster.tabIds) {
        if (tabIndexMap.has(tabId)) {
          try {
            await browser.tabs.move(tabId, { index: targetIndex });
            targetIndex++;
          } catch (e) {
            console.error(`Failed to move tab ${tabId}:`, e);
          }
        }
      }
    }
    
    this.broadcastUpdate('tabs-organized', { clusters: this.clusters.length });
    return true;
  }

  broadcastUpdate(type, data) {
    browser.runtime.sendMessage({ type, data }).catch(() => {});
  }
}

const tabManager = new TabManager();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'extract-tabs':
      tabManager.extractAllTabs().then(sendResponse);
      return true;
    
    case 'store-results':
      tabManager.storeResults(message.summaries, message.clusters).then(() => sendResponse({ success: true }));
      return true;
    
    case 'get-tabs':
      sendResponse(Array.from(tabManager.tabSummaries.values()));
      break;
    
    case 'get-clusters':
      sendResponse(tabManager.clusters);
      break;

    case 'get-sorted-results':
      sendResponse(tabManager.getSortedResults());
      break;

    case 'organize-tabs':
      tabManager.organizeTabsIntoGroups().then(sendResponse);
      return true;

    case 'close-tab':
      browser.tabs.remove(message.tabId).then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ error: e.message }));
      return true;

    case 'focus-tab':
      browser.tabs.update(message.tabId, { active: true }).then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    // Don't auto-analyze on every tab update (too expensive)
    // User should manually trigger analysis
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabManager.tabs.delete(tabId);
  tabManager.tabSummaries.delete(tabId);
});