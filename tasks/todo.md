# Music Taste Analyzer — Build Plan

## Spec Summary
- **Input:** Spotify OAuth (listening history, top tracks, saved songs) + manual text input per session
- **Output:** React + Vite web UI — taste profile card, ranked song suggestions, thumbs up/down, create Spotify playlist button
- **AI:** Claude + Spotify combo — Spotify discovers candidates, Claude analyzes and ranks
- **Scoring:** Niche score (0–100), top genres, subgenre, popularity percentile — with a brief Claude explanation per suggestion
- **Learning:** Thumbs up/down, persistent JSON taste profile, plain-text feedback to Claude
- **Backend:** Node.js + Express (Spotify OAuth handling, Claude API calls, profile persistence)

---

## Phase 1 — Project Scaffolding & Auth

- [ ] Init React + Vite frontend (`client/`)
- [ ] Init Node.js + Express backend (`server/`)
- [ ] Configure `.env` for Spotify Client ID/Secret and Claude API key
- [ ] Implement Spotify OAuth flow (login route, callback, token refresh)
- [ ] Store access/refresh tokens server-side per session
- [ ] Wire up Claude API client (Anthropic SDK)
- [ ] Basic health-check endpoint to confirm both APIs are reachable

## Phase 2 — Spotify Data Ingestion

- [ ] Fetch user's top tracks (short, medium, long-term windows)
- [ ] Fetch recently played tracks
- [ ] Fetch user's saved/liked songs (sample)
- [ ] Pull artist genre tags from Spotify for each track
- [ ] Normalize into a unified track schema: `{ title, artist, genres, popularity, spotifyId }`
- [ ] Expose a `/api/spotify/profile-data` endpoint returning normalized tracks

## Phase 3 — Taste Analysis with Claude

- [ ] Build Claude prompt that accepts track list + optional user text input
- [ ] Claude returns structured JSON:
  - `nicheScore` (0–100)
  - `topGenres` (array of 3–5 labels)
  - `subgenre` (one specific label, e.g. "hypnagogic pop")
  - `popularityPercentile` (0–100, inverted from Spotify popularity)
  - `tasteSummary` (2–3 sentence natural language description)
- [ ] Manual text input endpoint: user types artists/songs/vibes, merged with Spotify data before Claude call
- [ ] Expose `/api/analyze` endpoint that returns the taste profile JSON

## Phase 4 — Song Suggestions

- [ ] Use Spotify Recommendations API seeded by user's top 5 seed tracks
- [ ] Fetch 20–30 candidate tracks from Spotify
- [ ] Send candidates + taste profile to Claude for ranking and explanation
- [ ] Claude returns ranked list, each with:
  - `matchReason` (1 sentence)
  - `nicheScore`
  - `genreTag`
  - `popularityPercentile`
- [ ] Expose `/api/suggestions` endpoint returning ranked + annotated tracks

## Phase 5 — Web UI

- [ ] **Taste Profile Card:** niche score, top genres, subgenre, popularity percentile, taste summary
- [ ] **Suggestions List:** album art, track name, artist, Claude's match reason, niche score badge
- [ ] Thumbs up / thumbs down buttons on each suggestion
- [ ] "Refresh suggestions" button (re-runs analysis)
- [ ] Manual text input box: "Tell us more about your taste or mood right now"
- [ ] "Create Spotify Playlist" button — pushes liked/selected tracks to Spotify
- [ ] Spotify login/logout UI

## Phase 6 — Learning & Persistence

- [ ] Save taste profile to `profile.json` on the server after each analysis
- [ ] Thumbs up/down POSTs feedback to `/api/feedback` — updates profile weights
- [ ] Plain-text feedback sent to Claude alongside profile on next analysis run
- [ ] Load saved profile on app start and include in next Claude prompt as prior context
- [ ] Show "Profile last updated" timestamp in UI

## Phase 7 — Polish & Hardening

- [ ] Handle Spotify token expiry gracefully (auto-refresh)
- [ ] Handle Claude API errors with user-facing messages
- [ ] Rate limit awareness (Spotify 429 handling)
- [ ] Responsive layout (mobile-friendly)
- [ ] Empty state if no Spotify history yet (guide user to manual input)
- [ ] Basic loading states and skeleton UI during API calls
