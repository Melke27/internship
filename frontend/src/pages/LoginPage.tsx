import type { FormEvent, RefObject } from 'react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowRight, BellRing, Cpu, LogIn, ShieldCheck, UserCheck, Wrench, Zap } from 'lucide-react';

import { portalHome, useAuth } from '../context/AuthContext';
import CBELogo from '../components/branding/CBELogo';
import HeadOfficeVisual from '../components/branding/HeadOfficeVisual';

const DEMO_PROFILES = [
  {
    username: 'district.admin',
    role: 'District Administrator',
    description: 'Full district ATM fleet, incidents, and branch oversight',
    icon: ShieldCheck,
  },
  {
    username: 'maintenance.tech',
    role: 'Field Technician',
    description: 'Troubleshooting, physical repairs, and retest execution',
    icon: Wrench,
  },
  {
    username: 'branch.user',
    role: 'Branch Officer',
    description: 'Local ATM status reporting and incident escalation',
    icon: UserCheck,
  },
];
const DEMO_PASSWORD = 'DemoPass123!';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
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
              <span className="demo-list-label">Quick Role Access (Local Demo)</span>
              <div className="demo-quick-grid" style={{ display: 'grid', gap: 6, margin: '8px 0' }}>
                {DEMO_PROFILES.map((profile) => {
                  const Icon = profile.icon;
                  const selected = username === profile.username;
                  return (
                    <button
                      type="button"
                      key={profile.username}
                      className={`demo-quick-profile ${selected ? 'active' : ''}`}
                      onClick={() => pickAccount(profile.username)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: selected ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                        background: selected ? 'var(--brand-surface)' : 'var(--surface-2)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={16} style={{ color: selected ? 'var(--brand)' : 'var(--text-2)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                          {profile.username}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {profile.role}
                        </div>
                      </div>
                      <LogIn size={13} style={{ opacity: selected ? 1 : 0.4 }} />
                    </button>
                  );
                })}
              </div>
              {username ? (
                <p className="demo-quick-auth">
                  Selected <code>{username}</code> · credentials set.{' '}
                  <button type="button" onClick={() => void submit()} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                    Click to sign in &rarr;
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <button type="button" onClick={() => setShowDemo(true)}>
              Show demo role accounts
            </button>
          )}
        </div>

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