import { Pool } from 'pg';
import db from './db/index.js';
import redis from './db/redis.js';
import type {
  Post,
  UserProfile,
  ScoredPost,
  Interaction,
} from './types/index.js';
import { ContentScorer } from './scoring-engine.js';

class RecommendationEngine {
    private db: Pool;
    private scorer: ContentScorer;
    private diversityThreshold = 0.3;
  
    constructor() {
        this.db = db;
        this.scorer = new ContentScorer();
    }
  
    async generateFeed(userId: string, limit: number = 50): Promise<ScoredPost[]> {
      // Get user's interest profile
      const userProfile = await this.getUserProfile(userId);
  
      // Get candidate posts
      const candidates = await this.getCandidatePosts(userId);
  
      // Score each post
      const scoredPosts = await Promise.all(
        candidates.map(async post => {
          const score = await this.scorePost(post, userProfile);
          return { ...post, score };
        })
      );
  
      // Sort and apply diversity
      const rankedPosts = this.applyDiversityFilter(
        scoredPosts.sort((a, b) => b.score - a.score),
        userProfile
      );
  
      return rankedPosts.slice(0, limit);
    }
  
    async getUserProfile(userId: string): Promise<UserProfile> {
      // Fetch from cache first
      const cached = await this.getCachedProfile(userId);
      if (cached) return cached;
  
      // Fetch from database
      const profile = await this.db.query(
        `SELECT 
          id, 
          username, 
          interest_vector as "interestVector"
        FROM users WHERE id = $1`,
        [userId]
      );
  
      // Get recent feed history
      const recentFeed = await this.db.query(
        `SELECT post_id FROM feed_history 
         WHERE user_id = $1 
         ORDER BY shown_at DESC 
         LIMIT 50`,
        [userId]
      );
  
      // Get followed users
      const following = await this.db.query(
        `SELECT followed_id FROM follows WHERE follower_id = $1`,
        [userId]
      );
  
      // Get interaction history by category
      const interactions = await this.db.query(
        `SELECT category, SUM(weight) as score
         FROM user_category_interactions
         WHERE user_id = $1
         GROUP BY category`,
        [userId]
      );
  
      const userProfile: UserProfile = {
        ...profile.rows[0],
        recentFeed: recentFeed.rows.map(r => r.post_id),
        followedUsers: following.rows.map(r => r.followed_id),
        interactionHistory: new Map(
          interactions.rows.map(r => [r.category, r.score])
        )
      };
  
      // Cache the profile
      await this.cacheProfile(userId, userProfile);
  
      return userProfile;
    }
  
    async getCandidatePosts(userId: string): Promise<Post[]> {
      // Get posts from multiple sources and merge
  
      // 1. Recent posts from followed users (social signal)
      const followedPosts = await this.db.query(
        `SELECT p.* FROM posts p
         JOIN follows f ON p.user_id = f.followed_id
         WHERE f.follower_id = $1 
         AND p.created_at > NOW() - INTERVAL '48 hours'
         LIMIT 100`,
        [userId]
      );
  
      // 2. Trending posts (engagement signal)
      const trendingPosts = await this.getTrendingPosts(50);
  
      // 3. Posts similar to user interests (content signal)
      const similarPosts = await this.getSimilarPosts(userId, 100);
  
      // 4. Fresh diverse content (exploration)
      const diversePosts = await this.db.query(
        `SELECT * FROM posts 
         WHERE created_at > NOW() - INTERVAL '24 hours'
         ORDER BY RANDOM()
         LIMIT 50`
      );
  
      // Merge and deduplicate
      const allPosts = [
        ...followedPosts.rows,
        ...trendingPosts,
        ...similarPosts,
        ...diversePosts.rows
      ];
  
      const uniquePosts = Array.from(
        new Map(allPosts.map(post => [post.id, post])).values()
      );
  
      return uniquePosts;
    }
  
    applyDiversityFilter(posts: ScoredPost[], user: UserProfile): ScoredPost[] {
      const filtered: ScoredPost[] = [];
      const categoryCount: Map<string, number> = new Map();
      const authorCount: Map<string, number> = new Map();
  
      for (const post of posts) {
        const catCount = categoryCount.get(post.category || '') || 0;
        const authCount = authorCount.get(post.userId) || 0;
  
        // Skip if too many from same category or author
        if (catCount >= 3 || authCount >= 2) {
          // Only skip if not highly scored
          if (post.score < 0.8) continue;
        }
  
        filtered.push(post);
  
        // Update counts
        categoryCount.set(post.category || '', catCount + 1);
        authorCount.set(post.userId, authCount + 1);
  
        // Insert diverse content every N posts
        if (filtered.length % 10 === 0) {
          const diversePost = this.findDiversePost(
            posts,
            filtered,
            categoryCount,
            authorCount
          );
          if (diversePost) filtered.push(diversePost);
        }
      }
  
      return filtered;
    }
  
    private findDiversePost(
      allPosts: ScoredPost[],
      currentFeed: ScoredPost[],
      catCount: Map<string, number>,
      authCount: Map<string, number>
    ): ScoredPost | null {
      const currentIds = new Set(currentFeed.map(p => p.id));
      
      return allPosts.find(post => {
        if (currentIds.has(post.id)) return false;
        
        const cat = post.category || '';
        const isNewCategory = !catCount.has(cat) || catCount.get(cat)! < 2;
        const isNewAuthor = !authCount.has(post.userId) || authCount.get(post.userId)! < 1;
        
        return isNewCategory && isNewAuthor;
      }) || null;
    }
  
    private async scorePost(post: Post, userProfile: UserProfile): Promise<number> {
      // Get engagement stats
      const interactions = await this.getPostInteractions(post.id);
  
      // Content similarity
      const contentScore = this.scorer.calculateScore(post, userProfile, interactions);
  
      // Social signals
      const socialScore = await this.getSocialScore(post, userProfile);
  
      // Engagement prediction
      const engagementScore = await this.predictEngagement(post, userProfile);
  
      return contentScore * 0.4 + socialScore * 0.3 + engagementScore * 0.3;
    }
  
    private async getPostInteractions(postId: string): Promise<Interaction> {
      const result = await this.db.query(
        `SELECT 
          COUNT(CASE WHEN type = 'like' THEN 1 END) as likes,
          COUNT(CASE WHEN type = 'comment' THEN 1 END) as comments,
          COUNT(CASE WHEN type = 'share' THEN 1 END) as shares,
          COUNT(CASE WHEN type = 'view' THEN 1 END) as views
         FROM interactions WHERE post_id = $1`,
        [postId]
      );
      return result.rows[0];
    }
  
    private async getSocialScore(post: Post, user: UserProfile): Promise<number> {
      // Boost if from followed user
      if (user.followedUsers.includes(post.userId)) return 0.8;
      
      // Check if friends engaged with this post
      const friendEngagement = await this.db.query(
        `SELECT COUNT(*) as count FROM interactions i
         JOIN follows f ON i.user_id = f.followed_id
         WHERE f.follower_id = $1 AND i.post_id = $2`,
        [user.id, post.id]
      );
      
      return Math.min(friendEngagement.rows[0].count * 0.1, 0.5);
    }
  
    private async predictEngagement(post: Post, user: UserProfile): Promise<number> {
      // Simple heuristic - in production, use ML model
      const userEngagementRate = await this.getUserAvgEngagement(user.id);
      const postAvgEngagement = await this.getPostAvgEngagement(post.id);
      
      return (userEngagementRate + postAvgEngagement) / 2;
    }
  
    private async getTrendingPosts(limit: number): Promise<Post[]> {
        const postIds = await redis.zrevrange('trending:posts', 0, limit - 1);
        const posts = await this.db.query(
            `SELECT * FROM posts WHERE id = ANY($1)`,
            [postIds]
        );
        return posts.rows;
    }
  
    private async getSimilarPosts(userId: string, limit: number): Promise<Post[]> {
        // Use vector DB to find similar posts
        return []; // Placeholder
    }
  
    private async getCachedProfile(userId: string): Promise<UserProfile | null> {
        const profile = await redis.get(`user:${userId}:profile`);
        return profile ? JSON.parse(profile) : null;
    }
  
    private async cacheProfile(userId: string, profile: UserProfile): Promise<void> {
        await redis.set(
            `user:${userId}:profile`,
            JSON.stringify(profile),
            'EX',
            60 * 60
        );
    }
  
    private async getUserAvgEngagement(userId: string): Promise<number> {
      const result = await this.db.query(
        `SELECT AVG(CASE WHEN type IN ('like', 'comment', 'share') THEN 1 ELSE 0 END) as rate
         FROM interactions WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0].rate || 0;
    }
  
    private async getPostAvgEngagement(postId: string): Promise<number> {
      const interactions = await this.getPostInteractions(postId);
      const total = interactions.likes + interactions.comments + interactions.shares;
      return Math.min(total / Math.max(interactions.views, 1), 1);
    }
  }

export { RecommendationEngine };
