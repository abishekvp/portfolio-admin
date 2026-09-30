/**
 * Builds the public portfolio bundle consumed by portfolio_manager.js.
 *
 * { version, generated_at, data: {...}, media: { "<absolute media url>": "data:<mime>;base64,..." } }
 *
 * `data` only contains absolute media URLs. With `inline`, small images are also sent as
 * base64 data URIs in `media` so the SDK can keep everything (including images) in
 * sessionStorage and swap URLs for data URIs client-side.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { resources } from '../resources.js';
import { rowToJson } from '../lib/validate.js';
import { getAllSettings, getContentVersion } from './settings.js';
import { getMediaData, getMediaMeta, mediaPath } from './media.js';

const PUBLIC_OMIT = {
  testimonials: ['email', 'ip', 'session_id', 'admin_notes', 'status', 'source'],
};

const cache = new Map(); // key: `${version}|${base}|${inline}` -> { body, etag }

async function loadPublic(name) {
  const spec = resources[name];
  const where = name === 'testimonials' ? "WHERE status = 'approved'" : 'WHERE visible = 1';
  const rows = await db.all(`SELECT * FROM ${spec.table} ${where} ORDER BY ${spec.publicOrderBy || spec.orderBy}`);
  return rows.map((r) => {
    const item = rowToJson(spec, r);
    for (const key of PUBLIC_OMIT[name] || []) delete item[key];
    delete item.visible;
    delete item.created_at;
    delete item.updated_at;
    delete item.sort_order;
    return item;
  });
}

function collectMediaIds(node, out) {
  if (Array.isArray(node)) node.forEach((n) => collectMediaIds(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k.endsWith('_id') && Number.isInteger(v) && v > 0) out.add(v);
      else if (v && typeof v === 'object') collectMediaIds(v, out);
    }
  }
  return out;
}

/** Replace every `<name>_id` media reference with `<name>_url` (absolute). */
function attachUrls(node, meta, base) {
  if (Array.isArray(node)) return node.map((n) => attachUrls(n, meta, base));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith('_id') && (Number.isInteger(v) || v === null)) {
      const m = v ? meta.get(v) : null;
      const urlKey = k.replace(/_id$/, '_url');
      // keep an explicitly configured external URL (e.g. photo_url) when no upload exists
      out[urlKey] = m ? base + mediaPath(m) : node[urlKey] || '';
      continue;
    }
    if (out[k] !== undefined && k.endsWith('_url')) continue;
    out[k] = v && typeof v === 'object' ? attachUrls(v, meta, base) : v;
  }
  return out;
}

export async function buildBundle({ baseUrl, inline = false }) {
  const version = await getContentVersion();
  const base = config.publicUrl || baseUrl;
  const key = `${version}|${base}|${inline ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);

  const settings = await getAllSettings({ publicOnly: true });
  const [experience, education, skills, projects, achievements, testimonials] = await Promise.all(
    ['experience', 'education', 'skills', 'projects', 'achievements', 'testimonials'].map(loadPublic)
  );

  // Skill categories: configured order/icons first, then any category only used by skills.
  const configured = settings.skills_meta.categories.filter((c) => c.name);
  const known = new Set(configured.map((c) => c.name));
  const extra = [...new Set(skills.map((s) => s.category))].filter((c) => !known.has(c)).map((name) => ({ name, icon: '' }));
  const categories = [...configured, ...extra]
    .map((c) => ({ ...c, skills: skills.filter((s) => s.category === c.name) }))
    .filter((c) => c.skills.length);

  const raw = {
    profile: settings.profile,
    hero: settings.hero,
    about: settings.about,
    contact: settings.contact,
    sections: settings.sections,
    seo: settings.seo,
    experience,
    education,
    skills,
    skill_categories: categories,
    projects,
    achievements,
    testimonials,
  };

  const ids = [...collectMediaIds(raw, new Set())];
  const meta = await getMediaMeta(ids);
  const data = attachUrls(raw, meta, base);

  // The hero portrait falls back to the profile avatar.
  if (!data.hero.portrait_url) data.hero.portrait_url = data.profile.avatar_url;
  // Stable resume link: uploaded PDF, otherwise an external URL.
  data.profile.resume_url = settings.profile.resume_id ? `${base}/api/resume` : settings.profile.resume_url;
  data.profile.resume_download_url = data.profile.resume_url;

  let media = null;
  if (inline) {
    media = {};
    const small = [...meta.values()].filter((m) => m.mime.startsWith('image/') && Number(m.size) <= config.inlineMediaMaxBytes);
    const blobs = await getMediaData(small.map((m) => Number(m.id)));
    for (const m of small) {
      const b = blobs.get(Number(m.id));
      if (b) media[base + mediaPath(m)] = `data:${b.mime};base64,${b.data.toString('base64')}`;
    }
  }

  const body = JSON.stringify({ status: 'success', version, generated_at: new Date().toISOString(), data, media });
  const entry = { body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"`, version };
  if (cache.size > 20) cache.clear();
  cache.set(key, entry);
  return entry;
}
