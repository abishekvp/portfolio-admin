import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Download, Eye, Mail, MessageSquareQuote, ShieldAlert, Users } from 'lucide-react';
import { timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Badge, Card, Empty, PageHeader, Spinner, useFetch } from '../components/ui.jsx';
import { BarList, LineChart, StatTile } from '../components/Charts.jsx';

const CHECKLIST = [
  ['profile', 'Name and email on your profile', '/profile'],
  ['photo', 'Profile photo uploaded', '/profile'],
  ['summary', 'About summary written', '/profile'],
  ['resume', 'Resume uploaded', '/profile'],
  ['contacts', 'Contact links added', '/contacts'],
  ['experience', 'At least one experience entry', '/experience'],
  ['projects', 'At least one project', '/projects'],
  ['skills', 'Skills added', '/skills'],
  ['connected', 'Website connected with your API key', '/integration'],
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch('/api/admin/overview?days=14');
  if (loading && !data) return <Spinner block />;
  if (error) return <p className="text-danger">{error.message}</p>;
  const { counts, analytics: a, checklist } = data;
  const done = CHECKLIST.filter(([k]) => checklist[k]).length;
  const hour = new Date().getHours();

  return (
    <div className="page">
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user?.display_name || user?.username}`}
        description="Here's what's happening on your portfolio."
      />

      <div className="stat-grid">
        <StatTile label="Views today" value={a.views.today} sub={`${a.views.last_7_days} in the last 7 days`} icon={Eye} />
        <StatTile label="Visitors today" value={a.visitors.today} sub={`${a.visitors.total} all-time`} icon={Users} />
        <StatTile label="Resume downloads" value={a.resume_downloads.range} sub={`${a.resume_downloads.today} today · last 14 days`} icon={Download} />
        <StatTile label="Avg. time on site" value={a.engagement.avg_duration_formatted} sub="last 14 days" icon={Clock} />
      </div>

      <div className="grid-2-1">
        <Card title="Traffic" description="Last 14 days" actions={<Link to="/analytics" className="link-btn small">Full analytics →</Link>}>
          <LineChart
            title="Page views and visitors per day"
            data={a.series}
            series={[
              { key: 'views', label: 'Page views', slot: 1 },
              { key: 'visitors', label: 'Visitors', slot: 2 },
            ]}
          />
        </Card>
        <Card title="Needs attention">
          <ul className="attention-list">
            <li>
              <Link to="/messages?filter=unread">
                <Mail size={18} />
                <span>Unread messages</span>
                <Badge tone={counts.unread_messages ? 'accent' : 'neutral'}>{counts.unread_messages}</Badge>
              </Link>
            </li>
            <li>
              <Link to="/testimonials">
                <MessageSquareQuote size={18} />
                <span>Testimonials awaiting review</span>
                <Badge tone={counts.pending_testimonials ? 'warning' : 'neutral'}>{counts.pending_testimonials}</Badge>
              </Link>
            </li>
            <li>
              <Link to="/limits">
                <ShieldAlert size={18} />
                <span>Visitors blocked by daily limit today</span>
                <Badge>{counts.blocked_today}</Badge>
              </Link>
            </li>
          </ul>
          <div className="checklist">
            <div className="checklist-head">
              <strong>Portfolio completeness</strong>
              <span className="muted small">{done}/{CHECKLIST.length}</span>
            </div>
            <div className="progress"><div style={{ width: `${(done / CHECKLIST.length) * 100}%` }} /></div>
            {CHECKLIST.map(([k, label, to]) => (
              <Link key={k} to={to} className={checklist[k] ? 'check done' : 'check'}>
                {checklist[k] ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Latest messages" actions={<Link to="/messages" className="link-btn small">Inbox →</Link>}>
          {data.recent_messages.length ? (
            <ul className="mini-list">
              {data.recent_messages.map((m) => (
                <li key={m.id}>
                  <Link to={`/messages?id=${m.id}`}>
                    <span className={m.is_read ? '' : 'unread-dot'} />
                    <span className="mini-main">
                      <strong>{m.name}</strong>
                      <span className="muted">{m.subject}</span>
                    </span>
                    <span className="muted small">{timeAgo(m.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Mail} title="No messages yet">Messages from the contact form land here.</Empty>
          )}
        </Card>
        <Card title="Top sections & pages" description="Last 14 days">
          <BarList items={a.top_pages} />
          <h4 className="subhead">Devices</h4>
          <BarList items={a.devices} />
        </Card>
      </div>

      <div className="count-strip">
        {[
          ['Projects & Sites', counts.projects, '/projects'],
          ['Experience', counts.experience, '/experience'],
          ['Mentorship', counts.mentorship, '/mentorship'],
          ['Events', counts.events, '/events'],
          ['Skills', counts.skills, '/skills'],
          ['Achievements', counts.achievements, '/achievements'],
          ['Testimonials', counts.testimonials, '/testimonials'],
          ['Custom fields', counts.custom_content, '/custom'],
        ].map(([label, n, to]) => (
          <Link key={label} to={to} className="count-chip">
            <strong>{n ?? 0}</strong>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
