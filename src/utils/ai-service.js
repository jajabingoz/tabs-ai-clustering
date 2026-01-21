class GroqAIService {
  constructor() {
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'llama-3.1-70b-versatile';
    this.apiKey = null;
  }

  async setApiKey(key) {
    this.apiKey = key;
    await browser.storage.local.set({ groqApiKey: key });
  }

  async getApiKey() {
    if (!this.apiKey) {
      const result = await browser.storage.local.get('groqApiKey');
      this.apiKey = result.groqApiKey;
    }
    return this.apiKey;
  }

  async analyzeAndPrioritizeTab(tabData) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Groq API key not configured');
    }

    const prompt = `Analyze this web page and provide:
1. A concise summary (2-3 sentences)
2. A Priority Score (1-5, where 1 = highest priority) based on:
   
   Learning Value Factors:
   - Depth of content (comprehensive vs superficial)
   - Uniqueness of knowledge (rare insights vs common info)
   - Longevity (evergreen vs ephemeral content)
   - Technical rigor (well-researched vs casual)
   
   Utility Value Factors:
   - Practical applicability (can be applied immediately)
   - Reusability (code, frameworks, APIs, papers, templates)
   - Actionability (clear next steps vs passive reading)
   - Educational value (teaches skills vs entertains)

3. A brief rationale for the priority score (1-2 sentences)

Web Page Details:
Title: ${tabData.title}
URL: ${tabData.url}
Meta Description: ${tabData.metaDescription || 'N/A'}
Main Headings: ${tabData.headings?.join(', ') || 'N/A'}
Content Preview: ${tabData.textContent?.slice(0, 1500) || 'N/A'}

Return ONLY valid JSON in this exact format:
{
  "summary": "...",
  "priorityScore": 1-5,
  "priorityRationale": "...",
  "topics": ["topic1", "topic2", "topic3"]
}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || `${tabData.title}`,
          priorityScore: Math.min(5, Math.max(1, parseInt(parsed.priorityScore) || 3)),
          priorityRationale: parsed.priorityRationale || 'Standard content',
          topics: parsed.topics || this.extractBasicTopics(tabData)
        };
      }
      throw new Error('Invalid JSON response');
    } catch (error) {
      console.error('Groq API error:', error);
      return {
        summary: `${tabData.title} - ${tabData.metaDescription || 'Web page content'}`,
        priorityScore: 3,
        priorityRationale: 'Unable to analyze - default priority assigned',
        topics: this.extractBasicTopics(tabData)
      };
    }
  }

  async clusterAndSortTabs(tabSummaries) {
    const apiKey = await this.getApiKey();
    if (!apiKey || tabSummaries.length < 2) {
      return this.fallbackClustering(tabSummaries);
    }

    const prompt = `Analyze these web pages and group them into logical clusters.
Each tab has been analyzed with a priority score (1=highest, 5=lowest).

Tabs to cluster:
${tabSummaries.map(tab => `Tab ${tab.id} [Priority: ${tab.priorityScore}]: ${tab.title} - ${tab.summary}`).join('\n')}

Create 2-6 meaningful clusters based on topic similarity.
Return ONLY valid JSON array:
[
  {
    "name": "Cluster Name",
    "description": "Brief description",
    "tabIds": [tab_id1, tab_id2]
  }
]`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();
      
      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const clusters = JSON.parse(jsonMatch[0]);
        return this.validateAndSortClusters(clusters, tabSummaries);
      }
      throw new Error('Invalid JSON response');
    } catch (error) {
      console.error('Groq clustering error:', error);
      return this.fallbackClustering(tabSummaries);
    }
  }

  validateAndSortClusters(clusters, tabSummaries) {
    if (!Array.isArray(clusters)) return this.fallbackClustering(tabSummaries);
    
    const tabMap = new Map(tabSummaries.map(tab => [tab.id, tab]));
    const assignedTabIds = new Set();
    
    const validClusters = clusters
      .filter(cluster => cluster.name && cluster.tabIds && Array.isArray(cluster.tabIds))
      .map(cluster => {
        // Filter valid tab IDs and remove duplicates
        cluster.tabIds = cluster.tabIds.filter(id => {
          const isValid = tabMap.has(id) && !assignedTabIds.has(id);
          if (isValid) assignedTabIds.add(id);
          return isValid;
        });
        
        // Sort tabs within cluster by priority score, then by title
        cluster.tabIds.sort((a, b) => {
          const tabA = tabMap.get(a);
          const tabB = tabMap.get(b);
          if (tabA.priorityScore !== tabB.priorityScore) {
            return tabA.priorityScore - tabB.priorityScore;
          }
          return tabA.title.localeCompare(tabB.title);
        });
        
        // Add cluster priority (average of tab priorities)
        const avgPriority = cluster.tabIds.reduce((sum, id) => sum + tabMap.get(id).priorityScore, 0) / cluster.tabIds.length;
        cluster.clusterPriority = Math.round(avgPriority * 10) / 10;
        
        return cluster;
      })
      .filter(cluster => cluster.tabIds.length > 0);

    // Handle unassigned tabs
    const unassignedTabs = tabSummaries.filter(tab => !assignedTabIds.has(tab.id));
    if (unassignedTabs.length > 0) {
      const sortedUnassigned = unassignedTabs
        .sort((a, b) => a.priorityScore - b.priorityScore || a.title.localeCompare(b.title))
        .map(tab => tab.id);
      
      validClusters.push({
        name: 'Other',
        description: 'Uncategorized tabs',
        tabIds: sortedUnassigned,
        clusterPriority: unassignedTabs.reduce((sum, tab) => sum + tab.priorityScore, 0) / unassignedTabs.length
      });
    }

    // Sort clusters by average priority
    return validClusters.sort((a, b) => a.clusterPriority - b.clusterPriority);
  }

  extractBasicTopics(tabData) {
    const text = `${tabData.title} ${tabData.metaDescription || ''} ${tabData.headings?.join(' ') || ''}`.toLowerCase();
    const domains = ['technology', 'programming', 'business', 'science', 'news', 'education', 'documentation', 'tutorial', 'api', 'framework'];
    return domains.filter(domain => text.includes(domain)).slice(0, 3);
  }

  fallbackClustering(tabSummaries) {
    const clusters = new Map();
    
    tabSummaries.forEach(tab => {
      try {
        const domain = new URL(tab.url).hostname.replace('www.', '');
        const clusterKey = domain.split('.')[0];
        
        if (!clusters.has(clusterKey)) {
          clusters.set(clusterKey, {
            name: clusterKey.charAt(0).toUpperCase() + clusterKey.slice(1),
            description: `Pages from ${domain}`,
            tabIds: [],
            clusterPriority: 0
          });
        }
        clusters.get(clusterKey).tabIds.push(tab.id);
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Sort tabs within each cluster and calculate cluster priority
    const tabMap = new Map(tabSummaries.map(tab => [tab.id, tab]));
    const result = Array.from(clusters.values())
      .filter(cluster => cluster.tabIds.length > 0)
      .map(cluster => {
        cluster.tabIds.sort((a, b) => {
          const tabA = tabMap.get(a);
          const tabB = tabMap.get(b);
          return (tabA?.priorityScore || 3) - (tabB?.priorityScore || 3);
        });
        cluster.clusterPriority = cluster.tabIds.reduce((sum, id) => sum + (tabMap.get(id)?.priorityScore || 3), 0) / cluster.tabIds.length;
        return cluster;
      });

    return result.sort((a, b) => a.clusterPriority - b.clusterPriority);
  }
}

const aiService = new GroqAIService();