# Polish: date range display + empty-week handling + dead code

## Todo

- [x] 1. `TasteProfileCard.jsx` — show real date range (e.g. "Apr 4 – Apr 11") computed from updatedAt
- [x] 2. `analyze.js` — handle empty recentTracks; fix stale JSDoc; update nicheScore instruction for empty-recent case
- [x] 3. `api.js` — remove dead submitFeedback (call site already removed from AppContext)

## Files
- `client/src/components/TasteProfileCard.jsx`
- `server/lib/analyze.js`
- `client/src/api.js`
