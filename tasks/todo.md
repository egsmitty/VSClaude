# Fix: Try Again — session-aware exclusion

## Root cause

Try Again calls the server with the same prompt and no memory of what was shown.
Random offsets reduce overlap in the *candidate pool* but don't prevent Claude from
re-picking the same tracks — it has no idea what the user already saw.

## Design

Two-tier exclusion, keeping concerns separate:

| Set | What it contains | Exclusion strength |
|-----|------------------|--------------------|
| `listenedIds` (existing) | user's Spotify library tracks | Soft — relaxed in fallback retry |
| `excludeIds` (new) | tracks already shown by the app this session | Hard — never relaxed, even in fallback |

Client tracks `shownIds` in a `useRef` (not state — no re-render needed).
Each time suggestions return, their IDs are added to the ref.
When the user submits a *new* prompt (different text), the ref resets.
`excludeIds` is sent as a POST body array on every request.

Server merges `excludeIds` into the exclusion set used by `searchCandidates`.
The existing fallback retry that relaxes `listenedIds` now keeps `excludeIds` as-is.

## Todo

- [x] 1. `AppContext.jsx` — add shownIdsRef + lastPromptRef; update fetchSuggestions to track/send excludeIds
- [x] 2. `api.js` — switch getSuggestions to POST with { userText, excludeIds }
- [x] 3. `routes/suggestions.js` — switch to POST; extract and pass excludeIds to fetchCandidates
- [x] 4. `lib/suggestions.js` — add excludedIds param to fetchCandidates; hard-exclude from both main and fallback paths

## Files
- `client/src/AppContext.jsx`
- `client/src/api.js`
- `server/routes/suggestions.js`
- `server/lib/suggestions.js`
