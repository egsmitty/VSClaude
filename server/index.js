import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import authRouter from './routes/auth.js';
import spotifyRouter from './routes/spotify.js';
import analyzeRouter from './routes/analyze.js';
import suggestionsRouter from './routes/suggestions.js';
import { getClient } from './lib/claude.js';
import { getTokens } from './lib/tokenStore.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Attach spotify tokens from x-auth-token header to every request
app.use((req, res, next) => {
  const clientToken = req.headers['x-auth-token'];
  if (clientToken) {
    const tokens = getTokens(clientToken);
    if (tokens) {
      req.spotifyTokens = tokens;
      req.clientToken = clientToken;
    }
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/suggestions', suggestionsRouter);

// Health check — verifies Spotify and Claude APIs are reachable
app.get('/api/health', async (req, res) => {
  const results = { spotify: false, claude: false };

  // Spotify: check their API is up (public endpoint, no auth needed)
  try {
    await axios.get('https://api.spotify.com/v1/', { timeout: 5000 });
  } catch (err) {
    // Spotify returns 401 for unauthenticated — that means it's reachable
    if (err.response?.status === 401) results.spotify = true;
  }

  // Claude: list models as a lightweight connectivity check
  try {
    await getClient().models.list();
    results.claude = true;
  } catch (err) {
    console.error('Claude health check failed:', err.message);
  }

  const ok = results.spotify && results.claude;
  res.status(ok ? 200 : 503).json({ ok, ...results });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
