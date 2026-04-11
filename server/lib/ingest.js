import { spotifyClient } from './spotify.js';

function normalizeTrack(track, artistGenreMap = {}) {
  const artist = track.artists?.[0];
  return {
    spotifyId: track.id,
    title: track.name,
    artist: artist?.name ?? 'Unknown',
    artistId: artist?.id ?? null,
    album: track.album?.name ?? null,
    albumArt: track.album?.images?.[0]?.url ?? null,
    popularity: track.popularity ?? 0,
    genres: artistGenreMap[artist?.id] ?? [],
    previewUrl: track.preview_url ?? null,
  };
}

async function fetchArtistGenres(client, artistIds) {
  const unique = [...new Set(artistIds)].filter(Boolean);
  const genreMap = {};

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const { data } = await client.get('/artists', {
        params: { ids: batch.join(',') },
      });
      for (const artist of data.artists ?? []) {
        if (artist) genreMap[artist.id] = artist.genres ?? [];
      }
    } catch (err) {
      console.error(`fetchArtistGenres batch failed (${err.response?.status ?? err.message}) — continuing without genres for this batch`);
    }
  }

  return genreMap;
}

function dedupeAndNormalize(rawTracks, artistGenreMap) {
  const seen = new Set();
  const deduped = [];
  for (const { track } of rawTracks) {
    if (track?.id && !seen.has(track.id)) {
      seen.add(track.id);
      deduped.push(track);
    }
  }
  return deduped.map((t) => normalizeTrack(t, artistGenreMap));
}

/**
 * Returns merged deduped tracks for seeding suggestions.
 */
export async function fetchProfileData(req) {
  const client = await spotifyClient(req);

  const ENDPOINTS = [
    ['short_term top tracks',   () => client.get('/me/top/tracks', { params: { limit: 50, time_range: 'short_term' } })],
    ['medium_term top tracks',  () => client.get('/me/top/tracks', { params: { limit: 50, time_range: 'medium_term' } })],
    ['long_term top tracks',    () => client.get('/me/top/tracks', { params: { limit: 50, time_range: 'long_term' } })],
    ['recently played',         () => client.get('/me/player/recently-played', { params: { limit: 50 } })],
    ['saved tracks',            () => client.get('/me/tracks', { params: { limit: 50 } })],
  ];

  const results = await Promise.allSettled(ENDPOINTS.map(([, fn]) => fn()));

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Spotify endpoint "${ENDPOINTS[i][0]}" failed: ${r.reason?.response?.status ?? r.reason?.message}`);
    }
  });

  const [shortTerm, mediumTerm, longTerm, recentRes, savedRes] = results;
  const ok = (r) => r.status === 'fulfilled' ? r.value.data.items ?? [] : [];

  const rawTracks = [
    ...ok(shortTerm).map((t) => ({ track: t, source: 'top_short' })),
    ...ok(mediumTerm).map((t) => ({ track: t, source: 'top_medium' })),
    ...ok(longTerm).map((t) => ({ track: t, source: 'top_long' })),
    ...ok(recentRes).map((item) => ({ track: item.track, source: 'recent' })),
    ...ok(savedRes).map((item) => ({ track: item.track, source: 'saved' })),
  ];

  const seen = new Set();
  const dedupedRaw = [];
  for (const entry of rawTracks) {
    if (entry.track?.id && !seen.has(entry.track.id)) {
      seen.add(entry.track.id);
      dedupedRaw.push(entry);
    }
  }

  const artistIds = dedupedRaw.map((e) => e.track.artists?.[0]?.id).filter(Boolean);
  const artistGenreMap = await fetchArtistGenres(client, artistIds);

  return dedupedRaw.map(({ track }) => normalizeTrack(track, artistGenreMap));
}

/**
 * Returns separate recent (short_term) and overall (long_term) track sets
 * for the weekly taste recap analysis.
 */
export async function fetchTrackSets(req) {
  const client = await spotifyClient(req);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [recentRes, longTermRes] = await Promise.allSettled([
    client.get('/me/player/recently-played', { params: { limit: 50, after: sevenDaysAgo } }),
    client.get('/me/top/tracks', { params: { limit: 50, time_range: 'long_term' } }),
  ]);

  if (recentRes.status === 'rejected') {
    console.error(`recently-played fetch failed: ${recentRes.reason?.response?.status ?? recentRes.reason?.message}`);
  }
  if (longTermRes.status === 'rejected') {
    console.error(`long_term fetch failed: ${longTermRes.reason?.response?.status ?? longTermRes.reason?.message}`);
  }

  // recently-played items are already { track, played_at } — matches dedupeAndNormalize shape
  const recentItems = recentRes.status === 'fulfilled' ? recentRes.value.data.items ?? [] : [];
  const longItems   = longTermRes.status === 'fulfilled' ? longTermRes.value.data.items ?? [] : [];

  // Collect all unique artist IDs across both sets for genre lookup
  const allArtistIds = [
    ...recentItems.map((item) => item.track?.artists?.[0]?.id),
    ...longItems.map((t) => t.artists?.[0]?.id),
  ].filter(Boolean);

  const artistGenreMap = await fetchArtistGenres(client, allArtistIds);

  const recentTracks  = dedupeAndNormalize(recentItems, artistGenreMap);
  const overallTracks = dedupeAndNormalize(longItems.map((t) => ({ track: t })), artistGenreMap);

  return { recentTracks, overallTracks };
}
