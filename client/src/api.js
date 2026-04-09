const BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  logout: () => request('/api/auth/logout'),

  analyze: (userText) =>
    request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ userText }),
    }),

  getProfile: () => request('/api/analyze/profile'),

  getSuggestions: (userText) => {
    const params = userText ? `?userText=${encodeURIComponent(userText)}` : '';
    return request(`/api/suggestions${params}`);
  },

  submitFeedback: (spotifyId, vote) =>
    request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ spotifyId, vote }),
    }),

  createPlaylist: (trackIds) =>
    request('/api/spotify/playlist', {
      method: 'POST',
      body: JSON.stringify({ trackIds }),
    }),

  loginUrl: () => `${BASE}/api/auth/login`,
};
