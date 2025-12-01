import type { Post, UserProfile, Interaction } from './types/index.js';

class ContentScorer {
  calculateScore(
    post: Post,
    user: UserProfile,
    interactions: Interaction
  ): number {
    const recencyScore = this.getRecencyScore(post.createdAt);
    const engagementScore = this.getEngagementScore(interactions);
    const relevanceScore = this.getRelevanceScore(post, user);
    const diversityPenalty = this.getDiversityPenalty(post, user.recentFeed);

    return (
      recencyScore * 0.2 +
      engagementScore * 0.4 +
      relevanceScore * 0.35 +
      diversityPenalty * 0.05
    );
  }

  getRecencyScore(timestamp: Date): number {
    const hoursSincePost = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    return Math.exp(-hoursSincePost / 24);
  }

  getEngagementScore(interactions: Interaction): number {
    const { likes, comments, shares, views } = interactions;
    const engagementRate = (likes + comments * 3 + shares * 5) / Math.max(views, 1);
    return Math.min(engagementRate * 100, 1);
  }

  getRelevanceScore(post: Post, user: UserProfile): number {
    // Calculate cosine similarity between post and user interests
    const similarity = this.cosineSimilarity(post.embedding, user.interestVector);
    
    // Boost if from followed user
    const socialBoost = user.followedUsers.includes(post.userId) ? 0.2 : 0;
    
    // Boost if similar to previously engaged content
    const historyBoost = this.getHistoryBoost(post, user.interactionHistory);
    
    return Math.min(similarity + socialBoost + historyBoost, 1);
  }

  getDiversityPenalty(post: Post, recentFeed: string[]): number {
    // Penalize if too many similar posts recently shown
    const recentCategories = recentFeed.map(id => this.getCategoryFromCache(id));
    const categoryCount = recentCategories.filter(
      cat => cat === post.category
    ).length;
    
    // Higher penalty for more repetition
    const repetitionPenalty = Math.min(categoryCount * 0.1, 0.5);
    
    // Check for same author saturation
    const sameAuthorCount = recentFeed.filter(id => 
      this.getAuthorFromCache(id) === post.userId
    ).length;
    const authorPenalty = Math.min(sameAuthorCount * 0.15, 0.4);
    
    return 1 - (repetitionPenalty + authorPenalty);
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length || vec1.length === 0) return 0;
    
    const dot = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    
    return dot / (mag1 * mag2);
  }

  private getHistoryBoost(post: Post, history: Map<string, number>): number {
    // Boost based on engagement with similar content
    const relatedScore = history.get(post.category ?? '') ?? 0;
    return Math.min(relatedScore / 100, 0.2);
  }

  private getCategoryFromCache(postId: string): string {
    // In production, fetch from Redis cache
    return 'Technology'; // Placeholder
  }

  private getAuthorFromCache(postId: string): string {
    // In production, fetch from Redis cache
    return 'user123'; // Placeholder
  }
}

export { ContentScorer };
