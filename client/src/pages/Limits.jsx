import { RotateCcw, ShieldCheck, Unlock } from 'lucide-react';
import { api, formatDate } from '../lib/api.js';
import { SettingsForm } from '../components/SettingsForm.jsx';
import { Badge, Button, Card, Empty, IconButton, PageHeader, Spinner, useConfirm, useFetch, useToast } from '../components/ui.jsx';

export default function Limits() {
  const { data, loading, reload } = useFetch('/api/admin/limits');
  const toast = useToast();
  const confirm = useConfirm();
  const items = data?.items || [];

  async function unblock(row) {
    await api.del(`/api/admin/limits/${row.id}`);
    toast.success(`${row.key_value} can submit again today`);
    reload();
  }

  async function clearAll() {
    const ok = await confirm({ title: 'Reset all limits for today?', message: 'Every visitor will be able to send one more message and testimonial today.', confirmLabel: 'Reset', tone: 'primary' });
    if (!ok) return;
    const r = await api.del('/api/admin/limits');
    toast.success(`Cleared ${r.removed} entries`);
    reload();
  }

  return (
    <div className="page">
      <PageHeader
        title="Spam & limits"
        description="Each visitor may send a limited number of contact messages and testimonials per day, counted separately by email address and by IP address. Entries are cleared automatically when the day ends (server timezone), so they can send again the next day."
      />
      <div className="grid-2">
        <SettingsForm settingKey="submissions" onSaved={reload} />
        <Card
          title="Today's submissions"
          description="Who has used their daily allowance. Unblock someone to let them send again today."
          actions={<Button size="sm" icon={RotateCcw} onClick={clearAll} disabled={!items.length}>Reset all</Button>}
        >
          {loading && !data ? (
            <Spinner />
          ) : !items.length ? (
            <Empty icon={ShieldCheck} title="No submissions today">Entries appear here as visitors use the contact and testimonial forms.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Form</th>
                    <th>Identity</th>
                    <th className="num">Sent</th>
                    <th className="num">Blocked</th>
                    <th>Last attempt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td><Badge tone={r.kind === 'message' ? 'accent' : 'neutral'}>{r.kind}</Badge></td>
                      <td>
                        <span className="muted small">{r.key_type}</span>
                        <div className="mono">{r.key_value}</div>
                      </td>
                      <td className="num">{r.count}</td>
                      <td className="num">{r.blocked ? <Badge tone="warning">{r.blocked}</Badge> : 0}</td>
                      <td className="small muted">{formatDate(r.last_at)}</td>
                      <td><IconButton icon={Unlock} label="Unblock for today" onClick={() => unblock(r)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
