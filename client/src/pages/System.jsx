import { useRef, useState } from 'react';
import { Copy, Download, KeyRound, LogOut, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api, copyText, formatDate, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { SettingsForm } from '../components/SettingsForm.jsx';
import { Field } from '../components/Fields.jsx';
import { Badge, Button, Card, Empty, PageHeader, Spinner, Toggle, useConfirm, useFetch, useToast } from '../components/ui.jsx';
import { IpAddress, describeUserAgent, useIpRules } from '../components/IpAddress.jsx';

export function SiteSettings() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Site & SEO" description="Search engine and social sharing metadata (applied by the SDK), and analytics collection." />
      <SettingsForm settingKey="seo" />
      <SettingsForm settingKey="analytics" />
    </div>
  );
}

function CopyBlock({ label, value }) {
  const toast = useToast();
  return (
    <div className="copy-block">
      {label && <div className="muted small">{label}</div>}
      <div className="copy-row">
        <code>{value}</code>
        <Button size="sm" icon={Copy} onClick={async () => (await copyText(value)) && toast.success('Copied')}>Copy</Button>
      </div>
    </div>
  );
}

function ApiKeys({ keys, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/admin/keys', { name: name || 'API key' });
      setName('');
      toast.success('API key created');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function roll(k) {
    const ok = await confirm({
      title: `Rotate “${k.name}”?`,
      message: 'A new key replaces this one. The old key stops working immediately, so update every site that uses it.',
      confirmLabel: 'Rotate key',
    });
    if (!ok) return;
    await api.post(`/api/admin/keys/${k.id}/roll`);
    toast.success('Key rotated');
    reload();
  }

  async function remove(k) {
    const ok = await confirm({
      title: `Revoke “${k.name}”?`,
      message: 'Sites using this key will stop loading your portfolio. This cannot be undone.',
      confirmLabel: 'Revoke key',
    });
    if (!ok) return;
    await api.del(`/api/admin/keys/${k.id}`);
    toast.success('Key revoked');
    reload();
  }

  return (
    <Card
      title="API keys"
      description="A key identifies your portfolio. It is publishable: it goes into your website and only reads public content or submits the visitor forms. Use one per site so you can revoke them separately."
    >
      {keys.length ? (
        <ul className="key-list">
          {keys.map((k) => (
            <li key={k.id}>
              <div className="key-head">
                <strong>{k.name}</strong>
                <span className="muted small">{k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : 'never used'} · created {timeAgo(k.created_at)}</span>
              </div>
              <CopyBlock value={k.token} />
              <div className="key-actions">
                <Button size="sm" icon={RefreshCw} onClick={() => roll(k)}>Rotate</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(k)}>Revoke</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={KeyRound} title="No API keys">Create a key to connect your website.</Empty>
      )}
      <form onSubmit={create} className="inline-form" style={{ marginTop: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. my-site.com" aria-label="New key name" maxLength={60} />
        <Button type="submit" icon={Plus} loading={busy}>New key</Button>
      </form>
    </Card>
  );
}

export function Integration() {
  const { data, loading, reload } = useFetch('/api/admin/integration');
  const [selected, setSelected] = useState(null);
  if (loading && !data) return <Spinner block />;
  const keys = data.keys || [];
  const key = keys.find((k) => k.id === selected) || keys[0];
  const token = key?.token || 'pk_your_key';
  const snippet = `<script src="${data.sdk_url}" data-key="${token}" async></script>`;
  const bundleUrl = data.endpoints.bundle.replace('?inline=1', '');
  const withKey = (url) => `${url}${url.includes('?') ? '&' : '?'}key=${token}`;

  return (
    <div className="page page-narrow">
      <PageHeader title="Integration" description="Connect any website to your portfolio content with an API key." />
      <ApiKeys keys={keys} reload={reload} />

      {keys.length > 1 && (
        <Field label="Show examples for" htmlFor="key-pick">
          <select id="key-pick" value={key.id} onChange={(e) => setSelected(Number(e.target.value))}>
            {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </Field>
      )}

      <Card title="Option A: add the SDK" description="Paste into the <head> of your site's index.html. It loads all content (including images) into sessionStorage, tracks visits and wires up the contact and testimonial forms.">
        <CopyBlock value={snippet} />
        <p className="muted small">
          Optional attributes: <code>data-cache-ttl="0"</code> (seconds to trust the cache before checking for changes; default 0 = every page load), <code>data-track="false"</code>, <code>data-inline-images="false"</code>, <code>data-seo="false"</code>.
        </p>
        <pre className="code">{`// Vue / React / vanilla
PortfolioManager.onData((data) => {
  // Personal content: data.profile (incl. summary, photo_url, resume_url), data.contacts,
  // data.experience, data.education, data.skill_categories, data.projects, data.achievements,
  // data.testimonials, data.seo
  // Template texts from "Custom content", with your own fallbacks:
  const tagline = data.custom?.hero?.tagline ?? 'My default tagline';
});
// or listen for the DOM event (works even if the SDK loads after your app)
window.addEventListener('portfolio:data', (e) => render(e.detail.data));`}</pre>
      </Card>

      <Card title="Option B: call the API" description="One request returns your whole portfolio as JSON. Send the key as ?key=, an X-Portfolio-Key header, or Authorization: Bearer.">
        <CopyBlock label="curl" value={`curl -H "X-Portfolio-Key: ${token}" ${bundleUrl}`} />
        <pre className="code">{`const res = await fetch('${bundleUrl}', {
  headers: { 'X-Portfolio-Key': '${token}' },
});
const { version, data } = await res.json();
// Cheap change check: GET ${data.endpoints.version} returns { version }.
// Add ?since=<version> to the bundle URL and it answers { status: 'not_modified' } when nothing changed.`}</pre>
      </Card>

      <Card title="Forms" description="Mark your forms; the SDK validates, submits and shows the server response (including the once-per-day limit message).">
        <pre className="code">{`<form data-abishek-contact> name, email, subject, message … <div class="contact-response"></div></form>
<form data-abishek-testimonial> name, email, role, company, content, <input type="file" name="photo"> …
  <div class="testimonial-response"></div></form>`}</pre>
      </Card>

      <Card title="Endpoints" description="All public endpoints take the same key.">
        {Object.entries(data.endpoints).map(([k, v]) => (
          <CopyBlock key={k} label={k} value={withKey(v)} />
        ))}
      </Card>
    </div>
  );
}

export function Backup() {
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function restore(f) {
    if (!f) return;
    const ok = await confirm({
      title: 'Restore from backup?',
      message: `All current content, settings and media will be replaced with the contents of ${f.name}. Download a backup first if you are unsure.`,
      confirmLabel: 'Restore',
    });
    if (!ok) {
      file.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const json = JSON.parse(await f.text());
      const r = await api.post('/api/admin/backup/restore', json);
      toast.success(`Restored: ${Object.entries(r.restored).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'That file is not valid JSON.' : err);
    } finally {
      setBusy(false);
      file.current.value = '';
    }
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Backup & restore" description="A backup is a single JSON file with all of your content, custom content, notes, settings and media (as base64). Your login and API keys are not included. It can be restored into this or another account." />
      <Card title="Download backup">
        <div className="stack">
          <Toggle checked={includeMessages} onChange={setIncludeMessages} label="Include contact messages" />
          <Toggle checked={includeMedia} onChange={setIncludeMedia} label="Include media files (images, resume)" />
        </div>
        <div className="form-footer">
          <a className="btn btn-primary" href={`/api/admin/backup?messages=${includeMessages ? 1 : 0}&media=${includeMedia ? 1 : 0}`}>
            <Download size={16} />
            <span>Download backup</span>
          </a>
        </div>
      </Card>
      <Card title="Restore">
        <p className="muted">
          Replaces your current content with a backup file created by this admin (from any account). On Vercel, uploads are limited to 4.5 MB — for larger
          backups run <code>npm run restore -- backup.json --user=&lt;username&gt;</code> locally with <code>DATABASE_URL</code> pointing at the production database.
        </p>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        <Button icon={Upload} loading={busy} onClick={() => file.current?.click()}>Choose backup file…</Button>
      </Card>
    </div>
  );
}

export function ActivityLog() {
  const { data, loading } = useFetch('/api/admin/activity?limit=200');
  const rules = useIpRules();
  return (
    <div className="page">
      <PageHeader title="Activity log" description="Recent changes made in the admin, with the IP address, browser and (on Vercel) location they came from. Block an IP to restrict it on your public site." />
      <Card padded={false}>
        {loading && !data ? (
          <Spinner block />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Item</th>
                  <th>Details</th>
                  <th>IP address</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="small muted" title={formatDate(a.created_at)}>{timeAgo(a.created_at)}</td>
                    <td>{a.username}</td>
                    <td><Badge>{a.action}</Badge></td>
                    <td className="small">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                    <td className="small muted">{a.summary}</td>
                    <td className="small">{a.ip ? <IpAddress ip={a.ip} rules={rules} compact /> : <span className="muted">—</span>}</td>
                    <td className="small" title={a.user_agent || ''}>
                      {describeUserAgent(a.user_agent) || <span className="muted">—</span>}
                      {a.location && <div className="muted">{a.location}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Account() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const sessions = useFetch('/api/auth/sessions');
  const [profile, setProfile] = useState({ display_name: user?.display_name || '', email: user?.email || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const confirm = useConfirm();

  async function saveProfile(e) {
    e.preventDefault();
    try {
      await api.put('/api/auth/profile', profile);
      await refresh();
      toast.success('Account details updated');
    } catch (err) {
      toast.error(err);
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    const ok = await confirm({
      title: 'Delete your account?',
      message: 'Your portfolio content, media, messages, analytics and API keys are deleted permanently, and sites using your keys stop working. Download a backup first if you might need it.',
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    try {
      await api.post('/api/auth/delete-account', { password: deletePw });
      await refresh();
    } catch (err) {
      toast.error(err);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      await api.post('/api/auth/password', pw);
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed. Other sessions were signed out.');
      sessions.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    await api.del(`/api/auth/sessions/${id}`);
    sessions.reload();
  }

  async function revokeOthers() {
    const r = await api.post('/api/auth/sessions/revoke-others');
    toast.success(`Signed out ${r.revoked} other session${r.revoked === 1 ? '' : 's'}`);
    sessions.reload();
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Account" description={`Signed in as ${user?.username}`} />
      <Card title="Account details" description="Your sign-in details. Your public portfolio profile is edited under Profile.">
        <form onSubmit={saveProfile} className="form-grid">
          <Field label="Display name">
            <input value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="Email" help="You can sign in with it instead of your username.">
            <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} autoComplete="email" />
          </Field>
          <div className="form-footer field-full">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
      <Card title="Change password" description="At least 10 characters. Changing it signs out every other session.">
        <form onSubmit={changePassword} className="form-grid">
          <Field label="Current password" span="full">
            <input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
          </Field>
          <Field label="New password">
            <input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required minLength={10} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </Field>
          <div className="form-footer field-full">
            <Button variant="primary" type="submit" loading={busy}>Update password</Button>
          </div>
        </form>
      </Card>
      <SettingsForm settingKey="security" />
      <Card title="Active sessions" actions={<Button size="sm" icon={LogOut} onClick={revokeOthers}>Sign out others</Button>}>
        {!sessions.data ? (
          <Spinner />
        ) : (
          <ul className="session-list">
            {sessions.data.items.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.user_agent?.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] || 'Browser'}</strong> {s.current && <Badge tone="success">This device</Badge>}
                  <div className="muted small">{s.ip} · active {timeAgo(s.last_seen_at)} · expires {formatDate(s.expires_at)}</div>
                </div>
                {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>Revoke</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Delete account" className="danger-zone" description="Permanently deletes your account, your portfolio content and media, messages, analytics and API keys.">
        <form onSubmit={deleteAccount} className="inline-form">
          <input type="password" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} placeholder="Current password" aria-label="Current password" required />
          <Button type="submit" variant="danger" icon={Trash2}>Delete account</Button>
        </form>
      </Card>
    </div>
  );
}
