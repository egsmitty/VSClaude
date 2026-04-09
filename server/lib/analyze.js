import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

/**
 * Condenses the track list for the prompt — Claude doesn't need every field.
 * Caps at 100 tracks to keep token count reasonable.
 */
function summarizeTracks(tracks) {
  return tracks.slice(0, 100).map((t) => ({
    title: t.title,
    artist: t.artist,
    genres: t.genres,
    popularity: t.popularity,
  }));
}

/**
 * Builds the system prompt for taste analysis.
 */
function buildPrompt(tracks, userText, priorProfile) {
  const trackJson = JSON.stringify(summarizeTracks(tracks), null, 2);

  const priorSection = priorProfile
    ? `\n## Prior Taste Profile (from previous session)\n${JSON.stringify(priorProfile, null, 2)}\nUse this as additional context — evolve it, don't just repeat it.\n`
    : '';

  const userSection = userText
    ? `\n## User's Own Description of Their Taste\n"${userText}"\nFactor this in — the user knows themselves.\n`
    : '';

  return `You are a music taste analyst. Analyze the following Spotify listening data and return a JSON taste profile.
${priorSection}${userSection}
## Track Data
${trackJson}

## Instructions
- Examine genres, popularity scores, and artist diversity
- "nicheScore": 0 = pure mainstream, 100 = extremely obscure. Base this on the average popularity of tracks (Spotify popularity is 0–100, higher = more popular, so invert it) and genre niche-ness
- "popularityPercentile": 0 = least popular listener, 100 = most mainstream. Derived from average track popularity
- "topGenres": 3–5 genre labels that best define this taste, from most to least dominant
- "subgenre": one hyper-specific label (e.g. "hypnagogic pop", "deep tech house", "emo revival") — be precise, not generic
- "tasteSummary": 2–3 sentences describing the taste in an interesting, specific way. Mention specific artists or scenes if they stand out

## Output Format
Respond with ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "nicheScore": <number 0–100>,
  "popularityPercentile": <number 0–100>,
  "topGenres": [<string>, ...],
  "subgenre": "<string>",
  "tasteSummary": "<string>"
}`;
}

/**
 * Calls Claude to analyze the user's music taste.
 * @param {Array} tracks - Normalized track array from ingest.js
 * @param {string|null} userText - Optional free-text description from the user
 * @param {Object|null} priorProfile - Previously saved taste profile, if any
 * @returns {Object} Taste profile JSON
 */
export async function analyzeTaste(tracks, userText = null, priorProfile = null) {
  const prompt = buildPrompt(tracks, userText, priorProfile);
  const claude = getClient();

  const message = await claude.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Claude returned empty response');

  // Strip markdown code fences if Claude adds them despite instructions
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let profile;
  try {
    profile = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Validate required fields
  const required = ['nicheScore', 'popularityPercentile', 'topGenres', 'subgenre', 'tasteSummary'];
  for (const field of required) {
    if (profile[field] === undefined) throw new Error(`Missing field in Claude response: ${field}`);
  }

  return profile;
}
