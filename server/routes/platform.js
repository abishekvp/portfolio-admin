/**
 * Platform administration: the accounts on this server. Only for platform admins (the first
 * account, and anyone they promote). Account content itself stays private to each account.
 */
import express from 'express';
import { db } from '../db/index.js';
import { ah } from '../lib/http.js';
import { HttpError } from '../lib/validate.js';
import { requirePlatformAdmin } from './auth.js';
import { deleteAccount } from '../services/auth.js';
import { logActivity } from '../services/collections.js';

const router = express.Router();
router.use(requirePlatformAdmin);
router.use(express.json({ limit: '16kb' }));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/accounts', ah(async (req, res) => {
  const rows = await db.all(
    `SELECT u.id, u.username, u.display_name, u.email, u.is_admin, u.disabled, u.created_at, u.last_login_at,
       (SELECT COALESCE(SUM(m.size), 0) FROM pm_media m WHERE m.user_id = u.id) AS storage_bytes,
       (SELECT COUNT(*) FROM pm_projects p WHERE p.user_id = u.id) AS projects,
       (SELECT COUNT(*) FROM pm_api_keys k WHERE k.user_id = u.id) AS api_keys,
       (SELECT MAX(k.last_used_at) FROM pm_api_keys k WHERE k.user_id = u.id) AS api_last_used_at
     FROM pm_users u ORDER BY u.id`
  );
  res.json({
    items: rows.map((r) => ({
      ...r,
      is_admin: Boolean(r.is_admin),
      disabled: Boolean(r.disabled),
      storage_bytes: Number(r.storage_bytes),
      projects: Number(r.projects),
      api_keys: Number(r.api_keys),
      current: r.id === req.user.id,
    })),
  });
}));

async function account(id) {
  const row = await db.one('SELECT id, username, is_admin, disabled FROM pm_users WHERE id = ?', [Number(id)]);
  if (!row) throw new HttpError(404, 'Account not found');
  return row;
}

router.patch('/accounts/:id', ah(async (req, res) => {
  const target = await account(req.params.id);
  if (target.id === req.user.id) throw new HttpError(400, 'Use another admin account to change your own access.');
  const changes = [];
  if (typeof req.body?.disabled === 'boolean') {
    await db.run('UPDATE pm_users SET disabled = ? WHERE id = ?', [req.body.disabled ? 1 : 0, target.id]);
    // Disabled accounts are signed out everywhere; their public API stops answering.
    if (req.body.disabled) await db.run('DELETE FROM pm_sessions WHERE user_id = ?', [target.id]);
    changes.push(req.body.disabled ? 'disabled' : 'enabled');
  }
  if (typeof req.body?.is_admin === 'boolean') {
    await db.run('UPDATE pm_users SET is_admin = ? WHERE id = ?', [req.body.is_admin ? 1 : 0, target.id]);
    changes.push(req.body.is_admin ? 'made platform admin' : 'removed platform admin');
  }
  await logActivity(req.user, 'update', 'account', target.id, `${target.username}: ${changes.join(', ') || 'no changes'}`);
  res.json({ status: 'success' });
}));

router.delete('/accounts/:id', ah(async (req, res) => {
  const target = await account(req.params.id);
  if (target.id === req.user.id) throw new HttpError(400, 'Delete your own account from Account settings.');
  await deleteAccount(target.id);
  await logActivity(req.user, 'delete', 'account', target.id, `Deleted account ${target.username}`);
  res.json({ status: 'success' });
}));

export default router;
