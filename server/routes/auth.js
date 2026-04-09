import { Router } from 'express';
import axios from 'axios';

const router = Router();

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

// Step 1: Redirect user to Spotify login
router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope: SCOPES,
    show_dialog: 'true',
  });
  res.redirect(`${SPOTIFY_AUTH_URL}?${params}`);
});

// Step 2: Handle Spotify OAuth callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=auth_failed`);
  }

  try {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    req.session.spotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=session_save_failed`);
      }
      // Relay through localhost:3001 so the session cookie is set on `localhost`
      // (Spotify forces 127.0.0.1 as redirect URI, but the client runs on localhost —
      // different cookie domains. The relay copies the session across.)
      res.redirect(`http://localhost:3001/api/auth/relay?sid=${req.sessionID}`);
    });
  } catch (err) {
    console.error('Spotify OAuth callback error:', err.response?.data || err.message);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=token_exchange_failed`);
  }
});

// Relay: copies session from 127.0.0.1 to localhost so the cookie domain matches the client
router.get('/relay', (req, res) => {
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
  const { sid } = req.query;

  if (!sid) return res.redirect(`${CLIENT_URL}?error=relay_failed`);

  req.sessionStore.get(sid, (err, sessionData) => {
    if (err || !sessionData?.spotifyTokens) {
      return res.redirect(`${CLIENT_URL}?error=relay_failed`);
    }
    req.session.spotifyTokens = sessionData.spotifyTokens;
    req.session.save((saveErr) => {
      if (saveErr) return res.redirect(`${CLIENT_URL}?error=relay_failed`);
      res.redirect(`${CLIENT_URL}?auth=success`);
    });
  });
});

// Logout: clear session tokens
router.get('/logout', (req, res) => {
  req.session.spotifyTokens = null;
  res.json({ ok: true });
});

// Check auth status
router.get('/status', (req, res) => {
  const tokens = req.session.spotifyTokens;
  res.json({ authenticated: !!(tokens?.accessToken) });
});

export default router;
