import { Router } from 'express';
import { fetchProfileData } from '../lib/ingest.js';
import { fetchCandidates, rankCandidates } from '../lib/suggestions.js';
import { loadProfile } from '../lib/profile.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.spotifyTokens?.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  next();
}

// GET /api/suggestions
// Query params (optional): ?userText=feeling+melancholy+today
router.get('/', requireAuth, async (req, res) => {
  const { userText } = req.query;

  try {
    // Load taste profile — must exist before suggestions make sense
    const tasteProfile = await loadProfile();
    if (!tasteProfile) {
      return res.status(422).json({
        error: 'No taste profile found. Run POST /api/analyze first.',
      });
    }

    // Fetch user's top tracks (needed for seeding) and recommendation candidates
    const topTracks = await fetchProfileData(req);
    const candidates = await fetchCandidates(req, topTracks, tasteProfile);

    // Let Claude rank and annotate
    const suggestions = await rankCandidates(candidates, tasteProfile, userText || null);

    res.json({ suggestions, count: suggestions.length });
  } catch (err) {
    console.error('suggestions error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate suggestions' });
  }
});

export default router;
