const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function getToken() {
  return sessionStorage.getItem('authToken') || '';
}

async function request(path, options = {}) {
  const token = getToken();
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
      ...extraHeaders,
    },
    ...restOptions,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  logout: () => {
    sessionStorage.removeItem('authToken');
    return request('/api/auth/logout', { method: 'POST' });
  },

  analyze: (userText) =>
    request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ userText }),
    }),

  getProfile: () => request('/api/analyze/profile'),

  getSuggestions: (userText, excludeIds = []) =>
    request('/api/suggestions', {
      method: 'POST',
      body: JSON.stringify({ userText: userText || null, excludeIds }),
    }),

  createPlaylist: (trackIds) =>
    request('/api/spotify/playlist', {
      method: 'POST',
      body: JSON.stringify({ trackIds }),
    }),

  loginUrl: () => `${BASE}/api/auth/login`,
};
