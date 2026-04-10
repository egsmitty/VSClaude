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
  const dedupedTracks = [];
  for (const { track } of rawTracks) {
    if (track?.id && !seen.has(track.id)) {
      seen.add(track.id);
      dedupedTracks.push(track);
    }
  }

  const artistIds = dedupedTracks.map((t) => t.artists?.[0]?.id).filter(Boolean);
  const artistGenreMap = await fetchArtistGenres(client, artistIds);

  return dedupedTracks.map((track) => normalizeTrack(track, artistGenreMap));
}
