/**
 * Builds the public portfolio bundle consumed by portfolio_manager.js.
 *
 * {
 *   version, generated_at,
 *   data: { profile, contacts, experience, education, skills, skill_categories, projects,
 *           achievements, testimonials, custom: { <group>: { <key>: value } }, seo },
 *   media: { "<absolute media url>": "data:<mime>;base64,..." }   // only with ?inline=1
 * }
 *
 * `data` holds personal content only; template-specific texts come from `custom`, which the
 * site reads with its own defaults as fallback. With `inline`, small images are also sent as
 * base64 so the SDK can keep everything (images included) in sessionStorage.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { resources } from '../resources.js';
import { rowToJson } from '../lib/validate.js';
import { getAllSettings, getContentVersion } from './settings.js';
import { getMediaData, getMediaMeta, mediaPath } from './media.js';
import { customMediaIds } from './hooks.js';

const PUBLIC_OMIT = {
  testimonials: ['email', 'ip', 'session_id', 'admin_notes', 'status', 'source'],
  custom_content: ['help'],
};
const PUBLIC_COLLECTIONS = ['contacts', 'experience', 'education', 'skills', 'projects', 'achievements', 'testimonials', 'custom_content'];

// Keyed by content version, which is read from the database on every request, so a
// cached entry is never stale even with several serverless instances.
const cache = new Map();

async function loadPublic(name) {
  const spec = resources[name];
  const where = name === 'testimonials' ? "WHERE status = 'approved'" : 'WHERE visible = 1';
  const rows = await db.all(`SELECT * FROM ${spec.table} ${where} ORDER BY ${spec.publicOrderBy || spec.orderBy}`);
  return rows.map((r) => {
    const item = rowToJson(spec, r);
    for (const key of [...(PUBLIC_OMIT[name] || []), 'visible', 'created_at', 'updated_at', 'sort_order']) delete item[key];
    return item;
  });
}

/** Replace every `<name>_id` media reference with `<name>_url` (absolute). */
function attachUrls(node, urlOf) {
  if (Array.isArray(node)) return node.map((n) => attachUrls(n, urlOf));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith('_id') && (Number.isInteger(v) || v === null)) {
      const urlKey = k.replace(/_id$/, '_url');
      // keep an explicitly configured external URL (e.g. a testimonial photo_url) when nothing was uploaded
      out[urlKey] = urlOf(v) || node[urlKey] || '';
      continue;
    }
    if (out[k] !== undefined && k.endsWith('_url')) continue;
    out[k] = v && typeof v === 'object' ? attachUrls(v, urlOf) : v;
  }
  return out;
}

function collectIds(node, out) {
  if (Array.isArray(node)) node.forEach((n) => collectIds(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k.endsWith('_id') && Number.isInteger(v) && v > 0) out.add(v);
      else if (v && typeof v === 'object') collectIds(v, out);
    }
  }
  return out;
}

/** Custom content rows -> { group: { key: value } } with image ids turned into URLs. */
function buildCustom(rows, urlOf) {
  const custom = {};
  for (const r of rows) {
    let value = r.value;
    if (r.type === 'image') value = urlOf(value) || '';
    if (r.type === 'items' && Array.isArray(value)) {
      const images = (r.schema || []).filter((f) => f.type === 'image').map((f) => f.name);
      value = value.map((item) => {
        const copy = { ...item };
        for (const f of images) copy[f] = urlOf(copy[f]) || '';
        return copy;
      });
    }
    (custom[r.group_key] ||= {})[r.key] = value;
  }
  return custom;
}

export async function buildBundle({ baseUrl, inline = false }) {
  const version = await getContentVersion();
  const base = config.publicUrl || baseUrl;
  const key = `${version}|${base}|${inline ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);

  const settings = await getAllSettings({ publicOnly: true });
  const lists = Object.fromEntries(await Promise.all(PUBLIC_COLLECTIONS.map(async (n) => [n, await loadPublic(n)])));
  const { custom_content: customRows, ...collections } = lists;

  const ids = collectIds({ profile: settings.profile, seo: settings.seo, ...collections }, new Set());
  for (const r of customRows) customMediaIds(r).forEach((id) => ids.add(id));
  const meta = await getMediaMeta([...ids]);
  const urlOf = (id) => {
    const m = id ? meta.get(id) : null;
    return m ? base + mediaPath(m) : '';
  };

  // Skill categories: configured order/icons first, then any category only used by skills.
  const configured = settings.skills_meta.categories.filter((c) => c.name);
  const known = new Set(configured.map((c) => c.name));
  const extra = [...new Set(collections.skills.map((s) => s.category))].filter((c) => !known.has(c)).map((name) => ({ name, icon: '' }));
  const skillCategories = [...configured, ...extra]
    .map((c) => ({ ...c, skills: collections.skills.filter((s) => s.category === c.name) }))
    .filter((c) => c.skills.length);

  const profile = attachUrls(settings.profile, urlOf);
  // Stable resume link: the uploaded PDF, otherwise the external URL.
  profile.resume_url = settings.profile.resume_id ? `${base}/api/resume` : settings.profile.resume_url;

  const data = {
    profile,
    ...attachUrls(collections, urlOf),
    skill_categories: skillCategories,
    custom: buildCustom(customRows, urlOf),
    seo: attachUrls(settings.seo, urlOf),
  };

  let media = null;
  if (inline) {
    media = {};
    let budget = config.inlineMediaTotalBytes;
    const small = [...meta.values()]
      .filter((m) => m.mime.startsWith('image/') && Number(m.size) <= config.inlineMediaMaxBytes)
      .sort((a, b) => Number(a.size) - Number(b.size));
    const blobs = await getMediaData(small.map((m) => Number(m.id)));
    for (const m of small) {
      const b = blobs.get(Number(m.id));
      if (!b || b.data.length > budget) continue;
      budget -= b.data.length;
      media[base + mediaPath(m)] = `data:${b.mime};base64,${b.data.toString('base64')}`;
    }
  }

  const body = JSON.stringify({ status: 'success', version, generated_at: new Date().toISOString(), data, media });
  const entry = { body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"`, version };
  if (cache.size > 20) cache.clear();
  cache.set(key, entry);
  return entry;
}
