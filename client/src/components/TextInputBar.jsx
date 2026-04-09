import { useState } from 'react';
import { useApp } from '../AppContext';

export default function TextInputBar({ onSubmit }) {
  const [text, setText] = useState('');
  const { loading } = useApp();
  const busy = loading.analyze || loading.suggestions;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(text.trim() || null);
  };

  return (
    <form className="text-input-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe your mood or taste right now... (optional)"
        disabled={busy}
        maxLength={300}
      />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? '...' : 'Analyze + Suggest'}
      </button>
    </form>
  );
}
