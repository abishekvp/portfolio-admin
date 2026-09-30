import express from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { customMediaIds } from '../services/hooks.js';
import { restoreBackup, writeBackup } from '../services/backup.js';
import { CUSTOM_PRESETS, applyCustomPreset } from '../seed/custom-presets.js';
import { getResource, mediaFieldNames, resources } from '../resources.js';
import { ah, baseUrl } from '../lib/http.js';
import { HttpError, rowToJson } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';
import { requireAdmin } from './auth.js';
import {
  bulkUpdate, createItem, deleteItems, getItem, listItems, logActivity, reorderItems, updateItem,
} from '../services/collections.js';
import { SETTINGS, bumpContentVersion, getAllSettings, getSetting, setSetting, settingsMediaRefs } from '../services/settings.js';
import { decodeDataUri, mediaPath, storeMedia } from '../services/media.js';
import { purgeAnalytics, summary } from '../services/analytics.js';
import { clearEntries, listToday } from '../services/limits.js';

const router = express.Router();
router.use(requireAdmin);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const json = express.json({ limit: config.isServerless ? '4.4mb' : '25mb' });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

// ------------------------------------------------------------------ overview

router.get('/overview', ah(async (req, res) => {
  const n = async (sql, params) => Number((await db.one(sql, params))?.n || 0);
  const counts = {};
  for (const [name, spec] of Object.entries(resources)) counts[name] = await n(`SELECT COUNT(*) AS n FROM ${spec.table}`);
  const [unread, pending, media, limitsToday] = await Promise.all([
    n('SELECT COUNT(*) AS n FROM pm_messages WHERE is_read = 0 AND is_archived = 0'),
    n("SELECT COUNT(*) AS n FROM pm_testimonials WHERE status = 'pending'"),
    n('SELECT COUNT(*) AS n FROM pm_media'),
    n('SELECT COUNT(*) AS n FROM pm_submission_limits WHERE blocked > 0'),
  ]);
  const recentMessages = await db.all('SELECT id, name, email, subject, is_read, created_at FROM pm_messages WHERE is_archived = 0 ORDER BY created_at DESC LIMIT 5');
  const pendingTestimonials = await db.all("SELECT id, name, role, company, content, created_at FROM pm_testimonials WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5");
  const profile = await getSetting('profile');
  res.json({
    counts: { ...counts, unread_messages: unread, pending_testimonials: pending, media, blocked_today: limitsToday },
    recent_messages: recentMessages.map((m) => ({ ...m, is_read: Boolean(m.is_read) })),
    pending_testimonials: pendingTestimonials,
    analytics: await summary(Number(req.query.days) || 14),
    checklist: {
      profile: Boolean(profile.full_name && profile.email),
      photo: Boolean(profile.photo_id),
      summary: Boolean(profile.summary),
      contacts: counts.contacts > 0,
      resume: Boolean(profile.resume_id || profile.resume_url),
      projects: counts.projects > 0,
      experience: counts.experience > 0,
      skills: counts.skills > 0,
    },
  });
}));

router.get('/badges', ah(async (req, res) => {
  const unread = await db.one('SELECT COUNT(*) AS n FROM pm_messages WHERE is_read = 0 AND is_archived = 0');
  const pending = await db.one("SELECT COUNT(*) AS n FROM pm_testimonials WHERE status = 'pending'");
  res.json({ messages: Number(unread.n), testimonials: Number(pending.n) });
}));

router.get('/analytics', ah(async (req, res) => {
  res.json(await summary(Number(req.query.days) || 30));
}));

router.post('/analytics/purge', json, ah(async (req, res) => {
  const days = Math.max(1, Number.parseInt(req.body?.older_than_days, 10) || 365);
  const result = await purgeAnalytics(days);
  await logActivity(req.user, 'purge', 'analytics', null, `Removed analytics older than ${days} days`);
  res.json({ status: 'success', ...result });
}));

// ------------------------------------------------------------------ collections

function spec(req) {
  const s = getResource(req.params.resource);
  if (!s) throw new HttpError(404, 'Unknown collection');
  return s;
}

const itemLabel = (item) => item?.title || item?.name || item?.job_title || item?.institution || `#${item?.id}`;

router.get('/c/:resource', ah(async (req, res) => {
  res.json(await listItems(spec(req), req.query));
}));

router.get('/c/:resource/:id', ah(async (req, res) => {
  const s = spec(req);
  const item = await getItem(s, req.params.id);
  // Opening a message marks it as read.
  if (s === resources.messages && !item.is_read && req.query.mark_read !== '0') {
    await updateItem(s, item.id, { is_read: true });
    item.is_read = true;
  }
  res.json(item);
}));

router.post('/c/:resource', json, ah(async (req, res) => {
  const s = spec(req);
  if (s.creatable === false) throw new HttpError(405, `${s.label} cannot be created from the admin`);
  const item = await createItem(s, req.body);
  await logActivity(req.user, 'create', req.params.resource, item.id, itemLabel(item));
  res.status(201).json(item);
}));

router.patch('/c/:resource/:id', json, ah(async (req, res) => {
  const item = await updateItem(spec(req), req.params.id, req.body);
  await logActivity(req.user, 'update', req.params.resource, item.id, itemLabel(item));
  res.json(item);
}));
router.put('/c/:resource/:id', json, ah(async (req, res) => {
  const item = await updateItem(spec(req), req.params.id, req.body);
  await logActivity(req.user, 'update', req.params.resource, item.id, itemLabel(item));
  res.json(item);
}));

router.delete('/c/:resource/:id', ah(async (req, res) => {
  const s = spec(req);
  const item = await getItem(s, req.params.id);
  await deleteItems(s, [item.id]);
  // Photos uploaded by website visitors belong to their testimonial.
  if (s === resources.testimonials && item.source === 'website' && item.photo_id) await deleteMediaIfUnused(item.photo_id);
  await logActivity(req.user, 'delete', req.params.resource, item.id, itemLabel(item));
  res.json({ status: 'success' });
}));

router.post('/c/:resource/reorder', json, ah(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  await reorderItems(spec(req), ids);
  await logActivity(req.user, 'reorder', req.params.resource, null, `Reordered ${ids.length} items`);
  res.json({ status: 'success' });
}));

router.post('/c/:resource/bulk', json, ah(async (req, res) => {
  const s = spec(req);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
  const action = req.body?.action;
  let affected = 0;
  if (action === 'delete') affected = await deleteItems(s, ids);
  else if (action === 'update') affected = await bulkUpdate(s, ids, req.body?.patch || {});
  else throw new HttpError(400, 'Unknown bulk action');
  await logActivity(req.user, `bulk_${action}`, req.params.resource, null, `${affected} item(s)`);
  res.json({ status: 'success', affected });
}));

router.post('/c/:resource/:id/duplicate', ah(async (req, res) => {
  const s = spec(req);
  if (s.creatable === false) throw new HttpError(405, 'Not supported');
  const { id, created_at, updated_at, sort_order, ...rest } = await getItem(s, req.params.id);
  const titleField = ['title', 'name', 'job_title', 'institution'].find((k) => s.fields[k]);
  if (titleField) rest[titleField] = `${rest[titleField]} (copy)`.slice(0, s.fields[titleField].max);
  if ('visible' in s.fields) rest.visible = false;
  const item = await createItem(s, rest);
  await logActivity(req.user, 'duplicate', req.params.resource, item.id, itemLabel(item));
  res.status(201).json(item);
}));

// ------------------------------------------------------------------ settings

router.get('/settings', ah(async (req, res) => {
  res.json(await getAllSettings());
}));

router.get('/settings/:key', ah(async (req, res) => {
  res.json(await getSetting(req.params.key));
}));

router.put('/settings/:key', json, ah(async (req, res) => {
  const value = await setSetting(req.params.key, req.body, { partial: false });
  await logActivity(req.user, 'update', 'settings', req.params.key, SETTINGS[req.params.key]?.label);
  res.json(value);
}));

// ------------------------------------------------------------------ media

async function mediaUsage() {
  const usage = new Map();
  const add = (id, where) => {
    if (!id) return;
    if (!usage.has(id)) usage.set(id, []);
    usage.get(id).push(where);
  };
  for (const [name, s] of Object.entries(resources)) {
    const fields = mediaFieldNames(s);
    if (!fields.length) continue;
    const rows = await db.all(`SELECT id, ${fields.join(', ')} FROM ${s.table}`);
    for (const r of rows) for (const fld of fields) add(Number(r[fld]), `${s.label} #${r.id}`);
  }
  for (const ref of await settingsMediaRefs()) add(ref.id, `Settings: ${ref.where}`);
  for (const r of await db.all('SELECT id, group_key, key, type, value, schema FROM pm_custom_content')) {
    const row = rowToJson(resources.custom_content, r);
    for (const id of customMediaIds(row)) add(id, `Custom content ${row.group_key}.${row.key}`);
  }
  return usage;
}

async function deleteMediaIfUnused(id) {
  const usage = await mediaUsage();
  if (!usage.has(Number(id))) await db.run('DELETE FROM pm_media WHERE id = ?', [Number(id)]);
}

router.get('/media', ah(async (req, res) => {
  const rows = await db.all('SELECT id, filename, mime, size, width, height, alt, source, created_at FROM pm_media ORDER BY id DESC');
  const usage = await mediaUsage();
  const base = baseUrl(req);
  const kind = req.query.kind;
  res.json({
    items: rows
      .filter((r) => !kind || (kind === 'image' ? r.mime.startsWith('image/') : !r.mime.startsWith('image/')))
      .map((r) => ({ ...r, size: Number(r.size), url: mediaPath(r), absolute_url: base + mediaPath(r), used_by: usage.get(Number(r.id)) || [] })),
  });
}));

router.post('/media', upload.single('file'), json, ah(async (req, res) => {
  const preset = ['default', 'avatar', 'logo', 'original'].includes(req.query.preset) ? req.query.preset : 'default';
  const accept = ['image', 'document'].includes(req.query.accept) ? req.query.accept : 'any';
  let buffer = req.file?.buffer;
  let filename = req.file?.originalname;
  if (!buffer && typeof req.body?.data === 'string') {
    buffer = decodeDataUri(req.body.data, config.maxUploadBytes);
    filename = req.body.filename;
  }
  if (!buffer) throw new HttpError(400, 'No file received');
  const row = await storeMedia(buffer, { filename, accept, preset, alt: req.body?.alt || '' });
  await logActivity(req.user, 'upload', 'media', row.id, row.filename);
  res.status(201).json({ ...row, size: Number(row.size), url: mediaPath(row), absolute_url: baseUrl(req) + mediaPath(row) });
}));

router.patch('/media/:id', json, ah(async (req, res) => {
  await db.run('UPDATE pm_media SET alt = ? WHERE id = ?', [String(req.body?.alt || '').slice(0, 300), Number(req.params.id)]);
  await bumpContentVersion();
  res.json({ status: 'success' });
}));

router.delete('/media/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const used = (await mediaUsage()).get(id);
  if (used?.length && req.query.force !== '1') {
    throw new HttpError(409, `This file is still used by: ${used.join(', ')}`);
  }
  const { changes } = await db.run('DELETE FROM pm_media WHERE id = ?', [id]);
  if (!changes) throw new HttpError(404, 'Media not found');
  await bumpContentVersion();
  await logActivity(req.user, 'delete', 'media', id, used?.length ? 'Forced delete of a file in use' : '');
  res.json({ status: 'success' });
}));

router.post('/media/purge-unused', ah(async (req, res) => {
  const usage = await mediaUsage();
  const rows = await db.all('SELECT id FROM pm_media');
  const unused = rows.map((r) => Number(r.id)).filter((id) => !usage.has(id));
  if (unused.length) await db.run(`DELETE FROM pm_media WHERE id IN (${unused.map(() => '?').join(',')})`, unused);
  await logActivity(req.user, 'purge', 'media', null, `Removed ${unused.length} unused file(s)`);
  res.json({ status: 'success', removed: unused.length });
}));

// ------------------------------------------------------------------ submission limits

router.get('/limits', ah(async (req, res) => {
  res.json({ items: await listToday(), settings: await getSetting('submissions') });
}));

router.delete('/limits/:id', ah(async (req, res) => {
  await clearEntries({ id: req.params.id });
  await logActivity(req.user, 'clear', 'limits', req.params.id, 'Unblocked a visitor for today');
  res.json({ status: 'success' });
}));

router.delete('/limits', ah(async (req, res) => {
  const removed = await clearEntries({ all: true });
  await logActivity(req.user, 'clear', 'limits', null, `Cleared all ${removed} limit entries`);
  res.json({ status: 'success', removed });
}));

// ------------------------------------------------------------------ activity

router.get('/activity', ah(async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json({ items: await db.all('SELECT * FROM pm_activity ORDER BY id DESC LIMIT ?', [limit]) });
}));

// ------------------------------------------------------------------ integration info

router.get('/integration', ah(async (req, res) => {
  const base = baseUrl(req);
  res.json({
    base_url: base,
    sdk_url: `${base}/api/portfolio_manager.js`,
    snippet: `<script src="${base}/api/portfolio_manager.js" async></script>`,
    endpoints: {
      bundle: `${base}/api/portfolio?inline=1`,
      message: `${base}/api/messages/send`,
      testimonial: `${base}/api/testimonials/submit`,
      analytics: `${base}/api/analytics/collect`,
      resume: `${base}/api/resume`,
    },
  });
}));

// ------------------------------------------------------------------ backup / restore

router.get('/backup', ah(async (req, res) => {
  await logActivity(req.user, 'export', 'backup', null, 'Downloaded a backup');
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="portfolio-backup-${nowIso().slice(0, 10)}.json"`,
  });
  await writeBackup((chunk) => res.write(chunk), { includeMessages: req.query.messages !== '0', includeMedia: req.query.media !== '0' });
  res.end();
}));

router.post('/backup/restore', express.json({ limit: config.isServerless ? '4.4mb' : '250mb' }), ah(async (req, res) => {
  const stats = await restoreBackup(req.body);
  await logActivity(req.user, 'restore', 'backup', null, JSON.stringify(stats));
  res.json({ status: 'success', restored: stats });
}));

// ------------------------------------------------------------------ custom content presets

router.get('/custom/presets', (req, res) => {
  res.json({ items: Object.entries(CUSTOM_PRESETS).map(([id, p]) => ({ id, label: p.label, description: p.description, groups: [...new Set(p.entries.map((e) => e.group_key))], count: p.entries.length })) });
});

router.post('/custom/presets/:id/apply', json, ah(async (req, res) => {
  const result = await applyCustomPreset(req.params.id, { overwrite: req.body?.overwrite === true });
  await logActivity(req.user, 'preset', 'custom_content', req.params.id, `Added ${result.added}, updated ${result.updated}`);
  res.json({ status: 'success', ...result });
}));

export default router;
