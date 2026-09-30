import { db } from '../db/index.js';
import { dayKey, formatDuration, lastDays, nowIso } from '../lib/time.js';
import { getSetting } from './settings.js';
import { ipListed, normalizeIp } from './limits.js';

const EVENT_TYPES = new Set(['pageview', 'time_spent', 'resume_download', 'section_view', 'outbound_click', 'custom']);
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|node-fetch/i;

export function detectClient(ua = '') {
  const s = ua.toLowerCase();
  const browser = /edg\//.test(s) ? 'Edge'
    : /opr\/|opera/.test(s) ? 'Opera'
    : /samsungbrowser/.test(s) ? 'Samsung'
    : /chrome|crios|chromium/.test(s) ? 'Chrome'
    : /firefox|fxios/.test(s) ? 'Firefox'
    : /safari/.test(s) ? 'Safari'
    : 'Other';
  const os = /windows/.test(s) ? 'Windows'
    : /android/.test(s) ? 'Android'
    : /iphone|ipad|ipod/.test(s) ? 'iOS'
    : /mac os|macintosh/.test(s) ? 'macOS'
    : /cros/.test(s) ? 'ChromeOS'
    : /linux/.test(s) ? 'Linux'
    : 'Other';
  const device = /tablet|ipad|playbook|silk|(android(?!.*mobi))/.test(s) ? 'tablet'
    : /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s) ? 'mobile'
    : 'desktop';
  return { browser, os, device };
}

const str = (v, max) => String(v ?? '').slice(0, max);

function refHost(referrer) {
  try {
    return referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export async function collectEvent(uid, payload, { ip, userAgent, country = '', location = '', origin = '' }) {
  const settings = await getSetting(uid, 'analytics');
  if (!settings.enabled) return { skipped: 'disabled' };
  if (BOT_RE.test(userAgent || '')) return { skipped: 'bot' };
  const nip = normalizeIp(ip);
  if (ipListed(settings.ignore_ips, ip)) return { skipped: 'ignored' };
  // Blocked visitors (Spam & limits) are left out of the stats too.
  if (ipListed((await getSetting(uid, 'submissions')).blocked_ips, ip)) return { skipped: 'blocked' };

  const sessionId = str(payload.session_id, 64).replace(/[^\w-]/g, '') || `anon_${Date.now().toString(36)}`;
  const eventType = EVENT_TYPES.has(payload.event_type) ? payload.event_type : 'custom';
  const path = str(payload.path || '/', 255);
  const referrer = str(payload.referrer, 500);
  const extra = payload.extra_data && typeof payload.extra_data === 'object' ? payload.extra_data : {};
  const extraJson = JSON.stringify(extra).slice(0, 2000);
  const now = nowIso();
  const day = dayKey();
  const client = detectClient(userAgent);
  const device = ['desktop', 'mobile', 'tablet'].includes(payload.device_type) ? payload.device_type : client.device;

  await db.run(
    `INSERT INTO pm_visitor_sessions (user_id, session_id, ip, user_agent, device_type, browser, os, referrer, landing_path, country, location, origin, day, first_seen, last_seen, duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (user_id, session_id) DO UPDATE SET last_seen = excluded.last_seen`,
    [uid, sessionId, nip, str(userAgent, 500), device, client.browser, client.os, referrer, path, str(country, 8), str(location, 200), str(origin, 200), day, now, now]
  );

  if (eventType === 'time_spent') {
    const secs = Math.min(6 * 3600, Math.max(0, Number.parseInt(extra.duration_seconds, 10) || 0));
    await db.run('UPDATE pm_visitor_sessions SET duration_seconds = ? WHERE user_id = ? AND session_id = ? AND duration_seconds < ?', [secs, uid, sessionId, secs]);
    return { ok: true }; // heartbeats update the session only; they are not stored as events
  }

  await db.run(
    'INSERT INTO pm_analytics_events (user_id, session_id, event_type, path, referrer, title, extra, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uid, sessionId, eventType, path, referrer, str(payload.title, 255), extraJson, day, now]
  );
  return { ok: true };
}

export async function summary(uid, rangeDays = 30) {
  const days = lastDays(Math.min(365, Math.max(1, rangeDays)));
  const from = days[0];
  const today = days[days.length - 1];
  const week = lastDays(7)[0];

  const count = async (sql, params = []) => Number((await db.one(sql, [uid, ...params]))?.n || 0);
  const EV = 'FROM pm_analytics_events WHERE user_id = ?';
  const VS = 'FROM pm_visitor_sessions WHERE user_id = ?';

  const [viewsTotal, viewsToday, viewsWeek, viewsRange] = await Promise.all([
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'pageview'`),
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'pageview' AND day = ?`, [today]),
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'pageview' AND day >= ?`, [week]),
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'pageview' AND day >= ?`, [from]),
  ]);
  const [visitorsTotal, visitorsToday, visitorsWeek, visitorsRange] = await Promise.all([
    count(`SELECT COUNT(*) AS n ${VS}`),
    count(`SELECT COUNT(*) AS n ${VS} AND day = ?`, [today]),
    count(`SELECT COUNT(*) AS n ${VS} AND day >= ?`, [week]),
    count(`SELECT COUNT(*) AS n ${VS} AND day >= ?`, [from]),
  ]);
  const [resumeTotal, resumeToday, resumeRange] = await Promise.all([
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'resume_download'`),
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'resume_download' AND day = ?`, [today]),
    count(`SELECT COUNT(*) AS n ${EV} AND event_type = 'resume_download' AND day >= ?`, [from]),
  ]);

  const avgRow = await db.one(`SELECT AVG(duration_seconds) AS avg, SUM(duration_seconds) AS total ${VS} AND duration_seconds > 0 AND day >= ?`, [uid, from]);
  const avg = Math.round(Number(avgRow?.avg) || 0);

  const series = new Map(days.map((d) => [d, { day: d, views: 0, visitors: 0, downloads: 0 }]));
  for (const r of await db.all(`SELECT day, event_type, COUNT(*) AS n ${EV} AND day >= ? AND event_type IN ('pageview', 'resume_download') GROUP BY day, event_type`, [uid, from])) {
    const s = series.get(r.day);
    if (s) s[r.event_type === 'pageview' ? 'views' : 'downloads'] = Number(r.n);
  }
  for (const r of await db.all(`SELECT day, COUNT(*) AS n ${VS} AND day >= ? GROUP BY day`, [uid, from])) {
    const s = series.get(r.day);
    if (s) s.visitors = Number(r.n);
  }

  const group = async (col) =>
    (await db.all(`SELECT ${col} AS label, COUNT(*) AS n ${VS} AND day >= ? GROUP BY ${col} ORDER BY n DESC LIMIT 8`, [uid, from]))
      .map((r) => ({ label: r.label || 'Unknown', count: Number(r.n) }));

  const topPages = (await db.all(`SELECT path AS label, COUNT(*) AS n ${EV} AND event_type = 'pageview' AND day >= ? GROUP BY path ORDER BY n DESC LIMIT 8`, [uid, from]))
    .map((r) => ({ label: r.label, count: Number(r.n) }));

  const refCounts = new Map();
  for (const r of await db.all(`SELECT referrer, COUNT(*) AS n ${VS} AND day >= ? AND referrer <> '' GROUP BY referrer`, [uid, from])) {
    const host = refHost(r.referrer) || 'Other';
    refCounts.set(host, (refCounts.get(host) || 0) + Number(r.n));
  }
  const referrers = [...refCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const recentEvents = (await db.all(
    `SELECT e.event_type, e.path, e.referrer, e.created_at, s.ip, s.location, s.device_type, s.browser, s.os FROM pm_analytics_events e
     LEFT JOIN pm_visitor_sessions s ON s.user_id = e.user_id AND s.session_id = e.session_id
     WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 15`,
    [uid]
  )).map((r) => ({ ...r }));

  return {
    range_days: days.length,
    views: { total: viewsTotal, today: viewsToday, last_7_days: viewsWeek, range: viewsRange },
    visitors: { total: visitorsTotal, today: visitorsToday, last_7_days: visitorsWeek, range: visitorsRange },
    resume_downloads: { total: resumeTotal, today: resumeToday, range: resumeRange },
    engagement: { avg_duration_seconds: avg, avg_duration_formatted: formatDuration(avg), total_duration_seconds: Number(avgRow?.total) || 0 },
    series: [...series.values()],
    devices: await group('device_type'),
    browsers: await group('browser'),
    os: await group('os'),
    top_pages: topPages,
    referrers,
    recent_events: recentEvents,
    countries: await group('country'),
    updated_at: nowIso(),
  };
}

/**
 * Recent visitor sessions with where they came from, newest first, for spotting and blocking
 * unwanted traffic. `ip` filters to one (normalised) address.
 */
export async function recentVisitors(uid, { days = 30, limit = 100, ip = '' } = {}) {
  const from = lastDays(Math.min(365, Math.max(1, days)))[0];
  const params = [uid, from];
  let where = 's.user_id = ? AND s.day >= ?';
  if (ip) {
    where += ' AND s.ip = ?';
    params.push(normalizeIp(ip));
  }
  const rows = await db.all(
    `SELECT s.session_id, s.ip, s.user_agent, s.device_type, s.browser, s.os, s.referrer, s.landing_path, s.country, s.location, s.origin,
            s.first_seen, s.last_seen, s.duration_seconds,
            (SELECT COUNT(*) FROM pm_analytics_events e WHERE e.user_id = s.user_id AND e.session_id = s.session_id AND e.event_type = 'pageview') AS pageviews,
            (SELECT COUNT(*) FROM pm_analytics_events e WHERE e.user_id = s.user_id AND e.session_id = s.session_id AND e.event_type = 'resume_download') AS downloads
     FROM pm_visitor_sessions s WHERE ${where} ORDER BY s.last_seen DESC LIMIT ?`,
    [...params, Math.min(500, Math.max(1, limit))]
  );
  return rows.map((r) => ({ ...r, pageviews: Number(r.pageviews), downloads: Number(r.downloads), referrer_host: refHost(r.referrer) }));
}

export async function purgeAnalytics(uid, olderThanDays) {
  const cutoff = lastDays(Math.max(1, olderThanDays))[0];
  const e = await db.run('DELETE FROM pm_analytics_events WHERE user_id = ? AND day < ?', [uid, cutoff]);
  const s = await db.run('DELETE FROM pm_visitor_sessions WHERE user_id = ? AND day < ?', [uid, cutoff]);
  return { events: e.changes, sessions: s.changes };
}
