import { spotifyClient } from './spotify.js';
import { getClient } from './claude.js';

const MODEL = 'claude-sonnet-4-6';

/**
 * Strips conversational instruction language from a user prompt so what's left
 * is meaningful keywords Spotify can actually search.
 * e.g. "give me a song that sounds like Choosin Texas by Ella Langley that are not by her"
 *   → "Choosin Texas Ella Langley"
 */
function extractSearchTerms(prompt) {
  return prompt
    .replace(/give me (a |some )?songs?/gi, '')
    .replace(/find me (a |some )?songs?/gi, '')
    .replace(/something (that )?sounds? like/gi, '')
    .replace(/songs? (that )?sounds? like/gi, '')
    .replace(/sounds? like/gi, '')
    .replace(/similar to/gi, '')
    .replace(/that (is|are) not by (her|him|them|the artist)/gi, '')
    .replace(/not by (her|him|them)/gi, '')
    .replace(/\b(but|and|that|which|who|where|the|a |an )\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Finds the reference artist from a prompt via a quick track search, then fetches
 * their real Spotify genre tags from the artist record. Only uses /search and
 * /artists/{id} — both confirmed available to new apps.
 */
async function resolveReferenceArtist(client, promptTerms) {
  try {
    const { data } = await client.get('/search', {
      params: { q: promptTerms, type: 'track', limit: 1 },
    });
    const refTrack = data.tracks?.items?.[0];
    if (!refTrack) return null;
    const refArtist = refTrack.artists?.[0];
    if (!refArtist?.id) return null;
    const { data: artistData } = await client.get(`/artists/${refArtist.id}`);
    const genres = artistData.genres ?? [];
    if (genres.length === 0) return null;
    return { artistId: refArtist.id, genres: genres.slice(0, 3) };
  } catch {
    return null;
  }
}

/** Returns true if the prompt is asking for niche/underground/rare music. */
function isNichePrompt(prompt) {
  return /\b(niche|underground|obscure|rare|deep cut|hidden gem|unknown|undiscovered|indie|off the radar)\b/i.test(prompt);
}

/** Returns true if any of the track's artists match the given ID (catches features). */
function trackInvolvesArtist(track, artistId) {
  return (track.artists ?? []).some((a) => a.id === artistId);
}

/**
 * Builds the candidate pool.
 *
 * When a prompt names a reference song/artist:
 *   - Resolve the reference artist and get their real Spotify genre tags
 *   - Search each genre with a randomised offset so every call returns a
 *     different slice of the catalog (fixes "same 4 songs every time")
 *   - Exclude the reference artist from all results, including features
 *   - If genre searches yield nothing, fall through to the profile fallback
 *
 * Without a reference (or if resolution fails):
 *   - Profile genre + artist queries as before
 */
async function searchCandidates(client, tasteProfile, topTracks, listenedIds, userPrompt = null) {
  const candidates = [];
  const seen = new Set();

  const profileGenres = tasteProfile?.topGenres?.slice(0, 3) ?? (tasteProfile?.topGenre ? [tasteProfile.topGenre] : []);
  const profileArtists = [...new Set(topTracks.slice(0, 5).map((t) => t.artist))];
  const promptTerms = userPrompt ? extractSearchTerms(userPrompt) : null;

  const nicheMode = userPrompt ? isNichePrompt(userPrompt) : false;

  if (promptTerms) {
    const ref = await resolveReferenceArtist(client, promptTerms);
    if (ref) {
      for (const genre of ref.genres) {
        // Wide random offset so Try Again lands in a completely different catalog section
        const offset = Math.floor(Math.random() * 200);
        try {
          const { data } = await client.get('/search', {
            params: { q: `genre:"${genre}"`, type: 'track', limit: 15, offset },
          });
          for (const track of data.tracks?.items ?? []) {
            if (track?.id && !seen.has(track.id) && !trackInvolvesArtist(track, ref.artistId)) {
              seen.add(track.id);
              candidates.push(track);
            }
          }
        } catch (err) {
          console.error(`[search] genre query failed: "${genre}" —`, err.response?.status ?? err.message);
        }
      }

      // Only return if we have candidates that survive all filters;
      // otherwise fall through to the profile fallback below
      if (candidates.length > 0) {
        let filtered = candidates.filter((t) => !listenedIds.has(t.id));
        if (nicheMode) filtered = filtered.filter((t) => (t.popularity ?? 100) < 30);
        if (filtered.length > 0) {
          const artistCount = {};
          return filtered.filter((t) => {
            const artist = t.artists?.[0]?.name ?? 'Unknown';
            artistCount[artist] = (artistCount[artist] || 0) + 1;
            return artistCount[artist] <= 3;
          });
        }
        // Niche filter removed everything — fall through to profile fallback
      }
    }
  }

  // Profile fallback: prompt keyword + profile genres + profile artists
  const queries = [
    ...(promptTerms ? [promptTerms] : []),
    ...profileGenres.map((g) => `genre:"${g}"`),
    ...profileArtists.slice(0, 4).map((a) => `artist:"${a}"`),
  ].filter(Boolean).slice(0, 7);

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
    } catch (err) {
      console.error(`[search] query failed: "${query}" —`, err.response?.status ?? err.message);
    }
  }

  // Profile fallback is the last resort — never apply niche filter here or we
  // risk returning empty when the profile genres don't overlap with niche music
  const filtered = candidates.filter((t) => !listenedIds.has(t.id));
  const artistCount = {};
  return filtered.filter((t) => {
    const artist = t.artists?.[0]?.name ?? 'Unknown';
    artistCount[artist] = (artistCount[artist] || 0) + 1;
    return artistCount[artist] <= 3;
  });
}

export async function fetchCandidates(req, topTracks, tasteProfile, userPrompt = null, excludedIds = new Set()) {
  const client = await spotifyClient(req);

  if (topTracks.length === 0) throw new Error('No listening history available for recommendations');

  // listenedIds = user's own library (soft exclusion — relaxed in fallback)
  // excludedIds = already shown by the app this session (hard exclusion — never relaxed)
  const listenedIds = new Set(topTracks.map((t) => t.spotifyId).filter(Boolean));
  const allExcluded = new Set([...listenedIds, ...excludedIds]);

  let rawTracks = await searchCandidates(client, tasteProfile, topTracks, allExcluded, userPrompt);

  // Fallback: relax the library exclusion but keep the hard session exclusion intact
  if (rawTracks.length < 5) {
    rawTracks = await searchCandidates(client, tasteProfile, topTracks, excludedIds, userPrompt);
  }

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
