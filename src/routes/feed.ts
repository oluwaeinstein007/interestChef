import { Router } from 'express';
import { RecommendationEngine } from '../recommendation-engine.js';
import { UserInterestTracker } from '../user-profile.js';
import { RealTimeScorer } from '../real-time-scorer.js';
import db from '../db/index.js';

const router: Router = Router();

router.get('/feed', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const limit = parseInt(req.query.limit as string) || 50;

        const engine = new RecommendationEngine();
        const feed = await engine.generateFeed(userId, limit);

        res.json({ posts: feed });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/interaction', async (req, res) => {
    const { postId, type, duration } = req.body;
    const userId = (req as any).user.id;

    // Log interaction
    // await db.logInteraction({ userId, postId, type, duration });

    // Update user profile asynchronously
    const tracker = new UserInterestTracker();
    tracker
        .updateUserProfile(userId, { postId, type, duration })
        .catch(err => console.error('Profile update error:', err));

    // Update real-time scores
    const scorer = new RealTimeScorer();
    await scorer.updateEngagement(postId, type);

    res.json({ success: true });
});

export default router;
