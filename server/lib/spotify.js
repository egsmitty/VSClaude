import axios from 'axios';
import { updateTokens } from './tokenStore.js';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * Refreshes the Spotify access token if it has expired.
 * Mutates req.spotifyTokens with fresh values.
 */
export async function ensureFreshToken(req) {
  const tokens = req.spotifyTokens;
  if (!tokens) throw new Error('Not authenticated with Spotify');

  if (Date.now() < tokens.expiresAt - 30_000) {
    return tokens.accessToken;
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const { data } = await axios.post(
    SPOTIFY_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const newTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  if (req.clientToken) updateTokens(req.clientToken, newTokens);
  req.spotifyTokens = newTokens;

  return newTokens.accessToken;
}

/**
 * Returns an axios instance pre-configured with a fresh Spotify Bearer token.
 */
export async function spotifyClient(req) {
  const accessToken = await ensureFreshToken(req);
  return axios.create({
    baseURL: 'https://api.spotify.com/v1',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
