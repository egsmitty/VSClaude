import { useApp } from '../AppContext';

function ScoreMeter({ value, label }) {
  return (
    <div className="score-meter">
      <div className="score-meter-label">
        <span>{label}</span>
        <span className="score-value">{value}</span>
      </div>
      <div className="score-bar">
        <div className="score-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function TasteProfileCard() {
  const { profile, loading, runAnalysis, fetchSuggestions } = useApp();

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
        <h2>Your Taste Profile</h2>
        <p>We haven&apos;t analyzed your taste yet.</p>
        <button className="btn btn-primary" onClick={() => runAnalysis()}>
          Analyze My Taste
        </button>
      </div>
    );
  }

  const handleRefresh = async () => {
    await runAnalysis();
    await fetchSuggestions();
  };

  return (
    <div className="card profile-card">
      <div className="profile-header">
        <div>
          <h2>Your Taste Profile</h2>
          {profile.updatedAt && (
            <span className="updated-at">
              Updated {new Date(profile.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={loading.analyze}>
          Refresh
        </button>
      </div>

      <div className="subgenre-badge">{profile.subgenre}</div>

      <p className="taste-summary">{profile.tasteSummary}</p>

      <div className="genre-tags">
        {profile.topGenres?.map((g) => (
          <span key={g} className="genre-tag">{g}</span>
        ))}
      </div>

      <div className="score-meters">
        <ScoreMeter value={profile.nicheScore} label="Niche Score" />
        <ScoreMeter value={profile.popularityPercentile} label="Mainstream Score" />
      </div>
    </div>
  );
}
