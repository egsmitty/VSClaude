import { spotifyClient } from './spotify.js';

/**
 * Normalizes a Spotify track object into our unified schema.
 * Genres come from the artist lookup — passed in separately.
 */
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

/**
 * Fetches artist genre tags for a list of artist IDs.
 * Spotify allows up to 50 IDs per request.
 */
async function fetchArtistGenres(client, artistIds) {
  const unique = [...new Set(artistIds)].filter(Boolean);
  const genreMap = {};

  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const { data } = await client.get('/artists', {
      params: { ids: batch.join(',') },
    });
    for (const artist of data.artists ?? []) {
      if (artist) genreMap[artist.id] = artist.genres ?? [];
    }
  }

  return genreMap;
}

/**
 * Fetches all Spotify data needed for taste analysis.
 * Returns a deduplicated, normalized array of tracks.
 */
export async function fetchProfileData(req) {
  const client = await spotifyClient(req);

  // Fetch in parallel: top tracks (3 windows) + recently played + saved tracks
  const [shortTerm, mediumTerm, longTerm, recentRes, savedRes] = await Promise.all([
    client.get('/me/top/tracks', { params: { limit: 50, time_range: 'short_term' } }),
    client.get('/me/top/tracks', { params: { limit: 50, time_range: 'medium_term' } }),
    client.get('/me/top/tracks', { params: { limit: 50, time_range: 'long_term' } }),
    client.get('/me/player/recently-played', { params: { limit: 50 } }),
    client.get('/me/tracks', { params: { limit: 50 } }),
  ]);

  // Collect raw tracks, tagging source for dedup priority
  const rawTracks = [
    ...shortTerm.data.items.map((t) => ({ track: t, source: 'top_short' })),
    ...mediumTerm.data.items.map((t) => ({ track: t, source: 'top_medium' })),
    ...longTerm.data.items.map((t) => ({ track: t, source: 'top_long' })),
    ...recentRes.data.items.map((item) => ({ track: item.track, source: 'recent' })),
    ...savedRes.data.items.map((item) => ({ track: item.track, source: 'saved' })),
  ];

  // Deduplicate by spotifyId, keeping first occurrence (short-term has priority)
  const seen = new Set();
  const dedupedTracks = [];
  for (const { track } of rawTracks) {
    if (track?.id && !seen.has(track.id)) {
      seen.add(track.id);
      dedupedTracks.push(track);
    }
  }

  // Fetch genres for all unique artists
  const artistIds = dedupedTracks.map((t) => t.artists?.[0]?.id).filter(Boolean);
  const artistGenreMap = await fetchArtistGenres(client, artistIds);

  return dedupedTracks.map((track) => normalizeTrack(track, artistGenreMap));
}
