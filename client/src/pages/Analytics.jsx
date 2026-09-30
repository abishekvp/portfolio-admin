import { useState } from 'react';
import { Clock, Download, Eye, Trash2, Users } from 'lucide-react';
import { api, formatDate, timeAgo } from '../lib/api.js';
import { Button, Card, Empty, PageHeader, Spinner, cx, useConfirm, useFetch, useToast } from '../components/ui.jsx';
import { BarList, LineChart, StatTile } from '../components/Charts.jsx';
import { IpAddress, useIpRules } from '../components/IpAddress.jsx';

const RANGES = [7, 30, 90, 365];

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data: a, loading, error, reload } = useFetch(`/api/admin/analytics?days=${days}`);
  const visitors = useFetch(`/api/admin/analytics/visitors?days=${days}&limit=100`);
  const rules = useIpRules();
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
            {a.countries?.some((c) => c.label !== 'Unknown') && <Card title="Countries"><BarList items={a.countries} /></Card>}
            <Card title="Recent activity">
              <ul className="event-list">
                {a.recent_events.map((e, i) => (
                  <li key={i}>
                    <span className="event-type">{e.event_type.replace('_', ' ')}</span>
                    <span className="muted small">{[e.path, e.location, e.device_type, e.browser, e.os].filter(Boolean).join(' · ')}</span>
                    <span className="muted small">{timeAgo(e.created_at)}</span>
                    <span className="small"><IpAddress ip={e.ip} rules={rules} compact /></span>
                  </li>
                ))}
                {!a.recent_events.length && <p className="muted small">No events yet</p>}
              </ul>
            </Card>
          </div>
          <VisitorsTable data={visitors.data} loading={visitors.loading} rules={rules} />
        </div>
      )}
    </div>
  );
}

function sourceOf(v) {
  if (v.referrer_host) return v.referrer_host;
  return v.referrer ? 'Other' : 'Direct';
}

/** Recent visitor sessions with where they came from; any IP can be blocked from here. */
function VisitorsTable({ data, loading, rules }) {
  const items = data?.items || [];
  return (
    <Card
      title="Recent visitors"
      description="Where each visit came from. Block an IP to stop it sending messages or testimonials, using your download links and showing up in these stats."
      padded={false}
    >
      {loading && !data ? (
        <Spinner block />
      ) : !items.length ? (
        <Empty title="No visitors in this period">Visits appear here once the SDK is on your site.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Last seen</th>
                <th>IP address</th>
                <th>Location</th>
                <th>Device</th>
                <th>Source</th>
                <th>Landing page</th>
                <th className="num">Pages</th>
                <th className="num">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.session_id}>
                  <td className="small muted" title={formatDate(v.last_seen)}>{timeAgo(v.last_seen)}</td>
                  <td className="small"><IpAddress ip={v.ip} rules={rules} /></td>
                  <td className="small">{v.location || <span className="muted">—</span>}</td>
                  <td className="small" title={v.user_agent || ''}>{[v.browser, v.os, v.device_type].filter(Boolean).join(' · ')}</td>
                  <td className="small" title={v.referrer || ''}>
                    {sourceOf(v)}
                    {v.origin && <div className="muted">{v.origin.replace(/^https?:\/\//, '')}</div>}
                  </td>
                  <td className="small mono">{v.landing_path || '/'}</td>
                  <td className="num">
                    {v.pageviews}
                    {v.downloads > 0 && <div className="muted small">{v.downloads} download{v.downloads > 1 ? 's' : ''}</div>}
                  </td>
                  <td className="num small">{v.duration_seconds ? formatDuration(v.duration_seconds) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function formatDuration(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
