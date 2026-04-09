import { spotifyClient } from './spotify.js';
import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

/**
 * Fetches 25 recommendation candidates from Spotify seeded by the user's top tracks.
 * Falls back to fewer seeds if the user has limited history.
 */
export async function fetchCandidates(req, topTracks) {
  const client = await spotifyClient(req);

  // Use up to 5 seed tracks (Spotify's max)
  const seeds = topTracks.slice(0, 5).map((t) => t.spotifyId).filter(Boolean);
  if (seeds.length === 0) throw new Error('No seed tracks available for recommendations');

  const { data } = await client.get('/recommendations', {
    params: {
      seed_tracks: seeds.join(','),
      limit: 25,
    },
  });

  // Fetch artist genres for candidates
  const artistIds = data.tracks.map((t) => t.artists?.[0]?.id).filter(Boolean);
  const unique = [...new Set(artistIds)];
  const genreMap = {};

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const { data: artistData } = await client.get('/artists', {
      params: { ids: batch.join(',') },
    });
    for (const artist of artistData.artists ?? []) {
      if (artist) genreMap[artist.id] = artist.genres ?? [];
    }
  }

  return data.tracks.map((t) => ({
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

  // Merge Claude's annotations back onto the full candidate objects
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
