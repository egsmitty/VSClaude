import { Router } from 'express';
import { fetchProfileData } from '../lib/ingest.js';

const router = Router();

// Middleware: require Spotify auth
function requireAuth(req, res, next) {
  if (!req.spotifyTokens?.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  next();
}

// GET /api/spotify/profile-data
// Returns a deduplicated, normalized list of the user's tracks with genres
router.get('/profile-data', requireAuth, async (req, res) => {
  try {
    const tracks = await fetchProfileData(req);
    res.json({ tracks, count: tracks.length });
  } catch (err) {
    console.error('profile-data error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch Spotify profile data' });
  }
});

export default router;
