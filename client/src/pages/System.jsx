import { useRef, useState } from 'react';
import { Copy, Download, LogOut, Upload } from 'lucide-react';
import { api, copyText, formatDate, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { SettingsForm } from '../components/SettingsForm.jsx';
import { Field } from '../components/Fields.jsx';
import { Badge, Button, Card, PageHeader, Spinner, Toggle, useConfirm, useFetch, useToast } from '../components/ui.jsx';

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

export function Integration() {
  const { data, loading } = useFetch('/api/admin/integration');
  if (loading || !data) return <Spinner block />;
  return (
    <div className="page page-narrow">
      <PageHeader title="Integration" description="Connect your portfolio website to this admin." />
      <Card title="1. Add the SDK to your portfolio" description="Paste into the <head> of the portfolio's index.html. It loads all content (including images) into sessionStorage, tracks visits and wires up the contact & testimonial forms.">
        <CopyBlock value={data.snippet} />
        <p className="muted small">
          Optional attributes: <code>data-cache-ttl="300"</code> (seconds before revalidating), <code>data-track="false"</code>, <code>data-inline-images="false"</code>, <code>data-seo="false"</code>.
        </p>
      </Card>
      <Card title="2. Read the data" description="The SDK exposes window.PortfolioManager.">
        <pre className="code">{`// Vue / React / vanilla
PortfolioManager.onData((data) => {
  // data.profile, data.hero, data.about, data.experience, data.skill_categories,
  // data.projects, data.achievements, data.testimonials, data.contact, data.sections, data.seo
});
// or listen for the DOM event (works even if the SDK loads after your app)
window.addEventListener('portfolio:data', (e) => render(e.detail.data));`}</pre>
      </Card>
      <Card title="3. Forms" description="Mark your forms; the SDK validates, submits and shows the server response (including the once-per-day limit message).">
        <pre className="code">{`<form data-abishek-contact> name, email, subject, message … <div class="contact-response"></div></form>
<form data-abishek-testimonial> name, email, role, company, content, <input type="file" name="photo"> …
  <div class="testimonial-response"></div></form>`}</pre>
      </Card>
      <Card title="Endpoints">
        {Object.entries(data.endpoints).map(([k, v]) => (
          <CopyBlock key={k} label={k} value={v} />
        ))}
      </Card>
    </div>
  );
}

export function Backup() {
  const [includeMessages, setIncludeMessages] = useState(true);
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
      <PageHeader title="Backup & restore" description="A backup is a single JSON file with all content, settings and media (as base64). Admin accounts and the vault are not included." />
      <Card title="Download backup">
        <Toggle checked={includeMessages} onChange={setIncludeMessages} label="Include contact messages" />
        <div className="form-footer">
          <a className="btn btn-primary" href={`/api/admin/backup?messages=${includeMessages ? 1 : 0}`}>
            <Download size={16} />
            <span>Download backup</span>
          </a>
        </div>
      </Card>
      <Card title="Restore">
        <p className="muted">Replaces current content with a backup file created by this admin.</p>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        <Button icon={Upload} loading={busy} onClick={() => file.current?.click()}>Choose backup file…</Button>
      </Card>
    </div>
  );
}

export function ActivityLog() {
  const { data, loading } = useFetch('/api/admin/activity?limit=200');
  return (
    <div className="page">
      <PageHeader title="Activity log" description="Recent changes made in the admin." />
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
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  async function saveName(e) {
    e.preventDefault();
    await api.put('/api/auth/profile', { display_name: displayName });
    await refresh();
    toast.success('Display name updated');
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
      <Card title="Profile">
        <form onSubmit={saveName} className="inline-form">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" aria-label="Display name" />
          <Button type="submit">Save</Button>
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
    </div>
  );
}
