import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ContentArea from './components/ContentArea';
import Login from './components/Login';

export type ArticlePath = string;
type View = 'docs' | 'pitch';

const AUTH_KEY = 'nspbmcp_auth';

function App() {
  const [authed, setAuthed] = useState<boolean>(() => {
    return localStorage.getItem(AUTH_KEY) === '1' || sessionStorage.getItem(AUTH_KEY) === '1';
  });
  const [activeArticle, setActiveArticle] = useState<ArticlePath>('/help/OVERVIEW.md');
  const [view, setView] = useState<View>('docs');

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  // Pill style — orange when active, ghost gray when inactive.
  const pillBase: React.CSSProperties = {
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: '1px solid transparent',
    userSelect: 'none'
  };
  const pillActive: React.CSSProperties = {
    background: 'var(--accent)',
    color: 'white',
    boxShadow: '0 4px 12px rgba(242, 204, 95, 0.3)'
  };
  const pillIdle: React.CSSProperties = {
    background: 'transparent',
    color: '#888',
    border: '1px solid #555'
  };

  return (
    <div className="app-wrapper">
      <header className="global-header" style={{ padding: '0 30px' }}>
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
          <span style={{ fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '-0.5px' }}>NSPB <span style={{ color: 'var(--accent)' }}>AI Assistant</span></span>
        </div>

        <div style={{ marginLeft: '40px', display: 'flex', gap: '10px' }}>
          <div
            style={{ ...pillBase, ...(view === 'docs' ? pillActive : pillIdle) }}
            onClick={() => setView('docs')}
          >
            Documentation
          </div>
          <div
            style={{ ...pillBase, ...(view === 'pitch' ? pillActive : pillIdle) }}
            onClick={() => setView('pitch')}
          >
            Why NSPB MCP?
          </div>
        </div>
      </header>

      {view === 'docs' && (
        <main className="layout">
          <div className="glass-pane topics-sidebar" style={{ flex: 'none', width: '320px', minWidth: '320px', maxWidth: '320px', display: 'flex', flexDirection: 'column' }}>
            <Sidebar activeArticle={activeArticle} setActiveArticle={setActiveArticle} />
          </div>

          <div className="kb-main-area" style={{ flex: 1, overflowY: 'auto' }}>
            <ContentArea activeArticle={activeArticle} />
          </div>
        </main>
      )}

      {view === 'pitch' && (
        // Full-width pitch deck iframe — uses all the space below the header.
        // The deck is fixed-aspect 1920×1080; deck-stage.js handles fit-to-viewport.
        <main style={{ flex: 1, minHeight: 0, display: 'flex', background: '#0c1520' }}>
          <iframe
            src="/pitch/client-pitch.html"
            title="Why NSPB MCP — Client Pitch"
            style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
          />
        </main>
      )}

      <footer
        style={{
          padding: '12px 24px',
          fontSize: '11px',
          color: '#888',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        © 2026 Bruno Gallo · NSPB MCP Assistant · all rights reserved
      </footer>
    </div>
  );
}

export default App;
