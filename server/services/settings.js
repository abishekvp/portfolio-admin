/**
 * Singleton content blocks (profile, hero, about, contact, section headers, SEO) and
 * operational settings, stored as JSON in pm_settings.
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

const sectionHeader = { badge: '', title: '', accent: '', subtitle: '', visible: false };

export const SETTINGS = {
  profile: {
    label: 'Profile',
    public: true,
    template: {
      full_name: '', headline: '', email: '', phone: '', location: '', availability: '',
      avatar_id: null, resume_id: null, resume_url: '', resume_filename: '',
      website_url: '', github_url: '', linkedin_url: '', twitter_url: '',
      custom_links: [{ label: '', url: '' }],
    },
    defaults: { full_name: 'Your Name', headline: 'Software Engineer', availability: 'Open to opportunities', resume_filename: 'Resume.pdf', custom_links: [] },
  },
  hero: {
    label: 'Hero',
    public: true,
    template: {
      badge: '', name: '', name_accent: '', tagline: '', description: '',
      highlights: [{ icon: '', value: '', label: '' }],
      primary_cta_label: '', primary_cta_href: '', resume_label: '', terminal_cta_label: '',
      portrait_id: null, portrait_tag: '',
      floating_badges: [{ icon: '', title: '', text: '' }],
    },
    defaults: { primary_cta_label: 'View Projects', primary_cta_href: '#projects', resume_label: 'Download CV', terminal_cta_label: 'Launch Terminal CLI', highlights: [], floating_badges: [] },
  },
  about: {
    label: 'About',
    public: true,
    template: {
      expertise_title: '', expertise: [{ title: '', description: '' }],
      bio_title: '', role_badge: '', paragraphs: [''],
      highlights: [{ icon: '', title: '', description: '' }],
    },
    defaults: { expertise_title: 'Core Expertise', expertise: [], paragraphs: [], highlights: [] },
  },
  contact: {
    label: 'Contact',
    public: true,
    template: {
      intro: '', roles: '', form_heading: '', form_subheading: '',
      methods: [{ name: '', icon: '', value: '', link: '' }],
      socials: [{ name: '', link: '' }],
      footer_text: '',
    },
    defaults: { form_heading: 'Send a message', methods: [], socials: [] },
  },
  sections: {
    label: 'Section headers',
    public: true,
    template: {
      about: sectionHeader, achievements: sectionHeader, skills: sectionHeader, projects: sectionHeader,
      experience: sectionHeader, education: sectionHeader, testimonials: sectionHeader, contact: sectionHeader,
    },
    defaults: {
      about: { badge: '// 02. SYSTEM_SPECIFICATION', title: 'About', accent: 'Me', subtitle: 'Professional Summary', visible: true },
      achievements: { badge: '// HONORS_AND_CREDENTIALS', title: 'Achievements &', accent: 'Recognition', subtitle: 'Milestones, hackathon triumphs, and academic contributions', visible: true },
      skills: { badge: '// 03. CAPABILITIES_MATRIX', title: 'Core', accent: 'Competencies', subtitle: 'Technologies I work with', visible: true },
      projects: { badge: '// 04. ARCHITECTURAL_BUILDS', title: 'Featured', accent: 'Projects', subtitle: 'Some of my recent work', visible: true },
      experience: { badge: '// 05. CAREER_TRAJECTORY', title: 'Work', accent: 'Experience', subtitle: 'My professional journey', visible: true },
      education: { badge: '// EDUCATION', title: 'Education', accent: '', subtitle: 'Academic background', visible: false },
      testimonials: { badge: '// 06. PEER_ENDORSEMENTS', title: 'Testimonials &', accent: 'Feedback', subtitle: 'What colleagues and clients say', visible: true },
      contact: { badge: '// 07. COMMUNICATION_CHANNELS', title: 'Get In', accent: 'Touch', subtitle: "Let's work together", visible: true },
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
  analytics: {
    label: 'Analytics',
    public: false,
    template: { enabled: false, retention_days: 0, ignore_ips: [''] },
    defaults: { enabled: true, retention_days: 365, ignore_ips: [] },
  },
};

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

const cache = new Map();

export async function getSetting(key) {
  const def = SETTINGS[key];
  if (!def) throw new HttpError(404, 'Unknown settings section');
  if (cache.has(key)) return structuredClone(cache.get(key));
  const row = await db.one('SELECT value FROM pm_settings WHERE key = ?', [key]);
  let stored = {};
  try {
    stored = row ? JSON.parse(row.value) : {};
  } catch {
    stored = {};
  }
  const value = merge(merge(blank(def.template), def.defaults), stored);
  cache.set(key, value);
  return structuredClone(value);
}

export async function getAllSettings({ publicOnly = false } = {}) {
  const out = {};
  for (const key of Object.keys(SETTINGS)) {
    if (publicOnly && !SETTINGS[key].public) continue;
    out[key] = await getSetting(key);
  }
  return out;
}

export async function setSetting(key, input, { partial = true } = {}) {
  const def = SETTINGS[key];
  if (!def) throw new HttpError(404, 'Unknown settings section');
  const current = await getSetting(key);
  const candidate = partial ? merge(current, input) : input;
  const errors = {};
  const value = sanitize(def.template, candidate, '', errors);
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
  const json = JSON.stringify(value);
  if (json.length > 500_000) throw new HttpError(413, 'Settings payload is too large');
  await db.run(
    `INSERT INTO pm_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, json, nowIso()]
  );
  cache.set(key, value);
  if (def.public) await bumpContentVersion();
  return structuredClone(value);
}

export function clearSettingsCache() {
  cache.clear();
}

/** Media ids referenced from settings (for usage tracking). */
export async function settingsMediaRefs() {
  const refs = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k.endsWith('_id') && Number.isFinite(v) && v > 0) refs.push({ id: v, where: `${path}.${k}` });
      else if (typeof v === 'object') walk(v, `${path}.${k}`);
    }
  };
  const all = await getAllSettings();
  for (const [key, value] of Object.entries(all)) walk(value, key);
  return refs;
}

// ---- content version (drives the public bundle cache / SDK revalidation) ----

let contentVersion = null;

export async function getContentVersion() {
  if (contentVersion) return contentVersion;
  const row = await db.one("SELECT value FROM pm_meta WHERE key = 'content_version'");
  contentVersion = row?.value || (await bumpContentVersion());
  return contentVersion;
}

export async function bumpContentVersion() {
  contentVersion = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  await db.run(
    `INSERT INTO pm_meta (key, value) VALUES ('content_version', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [contentVersion]
  );
  return contentVersion;
}
