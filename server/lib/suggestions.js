import { spotifyClient } from './spotify.js';
import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

/**
 * Builds search queries from the user's taste profile and top tracks.
 * Uses genre tags and top artists as seeds instead of the deprecated /recommendations endpoint.
 */
async function searchCandidates(client, tasteProfile, topTracks) {
  const candidates = [];
  const seen = new Set();

  // Seed queries: top genres from profile + top artists from listening history
  const genres = tasteProfile?.topGenres?.slice(0, 3) ?? [];
  const artists = [...new Set(topTracks.slice(0, 5).map((t) => t.artist))];

  const queries = [
    ...genres.map((g) => `genre:"${g}"`),
    ...artists.map((a) => `artist:"${a}"`),
  ].slice(0, 6); // cap at 6 queries

  for (const query of queries) {
    try {
      const { data } = await client.get('/search', {
        params: { q: query, type: 'track', limit: 10 },
      });

      for (const track of data.tracks?.items ?? []) {
        if (track?.id && !seen.has(track.id)) {
          seen.add(track.id);
          candidates.push(track);
        }
      }
    } catch {
      // Skip failed queries — partial results are fine
    }
  }

  return candidates;
}

/**
 * Fetches recommendation candidates via Spotify search.
 * Falls back gracefully if profile genres are unavailable.
 */
export async function fetchCandidates(req, topTracks, tasteProfile) {
  const client = await spotifyClient(req);

  if (topTracks.length === 0) throw new Error('No listening history available for recommendations');

  const rawTracks = await searchCandidates(client, tasteProfile, topTracks);

  if (rawTracks.length === 0) throw new Error('No recommendation candidates found');

  // Fetch artist genres for candidates
  const artistIds = [...new Set(rawTracks.map((t) => t.artists?.[0]?.id).filter(Boolean))];
  const genreMap = {};

  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50);
    try {
      const { data } = await client.get('/artists', { params: { ids: batch.join(',') } });
      for (const artist of data.artists ?? []) {
        if (artist) genreMap[artist.id] = artist.genres ?? [];
      }
    } catch {
      // Genres are non-critical
    }
  }

  return rawTracks.map((t) => ({
    spotifyId: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name ?? 'Unknown',
    album: t.album?.name ?? null,
    albumArt: t.album?.images?.[0]?.url ?? null,
    popularity: t.popularity ?? 0,
    genres: genreMap[t.artists?.[0]?.id] ?? [],
    previewUrl: t.preview_url ?? null,
  }));
}

/**
 * Sends candidates + taste profile to Claude for ranking and annotation.
 * Returns an ordered array of tracks with Claude's analysis attached.
 */
export async function rankCandidates(candidates, tasteProfile, userText = null) {
  const claude = getClient();

  const userSection = userText
    ? `\n## User's Current Mood / Context\n"${userText}"\nWeight this heavily for today's suggestions.\n`
    : '';

  const prompt = `You are a music recommendation expert. Given a user's taste profile and a list of candidate tracks, rank and annotate the tracks from best to worst match.

## User's Taste Profile
${JSON.stringify(tasteProfile, null, 2)}
${userSection}
## Candidate Tracks
${JSON.stringify(candidates.map((t) => ({ spotifyId: t.spotifyId, title: t.title, artist: t.artist, genres: t.genres, popularity: t.popularity })), null, 2)}

## Instructions
- Rank ALL ${candidates.length} tracks from best to worst match for this user
- For each track provide:
  - "spotifyId": copy exactly from input
  - "matchReason": one punchy sentence explaining WHY this fits their taste — be specific, not generic
  - "nicheScore": 0–100, how obscure/niche this track is (invert popularity, factor in genre niche-ness)
  - "genreTag": one short genre label (e.g. "shoegaze", "neo-soul", "dark techno")
  - "popularityPercentile": 0–100, derived from Spotify popularity score

## Output Format
Respond with ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "spotifyId": "<string>",
    "matchReason": "<string>",
    "nicheScore": <number>,
    "genreTag": "<string>",
    "popularityPercentile": <number>
  },
  ...
]`;

  const message = await claude.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned empty response');

  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let ranked;
  try {
    ranked = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(ranked)) throw new Error('Claude response was not an array');

  const candidateMap = Object.fromEntries(candidates.map((c) => [c.spotifyId, c]));

  return ranked
    .filter((r) => candidateMap[r.spotifyId])
    .map((r) => ({
      ...candidateMap[r.spotifyId],
      matchReason: r.matchReason,
      nicheScore: r.nicheScore,
      genreTag: r.genreTag,
      popularityPercentile: r.popularityPercentile,
    }));
}
