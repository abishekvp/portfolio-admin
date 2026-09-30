import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/index.js';
import { TENANT_TABLES, claimOrphans } from '../db/schema.js';
import { nowIso } from '../lib/time.js';
import { HttpError, isEmail } from '../lib/validate.js';
import { getSetting } from './settings.js';
import { createApiKey } from './apikeys.js';

/** Session lifetime in days, from the account's Account → Security (1–365). */
async function sessionDays(uid) {
  const { session_days } = await getSetting(uid, 'security');
  return Math.min(365, Math.max(1, Math.round(Number(session_days)) || 14));
}

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'pm_session';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, saltB64, keyB64] = String(stored || '').split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, expected);
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) throw new HttpError(400, 'Password must be at least 10 characters long.');
  if (password.length > 200) throw new HttpError(400, 'Password is too long.');
}

export function validateUsername(username) {
  if (!/^[a-zA-Z0-9_.@-]{3,64}$/.test(String(username || ''))) {
    throw new HttpError(400, 'Username must be 3-64 characters (letters, numbers, . _ @ -).');
  }
}

export function normalizeAccountEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (e && !isEmail(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e || null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function userCount() {
  return Number((await db.one('SELECT COUNT(*) AS n FROM pm_users')).n);
}

/**
 * Create an account: its own portfolio, settings and a first API key. The first account on the
 * server becomes the platform admin and takes over any unowned (pre-accounts) content.
 */
export async function createUser(username, password, displayName = '', { email = '', isAdmin = false } = {}) {
  validateUsername(username);
  validatePassword(password);
  const mail = normalizeAccountEmail(email);
  const exists = await db.one('SELECT id FROM pm_users WHERE LOWER(username) = LOWER(?)', [username]);
  if (exists) throw new HttpError(409, 'That username is already taken.');
  if (mail && (await db.one('SELECT id FROM pm_users WHERE email = ?', [mail]))) {
    throw new HttpError(409, 'An account with that email already exists.');
  }
  const passwordHash = await hashPassword(password);
  const id = await db.tx(async (t) => {
    const first = Number((await t.one('SELECT COUNT(*) AS n FROM pm_users')).n) === 0;
    const { rows } = await t.run(
      'INSERT INTO pm_users (username, display_name, email, is_admin, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [username, displayName || username, mail, isAdmin || first ? 1 : 0, passwordHash, nowIso()]
    );
    const uid = rows[0].id;
    if (first) await claimOrphans(t, uid);
    await createApiKey(uid, 'Default', t);
    return uid;
  });
  return id;
}

/** Permanently delete an account and everything it owns. */
export async function deleteAccount(uid) {
  await db.tx(async (t) => {
    for (const table of TENANT_TABLES) await t.run(`DELETE FROM ${table} WHERE user_id = ?`, [uid]);
    await t.run('DELETE FROM pm_sessions WHERE user_id = ?', [uid]);
    await t.run('DELETE FROM pm_users WHERE id = ?', [uid]);
  });
}

export async function createSession(userId, { ip, userAgent }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + (await sessionDays(userId)) * 86_400_000);
  await db.run(
    'INSERT INTO pm_sessions (token_hash, user_id, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [sha256(token), userId, ip, String(userAgent || '').slice(0, 300), now.toISOString(), now.toISOString(), expires.toISOString()]
  );
  await db.run('UPDATE pm_users SET last_login_at = ? WHERE id = ?', [now.toISOString(), userId]);
  return { token, expires };
}

export async function resolveSession(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const row = await db.one(
    `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.id, u.username, u.display_name, u.email, u.is_admin, u.disabled,
            u.created_at, u.last_login_at
     FROM pm_sessions s JOIN pm_users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    [sha256(token)]
  );
  if (!row) return null;
  if (row.disabled) return null;
  row.is_admin = Boolean(row.is_admin);
  if (new Date(row.expires_at) < new Date()) {
    await db.run('DELETE FROM pm_sessions WHERE id = ?', [row.session_id]);
    return null;
  }
  // Touch at most every 5 minutes.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.run('UPDATE pm_sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), row.session_id]);
  }
  return row;
}

export async function destroySession(token) {
  if (token) await db.run('DELETE FROM pm_sessions WHERE token_hash = ?', [sha256(String(token))]);
}

export async function purgeExpiredSessions() {
  await db.run('DELETE FROM pm_sessions WHERE expires_at < ?', [nowIso()]);
}

// ---- brute-force protection (stored in the database so it holds across serverless instances) ----

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failureKeys = (ip, username) => [`ip:${ip}`, `user:${String(username).toLowerCase().slice(0, 64)}`];

export async function assertNotLocked(ip, username) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  for (const key of failureKeys(ip, username)) {
    const row = await db.one('SELECT count, first_at FROM pm_login_failures WHERE key = ? AND first_at > ?', [key, since]);
    if (row && Number(row.count) >= MAX_FAILURES) {
      const mins = Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - new Date(row.first_at).getTime())) / 60_000));
      throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
  }
}

export async function recordFailure(ip, username) {
  const now = nowIso();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  for (const key of failureKeys(ip, username)) {
    await db.run(
      `INSERT INTO pm_login_failures (key, count, first_at) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN pm_login_failures.first_at > ? THEN pm_login_failures.count + 1 ELSE 1 END,
         first_at = CASE WHEN pm_login_failures.first_at > ? THEN pm_login_failures.first_at ELSE excluded.first_at END`,
      [key, now, since, since]
    );
  }
}

export async function clearFailures(ip, username) {
  await db.run('DELETE FROM pm_login_failures WHERE key IN (?, ?)', failureKeys(ip, username));
}

export async function purgeLoginFailures() {
  await db.run('DELETE FROM pm_login_failures WHERE first_at < ?', [new Date(Date.now() - WINDOW_MS).toISOString()]);
}
