import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowRight, BellRing, Cpu, ShieldCheck } from 'lucide-react';

import { portalHome, useAuth } from '../context/AuthContext';
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

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await login(username, password);
      navigate(portalHome(user));
    } catch (err) {
      setError(
        isAxiosError(err)
          ? err.response?.status === 401
            ? 'Invalid username or password. Please try again.'
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
        <div className="auth-card-mobile-brand">
          <CBELogo />
        </div>
        <p className="auth-card-eyebrow">Secure internal access</p>
        <h1>Welcome back</h1>
        <p className="auth-card-muted">
          Sign in to the CBE ATM technical support portal to manage operations for your scope.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span className="auth-field-label">Username</span>
            <div className="auth-field-box">
              <i aria-hidden="true"><Cpu size={15} /></i>
              <input
                autoComplete="username"
                autoFocus
                required
                value={username}
                placeholder="Enter your username"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>
          <label className="auth-field">
            <span className="auth-field-label">Password</span>
            <div className="auth-field-box">
              <i aria-hidden="true"><ShieldCheck size={15} /></i>
              <input
                autoComplete="current-password"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Enter your password"
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

          {error ? (
            <div className="form-error" role="alert">
              <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in securely'}
            {!loading ? <ArrowRight size={16} /> : null}
          </button>
        </form>

        <div className="auth-rule" />

        <p className="auth-help">Need access? Contact your district administrator.</p>
        <small className="security-note">
          <BellRing size={14} style={{ flexShrink: 0 }} />
          Commercial Bank of Ethiopia — Internal Support Access.
        </small>
      </section>
    </main>
  );
}
