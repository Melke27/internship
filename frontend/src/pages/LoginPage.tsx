import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { useAuth } from '../context/AuthContext';
import CBELogo from '../components/branding/CBELogo';
import HeadOfficeVisual from '../components/branding/HeadOfficeVisual';

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
    <main className="auth-page">
      <section className="auth-visual">
        <HeadOfficeVisual />
      </section>
      <section className="auth-card">
        <CBELogo />
        <div className="auth-rule" />
        <p className="eyebrow accent">SECURE INTERNAL ACCESS</p>
        <h1>Sign in to ATM support</h1>
        <p className="muted">Monitor ATM health, incidents and technical operations for your district.</p>
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
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="button primary auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>
        <small className="security-note">Technical-support metadata only. Never enter customer or card data.</small>
      </section>
    </main>
  );
}
