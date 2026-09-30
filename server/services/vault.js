/**
 * Private vault. Secrets (username, password, notes, custom fields) and attachments are
 * encrypted at rest with AES-256-GCM using a key derived from VAULT_KEY.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';

export const VAULT_CATEGORIES = ['Credential', 'API Key', 'Server & DB', 'Document', 'Personal Note', 'Other'];

const key = config.vaultKey ? crypto.createHash('sha256').update(`portfolio-vault:${config.vaultKey}`).digest() : null;

export const vaultEnabled = () => Boolean(key);

function requireKey() {
  if (!key) throw new HttpError(503, 'The vault is locked. Set VAULT_KEY in the server environment to enable it.');
}

export function encrypt(buf) {
  requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), enc]);
}

export function decrypt(buf) {
  requireKey();
  if (!buf || buf[0] !== 1) throw new HttpError(500, 'Unsupported vault payload');
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]);
  } catch {
    throw new HttpError(500, 'Unable to decrypt this entry. Was VAULT_KEY changed?');
  }
}

const str = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);

function sanitizeSecret(input = {}) {
  const fields = Array.isArray(input.fields) ? input.fields.slice(0, 50) : [];
  return {
    username: str(input.username, 500),
    password: str(input.password, 2000),
    notes: str(input.notes, 20000),
    fields: fields.map((f) => ({ key: str(f?.key, 200), value: str(f?.value, 5000) })).filter((f) => f.key || f.value),
  };
}

function toMeta(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    url: row.url,
    has_attachment: Boolean(row.attachment_name),
    attachment_name: row.attachment_name,
    attachment_mime: row.attachment_mime,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const META_COLS = 'id, title, category, url, attachment_name, attachment_mime, created_at, updated_at';

export async function listVault(q) {
  const rows = await db.all(`SELECT ${META_COLS} FROM pm_vault ORDER BY updated_at DESC`);
  const term = String(q || '').toLowerCase();
  return rows.map(toMeta).filter((r) => !term || `${r.title} ${r.category} ${r.url}`.toLowerCase().includes(term));
}

export async function getVaultItem(id) {
  const row = await db.one(`SELECT ${META_COLS}, secret FROM pm_vault WHERE id = ?`, [Number(id)]);
  if (!row) throw new HttpError(404, 'Vault item not found');
  const secret = JSON.parse(decrypt(Buffer.from(row.secret, 'base64')).toString('utf8'));
  return { ...toMeta(row), ...secret };
}

function validateMeta(input) {
  const title = str(input.title, 255).trim();
  if (!title) throw new HttpError(400, 'Please fix the highlighted fields.', { title: 'This field is required' });
  const category = VAULT_CATEGORIES.includes(input.category) ? input.category : 'Other';
  return { title, category, url: str(input.url, 1000).trim() };
}

export async function saveVaultItem(id, input, attachment) {
  requireKey();
  const meta = validateMeta(input);
  const secret = encrypt(Buffer.from(JSON.stringify(sanitizeSecret(input)))).toString('base64');
  const now = nowIso();
  let itemId = id;
  if (id) {
    const { changes } = await db.run('UPDATE pm_vault SET title = ?, category = ?, url = ?, secret = ?, updated_at = ? WHERE id = ?', [meta.title, meta.category, meta.url, secret, now, Number(id)]);
    if (!changes) throw new HttpError(404, 'Vault item not found');
  } else {
    const { rows } = await db.run('INSERT INTO pm_vault (title, category, url, secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [meta.title, meta.category, meta.url, secret, now, now]);
    itemId = rows[0].id;
  }
  if (attachment) {
    await db.run('UPDATE pm_vault SET attachment = ?, attachment_name = ?, attachment_mime = ? WHERE id = ?', [
      encrypt(attachment.buffer),
      str(attachment.originalname, 200).replace(/[^\w.\- ]+/g, '') || 'attachment',
      str(attachment.mimetype, 100) || 'application/octet-stream',
      itemId,
    ]);
  } else if (input.remove_attachment === true || input.remove_attachment === 'true') {
    await db.run('UPDATE pm_vault SET attachment = NULL, attachment_name = NULL, attachment_mime = NULL WHERE id = ?', [itemId]);
  }
  return getVaultItem(itemId);
}

export async function getVaultAttachment(id) {
  const row = await db.one('SELECT attachment, attachment_name, attachment_mime FROM pm_vault WHERE id = ?', [Number(id)]);
  if (!row?.attachment) throw new HttpError(404, 'No attachment');
  return { name: row.attachment_name, mime: row.attachment_mime, data: decrypt(db.toBuffer(row.attachment)) };
}

export async function deleteVaultItem(id) {
  const { changes } = await db.run('DELETE FROM pm_vault WHERE id = ?', [Number(id)]);
  if (!changes) throw new HttpError(404, 'Vault item not found');
}
