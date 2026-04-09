import { useState } from 'react';
import { useApp } from './AppContext';
import LoginButton from './components/LoginButton';
import TasteProfileCard from './components/TasteProfileCard';
import SuggestionsList from './components/SuggestionsList';
import TextInputBar from './components/TextInputBar';

export default function App() {
  const { authenticated, loading, logout, runAnalysis, fetchSuggestions, error } = useApp();
  const [userText, setUserText] = useState(null);

  if (loading.auth) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginButton />;
  }

  const handleSubmit = async (text) => {
    setUserText(text);
    await runAnalysis(text);
    await fetchSuggestions(text);
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">Taste Analyzer</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}
        <TextInputBar onSubmit={handleSubmit} />
        <TasteProfileCard />
        <SuggestionsList userText={userText} />
      </main>
    </div>
  );
}
