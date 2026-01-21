class GroqService {
  constructor() {
    this.baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = 'llama-3.1-70b-versatile';
    
    if (!this.apiKey) {
      console.warn('WARNING: GROQ_API_KEY environment variable is not set. API calls will fail.');
    }
  }

  async analyzeTabs(tabs) {
    try {
      // Step 1: Analyze each tab with priority scoring
      const summaries = await Promise.all(
        tabs.map(tab => this.analyzeAndPrioritizeTab(tab).catch(err => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          summary: `${tab.title} - ${tab.metaDescription || 'Web page content'}`,
          priorityScore: 3,
          priorityRationale: 'Analysis unavailable',
          topics: [],
          error: err.message
        })))
      );

      // Step 2: Cluster tabs based on summaries and sort by priority
      const clusters = await this.clusterAndSortTabs(summaries);

      return {
        summaries: summaries.filter(s => !s.error),
        clusters,
        processed: summaries.length,
        errors: summaries.filter(s => s.error).length
      };
    } catch (error) {
      console.error('Tab analysis failed:', error);
      throw new Error('AI analysis failed');
    }
  }

  async analyzeAndPrioritizeTab(tab) {
    const prompt = this.createPriorityAnalysisPrompt(tab);
    
    const response = await this.makeGroqRequest({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3
    });

    const content = response.choices[0].message.content.trim();
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          summary: parsed.summary || tab.title,
          priorityScore: Math.min(5, Math.max(1, parseInt(parsed.priorityScore) || 3)),
          priorityRationale: parsed.priorityRationale || 'Standard content',
          topics: parsed.topics || this.extractTopics(content, tab)
        };
      }
    } catch (parseError) {
      console.error('Failed to parse priority response:', parseError);
    }

    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      summary: content.slice(0, 200),
      priorityScore: 3,
      priorityRationale: 'Unable to determine priority',
      topics: this.extractTopics(content, tab)
    };
  }

  async clusterAndSortTabs(tabSummaries) {
    if (tabSummaries.length < 2) {
      return [{
        name: 'All Tabs',
        description: 'All your open tabs',
        tabIds: tabSummaries.map(t => t.id),
        clusterPriority: tabSummaries[0]?.priorityScore || 3
      }];
    }

    try {
      const prompt = this.createClusteringPrompt(tabSummaries);
      
      const response = await this.makeGroqRequest({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2
      });

      const clustersText = response.choices[0].message.content.trim();
      const clusters = this.parseClusteringResponse(clustersText, tabSummaries);
      
      return this.validateAndSortClusters(clusters, tabSummaries);
    } catch (error) {
      console.error('Clustering failed, using fallback:', error);
      return this.fallbackClustering(tabSummaries);
    }
  }

  createPriorityAnalysisPrompt(tab) {
    return `Analyze this web page and provide:
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
Title: ${tab.title}
URL: ${tab.url}
Meta Description: ${tab.metaDescription || 'N/A'}
Main Headings: ${tab.headings?.join(', ') || 'N/A'}
Content Preview: ${tab.textContent?.slice(0, 1500) || 'N/A'}

Return ONLY valid JSON in this exact format:
{
  "summary": "...",
  "priorityScore": 1-5,
  "priorityRationale": "...",
  "topics": ["topic1", "topic2", "topic3"]
}`;
  }

  createClusteringPrompt(tabSummaries) {
    const tabList = tabSummaries
      .map(tab => `Tab ${tab.id} [Priority: ${tab.priorityScore}]: "${tab.title}" - ${tab.summary}`)
      .join('\n');

    return `Analyze these web page summaries and group them into 2-6 logical clusters based on their topics and content similarity.
Each tab has been analyzed with a priority score (1=highest, 5=lowest).

Return ONLY a valid JSON array where each cluster has:
- "name": A short, descriptive cluster name
- "description": A brief explanation of what the cluster contains
- "tabIds": An array of tab IDs that belong to this cluster

Tabs to cluster:
${tabList}

Return only the JSON array:`;
  }

  parseClusteringResponse(responseText, tabSummaries) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\[.*\]/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // If no JSON found, try parsing the full response
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse clustering response:', error);
      return this.fallbackClustering(tabSummaries);
    }
  }

  validateAndSortClusters(clusters, tabSummaries) {
    if (!Array.isArray(clusters)) {
      return this.fallbackClustering(tabSummaries);
    }

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

        // Calculate cluster priority (average of tab priorities)
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

  fallbackClustering(tabSummaries) {
    const domainClusters = new Map();
    const tabMap = new Map(tabSummaries.map(tab => [tab.id, tab]));
    
    tabSummaries.forEach(tab => {
      try {
        const domain = new URL(tab.url).hostname.replace('www.', '');
        const key = domain.split('.')[0] || 'unknown';
        
        if (!domainClusters.has(key)) {
          domainClusters.set(key, {
            name: key.charAt(0).toUpperCase() + key.slice(1),
            description: `Pages from ${domain}`,
            tabIds: [],
            clusterPriority: 0
          });
        }
        domainClusters.get(key).tabIds.push(tab.id);
      } catch (error) {
        // Handle invalid URLs
        if (!domainClusters.has('other')) {
          domainClusters.set('other', {
            name: 'Other',
            description: 'Miscellaneous pages',
            tabIds: [],
            clusterPriority: 0
          });
        }
        domainClusters.get('other').tabIds.push(tab.id);
      }
    });

    // Sort tabs within each cluster and calculate cluster priority
    const result = Array.from(domainClusters.values())
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

  extractTopics(text, tab) {
    const content = `${text} ${tab.title} ${tab.metaDescription || ''}`.toLowerCase();
    const words = content.split(/\W+/);
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'this', 'that', 'these', 'those'
    ]);
    
    return words
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 5);
  }

  async makeGroqRequest(payload) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error (${response.status}): ${error}`);
    }

    return await response.json();
  }
}

module.exports = GroqService;