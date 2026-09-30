/**
 * Full JSON backup (settings, collections, binary media as base64) and restore.
 * Used by the admin API and by `npm run backup` / `npm run restore` (the CLI path has no
 * size limit, unlike serverless request/response bodies).
 */
import { db } from '../db/index.js';
import { resources } from '../resources.js';
import { HttpError } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';
import { SETTINGS, bumpContentVersion } from './settings.js';

export const BACKUP_FORMAT = 'portfolio-admin-backup';

/** Stream a backup as JSON through `write(chunk)`; media rows are fetched one at a time. */
export async function writeBackup(write, { includeMessages = true, includeMedia = true } = {}) {
  write(`{"format":"${BACKUP_FORMAT}","version":1,"exported_at":${JSON.stringify(nowIso())},"settings":{`);
  const settings = await db.all('SELECT key, value FROM pm_settings');
  write(settings.map((r) => `${JSON.stringify(r.key)}:${r.value}`).join(','));
  write('},"collections":{');
  let first = true;
  for (const [name, s] of Object.entries(resources)) {
    if (name === 'messages' && !includeMessages) continue;
    const rows = await db.all(`SELECT * FROM ${s.table} ORDER BY id`);
    write(`${first ? '' : ','}${JSON.stringify(name)}:${JSON.stringify(rows)}`);
    first = false;
  }
  write('},"media":[');
  if (includeMedia) {
    const ids = await db.all('SELECT id FROM pm_media ORDER BY id');
    for (let i = 0; i < ids.length; i++) {
      const m = await db.one('SELECT * FROM pm_media WHERE id = ?', [ids[i].id]);
      write(`${i ? ',' : ''}${JSON.stringify({ ...m, data: db.toBuffer(m.data).toString('base64') })}`);
    }
  }
  write(']}');
}

export async function restoreBackup(backup) {
  if (backup?.format !== BACKUP_FORMAT) throw new HttpError(400, 'This is not a portfolio admin backup file.');
  const stats = { settings: 0, media: 0 };
  await db.tx(async (t) => {
    if (Array.isArray(backup.media) && backup.media.length) {
      await t.run('DELETE FROM pm_media');
      for (const m of backup.media) {
        await t.run(
          'INSERT INTO pm_media (id, filename, mime, size, width, height, sha256, alt, source, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [m.id, m.filename, m.mime, m.size, m.width, m.height, m.sha256, m.alt, m.source || 'admin', Buffer.from(m.data, 'base64'), m.created_at]
        );
        stats.media++;
      }
    }
    for (const [key, value] of Object.entries(backup.settings || {})) {
      if (!SETTINGS[key]) continue;
      await t.run(
        'INSERT INTO pm_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [key, JSON.stringify(value), nowIso()]
      );
      stats.settings++;
    }
    for (const [name, rows] of Object.entries(backup.collections || {})) {
      const s = resources[name];
      if (!s || !Array.isArray(rows)) continue;
      await t.run(`DELETE FROM ${s.table}`);
      const cols = ['id', ...Object.keys(s.fields), 'sort_order', 'created_at', 'updated_at'];
      for (const row of rows) {
        await t.run(
          `INSERT INTO ${s.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] ?? (c.endsWith('_at') ? nowIso() : c === 'sort_order' ? 0 : null))
        );
      }
      stats[name] = rows.length;
    }
  });
  // Keep Postgres sequences ahead of the restored ids.
  if (db.dialect === 'pg') {
    for (const table of ['pm_media', ...Object.values(resources).map((s) => s.table)]) {
      await db.exec(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
    }
  }
  await bumpContentVersion();
  return stats;
}
