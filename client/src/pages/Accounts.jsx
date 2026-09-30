import { Ban, CheckCircle2, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { api, formatBytes, formatDate, timeAgo } from '../lib/api.js';
import { Badge, Button, Card, PageHeader, Spinner, useConfirm, useFetch, useToast } from '../components/ui.jsx';

/** Platform admins only: every account on this server. */
export default function Accounts() {
  const { data, loading, error, reload } = useFetch('/api/platform/accounts');
  const toast = useToast();
  const confirm = useConfirm();

  async function update(a, patch, done) {
    try {
      await api.patch(`/api/platform/accounts/${a.id}`, patch);
      toast.success(done);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function disable(a) {
    const ok = await confirm({
      title: `Disable ${a.username}?`,
      message: 'They are signed out everywhere and their API keys stop serving their portfolio until you enable the account again.',
      confirmLabel: 'Disable',
    });
    if (ok) update(a, { disabled: true }, `${a.username} disabled`);
  }

  async function remove(a) {
    const ok = await confirm({
      title: `Delete ${a.username}?`,
      message: 'The account and all of its content, media, messages, analytics and API keys are deleted permanently.',
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    try {
      await api.del(`/api/platform/accounts/${a.id}`);
      toast.success(`${a.username} deleted`);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  if (error) return <p className="text-danger">{error.message}</p>;
  const items = data?.items || [];

  return (
    <div className="page">
      <PageHeader title="Accounts" description={`Everyone with a portfolio on this server (${items.length}). Each account's content is private to it.`} />
      <Card padded={false}>
        {loading && !data ? (
          <Spinner block />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Storage</th>
                  <th>Projects</th>
                  <th>API last used</th>
                  <th>Last sign-in</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.username}</strong> {a.current && <Badge tone="accent">You</Badge>}
                      <div className="muted small">{a.email || a.display_name}</div>
                    </td>
                    <td>
                      {a.disabled ? <Badge tone="danger">Disabled</Badge> : <Badge tone="success">Active</Badge>}{' '}
                      {a.is_admin && <Badge>Admin</Badge>}
                    </td>
                    <td className="small">{formatBytes(a.storage_bytes)}</td>
                    <td className="small">{a.projects}</td>
                    <td className="small muted">{a.api_last_used_at ? timeAgo(a.api_last_used_at) : 'never'}</td>
                    <td className="small muted" title={formatDate(a.last_login_at)}>{a.last_login_at ? timeAgo(a.last_login_at) : 'never'}</td>
                    <td className="small muted">{formatDate(a.created_at)}</td>
                    <td>
                      {!a.current && (
                        <div className="key-actions">
                          {a.disabled ? (
                            <Button size="sm" icon={CheckCircle2} onClick={() => update(a, { disabled: false }, `${a.username} enabled`)}>Enable</Button>
                          ) : (
                            <Button size="sm" icon={Ban} onClick={() => disable(a)}>Disable</Button>
                          )}
                          {a.is_admin ? (
                            <Button size="sm" variant="ghost" icon={ShieldOff} onClick={() => update(a, { is_admin: false }, `${a.username} is no longer an admin`)}>Remove admin</Button>
                          ) : (
                            <Button size="sm" variant="ghost" icon={ShieldCheck} onClick={() => update(a, { is_admin: true }, `${a.username} is now a platform admin`)}>Make admin</Button>
                          )}
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(a)}>Delete</Button>
                        </div>
                      )}
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
