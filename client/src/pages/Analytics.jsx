import { useState } from 'react';
import { Clock, Download, Eye, Trash2, Users } from 'lucide-react';
import { api, timeAgo } from '../lib/api.js';
import { Button, Card, PageHeader, Spinner, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';
import { BarList, LineChart, StatTile } from '../components/Charts.jsx';

const RANGES = [7, 30, 90, 365];

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data: a, loading, error, reload } = useFetch(`/api/admin/analytics?days=${days}`);
  const confirm = useConfirm();
  const toast = useToast();

  async function purge() {
    const ok = await confirm({ title: 'Delete old analytics?', message: 'Removes all events and visitor sessions older than 90 days.', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      const r = await api.post('/api/admin/analytics/purge', { older_than_days: 90 });
      toast.success(`Removed ${r.events} events and ${r.sessions} sessions`);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="page">
      <PageHeader title="Analytics" description="Privacy-friendly visitor stats collected by the portfolio SDK. Only visible to you." actions={<Button icon={Trash2} variant="ghost" onClick={purge}>Purge &gt; 90 days</Button>} />
      <div className="filter-row">
        {RANGES.map((r) => (
          <button key={r} className={cx('chip-btn', days === r && 'is-active')} onClick={() => setDays(r)}>
            {r === 365 ? '1 year' : `${r} days`}
          </button>
        ))}
      </div>
      {!a && loading ? (
        <Spinner block />
      ) : error ? (
        <p className="text-danger">{error.message}</p>
      ) : (
        <div className={cx(loading && 'is-refreshing')}>
          <div className="stat-grid">
            <StatTile label="Page views" value={a.views.range} sub={`${a.views.total} all-time`} icon={Eye} />
            <StatTile label="Visitors" value={a.visitors.range} sub={`${a.visitors.total} all-time`} icon={Users} />
            <StatTile label="Resume downloads" value={a.resume_downloads.range} sub={`${a.resume_downloads.total} all-time`} icon={Download} />
            <StatTile label="Avg. time on site" value={a.engagement.avg_duration_formatted} sub="per visitor" icon={Clock} />
          </div>
          <Card title="Traffic over time">
            <LineChart
              title="Page views and visitors per day"
              data={a.series}
              series={[
                { key: 'views', label: 'Page views', slot: 1 },
                { key: 'visitors', label: 'Visitors', slot: 2 },
              ]}
            />
          </Card>
          <Card title="Resume downloads per day">
            <LineChart title="Resume downloads per day" data={a.series} series={[{ key: 'downloads', label: 'Downloads', slot: 1 }]} height={180} />
          </Card>
          <div className="grid-3">
            <Card title="Top pages"><BarList items={a.top_pages} /></Card>
            <Card title="Referrers"><BarList items={a.referrers} empty="No referrers yet (direct visits)" /></Card>
            <Card title="Devices"><BarList items={a.devices} /></Card>
            <Card title="Browsers"><BarList items={a.browsers} /></Card>
            <Card title="Operating systems"><BarList items={a.os} /></Card>
            <Card title="Recent activity">
              <ul className="event-list">
                {a.recent_events.map((e, i) => (
                  <li key={i}>
                    <span className="event-type">{e.event_type.replace('_', ' ')}</span>
                    <span className="muted small">{[e.device_type, e.browser, e.os].filter(Boolean).join(' · ')}</span>
                    <span className="muted small">{timeAgo(e.created_at)}</span>
                  </li>
                ))}
                {!a.recent_events.length && <p className="muted small">No events yet</p>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
