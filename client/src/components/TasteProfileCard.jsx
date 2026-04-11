import { useApp } from '../AppContext';

function nicheLabel(score) {
  if (score >= 85) return 'deeply underground';
  if (score >= 65) return 'pretty niche';
  if (score >= 45) return 'indie-leaning';
  if (score >= 25) return 'somewhat mainstream';
  return 'chart territory';
}

export default function TasteProfileCard() {
  const { profile, loading, runAnalysis } = useApp();

  if (loading.analyze) {
    return (
      <div className="card profile-card loading-card">
        <div className="spinner" />
        <p>Analyzing your taste...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card profile-card empty-card">
        <h2>Your Taste Recap</h2>
        <p>See how your listening has shifted over the past 7 days vs. your all-time taste.</p>
        <button className="btn btn-primary" onClick={() => runAnalysis()}>
          Analyze My Taste
        </button>
      </div>
    );
  }

  const updatedDate = profile.updatedAt ? new Date(profile.updatedAt) : null;
  const weekStart   = updatedDate ? new Date(+updatedDate - 7 * 24 * 60 * 60 * 1000) : null;
  const fmtShort    = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="card profile-card">
      <div className="profile-header">
        <div>
          <h2>Taste Recap</h2>
          {updatedDate && (
            <span className="updated-at">
              {fmtShort(weekStart)} – {fmtShort(updatedDate)} · Updated {updatedDate.toLocaleDateString()}
            </span>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => runAnalysis()}
          disabled={loading.analyze}
        >
          Refresh
        </button>
      </div>

      <div className="subgenre-badge">{profile.subgenre}</div>

      <p className="taste-summary">{profile.tasteSummary}</p>

      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Top Artist</span>
          <span className="stat-value">{profile.topArtist || '—'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Top Genre</span>
          <span className="stat-value">{profile.topGenre || '—'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Artists Listened</span>
          <span className="stat-value">{profile.artistCount ?? '—'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Songs Listened</span>
          <span className="stat-value">{profile.songCount ?? '—'}</span>
        </div>
      </div>

      {profile.nicheScore != null && (
        <div className="niche-strip">
          <div className="niche-strip-score">
            <span className="niche-strip-title">Niche Score</span>
            <span className="niche-big-num">{profile.nicheScore}<span className="niche-big-unit">%</span></span>
            <span className="niche-big-label">{nicheLabel(profile.nicheScore)}</span>
          </div>
          <div className="niche-strip-divider" />
          <p className="niche-strip-explanation">
            {profile.nicheExplanation || 'Niche score based on the underground-ness of your listening.'}
          </p>
        </div>
      )}

      {profile.weeklyShift && (
        <div className="weekly-shift">
          <span className="weekly-shift-label">What changed</span>
          <p>{profile.weeklyShift}</p>
        </div>
      )}
    </div>
  );
}
