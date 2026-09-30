/**
 * Full JSON backup of one account (settings, collections, binary media as base64) and restore.
 * Used by the admin API and by `npm run backup` / `npm run restore` (the CLI path has no
 * size limit, unlike serverless request/response bodies).
 *
 * Row ids are shared by all accounts, so a restore never reuses the ids from the file: rows are
 * inserted fresh and every media reference (media fields, `*_id` settings, custom content
 * images) is rewritten to the new media ids.
 */
import { db } from '../db/index.js';
import { mediaFieldNames, resources } from '../resources.js';
import { HttpError } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';
import { SETTINGS, bumpContentVersion } from './settings.js';

export const BACKUP_FORMAT = 'portfolio-admin-backup';

const strip = ({ id, user_id, ...rest }) => ({ id, ...rest });

/** Stream a backup as JSON through `write(chunk)`; media rows are fetched one at a time. */
export async function writeBackup(uid, write, { includeMessages = true, includeMedia = true } = {}) {
  write(`{"format":"${BACKUP_FORMAT}","version":2,"exported_at":${JSON.stringify(nowIso())},"settings":{`);
  const settings = await db.all('SELECT key, value FROM pm_account_settings WHERE user_id = ?', [uid]);
  write(settings.map((r) => `${JSON.stringify(r.key)}:${r.value}`).join(','));
  write('},"collections":{');
  let first = true;
  for (const [name, s] of Object.entries(resources)) {
    if (name === 'messages' && !includeMessages) continue;
    const rows = await db.all(`SELECT * FROM ${s.table} WHERE user_id = ? ORDER BY id`, [uid]);
    write(`${first ? '' : ','}${JSON.stringify(name)}:${JSON.stringify(rows.map(strip))}`);
    first = false;
  }
  write('},"media":[');
  if (includeMedia) {
    const ids = await db.all('SELECT id FROM pm_media WHERE user_id = ? ORDER BY id', [uid]);
    for (let i = 0; i < ids.length; i++) {
      const m = await db.one('SELECT * FROM pm_media WHERE id = ? AND user_id = ?', [ids[i].id, uid]);
      write(`${i ? ',' : ''}${JSON.stringify({ ...strip(m), data: db.toBuffer(m.data).toString('base64') })}`);
    }
  }
  write(']}');
}

/** Rewrite every `*_id` media reference inside a settings object. */
function remapSettings(node, mapId) {
  if (Array.isArray(node)) return node.map((n) => remapSettings(n, mapId));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k.endsWith('_id') && (Number.isInteger(v) || v === null) ? mapId(v) : remapSettings(v, mapId)]));
}

function parseJson(v) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** Custom content keeps image ids inside its JSON `value` (type image, or image fields of item lists). */
function remapCustomRow(row, mapId) {
  const value = parseJson(row.value);
  const schema = parseJson(row.schema) || [];
  if (row.type === 'image') return { ...row, value: JSON.stringify(mapId(value)) };
  if (row.type === 'items' && Array.isArray(value)) {
    const images = (Array.isArray(schema) ? schema : []).filter((f) => f.type === 'image').map((f) => f.name);
    const next = value.map((item) => {
      const copy = { ...item };
      for (const f of images) if (f in copy) copy[f] = mapId(copy[f]);
      return copy;
    });
    return { ...row, value: JSON.stringify(next) };
  }
  return row;
}

export async function restoreBackup(uid, backup) {
  if (backup?.format !== BACKUP_FORMAT) throw new HttpError(400, 'This is not a portfolio admin backup file.');
  const stats = { settings: 0, media: 0 };
  await db.tx(async (t) => {
    // Media first, so references can be pointed at the new ids.
    const idMap = new Map();
    const restoringMedia = Array.isArray(backup.media) && backup.media.length > 0;
    if (restoringMedia) {
      await t.run('DELETE FROM pm_media WHERE user_id = ?', [uid]);
      for (const m of backup.media) {
        const { rows } = await t.run(
          'INSERT INTO pm_media (user_id, filename, mime, size, width, height, sha256, alt, source, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
          [uid, m.filename, m.mime, m.size, m.width, m.height, m.sha256, m.alt, m.source || 'admin', Buffer.from(m.data, 'base64'), m.created_at || nowIso()]
        );
        idMap.set(Number(m.id), rows[0].id);
        stats.media++;
      }
    }
    // Without media in the file, references keep pointing at this account's existing media
    // (ids of other accounts never resolve: media lookups are scoped to the account).
    const mapId = (v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return restoringMedia ? idMap.get(n) ?? null : n;
    };

    for (const [key, value] of Object.entries(backup.settings || {})) {
      if (!SETTINGS[key]) continue;
      await t.run(
        `INSERT INTO pm_account_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [uid, key, JSON.stringify(remapSettings(value, mapId)), nowIso()]
      );
      stats.settings++;
    }
    for (const [name, rows] of Object.entries(backup.collections || {})) {
      const s = resources[name];
      if (!s || !Array.isArray(rows)) continue;
      await t.run(`DELETE FROM ${s.table} WHERE user_id = ?`, [uid]);
      const mediaCols = mediaFieldNames(s);
      const cols = [...Object.keys(s.fields), 'sort_order', 'created_at', 'updated_at'];
      for (const raw of rows) {
        let row = { ...raw };
        for (const c of mediaCols) row[c] = mapId(row[c]);
        if (name === 'custom_content') row = remapCustomRow(row, mapId);
        await t.run(
          `INSERT INTO ${s.table} (user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
          [uid, ...cols.map((c) => row[c] ?? (c.endsWith('_at') ? nowIso() : c === 'sort_order' ? 0 : null))]
        );
      }
      stats[name] = rows.length;
    }
  });
  await bumpContentVersion(uid);
  return stats;
}
