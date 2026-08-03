import { useState } from 'react';
import { Lock } from 'lucide-react';

interface LoginProps {
  onSuccess: () => void;
}

// NOTE: Client-side gate, not real security. Anyone who reads the JS bundle
// can see the credentials below. Purpose is to keep casual visitors out of
// the demo site, not to protect secrets. Don't host real secrets behind this.
const VALID_USER = 'demoadmin';
const VALID_PASS = 'demoadmin';

export default function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === VALID_USER && password === VALID_PASS) {
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('nspbmcp_auth', '1');
      // Belt-and-suspenders: also clear the other store so the auth flag has a single source
      (remember ? sessionStorage : localStorage).removeItem('nspbmcp_auth');
      onSuccess();
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1f2937 0%, #0a0a0a 100%)',
      zIndex: 9999, padding: '20px'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: '16px', padding: '40px',
        width: '100%', maxWidth: '360px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #1e40af)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '14px'
          }}>
            <Lock size={22} color="#fff" />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0a0a0a', fontWeight: 700 }}>
            NSPB MCP Assistant
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
            Sign in to access the documentation
          </p>
        </div>

        <label style={{ display: 'block', marginBottom: '16px' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 700, marginBottom: '6px' }}>
            Username
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            style={{
              width: '100%', padding: '10px 12px',
              border: '1px solid #d4d4d4', borderRadius: '6px',
              fontSize: '0.95rem', boxSizing: 'border-box',
              background: '#fafafa'
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '16px' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 700, marginBottom: '6px' }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: '100%', padding: '10px 12px',
              border: '1px solid #d4d4d4', borderRadius: '6px',
              fontSize: '0.95rem', boxSizing: 'border-box',
              background: '#fafafa'
            }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', fontSize: '0.9rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          Remember me on this device
        </label>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#991b1b',
            padding: '10px 12px', borderRadius: '6px',
            fontSize: '0.85rem', marginBottom: '14px',
            border: '1px solid #fecaca'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%', padding: '12px',
            background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: '6px',
            fontSize: '0.95rem', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
          }}
        >
          Sign in
        </button>

        <p style={{ margin: '20px 0 0', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
          Internal demo access. For credentials, contact gallobruno@gmail.com
        </p>
      </form>
    </div>
  );
}
