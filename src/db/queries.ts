import type { Post, UserProfile } from '../types/index.js';
import db from './index.js';

export async function getPost(postId: string): Promise<Post> {
  const result = await db.query('SELECT * FROM posts WHERE id = $1', [postId]);
  return result.rows[0];
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

export async function updateUserInterestVector(
  userId: string,
  interestVector: number[]
): Promise<void> {
  await db.query('UPDATE users SET interest_vector = $1 WHERE id = $2', [
    interestVector,
    userId,
  ]);
}

export async function incrementCategoryInteraction(
  userId: string,
  category: string,
  weight: number
): Promise<void> {
  await db.query(
    'INSERT INTO user_category_interactions (user_id, category, weight) VALUES ($1, $2, $3) ON CONFLICT (user_id, category) DO UPDATE SET weight = user_category_interactions.weight + $3',
    [userId, category, weight]
  );
}
