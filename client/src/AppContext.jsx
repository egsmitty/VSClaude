import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [votes, setVotes] = useState({}); // { spotifyId: 'up' | 'down' }
  const [loading, setLoading] = useState({ auth: true, analyze: false, suggestions: false });
  const [error, setError] = useState(null);

  // Check auth on mount and after OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      sessionStorage.setItem('authToken', token);
      window.history.replaceState({}, '', '/');
    } else if (params.get('error')) {
      window.history.replaceState({}, '', '/');
    }
    api.authStatus()
      .then(({ authenticated }) => {
        setAuthenticated(authenticated);
        if (authenticated) loadSavedProfile();
      })
      .catch(() => {})
      .finally(() => setLoading((l) => ({ ...l, auth: false })));
  }, []);

  const loadSavedProfile = useCallback(async () => {
    try {
      const { profile } = await api.getProfile();
      setProfile(profile);
    } catch {
      // No saved profile yet — that's fine
    }
  }, []);

  const runAnalysis = useCallback(async (userText) => {
    setLoading((l) => ({ ...l, analyze: true }));
    setError(null);
    try {
      const { profile } = await api.analyze(userText);
      setProfile(profile);
      return profile;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading((l) => ({ ...l, analyze: false }));
    }
  }, []);

  const fetchSuggestions = useCallback(async (userText) => {
    setLoading((l) => ({ ...l, suggestions: true }));
    setError(null);
    try {
      const { suggestions } = await api.getSuggestions(userText);
      setSuggestions(suggestions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading((l) => ({ ...l, suggestions: false }));
    }
  }, []);

  const vote = useCallback(async (spotifyId, direction) => {
    const prev = votes[spotifyId];
    const next = prev === direction ? null : direction; // toggle off
    setVotes((v) => ({ ...v, [spotifyId]: next }));
    try {
      await api.submitFeedback(spotifyId, next);
    } catch {
      // Feedback endpoint may not exist yet — fail silently in UI
    }
  }, [votes]);

  const logout = useCallback(async () => {
    await api.logout();
    setAuthenticated(false);
    setProfile(null);
    setSuggestions([]);
    setVotes({});
  }, []);

  return (
    <AppContext.Provider value={{
      authenticated, profile, suggestions, votes, loading, error,
      runAnalysis, fetchSuggestions, vote, logout,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
