/**
 * Per-account singleton records stored as JSON in pm_account_settings: the personal profile, skill category
 * metadata, SEO and operational settings. Template-specific texts live in the
 * custom_content collection instead.
 *
 * Each template doubles as the shape validator:
 *   ''    -> string          0     -> number        false -> boolean
 *   null  -> media id        ['']  -> string list   [{..}] -> list of objects
 *   {..}  -> nested object
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { HttpError, isSafeUrl } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';

export const SETTINGS = {
  profile: {
    label: 'Profile',
    public: true,
    template: {
      full_name: '', headline: '', summary: '', location: '', availability: '',
      email: '', phone: '',
      photo_id: null, resume_id: null, resume_url: '', resume_filename: '',
    },
    defaults: { full_name: 'Your Name', headline: 'Software Engineer', resume_filename: 'Resume.pdf' },
  },
  // Named download links: /api/download/<slug> serves the chosen media file. The slug
  // `resume` also backs /api/resume (before falling back to profile.resume_id).
  downloads: {
    label: 'Download links',
    public: true,
    template: { links: [{ slug: '', label: '', media_id: null, filename: '' }] },
    defaults: { links: [] },
    validate(value, errors) {
      const seen = new Set();
      value.links = value.links.filter((l) => l.slug || l.media_id || l.label);
      value.links.forEach((l, i) => {
        l.slug = l.slug.toLowerCase();
        if (!DOWNLOAD_SLUG.test(l.slug)) errors[`links[${i}].slug`] = 'Use 1–60 lowercase letters, numbers, - or _';
        else if (seen.has(l.slug)) errors[`links[${i}].slug`] = 'Already used by another link';
        seen.add(l.slug);
        if (!l.media_id) errors[`links[${i}].media_id`] = 'Choose a file';
        l.filename = l.filename.replace(/[^\w.\- ]+/g, '').slice(0, 120);
      });
    },
  },
  skills_meta: {
    label: 'Skill categories',
    public: true,
    template: { categories: [{ name: '', icon: '' }] },
    defaults: { categories: [] },
  },
  seo: {
    label: 'SEO',
    public: true,
    template: { site_title: '', description: '', keywords: '', author: '', og_image_id: null, theme_color: '' },
    defaults: {},
  },
  submissions: {
    label: 'Submissions & limits',
    public: false,
    template: {
      messages_enabled: false, testimonials_enabled: false,
      per_email_daily: 0, per_ip_daily: 0,
      require_testimonial_email: false, auto_approve_testimonials: false,
      min_message_length: 0,
      blocked_emails: [''], blocked_ips: [''],
      notify_webhook_url: '',
    },
    defaults: {
      messages_enabled: true, testimonials_enabled: true,
      per_email_daily: 1, per_ip_daily: 1,
      require_testimonial_email: true, auto_approve_testimonials: false,
      min_message_length: 10,
      blocked_emails: [], blocked_ips: [],
    },
  },
  security: {
    label: 'Security',
    public: false,
    template: { session_days: 0 },
    // Managed only from Account → Security in the admin UI.
    defaults: { session_days: 14 },
  },
  analytics: {
    label: 'Analytics',
    public: false,
    template: { enabled: false, retention_days: 0, ignore_ips: [''] },
    defaults: { enabled: true, retention_days: 365, ignore_ips: [] },
  },
};

export const DOWNLOAD_SLUG = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const MAX_STRING = 10000;
const MAX_LIST = 200;
const isUrlKey = (key) => /(_url|_href|^link|^url|^href)$/.test(key);

function blank(template) {
  if (Array.isArray(template)) return [];
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, blank(v)]));
  }
  return template;
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function sanitize(template, value, path, errors) {
  if (template === null) {
    if (value === null || value === '' || value === undefined) return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof template === 'string') {
    const s = String(value ?? '').replace(/\u0000/g, '').trim();
    if (s.length > MAX_STRING) errors[path] = 'Too long';
    const key = path.split('.').pop().replace(/\[\d+\]$/, '');
    if (isUrlKey(key) && !isSafeUrl(s)) errors[path] = 'Enter a valid http(s), mailto:, tel: or relative link';
    return s.slice(0, MAX_STRING);
  }
  if (typeof template === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof template === 'boolean') return value === true || value === 'true' || value === 1 || value === 'on';
  if (Array.isArray(template)) {
    const arr = Array.isArray(value) ? value.slice(0, MAX_LIST) : [];
    const item = template[0];
    const res = arr.map((v, i) => sanitize(item, v, `${path}[${i}]`, errors));
    return typeof item === 'string' ? res.filter(Boolean) : res;
  }
  const obj = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(template).map(([k, t]) => [k, sanitize(t, obj[k], path ? `${path}.${k}` : k, errors)]));
}

// No long-lived caches: on serverless hosts several instances run at once, so every
// read goes to the database (one small query).

function hydrate(key, raw) {
  const def = SETTINGS[key];
  let stored = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    stored = {};
  }
  return merge(merge(blank(def.template), def.defaults), stored);
}

export async function getSetting(uid, key) {
  if (!SETTINGS[key]) throw new HttpError(404, 'Unknown settings section');
  const row = await db.one('SELECT value FROM pm_account_settings WHERE user_id = ? AND key = ?', [uid, key]);
  return hydrate(key, row?.value);
}

export async function getAllSettings(uid, { publicOnly = false } = {}) {
  const rows = new Map((await db.all('SELECT key, value FROM pm_account_settings WHERE user_id = ?', [uid])).map((r) => [r.key, r.value]));
  const out = {};
  for (const key of Object.keys(SETTINGS)) {
    if (publicOnly && !SETTINGS[key].public) continue;
    out[key] = hydrate(key, rows.get(key));
  }
  return out;
}

export async function setSetting(uid, key, input, { partial = true } = {}) {
  const def = SETTINGS[key];
  if (!def) throw new HttpError(404, 'Unknown settings section');
  const current = await getSetting(uid, key);
  const candidate = partial ? merge(current, input) : input;
  const errors = {};
  const value = sanitize(def.template, candidate, '', errors);
  def.validate?.(value, errors);
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
  const json = JSON.stringify(value);
  if (json.length > 500_000) throw new HttpError(413, 'Settings payload is too large');
  await db.run(
    `INSERT INTO pm_account_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [uid, key, json, nowIso()]
  );
  if (def.public) await bumpContentVersion(uid);
  return value;
}

/** Media ids referenced from settings (for usage tracking). */
export async function settingsMediaRefs(uid) {
  const refs = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k.endsWith('_id') && Number.isFinite(v) && v > 0) refs.push({ id: v, where: `${path}.${k}` });
      else if (typeof v === 'object') walk(v, `${path}.${k}`);
    }
  };
  const all = await getAllSettings(uid);
  for (const [key, value] of Object.entries(all)) walk(value, key);
  return refs;
}

// ---- content version (drives the public bundle cache / SDK revalidation) ----
// One per account, always read from the database so every serverless instance agrees on it.

export async function getContentVersion(uid) {
  const row = await db.one('SELECT content_version FROM pm_users WHERE id = ?', [uid]);
  return row?.content_version || bumpContentVersion(uid);
}

export async function bumpContentVersion(uid) {
  const version = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  await db.run('UPDATE pm_users SET content_version = ? WHERE id = ?', [version, uid]);
  return version;
}
