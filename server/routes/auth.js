import express from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { ah, clientIp } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';
import { HttpError } from '../lib/validate.js';
import {
  SESSION_COOKIE, assertNotLocked, clearFailures, createSession, createUser, deleteAccount, destroySession,
  hashPassword, normalizeAccountEmail, recordFailure, resolveSession, userCount, validatePassword, verifyPassword,
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
 * Account API guard: requires a session, and for state-changing requests the custom
 * X-Requested-With header (cannot be sent cross-site without a CORS preflight, which is never granted).
 * Everything behind it works on the signed-in account's own data (req.user.id).
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'portfolio-admin') {
    return next(new HttpError(403, 'Missing request header'));
  }
  next();
}

/** Platform admins manage every account (see routes/platform.js). */
export function requirePlatformAdmin(req, res, next) {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.is_admin) return next(new HttpError(403, 'Only platform admins can do that.'));
    next();
  });
}

function publicUser(u) {
  return u && {
    id: u.id, username: u.username, display_name: u.display_name, email: u.email || '',
    is_admin: Boolean(u.is_admin), created_at: u.created_at, last_login_at: u.last_login_at,
  };
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
    signup_enabled: count === 0 || config.signupEnabled,
    setup_requires_token: count === 0 && (config.isProd || Boolean(config.setupToken)),
  });
}));

// Create an account. The very first account (the platform admin) needs SETUP_TOKEN in production;
// after that anyone can sign up unless SIGNUP_ENABLED=false.
router.post(['/signup', '/setup'], rateLimit({ windowMs: 60 * 60_000, max: 10, message: 'Too many sign-ups from this network. Try again later.' }), ah(async (req, res) => {
  assertCsrfHeader(req);
  const first = (await userCount()) === 0;
  if (first) {
    if (config.isProd || config.setupToken) {
      if (!config.setupToken) throw new HttpError(403, 'Set SETUP_TOKEN (or ADMIN_USERNAME/ADMIN_PASSWORD) on the server to create the first account.');
      if (req.body?.setup_token !== config.setupToken) throw new HttpError(403, 'Invalid setup token.');
    }
  } else if (!config.signupEnabled) {
    throw new HttpError(403, 'Sign-ups are closed on this server.');
  }
  const { username, password, display_name, email } = req.body || {};
  const name = String(username || '').trim();
  const id = await createUser(name, password, String(display_name || '').trim().slice(0, 100), { email });
  const session = await createSession(id, { ip: clientIp(req), userAgent: req.get('user-agent') });
  res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expires));
  await logActivity({ id, username: name }, 'signup', 'user', id, first ? 'Created the first (platform admin) account' : 'Created the account');
  res.status(201).json({ status: 'success' });
}));

router.post('/login', ah(async (req, res) => {
  assertCsrfHeader(req);
  const login = String(req.body?.username || req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const ip = clientIp(req);
  if (!login || !password) throw new HttpError(400, 'Username (or email) and password are required.');
  await assertNotLocked(ip, login);

  const user = await db.one(
    'SELECT id, username, password_hash, disabled FROM pm_users WHERE LOWER(username) = LOWER(?) OR email = LOWER(?) ORDER BY id LIMIT 1',
    [login, login]
  );
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, await hashPassword('timing-dummy'));
  if (!user || !ok) {
    await recordFailure(ip, login);
    throw new HttpError(401, 'Invalid username or password.');
  }
  if (user.disabled) throw new HttpError(403, 'This account has been disabled. Contact the site administrator.');
  await clearFailures(ip, login);
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

async function assertPassword(user, password) {
  const row = await db.one('SELECT password_hash FROM pm_users WHERE id = ?', [user.id]);
  if (!(await verifyPassword(String(password || ''), row.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
}

router.post('/password', requireAdmin, ah(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  await assertPassword(req.user, current_password);
  validatePassword(new_password);
  await db.run('UPDATE pm_users SET password_hash = ? WHERE id = ?', [await hashPassword(new_password), req.user.id]);
  await db.run('DELETE FROM pm_sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.user.session_id]);
  await logActivity(req.user, 'password', 'user', req.user.id, 'Changed password (other sessions signed out)');
  res.json({ status: 'success' });
}));

router.put('/profile', requireAdmin, ah(async (req, res) => {
  const displayName = String(req.body?.display_name ?? req.user.display_name ?? '').trim().slice(0, 100);
  const email = req.body?.email === undefined ? req.user.email : normalizeAccountEmail(req.body.email);
  if (email && (await db.one('SELECT id FROM pm_users WHERE email = ? AND id <> ?', [email, req.user.id]))) {
    throw new HttpError(409, 'Another account already uses that email.');
  }
  await db.run('UPDATE pm_users SET display_name = ?, email = ? WHERE id = ?', [displayName || req.user.username, email || null, req.user.id]);
  res.json({ status: 'success' });
}));

// Permanently delete the signed-in account with all its content, media, analytics and API keys.
router.post('/delete-account', requireAdmin, ah(async (req, res) => {
  await assertPassword(req.user, req.body?.password);
  if (req.user.is_admin) {
    const admins = Number((await db.one('SELECT COUNT(*) AS n FROM pm_users WHERE is_admin = 1 AND disabled = 0')).n);
    const others = Number((await db.one('SELECT COUNT(*) AS n FROM pm_users WHERE id <> ?', [req.user.id])).n);
    if (admins <= 1 && others > 0) throw new HttpError(409, 'You are the only platform admin. Make another account an admin first.');
  }
  await deleteAccount(req.user.id);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ status: 'success' });
}));

export default router;
