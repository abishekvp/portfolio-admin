import { useState } from 'react';
import { KeyRound, LayoutTemplate, LockKeyhole, MessageSquareQuote, BarChart3 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button, Tabs } from '../components/ui.jsx';
import { Field } from '../components/Fields.jsx';

const FEATURES = [
  [LayoutTemplate, 'Your content, any design', 'Profile, experience, projects, skills and more, managed here and rendered by your own site.'],
  [KeyRound, 'One API key', 'Fetch everything in one request with your key, or drop in the SDK script.'],
  [MessageSquareQuote, 'Forms built in', 'Contact messages and testimonials with spam limits, straight to your inbox.'],
  [BarChart3, 'Analytics', 'Views, visitors, time on site and resume downloads.'],
];

export default function Login() {
  const auth = useAuth();
  const firstRun = auth.needs_setup;
  const [mode, setMode] = useState(firstRun ? 'signup' : 'signin');
  const signup = mode === 'signup';
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', display_name: '', setup_token: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (signup && form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post(signup ? '/api/auth/signup' : '/api/auth/login', form);
      await auth.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-layout">
        <section className="auth-pitch">
          <div className="auth-brand">
            <div className="brand-mark">P</div>
            <span>Portfolio Manager</span>
          </div>
          <h2>The backend for your portfolio website.</h2>
          <p className="muted">Create an account, fill in your content, and connect any site with your API key.</p>
          <ul className="auth-features">
            {FEATURES.map(([Icon, title, text]) => (
              <li key={title}>
                <Icon size={18} />
                <div>
                  <strong>{title}</strong>
                  <span className="muted">{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form className="auth-card" onSubmit={submit}>
          <div className="auth-icon">
            <LockKeyhole size={22} />
          </div>
          <h1>{firstRun ? 'Create the first account' : signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">
            {firstRun
              ? 'This account also becomes the platform admin. Use a strong password (10+ characters).'
              : signup
                ? 'Free, and you get your own API key right away.'
                : 'Sign in with your username or email.'}
          </p>

          {!firstRun && auth.signup_enabled && (
            <Tabs value={mode} onChange={(m) => { setMode(m); setError(''); }} tabs={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
          )}

          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          {signup && (
            <Field label="Display name" htmlFor="dn">
              <input id="dn" value={form.display_name} onChange={set('display_name')} autoComplete="name" />
            </Field>
          )}
          <Field label={signup ? 'Username' : 'Username or email'} htmlFor="un" help={signup ? '3–64 characters: letters, numbers, . _ @ -' : undefined}>
            <input id="un" value={form.username} onChange={set('username')} autoComplete="username" required autoFocus />
          </Field>
          {signup && (
            <Field label="Email" htmlFor="em">
              <input id="em" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
          )}
          <Field label="Password" htmlFor="pw">
            <input id="pw" type="password" value={form.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 10 : undefined} />
          </Field>
          {signup && (
            <Field label="Confirm password" htmlFor="pw2">
              <input id="pw2" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </Field>
          )}
          {signup && auth.setup_requires_token && (
            <Field label="Setup token" htmlFor="st" help="The SETUP_TOKEN value from the server environment.">
              <input id="st" type="password" value={form.setup_token} onChange={set('setup_token')} required />
            </Field>
          )}
          <Button variant="primary" type="submit" loading={busy} className="btn-block">
            {signup ? 'Create account' : 'Sign in'}
          </Button>
          {!firstRun && !auth.signup_enabled && <p className="muted small">New sign-ups are closed on this server.</p>}
        </form>
      </div>
    </div>
  );
}
