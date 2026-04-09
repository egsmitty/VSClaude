import { useState } from 'react';
import { useApp } from '../AppContext';
import SuggestionCard from './SuggestionCard';
import { api } from '../api';

export default function SuggestionsList({ userText }) {
  const { suggestions, loading, fetchSuggestions, profile } = useApp();
  const [selected, setSelected] = useState(new Set());
  const [playlistStatus, setPlaylistStatus] = useState(null);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreatePlaylist = async () => {
    if (selected.size === 0) return;
    setPlaylistStatus('loading');
    try {
      const { playlistUrl } = await api.createPlaylist([...selected]);
      setPlaylistStatus({ url: playlistUrl });
    } catch (err) {
      setPlaylistStatus({ error: err.message });
    }
  };

  if (!profile) return null;

  if (loading.suggestions) {
    return (
      <div className="suggestions-section">
        <div className="loading-card card">
          <div className="spinner" />
          <p>Finding songs for you...</p>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="suggestions-section">
        <div className="suggestions-header">
          <h2>Suggested for You</h2>
          <button
            className="btn btn-primary"
            onClick={() => fetchSuggestions(userText)}
            disabled={loading.suggestions}
          >
            Get Suggestions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="suggestions-section">
      <div className="suggestions-header">
        <h2>Suggested for You</h2>
        <div className="suggestions-controls">
          {selected.size > 0 && (
            <button className="btn btn-spotify" onClick={handleCreatePlaylist} disabled={playlistStatus === 'loading'}>
              {playlistStatus === 'loading' ? 'Creating...' : `Create Playlist (${selected.size})`}
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => fetchSuggestions(userText)}
            disabled={loading.suggestions}
          >
            Refresh
          </button>
        </div>
      </div>

      {playlistStatus?.url && (
        <div className="playlist-success">
          Playlist created!{' '}
          <a href={playlistStatus.url} target="_blank" rel="noreferrer">Open in Spotify</a>
        </div>
      )}
      {playlistStatus?.error && (
        <div className="playlist-error">Failed: {playlistStatus.error}</div>
      )}

      <div className="suggestions-list">
        {suggestions.map((track) => (
          <SuggestionCard
            key={track.spotifyId}
            track={track}
            selected={selected.has(track.spotifyId)}
            onSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
