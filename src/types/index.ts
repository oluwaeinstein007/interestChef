export interface Post {
  id: string;
  userId: string;
  createdAt: Date;
  category?: string;
  embedding: number[];
  content: string;
  title: string;
}

export interface UserProfile {
  id: string;
  interestVector: number[];
  followedUsers: string[];
  recentFeed: string[];
  interactionHistory: Map<string, number>;
}

export interface Interaction {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export interface ScoredPost extends Post {
  score: number;
}

export interface UserInteraction {
  postId: string;
  type: string;
  duration?: number;
}
