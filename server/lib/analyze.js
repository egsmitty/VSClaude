import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

function summarizeTracks(tracks) {
  return tracks.slice(0, 60).map((t) => ({
    title: t.title,
    artist: t.artist,
    genres: t.genres,
    popularity: t.popularity,
  }));
}

/**
 * Computes the most-played artist from a track list (server-side, objective).
 */
function computeTopArtist(tracks) {
  const counts = {};
  for (const t of tracks) {
    if (t.artist && t.artist !== 'Unknown') {
      counts[t.artist] = (counts[t.artist] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Counts unique genres across a set of tracks.
 */
function computeGenreCount(tracks) {
  const genres = new Set();
  for (const t of tracks) {
    t.genres?.forEach((g) => genres.add(g));
  }
  return genres.size;
}

/**
 * Analyzes the user's music taste by comparing recent vs all-time listening.
 * Returns a structured profile including weekly shift blurb.
 *
 * @param {Array} recentTracks  - short_term top tracks (~last 4 weeks)
 * @param {Array} overallTracks - long_term top tracks (all-time)
 * @param {Object|null} priorProfile - previously saved profile for evolution context
 */
export async function analyzeTaste(recentTracks, overallTracks, priorProfile = null) {
  const allTracks = [...recentTracks, ...overallTracks];
  const topArtist  = computeTopArtist(recentTracks) ?? computeTopArtist(overallTracks) ?? 'Unknown';
  const genreCount = computeGenreCount(allTracks);

  // Unique artists and unique songs across both sets
  const artistCount = new Set(allTracks.map((t) => t.artist).filter((a) => a && a !== 'Unknown')).size;
  const songCount   = new Set(allTracks.map((t) => t.spotifyId).filter(Boolean)).size;

  const recentJson  = JSON.stringify(summarizeTracks(recentTracks), null, 2);
  const overallJson = JSON.stringify(summarizeTracks(overallTracks), null, 2);

  const priorSection = priorProfile
    ? `\n## Prior Profile (last analysis)\n${JSON.stringify(priorProfile, null, 2)}\nNote any meaningful evolution.\n`
    : '';

  const prompt = `You are a music taste analyst giving a listener their weekly recap. Compare their recent listening (last ~4 weeks) against their all-time listening to surface what's shifted.

${priorSection}
## Recent Listening (last 4 weeks)
${recentJson}

## All-Time Listening
${overallJson}

## Pre-computed Stats
- Top artist this week: "${topArtist}"
- Total unique genres explored: ${genreCount}

## Instructions
- "topGenre": the single genre that dominates their overall taste (pick the most recurring, be specific not generic — e.g. "melodic rap" not "rap")
- "nicheScore": 0–100 (100 = extremely underground). Invert average popularity of recent tracks. Be honest.
- "nicheExplanation": one sentence explaining what the niche score means for this specific person — name an artist or genre that illustrates it
- "subgenre": one hyper-specific scene label (e.g. "hypnagogic pop", "post-bop jazz", "bedroom pop")
- "tasteSummary": 2–3 punchy sentences about their overall taste — be specific, mention real artists/scenes
- "weeklyShift": one sentence on what's different this week vs their all-time — only if there's a real difference. If it's identical, say what they're consistently loyal to. Be conversational, not clinical.

## Output Format
Respond with ONLY valid JSON — no markdown, no explanation:
{
  "topGenre": "<string>",
  "nicheScore": <number 0–100>,
  "nicheExplanation": "<string>",
  "subgenre": "<string>",
  "tasteSummary": "<string>",
  "weeklyShift": "<string>"
}`;

  const claude = getClient();
  const message = await claude.messages.create({
    model: MODEL,
    max_tokens: 1024,
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

  const required = ['topGenre', 'nicheScore', 'nicheExplanation', 'subgenre', 'tasteSummary', 'weeklyShift'];
  for (const field of required) {
    if (result[field] === undefined) throw new Error(`Missing field in Claude response: ${field}`);
  }

  // Merge server-computed stats into the profile
  return {
    ...result,
    topArtist,
    genreCount,
    artistCount,
    songCount,
  };
}
