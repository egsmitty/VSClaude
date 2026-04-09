import { useApp } from '../AppContext';

export default function SuggestionCard({ track, selected, onSelect }) {
  const { vote, votes } = useApp();
  const userVote = votes[track.spotifyId];

  return (
    <div className={`card suggestion-card ${selected ? 'selected' : ''}`}>
      <div className="suggestion-select" onClick={() => onSelect(track.spotifyId)}>
        <div className={`checkbox ${selected ? 'checked' : ''}`} />
      </div>

      <img
        src={track.albumArt || '/placeholder-art.png'}
        alt={track.album}
        className="album-art"
        onError={(e) => { e.target.style.display = 'none'; }}
      />

      <div className="suggestion-info">
        <div className="suggestion-title">{track.title}</div>
        <div className="suggestion-artist">{track.artist}</div>
        <div className="suggestion-reason">{track.matchReason}</div>

        <div className="suggestion-meta">
          <span className="genre-tag">{track.genreTag}</span>
          <span className="niche-badge" title="Niche Score">
            {track.nicheScore}% niche
          </span>
        </div>
      </div>

      <div className="suggestion-actions">
        <button
          className={`vote-btn ${userVote === 'up' ? 'active-up' : ''}`}
          onClick={() => vote(track.spotifyId, 'up')}
          title="Like"
        >
          ▲
        </button>
        <button
          className={`vote-btn ${userVote === 'down' ? 'active-down' : ''}`}
          onClick={() => vote(track.spotifyId, 'down')}
          title="Dislike"
        >
          ▼
        </button>
      </div>
    </div>
  );
}
