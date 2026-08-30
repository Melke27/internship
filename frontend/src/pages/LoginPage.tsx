import type { FormEvent, RefObject } from 'react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowRight, BellRing, Cpu, LogIn, ShieldCheck, Zap } from 'lucide-react';

import { portalHome, useAuth } from '../context/AuthContext';
import CBELogo from '../components/branding/CBELogo';
import HeadOfficeVisual from '../components/branding/HeadOfficeVisual';

const DEMO_ACCOUNTS = ['district.admin', 'maintenance.tech', 'branch.user'];
const DEMO_PASSWORD = 'DemoPass123!';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef: RefObject<HTMLInputElement> = useRef(null);

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

  function pickAccount(account: string) {
    setUsername(account);
    setPassword(DEMO_PASSWORD);
    passwordRef.current?.focus();
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
          Sign in to the ATM technical support portal to manage operations for your scope.
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
                placeholder="e.g. district.admin"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>
          <label className="auth-field">
            <span className="auth-field-label">Password</span>
            <div className="auth-field-box">
              <i aria-hidden="true"><Zap size={15} /></i>
              <input
                ref={passwordRef}
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

        <div className="demo-hint">
          {showDemo ? (
            <div className="demo-list">
              <span className="demo-list-label">One-click local demo sign-in</span>
              <div className="demo-quick">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    type="button"
                    key={account}
                    className={username === account ? 'active' : ''}
                    onClick={() => pickAccount(account)}
                  >
                    <LogIn size={12} />
                    {account}
                  </button>
                ))}
              </div>
              {username ? (
                <p className="demo-quick-auth">
                  Selected <code>{username}</code> · password pre-filled. Press{' '}
                  <button type="button" onClick={() => void submit()}>Sign in securely</button> or switch portal above.
                </p>
              ) : (
                <p className="demo-quick-hint">Pick a portal to pre-fill its account and the local demo password.</p>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setShowDemo(true)}>
              Show local demo sign-in
            </button>
          )}
        </div>

        <div className="auth-rule" />

        <p className="auth-help">Need access? Contact your district administrator.</p>
        <small className="security-note">
          <BellRing size={14} style={{ flexShrink: 0 }} />
          Technical-support metadata only. Never enter customer or card data.
        </small>
      </section>
    </main>
  );
}