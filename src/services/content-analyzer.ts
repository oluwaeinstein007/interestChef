class ContentAnalyzer {
    async analyzePost(content: string): Promise<{
      embedding: number[];
      category: string;
      sentiment: string;
      isSafe: boolean;
    }> {
      // Get embeddings for semantic understanding
      const embedding = await this.getEmbedding(content);
  
      // Classify content category
      const category = await this.classifyContent(content);
  
      // Sentiment analysis
      const sentiment = await this.analyzeSentiment(content);
  
      // Content moderation
      const isSafe = await this.moderateContent(content);
  
      return { embedding, category, sentiment, isSafe };
    }
  
    async getEmbedding(text: string): Promise<number[]> {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text
        })
      });
  
      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.statusText}`);
      }
  
      const data = await response.json();
      return data.data[0].embedding;
    }
  
    async classifyContent(content: string): Promise<string> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `Classify this post into ONE category: Technology, Sports, Entertainment, Politics, Lifestyle, Business, Education, or Other.
  
  Post: ${content}
  
  Respond with just the category name.`
          }]
        })
      });
  
      const data = await response.json();
      return data.content[0].text.trim();
    }
  
    async analyzeSentiment(content: string): Promise<string> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 50,
          messages: [{
            role: 'user',
            content: `Analyze the sentiment of this post. Respond with only one word: Positive, Negative, or Neutral.
  
  Post: ${content}`
          }]
        })
      });
  
      const data = await response.json();
      return data.content[0].text.trim().toLowerCase();
    }
  
    async moderateContent(content: string): Promise<boolean> {
      // Use OpenAI Moderation API
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: content
        })
      });
  
      if (!response.ok) {
        throw new Error(`Moderation API error: ${response.statusText}`);
      }
  
      const data = await response.json();
      const result = data.results[0];
  
      // Check if any category is flagged
      const isFlagged = result.flagged;
      
      // Additional checks for high scores even if not flagged
      const categories = result.categories;
      const highRiskCategories = [
        'hate',
        'hate/threatening',
        'self-harm',
        'sexual/minors',
        'violence'
      ];
  
      const hasHighRisk = highRiskCategories.some(cat => categories[cat]);
  
      return !isFlagged && !hasHighRisk;
    }
  }

  export { ContentAnalyzer };
