import redis from './db/redis.js';
import type { UserInteraction } from './types/index.js';
import {
  getPost,
  getUserProfile,
  updateUserInterestVector,
  incrementCategoryInteraction,
} from './db/queries.js';

class UserInterestTracker {
    private vectorDb: any; // Replace with vector DB client type
  
    async updateUserProfile(userId: string, interaction: UserInteraction): Promise<void> {
      const { postId, type, duration } = interaction;
  
      // Get post embeddings
      const postEmbedding = await this.getPostEmbedding(postId);
  
      // Weight by interaction type
      const weights: Record<string, number> = {
        view: 1,
        like: 3,
        comment: 5,
        share: 7,
        dwell: (duration ?? 0) / 10
      };
  
      // Update user's interest vector
      await this.updateInterestVector(userId, postEmbedding, weights[type]);
    }
  
    async getPostEmbedding(postId: string): Promise<number[]> {
      // Check cache first
      const cached = await this.getCachedEmbedding(postId);
      if (cached) return cached;
  
      // Fetch post from DB
      const post = await getPost(postId);
  
      // Use OpenAI embeddings API
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: `${post.title} ${post.content}`
        })
      });
  
      const data = await response.json();
      const embedding = data.data[0].embedding;
  
      // Cache the embedding
      await this.cacheEmbedding(postId, embedding);
  
      return embedding;
    }
  
    async updateInterestVector(
      userId: string,
      postEmbedding: number[],
      weight: number
    ): Promise<void> {
      // Fetch current user interest vector
      const userProfile = await getUserProfile(userId);
      const currentVector =
        userProfile.interestVector || new Array(postEmbedding.length).fill(0);

      // Learning rate - how much new interactions affect the profile
      const learningRate = 0.1;
      const adjustedWeight = weight * learningRate;

      // Update vector: weighted average with decay
      const updatedVector = currentVector.map((val: number, i: number) => {
        const decayedCurrent = val * 0.95; // Decay old interests slightly
        const newContribution = postEmbedding[i] * adjustedWeight;
        return decayedCurrent + newContribution;
      });

      // Normalize the vector
      const magnitude = Math.sqrt(
        updatedVector.reduce((sum: number, val: number) => sum + val * val, 0)
      );
      const normalizedVector = updatedVector.map((val: number) => val / magnitude);

      // Update in database
      await updateUserInterestVector(userId, normalizedVector);

      // Update interaction history for category boosting
      const post = await getPost(postEmbedding.toString());
      if (post.category) {
        await incrementCategoryInteraction(userId, post.category, weight);
      }
    }
  
    private async getCachedEmbedding(postId: string): Promise<number[] | null> {
        const embedding = await redis.get(`post:${postId}:embedding`);
        return embedding ? JSON.parse(embedding) : null;
    }
  
    private async cacheEmbedding(postId: string, embedding: number[]): Promise<void> {
        await redis.set(`post:${postId}:embedding`, JSON.stringify(embedding));
    }
}

export { UserInterestTracker };
