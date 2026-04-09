import { Router } from 'express';
import { fetchProfileData } from '../lib/ingest.js';
import { analyzeTaste } from '../lib/analyze.js';
import { loadProfile, saveProfile } from '../lib/profile.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.spotifyTokens?.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  next();
}

// POST /api/analyze
// Body (optional): { userText: "I love dreamy lo-fi and early 2000s indie..." }
router.post('/', requireAuth, async (req, res) => {
  const { userText } = req.body ?? {};

  try {
    // Fetch Spotify data and prior profile in parallel
    const [tracks, priorProfile] = await Promise.all([
      fetchProfileData(req),
      loadProfile(),
    ]);

    if (tracks.length === 0) {
      return res.status(422).json({ error: 'No Spotify listening history found. Try adding some tracks first.' });
    }

    // Run Claude analysis
    const profile = await analyzeTaste(tracks, userText || null, priorProfile);

    // Persist updated profile
    await saveProfile(profile);

    res.json({ profile, trackCount: tracks.length });
  } catch (err) {
    console.error('analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// GET /api/analyze/profile — return saved profile without re-running analysis
router.get('/profile', async (req, res) => {
  const profile = await loadProfile();
  if (!profile) return res.status(404).json({ error: 'No profile saved yet' });
  res.json({ profile });
});

export default router;
