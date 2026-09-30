/**
 * Publishable API keys. A key identifies whose portfolio the public API serves; it is embedded
 * in the account's website (`<script data-key="pk_...">` or `?key=pk_...`), so it grants read
 * access to public content and the visitor forms only, never to the admin API. Keys are stored
 * as-is so the Integration page can always show the ready-to-paste snippet; accounts can create
 * several, rotate them or revoke them at any time.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { nowIso } from '../lib/time.js';
import { HttpError } from '../lib/validate.js';

export const KEY_PREFIX = 'pk_';
const TOKEN_RE = /^pk_[A-Za-z0-9_-]{20,64}$/;
const MAX_KEYS = 20;

const newToken = () => KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
const cleanName = (name) => String(name || '').replace(/\u0000/g, '').trim().slice(0, 60) || 'API key';

export async function listApiKeys(uid) {
  return db.all('SELECT id, name, token, created_at, last_used_at FROM pm_api_keys WHERE user_id = ? ORDER BY id', [uid]);
}

export async function createApiKey(uid, name, runner = db) {
  const { n } = await runner.one('SELECT COUNT(*) AS n FROM pm_api_keys WHERE user_id = ?', [uid]);
  if (Number(n) >= MAX_KEYS) throw new HttpError(400, `You can have at most ${MAX_KEYS} API keys.`);
  const { rows } = await runner.run(
    'INSERT INTO pm_api_keys (user_id, name, token, created_at) VALUES (?, ?, ?, ?) RETURNING id, name, token, created_at, last_used_at',
    [uid, cleanName(name), newToken(), nowIso()]
  );
  return rows[0];
}

export async function renameApiKey(uid, id, name) {
  const { changes } = await db.run('UPDATE pm_api_keys SET name = ? WHERE id = ? AND user_id = ?', [cleanName(name), Number(id), uid]);
  if (!changes) throw new HttpError(404, 'API key not found');
}

/** Replace a key's token (the old one stops working immediately). */
export async function rollApiKey(uid, id) {
  const { rows } = await db.run(
    'UPDATE pm_api_keys SET token = ?, last_used_at = NULL WHERE id = ? AND user_id = ? RETURNING id, name, token, created_at, last_used_at',
    [newToken(), Number(id), uid]
  );
  if (!rows.length) throw new HttpError(404, 'API key not found');
  return rows[0];
}

export async function deleteApiKey(uid, id) {
  const { changes } = await db.run('DELETE FROM pm_api_keys WHERE id = ? AND user_id = ?', [Number(id), uid]);
  if (!changes) throw new HttpError(404, 'API key not found');
}

/** Account served for a key, or null when the key is unknown. */
export async function resolveApiKey(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const row = await db.one(
    `SELECT k.id AS key_id, k.last_used_at, u.id, u.username, u.disabled
     FROM pm_api_keys k JOIN pm_users u ON u.id = k.user_id WHERE k.token = ?`,
    [token]
  );
  if (!row) return null;
  // Record usage at most every 10 minutes (keeps the bundle endpoint read-only most of the time).
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 10 * 60_000) {
    await db.run('UPDATE pm_api_keys SET last_used_at = ? WHERE id = ?', [nowIso(), row.key_id]).catch(() => {});
  }
  return { id: row.id, username: row.username, disabled: Boolean(row.disabled) };
}
