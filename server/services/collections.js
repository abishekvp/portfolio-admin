import { db } from '../db/index.js';
import { mediaFieldNames } from '../resources.js';
import { HttpError, rowToJson, toDbValue, validateInput } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';
import { getMediaMeta, mediaPath } from './media.js';
import { bumpContentVersion } from './settings.js';
import { hooks } from './hooks.js';

/**
 * Attach `<field>_url` (relative) for each media field, or `<field>_src` when the spec
 * already has a real `<field>_url` column (e.g. a testimonial's external photo_url).
 */
export async function withMediaUrls(spec, items, baseUrl = '') {
  const fields = mediaFieldNames(spec);
  if (!fields.length || !items.length) return items;
  const meta = await getMediaMeta(items.flatMap((it) => fields.map((fname) => it[fname])));
  for (const it of items) {
    for (const fname of fields) {
      const m = meta.get(it[fname]);
      const urlKey = fname.replace(/_id$/, '_url');
      it[spec.fields[urlKey] ? fname.replace(/_id$/, '_src') : urlKey] = m ? baseUrl + mediaPath(m) : '';
      it[fname.replace(/_id$/, '_mime')] = m ? m.mime : '';
    }
  }
  return items;
}

export async function listItems(spec, query = {}) {
  const where = [];
  const params = [];

  for (const key of spec.filters || []) {
    if (query[key] === undefined || query[key] === '') continue;
    const def = spec.fields[key];
    where.push(`${key} = ?`);
    params.push(def?.type === 'bool' ? (['1', 'true', true].includes(query[key]) ? 1 : 0) : String(query[key]));
  }
  if (query.q && spec.search?.length) {
    const term = `%${String(query.q).toLowerCase().slice(0, 100)}%`;
    where.push(`(${spec.search.map((c) => `LOWER(COALESCE(${c}, '')) LIKE ?`).join(' OR ')})`);
    params.push(...spec.search.map(() => term));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let limitSql = '';
  let page = 1;
  let limit = null;
  if (spec.paginate) {
    limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 50));
    page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    limitSql = ` LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  }

  const rows = await db.all(`SELECT * FROM ${spec.table} ${whereSql} ORDER BY ${spec.orderBy}${limitSql}`, params);
  const items = await withMediaUrls(spec, rows.map((r) => rowToJson(spec, r)));
  if (!spec.paginate) return { items, total: items.length };
  const { total } = await db.one(`SELECT COUNT(*) AS total FROM ${spec.table} ${whereSql}`, params);
  return { items, total: Number(total), page, limit };
}

export async function getItem(spec, id) {
  const row = await db.one(`SELECT * FROM ${spec.table} WHERE id = ?`, [Number(id)]);
  if (!row) throw new HttpError(404, `${spec.label} item not found`);
  const [item] = await withMediaUrls(spec, [rowToJson(spec, row)]);
  return item;
}

export async function createItem(spec, input, { allowReadonly = false, runner = db } = {}) {
  let values = validateInput(spec, input, { allowReadonly });
  if (hooks[spec.table]) values = await hooks[spec.table](values, null, new Set(Object.keys(input || {})));
  const cols = Object.keys(values);
  const now = nowIso();
  const { max } = (await runner.one(`SELECT MAX(sort_order) AS max FROM ${spec.table}`)) || {};
  const sortOrder = Number.isFinite(Number(input?.sort_order)) ? Number(input.sort_order) : (Number(max) || 0) + 1;
  const params = [...cols.map((c) => toDbValue(spec.fields[c], values[c])), sortOrder, now, now];
  const { rows } = await runner.run(
    `INSERT INTO ${spec.table} (${cols.join(', ')}, sort_order, created_at, updated_at)
     VALUES (${params.map(() => '?').join(', ')}) RETURNING id`,
    params
  );
  if (spec.affectsPublic !== false) await bumpContentVersion();
  return runner === db ? getItem(spec, rows[0].id) : { id: rows[0].id };
}

export async function updateItem(spec, id, input) {
  let values = validateInput(spec, input, { partial: true });
  if (hooks[spec.table]) {
    const current = await getItem(spec, id);
    const merged = Object.fromEntries(Object.keys(spec.fields).filter((k) => !spec.fields[k].readonly).map((k) => [k, current[k]]));
    values = await hooks[spec.table]({ ...merged, ...values }, current, new Set(Object.keys(input || {})));
  }
  const cols = Object.keys(values);
  if (!cols.length) return getItem(spec, id);
  const params = [...cols.map((c) => toDbValue(spec.fields[c], values[c])), nowIso(), Number(id)];
  const { changes } = await db.run(`UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, params);
  if (!changes) throw new HttpError(404, `${spec.label} item not found`);
  if (spec.affectsPublic !== false) await bumpContentVersion();
  return getItem(spec, id);
}

export async function deleteItems(spec, ids) {
  const list = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) return 0;
  const { changes } = await db.run(`DELETE FROM ${spec.table} WHERE id IN (${list.map(() => '?').join(',')})`, list);
  if (spec.affectsPublic !== false) await bumpContentVersion();
  return changes;
}

export async function bulkUpdate(spec, ids, patch) {
  const values = validateInput(spec, patch, { partial: true });
  const cols = Object.keys(values);
  const list = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!cols.length || !list.length) return 0;
  const { changes } = await db.run(
    `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id IN (${list.map(() => '?').join(',')})`,
    [...cols.map((c) => toDbValue(spec.fields[c], values[c])), nowIso(), ...list]
  );
  if (spec.affectsPublic !== false) await bumpContentVersion();
  return changes;
}

export async function reorderItems(spec, ids) {
  const list = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  await db.tx(async (t) => {
    for (let i = 0; i < list.length; i++) {
      await t.run(`UPDATE ${spec.table} SET sort_order = ? WHERE id = ?`, [i + 1, list[i]]);
    }
  });
  if (spec.affectsPublic !== false) await bumpContentVersion();
}

export async function logActivity(user, action, entity, entityId, summary) {
  try {
    await db.run(
      'INSERT INTO pm_activity (user_id, username, action, entity, entity_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user?.id ?? null, user?.username ?? 'system', action, entity ?? null, entityId == null ? null : String(entityId), String(summary ?? '').slice(0, 300), nowIso()]
    );
  } catch (err) {
    console.error('[activity] failed to log', err.message);
  }
}
