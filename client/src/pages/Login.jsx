import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from '../components/ui.jsx';
import { Field } from '../components/Fields.jsx';

export default function Login() {
  const auth = useAuth();
  const setup = auth.needs_setup;
  const [form, setForm] = useState({ username: '', password: '', confirm: '', display_name: '', setup_token: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (setup && form.password !== form.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post(setup ? '/api/auth/setup' : '/api/auth/login', form);
      await auth.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-icon">
          <LockKeyhole size={22} />
        </div>
        <h1>{setup ? 'Create your admin account' : 'Sign in'}</h1>
        <p className="muted">{setup ? 'This runs once. Choose a username and a strong password (10+ characters).' : 'Portfolio Manager — private admin area.'}</p>

        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        {setup && (
          <Field label="Display name" htmlFor="dn">
            <input id="dn" value={form.display_name} onChange={set('display_name')} autoComplete="name" />
          </Field>
        )}
        <Field label="Username" htmlFor="un">
          <input id="un" value={form.username} onChange={set('username')} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="pw">
          <input id="pw" type="password" value={form.password} onChange={set('password')} autoComplete={setup ? 'new-password' : 'current-password'} required />
        </Field>
        {setup && (
          <Field label="Confirm password" htmlFor="pw2">
            <input id="pw2" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
          </Field>
        )}
        {setup && auth.setup_requires_token && (
          <Field label="Setup token" htmlFor="st" help="The SETUP_TOKEN value from the server environment.">
            <input id="st" type="password" value={form.setup_token} onChange={set('setup_token')} required />
          </Field>
        )}
        <Button variant="primary" type="submit" loading={busy} className="btn-block">
          {setup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
