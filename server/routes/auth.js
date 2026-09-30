import express from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { ah, clientIp } from '../lib/http.js';
import { HttpError } from '../lib/validate.js';
import {
  SESSION_COOKIE, assertNotLocked, clearFailures, createSession, createUser, destroySession,
  hashPassword, recordFailure, resolveSession, userCount, validatePassword, verifyPassword,
} from '../services/auth.js';
import { logActivity } from '../services/collections.js';

const router = express.Router();
router.use(express.json({ limit: '16kb' }));

const cookieOptions = (expires) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  expires,
});

/** Populate req.user from the session cookie. */
export async function loadUser(req, res, next) {
  try {
    req.user = await resolveSession(req.cookies?.[SESSION_COOKIE]);
  } catch (err) {
    return next(err);
  }
  next();
}

/**
 * Admin API guard: requires a session, and for state-changing requests the custom
 * X-Requested-With header (cannot be sent cross-site without a CORS preflight, which is never granted).
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'portfolio-admin') {
    return next(new HttpError(403, 'Missing request header'));
  }
  next();
}

function publicUser(u) {
  return u && { id: u.id, username: u.username, display_name: u.display_name, created_at: u.created_at, last_login_at: u.last_login_at };
}

function assertCsrfHeader(req) {
  if (req.get('x-requested-with') !== 'portfolio-admin') throw new HttpError(403, 'Missing request header');
}

router.get('/status', ah(async (req, res) => {
  const count = await userCount();
  res.set('Cache-Control', 'no-store').json({
    authenticated: Boolean(req.user),
    user: publicUser(req.user),
    needs_setup: count === 0,
    setup_requires_token: config.isProd || Boolean(config.setupToken),
  });
}));

router.post('/setup', ah(async (req, res) => {
  assertCsrfHeader(req);
  if ((await userCount()) > 0) throw new HttpError(409, 'Setup has already been completed.');
  if (config.isProd || config.setupToken) {
    if (!config.setupToken) throw new HttpError(403, 'Set SETUP_TOKEN (or ADMIN_USERNAME/ADMIN_PASSWORD) on the server to create the first admin.');
    if (req.body?.setup_token !== config.setupToken) throw new HttpError(403, 'Invalid setup token.');
  }
  const { username, password, display_name } = req.body || {};
  const id = await createUser(String(username || '').trim(), password, String(display_name || '').trim().slice(0, 100));
  const session = await createSession(id, { ip: clientIp(req), userAgent: req.get('user-agent') });
  res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expires));
  await logActivity({ id, username }, 'setup', 'user', id, 'Created the first admin account');
  res.status(201).json({ status: 'success' });
}));

router.post('/login', ah(async (req, res) => {
  assertCsrfHeader(req);
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const ip = clientIp(req);
  if (!username || !password) throw new HttpError(400, 'Username and password are required.');
  assertNotLocked(ip, username);

  const user = await db.one('SELECT id, username, password_hash FROM pm_users WHERE LOWER(username) = LOWER(?)', [username]);
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, await hashPassword('timing-dummy'));
  if (!user || !ok) {
    recordFailure(ip, username);
    throw new HttpError(401, 'Invalid username or password.');
  }
  clearFailures(ip, username);
  const session = await createSession(user.id, { ip, userAgent: req.get('user-agent') });
  res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expires));
  await logActivity(user, 'login', 'user', user.id, `Signed in from ${ip}`);
  res.json({ status: 'success' });
}));

router.post('/logout', ah(async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ status: 'success' });
}));

// ---- account management (signed in) ----

router.get('/sessions', requireAdmin, ah(async (req, res) => {
  const rows = await db.all('SELECT id, ip, user_agent, created_at, last_seen_at, expires_at FROM pm_sessions WHERE user_id = ? ORDER BY last_seen_at DESC', [req.user.id]);
  res.json({ items: rows.map((r) => ({ ...r, current: r.id === req.user.session_id })) });
}));

router.delete('/sessions/:id', requireAdmin, ah(async (req, res) => {
  await db.run('DELETE FROM pm_sessions WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ status: 'success' });
}));

router.post('/sessions/revoke-others', requireAdmin, ah(async (req, res) => {
  const { changes } = await db.run('DELETE FROM pm_sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.user.session_id]);
  res.json({ status: 'success', revoked: changes });
}));

router.post('/password', requireAdmin, ah(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const row = await db.one('SELECT password_hash FROM pm_users WHERE id = ?', [req.user.id]);
  if (!(await verifyPassword(String(current_password || ''), row.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
  validatePassword(new_password);
  await db.run('UPDATE pm_users SET password_hash = ? WHERE id = ?', [await hashPassword(new_password), req.user.id]);
  await db.run('DELETE FROM pm_sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.user.session_id]);
  await logActivity(req.user, 'password', 'user', req.user.id, 'Changed password (other sessions signed out)');
  res.json({ status: 'success' });
}));

router.put('/profile', requireAdmin, ah(async (req, res) => {
  const displayName = String(req.body?.display_name || '').trim().slice(0, 100);
  await db.run('UPDATE pm_users SET display_name = ? WHERE id = ?', [displayName || req.user.username, req.user.id]);
  res.json({ status: 'success' });
}));

export default router;
