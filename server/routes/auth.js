import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { storeTokens, getTokens, deleteTokens } from '../lib/tokenStore.js';

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
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${CLIENT_URL}?error=auth_failed`);
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

    const clientToken = crypto.randomBytes(32).toString('hex');
    storeTokens(clientToken, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    res.redirect(`${CLIENT_URL}?token=${clientToken}`);
  } catch (err) {
    console.error('Spotify OAuth callback error:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}?error=token_exchange_failed`);
  }
});

// Logout
router.post('/logout', (req, res) => {
  const clientToken = req.headers['x-auth-token'];
  if (clientToken) deleteTokens(clientToken);
  res.json({ ok: true });
});

// Check auth status
router.get('/status', (req, res) => {
  const clientToken = req.headers['x-auth-token'];
  const tokens = clientToken ? getTokens(clientToken) : null;
  res.set('Cache-Control', 'no-store');
  res.json({ authenticated: !!(tokens?.accessToken) });
});

export default router;
