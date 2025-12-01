import { Redis } from 'ioredis';
import redis from './db/redis.js';

class RealTimeScorer {
    private redis: Redis;

    constructor() {
        this.redis = redis;
    }
  
    async updateEngagement(postId: string, interactionType: string): Promise<void> {
      const key = `post:${postId}:engagement`;
  
      // Increment counters
      await this.redis.hincrby(key, interactionType, 1);
  
      // Update trending score
      const engagement = await this.redis.hgetall(key);
      const trendingScore = this.calculateTrendingScore(engagement);
  
      await this.redis.zadd('trending:posts', trendingScore, postId);
    }
  
    calculateTrendingScore(engagement: Record<string, string>): number {
      const views = parseInt(engagement.views || '0');
      const likes = parseInt(engagement.likes || '0');
      const comments = parseInt(engagement.comments || '0');
      const shares = parseInt(engagement.shares || '0');
  
      const velocity = (likes + comments * 2 + shares * 3) / Math.max(views, 1);
      const recency = Date.now() / 1000;
  
      return velocity * Math.log(recency);
    }
  
    async getTrendingPosts(limit: number = 20): Promise<string[]> {
        return await this.redis.zrevrange('trending:posts', 0, limit - 1);
    }
  }
  
export { RealTimeScorer };
