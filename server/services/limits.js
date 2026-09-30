/**
 * Daily submission limits for public contact messages and testimonials.
 *
 * Each accepted submission consumes one slot for its (kind, email) and (kind, ip) keys for the
 * current day in APP_TIMEZONE, per account (a visitor's limit on one portfolio does not affect another). Once either key reaches its limit, further submissions of that
 * kind are rejected until the day ends. Rows are purged at local midnight (and on startup), so
 * the visitor can send again the next day.
 */
import net from 'node:net';
import { db } from '../db/index.js';
import { dayKey, msUntilNextDay, nowIso } from '../lib/time.js';

export const KINDS = ['message', 'testimonial'];

/** Lowercase, strip +tags, and ignore dots for Gmail so trivial aliases share a limit. */
export function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at).split('+')[0];
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Normalise an IP; IPv6 addresses are grouped by their /64 prefix (one household/device). */
export function normalizeIp(ip) {
  let s = String(ip || '').trim();
  if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
  if (net.isIPv6(s)) {
    const [head] = s.split('%');
    if (head === '::1') return head;
    const full = expandIPv6(head);
    return full ? `${full.slice(0, 4).join(':')}::/64` : head;
  }
  return s || 'unknown';
}

/** Whether `ip` is in a block/ignore list (entries may be raw or normalised addresses). */
export function ipListed(list, ip) {
  if (!ip || !list?.length) return false;
  const nip = normalizeIp(ip);
  return list.some((x) => x && (x === ip || x === nip));
}

function expandIPv6(addr) {
  const [left, right = ''] = addr.split('::');
  const l = left ? left.split(':') : [];
  const r = right ? right.split(':') : [];
  if (!addr.includes('::') && l.length !== 8) return null;
  const middle = new Array(Math.max(0, 8 - l.length - r.length)).fill('0');
  return [...l, ...middle, ...r].map((h) => h.toLowerCase().replace(/^0+(?=.)/, ''));
}

function keysFor({ email, ip }, settings) {
  const keys = [];
  if (email && settings.per_email_daily > 0) keys.push({ key_type: 'email', key_value: normalizeEmail(email), limit: settings.per_email_daily });
  if (ip && settings.per_ip_daily > 0) keys.push({ key_type: 'ip', key_value: normalizeIp(ip), limit: settings.per_ip_daily });
  return keys;
}

function limitMessage(kind) {
  return kind === 'message'
    ? "You've already sent a message today. Please try again tomorrow."
    : "You've already submitted a testimonial today. Please try again tomorrow.";
}

// Serverless instances have no midnight timer; the first submission each instance sees on
// a new day clears the previous days' entries (Vercel Cron does the same once a day).
let lastPurgeDay = null;
async function purgeIfNewDay(day) {
  if (lastPurgeDay === day) return;
  lastPurgeDay = day;
  await purgeExpired().catch((err) => console.error('[limits] purge failed', err.message));
}

/** Read-only pre-check (used before expensive work such as image processing). */
export async function checkLimit(uid, kind, identity, settings) {
  const day = dayKey();
  await purgeIfNewDay(day);
  for (const k of keysFor(identity, settings)) {
    const row = await db.one('SELECT count FROM pm_daily_limits WHERE user_id = ? AND kind = ? AND key_type = ? AND key_value = ? AND day = ?', [uid, kind, k.key_type, k.key_value, day]);
    if (row && Number(row.count) >= k.limit) {
      await recordBlocked(uid, kind, k, day);
      return blocked(kind, k, day);
    }
  }
  return { ok: true };
}

function blocked(kind, k, day) {
  return {
    ok: false,
    reason: k.key_type,
    message: limitMessage(kind),
    retryAfterSeconds: Math.ceil(msUntilNextDay() / 1000),
    day,
  };
}

async function recordBlocked(uid, kind, k, day) {
  const now = nowIso();
  await db.run(
    `INSERT INTO pm_daily_limits (user_id, kind, key_type, key_value, day, count, blocked, first_at, last_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)
     ON CONFLICT (user_id, kind, key_type, key_value, day) DO UPDATE SET blocked = pm_daily_limits.blocked + 1, last_at = excluded.last_at`,
    [uid, kind, k.key_type, k.key_value, day, now, now]
  ).catch(() => {});
}

/**
 * Atomically consume a slot for every key and run `work(tx)` in the same transaction.
 * If any key is over its limit, nothing is written (besides a "blocked" counter) and
 * `{ ok: false, ... }` is returned.
 */
export async function consumeAndRun(uid, kind, identity, settings, work) {
  const day = dayKey();
  await purgeIfNewDay(day);
  const keys = keysFor(identity, settings);
  const OVER = Symbol('over');
  let offending = null;

  try {
    const result = await db.tx(async (t) => {
      const now = nowIso();
      for (const k of keys) {
        const { rows } = await t.run(
          `INSERT INTO pm_daily_limits (user_id, kind, key_type, key_value, day, count, blocked, first_at, last_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
           ON CONFLICT (user_id, kind, key_type, key_value, day) DO UPDATE SET count = pm_daily_limits.count + 1, last_at = excluded.last_at
           RETURNING count`,
          [uid, kind, k.key_type, k.key_value, day, now, now]
        );
        if (Number(rows[0]?.count) > k.limit) {
          offending = k;
          throw OVER;
        }
      }
      return work(t);
    });
    return { ok: true, result };
  } catch (err) {
    if (err !== OVER) throw err;
    await recordBlocked(uid, kind, offending, day);
    return blocked(kind, offending, day);
  }
}

export async function purgeExpired() {
  const { changes } = await db.run('DELETE FROM pm_daily_limits WHERE day < ?', [dayKey()]);
  return changes;
}

export async function listToday(uid) {
  const rows = await db.all('SELECT * FROM pm_daily_limits WHERE user_id = ? AND day = ? ORDER BY last_at DESC', [uid, dayKey()]);
  return rows.map((r) => ({ ...r, count: Number(r.count), blocked: Number(r.blocked) }));
}

export async function clearEntries(uid, { id, all } = {}) {
  if (all) return (await db.run('DELETE FROM pm_daily_limits WHERE user_id = ?', [uid])).changes;
  return (await db.run('DELETE FROM pm_daily_limits WHERE id = ? AND user_id = ?', [Number(id), uid])).changes;
}

let timer = null;

/** Purge now, then again right after every local midnight. */
export function scheduleDailyPurge() {
  const run = async () => {
    try {
      const n = await purgeExpired();
      if (n) console.log(`[limits] cleared ${n} submission-limit entr${n === 1 ? 'y' : 'ies'} from previous days`);
    } catch (err) {
      console.error('[limits] purge failed', err.message);
    }
    clearTimeout(timer);
    timer = setTimeout(run, msUntilNextDay() + 1000);
    timer.unref?.();
  };
  return run();
}
