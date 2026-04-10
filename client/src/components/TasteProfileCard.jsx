import { useApp } from '../AppContext';

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
        <h2>Your Weekly Recap</h2>
        <p>See how your listening has shifted this week vs. your all-time taste.</p>
        <button className="btn btn-primary" onClick={() => runAnalysis()}>
          Analyze My Taste
        </button>
      </div>
    );
  }

  return (
    <div className="card profile-card">
      <div className="profile-header">
        <div>
          <h2>Weekly Recap</h2>
          {profile.updatedAt && (
            <span className="updated-at">
              Updated {new Date(profile.updatedAt).toLocaleDateString()}
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
        <div className="stat-item">
          <span className="stat-label">Niche Score</span>
          <span className="stat-value niche-score">{profile.nicheScore != null ? `${profile.nicheScore}%` : '—'}</span>
        </div>
      </div>

      {profile.nicheExplanation && (
        <p className="niche-explanation">{profile.nicheExplanation}</p>
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
