import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(
        isAxiosError(err)
          ? err.response?.status === 401
            ? 'Invalid username or password.'
            : 'Sign-in was rejected by the server. Please check your connection and try again.'
          : 'Support API is unavailable. Start the backend and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-inner">
          <div className="brand-mark large">ATM</div>
          <p className="page-kicker">ATM Technical Operations</p>
          <h1>District Support & Monitoring</h1>
          <p>
            Monitor ATM health, manage incidents, record troubleshooting actions, verify restorations,
            and keep a full technical audit trail — for one district, one dashboard.
          </p>
          <ul className="auth-points">
            <li>ATM availability and health monitoring</li>
            <li>Incident lifecycle with verification</li>
            <li>Authorized technical actions only</li>
          </ul>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-card">
          <strong className="auth-brand">ATM SUPPORT</strong>
          <h2>Sign in</h2>
          <p className="page-copy">Use your authorized district credentials.</p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  autoComplete="current-password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            {error ? <div className="error-banner"><strong>{error}</strong></div> : null}
            <button className="button primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <small className="helper-text">
            Technical support metadata only. Never enter customer or card data.
          </small>
        </div>
      </section>
    </main>
  );
}
