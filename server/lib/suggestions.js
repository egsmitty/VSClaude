import { spotifyClient } from './spotify.js';
import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

/**
 * Searches Spotify for candidate tracks using the taste profile's genres, top artists,
 * and (when provided) the user's mood/prompt text directly.
 */
async function searchCandidates(client, tasteProfile, topTracks, userPrompt = null) {
  const candidates = [];
  const seen = new Set();

  const genres  = tasteProfile?.topGenres?.slice(0, 3) ?? (tasteProfile?.topGenre ? [tasteProfile.topGenre] : []);
  const artists = [...new Set(topTracks.slice(0, 5).map((t) => t.artist))];

  // If the user gave a prompt, search it first so those results seed the pool
  const queries = [
    ...(userPrompt ? [userPrompt] : []),
    ...genres.map((g) => `genre:"${g}"`),
    ...artists.map((a) => `artist:"${a}"`),
  ].slice(0, 7);

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

  // Cap at 3 tracks per artist so no single artist dominates the candidate pool
  const artistCount = {};
  return candidates.filter((t) => {
    const artist = t.artists?.[0]?.name ?? 'Unknown';
    artistCount[artist] = (artistCount[artist] || 0) + 1;
    return artistCount[artist] <= 3;
  });
}

export async function fetchCandidates(req, topTracks, tasteProfile, userPrompt = null) {
  const client = await spotifyClient(req);

  if (topTracks.length === 0) throw new Error('No listening history available for recommendations');

  const rawTracks = await searchCandidates(client, tasteProfile, topTracks, userPrompt);
  if (rawTracks.length === 0) throw new Error('No recommendation candidates found');

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
 * Asks Claude to pick ONE top song + 3–4 runners-up from the candidates,
 * crafted specifically for the user's taste and current prompt.
 *
 * Returns { topPick, runnersUp } with full track data merged in.
 */
export async function rankCandidates(candidates, tasteProfile, userPrompt = null) {
  const claude = getClient();

  const moodSection = userPrompt
    ? `## What They're Looking For Right Now\n"${userPrompt}"\nThis is the primary signal — match this above everything else.\n\n`
    : '';

  const prompt = `You are a knowledgeable music friend picking the perfect song for someone. Study their taste and pick ONE song they'll love, then name a few solid alternatives.

## Their Taste Profile
${JSON.stringify({
  subgenre: tasteProfile.subgenre,
  topGenre: tasteProfile.topGenre ?? tasteProfile.topGenres?.[0],
  nicheScore: tasteProfile.nicheScore,
  tasteSummary: tasteProfile.tasteSummary,
}, null, 2)}

${moodSection}## Candidate Tracks (choose from these only)
${JSON.stringify(candidates.map((t) => ({
  spotifyId: t.spotifyId,
  title: t.title,
  artist: t.artist,
  genres: t.genres,
  popularity: t.popularity,
})), null, 2)}

## Instructions
- Pick the single best match as "topPick" — the song you'd text a friend right now
- "explanation": 1 sentence max — punchy, specific, written like a text to a friend. Name one concrete thing (production, vibe, lyric) that makes it right. No filler.
- Pick 3–4 solid alternatives as "runnersUp"
- "reason" for each runner-up: one punchy sentence
- "genreTag" for each: one short genre label

## Output Format
Respond with ONLY valid JSON — no markdown, no explanation:
{
  "topPick": {
    "spotifyId": "<string>",
    "explanation": "<string>",
    "genreTag": "<string>"
  },
  "runnersUp": [
    { "spotifyId": "<string>", "reason": "<string>", "genreTag": "<string>" }
  ]
}`;

  const message = await claude.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned empty response');

  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!result.topPick?.spotifyId) throw new Error('Claude response missing topPick');

  const candidateMap = Object.fromEntries(candidates.map((c) => [c.spotifyId, c]));

  const topPickData = candidateMap[result.topPick.spotifyId];
  const topPick = topPickData
    ? { ...topPickData, explanation: result.topPick.explanation, genreTag: result.topPick.genreTag }
    : null;

  const runnersUp = (result.runnersUp ?? [])
    .filter((r) => candidateMap[r.spotifyId])
    .map((r) => ({
      ...candidateMap[r.spotifyId],
      reason: r.reason,
      genreTag: r.genreTag,
    }));

  return { topPick, runnersUp };
}
