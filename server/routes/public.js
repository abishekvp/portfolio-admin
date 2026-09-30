/**
 * Public API used by portfolio websites (cross-origin, no credentials).
 *
 * Every request is served for one account, picked by its publishable API key:
 *   ?key=pk_...   or   X-Portfolio-Key: pk_...   or   Authorization: Bearer pk_...
 * Requests without a key get the default site (DEFAULT_SITE; the oldest account unless set to
 * 'none'), so portfolios embedded before API keys existed keep working. Legacy Django paths
 * (/api/portfolio/, /api/messages/send/, /api/testimonials/submit/, ...) keep working unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ROOT_DIR, config } from '../config.js';
import { db } from '../db/index.js';
import { resources } from '../resources.js';
import { ah, baseUrl, clientIp, publicCors } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';
import { HttpError, isEmail, isSafeUrl } from '../lib/validate.js';
import { buildBundle } from '../services/bundle.js';
import { getSetting } from '../services/settings.js';
import { checkLimit, consumeAndRun, normalizeEmail, normalizeIp } from '../services/limits.js';
import { createItem } from '../services/collections.js';
import { decodeDataUri, storeMedia } from '../services/media.js';
import { collectEvent } from '../services/analytics.js';
import { notify } from '../services/notify.js';
import { resolveApiKey } from '../services/apikeys.js';

const router = express.Router();
router.use(publicCors);

// ---------------------------------------------------------------- account resolution

export async function defaultSite() {
  if (config.defaultSite.toLowerCase() === 'none') return null;
  return config.defaultSite
    ? db.one('SELECT id, username, disabled FROM pm_users WHERE LOWER(username) = LOWER(?)', [config.defaultSite])
    : db.one('SELECT id, username, disabled FROM pm_users ORDER BY id LIMIT 1');
}

function apiKeyFrom(req) {
  const q = req.query.key ?? req.query.api_key;
  if (typeof q === 'string' && q) return q.trim();
  const header = req.get('x-portfolio-key') || req.get('x-api-key');
  if (header) return header.trim();
  return /^Bearer\s+(pk_\S+)$/i.exec(req.get('authorization') || '')?.[1] || '';
}

/** Sets req.site = { id, username, key } for the account this request is for. */
const site = ah(async (req, res, next) => {
  const key = apiKeyFrom(req);
  let account;
  if (key) {
    account = await resolveApiKey(key);
    if (!account) throw new HttpError(401, 'Invalid API key.');
  } else {
    account = await defaultSite();
    if (!account) throw new HttpError(401, 'An API key is required. Pass ?key=pk_... or the X-Portfolio-Key header.');
  }
  if (account.disabled) throw new HttpError(403, 'This portfolio is not available.');
  req.site = { id: account.id, username: account.username, key };
  next();
});

const smallJson = [express.json({ limit: '64kb' }), express.urlencoded({ extended: false, limit: '64kb' })];
const photoJson = [express.json({ limit: '9mb' }), express.urlencoded({ extended: false, limit: '9mb' })];
const PHOTO_MAX = 6 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX, files: 1, fields: 20 } });

const s = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

function sendLimited(res, verdict) {
  res.set('Retry-After', String(verdict.retryAfterSeconds));
  return res.status(429).json({ status: 'error', code: 'daily_limit', message: verdict.message, retry_after: verdict.retryAfterSeconds });
}

function isBlocked(settings, email, ip) {
  const e = email ? normalizeEmail(email) : '';
  const nip = normalizeIp(ip);
  return (
    settings.blocked_emails.some((b) => b && (normalizeEmail(b) === e || (b.startsWith('@') && e.endsWith(b.toLowerCase())))) ||
    settings.blocked_ips.some((b) => b && (b === ip || b === nip))
  );
}

// ---------------------------------------------------------------- bundle

const bundleFor = (req, inline = false) => buildBundle({ uid: req.site.id, apiKey: req.site.key, baseUrl: baseUrl(req), inline });

router.get(['/portfolio', '/portfolio/data'], site, ah(async (req, res) => {
  const inline = ['1', 'true', 'yes'].includes(String(req.query.inline || '').toLowerCase());
  const bundle = await bundleFor(req, inline);
  res.set('Cache-Control', 'no-cache');
  res.set('X-Content-Version', bundle.version);
  if (req.query.since && req.query.since === bundle.version) {
    return res.json({ status: 'not_modified', version: bundle.version });
  }
  res.set('ETag', bundle.etag);
  if (req.fresh) return res.status(304).end();
  res.type('application/json').send(bundle.body);
}));

router.get('/portfolio/version', site, ah(async (req, res) => {
  const bundle = await bundleFor(req);
  res.set('Cache-Control', 'no-cache').json({ status: 'success', version: bundle.version });
}));

router.get('/testimonials', site, ah(async (req, res) => {
  const bundle = JSON.parse((await bundleFor(req)).body);
  res.set('Cache-Control', 'no-cache').json({ status: 'success', data: bundle.data.testimonials });
}));

// ---------------------------------------------------------------- media

// /api/media/:id/:hash/:name — the hash (first 16 hex chars of the file's sha256) makes the URL
// unguessable. The older /api/media/:id/:name form is kept for the default site only.
router.get(['/media/:id/:hash/:name', '/media/:id{/:name}'], ah(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(404, 'Not found');
  const row = await db.one('SELECT id, user_id, filename, mime, size, sha256, data FROM pm_media WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Not found');
  if (req.params.hash !== undefined) {
    if (req.params.hash.length !== 16 || !row.sha256.startsWith(req.params.hash)) throw new HttpError(404, 'Not found');
  } else if (row.user_id !== (await defaultSite())?.id) {
    throw new HttpError(404, 'Not found');
  }
  const etag = `"${row.sha256}"`;
  res.set({
    'Content-Type': row.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${String(row.filename || 'file').replace(/"/g, '')}"`,
  });
  if (req.get('if-none-match') === etag) return res.status(304).end();
  res.send(db.toBuffer(row.data));
}));

router.get('/resume', site, ah(async (req, res) => {
  const uid = req.site.id;
  const profile = await getSetting(uid, 'profile');
  if (!profile.resume_id) {
    if (profile.resume_url && /^https?:\/\//i.test(profile.resume_url)) return res.redirect(302, profile.resume_url);
    throw new HttpError(404, 'No resume uploaded yet');
  }
  const row = await db.one('SELECT mime, data, sha256 FROM pm_media WHERE id = ? AND user_id = ?', [profile.resume_id, uid]);
  if (!row) throw new HttpError(404, 'Resume not found');
  const filename = (profile.resume_filename || 'Resume.pdf').replace(/[^\w.\- ]+/g, '');
  res.set({
    'Content-Type': row.mime,
    'Cache-Control': 'public, max-age=300',
    ETag: `"${row.sha256}"`,
    'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(db.toBuffer(row.data));
}));

// ---------------------------------------------------------------- contact messages

router.post(
  ['/messages/send', '/contact', '/messages'],
  rateLimit({ windowMs: 60_000, max: 8 }),
  site,
  ...smallJson,
  ah(async (req, res) => {
    const uid = req.site.id;
    const settings = await getSetting(uid, 'submissions');
    if (!settings.messages_enabled) throw new HttpError(403, 'The contact form is currently closed.');
    const body = req.body || {};
    if (s(body.website, 200) || s(body._gotcha, 200)) {
      return res.status(201).json({ status: 'success', message: 'Your message has been sent successfully! Thank you for reaching out.' });
    }

    const name = s(body.name, 150);
    const email = s(body.email, 254).toLowerCase();
    const message = s(body.message, 5000);
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!isEmail(email)) errors.email = 'A valid email is required';
    if (message.length < Math.max(1, settings.min_message_length)) errors.message = `Message must be at least ${Math.max(1, settings.min_message_length)} characters`;
    if (String(body.message ?? '').length > 5000) errors.message = 'Message is too long (max 5000 characters)';
    if (Object.keys(errors).length) {
      return res.status(400).json({ status: 'error', message: Object.values(errors)[0], errors });
    }

    const ip = clientIp(req);
    if (isBlocked(settings, email, ip)) throw new HttpError(403, 'We are unable to accept your message.');

    const verdict = await consumeAndRun(uid, 'message', { email, ip }, settings, (t) =>
      createItem(uid, resources.messages, {
        name, email, message,
        subject: s(body.subject, 255) || `New portfolio message from ${name}`,
        phone: s(body.phone, 50),
        ip: normalizeIp(ip),
        user_agent: s(req.get('user-agent'), 500),
        session_id: s(body.session_id, 64),
      }, { allowReadonly: true, runner: t })
    );
    if (!verdict.ok) return sendLimited(res, verdict);

    notify(uid, 'New portfolio message', [`From: ${name} <${email}>`, body.subject && `Subject: ${s(body.subject, 255)}`, message.slice(0, 500)]);
    res.status(201).json({
      status: 'success',
      message: 'Your message has been sent successfully! Thank you for reaching out.',
      message_id: verdict.result.id,
    });
  })
);

// ---------------------------------------------------------------- testimonials

router.post(
  ['/testimonials/submit', '/testimonials'],
  rateLimit({ windowMs: 60_000, max: 6 }),
  site,
  upload.single('photo'),
  ...photoJson,
  ah(async (req, res) => {
    const uid = req.site.id;
    const settings = await getSetting(uid, 'submissions');
    if (!settings.testimonials_enabled) throw new HttpError(403, 'Testimonial submissions are currently closed.');
    const body = req.body || {};
    if (s(body.website, 200) || s(body._gotcha, 200)) {
      return res.status(201).json({ status: 'success', message: 'Thank you! Your testimonial has been submitted and is pending review.' });
    }

    const name = s(body.name, 150);
    const content = s(body.content || body.message, 3000);
    const email = s(body.email, 254).toLowerCase();
    const photoUrl = s(body.photo_url, 1000);
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (content.length < 10) errors.content = 'Testimonial must be at least 10 characters';
    if (email && !isEmail(email)) errors.email = 'Enter a valid email address';
    if (!email && settings.require_testimonial_email) errors.email = 'Email is required';
    if (photoUrl && (!/^https:\/\//i.test(photoUrl) || !isSafeUrl(photoUrl))) errors.photo_url = 'Photo URL must be an https link';
    if (Object.keys(errors).length) {
      return res.status(400).json({ status: 'error', message: Object.values(errors)[0], errors });
    }

    const ip = clientIp(req);
    if (isBlocked(settings, email, ip)) throw new HttpError(403, 'We are unable to accept your testimonial.');

    // Cheap pre-check before doing any image work.
    const pre = await checkLimit(uid, 'testimonial', { email, ip }, settings);
    if (!pre.ok) return sendLimited(res, pre);

    // Photo: multipart file, or a base64 data-URI string ("binary string") from the SDK.
    let photoId = null;
    const photoBuffer = req.file?.buffer || (typeof body.photo === 'string' && body.photo ? decodeDataUri(body.photo, PHOTO_MAX) : null);
    if (photoBuffer) {
      const media = await storeMedia(uid, photoBuffer, { filename: `testimonial-${name}`, accept: 'image', preset: 'photo', source: 'website', alt: name });
      photoId = media.id;
    }

    const rating = Math.min(5, Math.max(1, Number.parseInt(body.rating, 10) || 5));
    const verdict = await consumeAndRun(uid, 'testimonial', { email, ip }, settings, (t) =>
      createItem(uid, resources.testimonials, {
        name, content, email, rating,
        role: s(body.role || body.designation, 150),
        company: s(body.company, 150),
        photo_id: photoId,
        photo_url: photoUrl,
        status: settings.auto_approve_testimonials ? 'approved' : 'pending',
        source: 'website',
        ip: normalizeIp(ip),
        session_id: s(body.session_id, 64),
      }, { allowReadonly: true, runner: t })
    );
    if (!verdict.ok) return sendLimited(res, verdict);

    notify(uid, 'New testimonial submitted', [`From: ${name}${email ? ` <${email}>` : ''}`, content.slice(0, 500)]);
    res.status(201).json({
      status: 'success',
      message: settings.auto_approve_testimonials
        ? 'Thank you! Your testimonial has been published.'
        : 'Thank you! Your testimonial has been submitted successfully and is pending review.',
      testimonial_id: verdict.result.id,
    });
  })
);

// ---------------------------------------------------------------- analytics

router.post(
  ['/analytics/collect', '/collect'],
  rateLimit({ windowMs: 60_000, max: 120 }),
  site,
  express.text({ type: ['text/plain', 'application/json'], limit: '16kb' }),
  ah(async (req, res) => {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch {
        throw new HttpError(400, 'Malformed JSON body.');
      }
    }
    await collectEvent(req.site.id, payload || {}, { ip: clientIp(req), userAgent: req.get('user-agent') });
    res.status(202).json({ status: 'success' });
  })
);

// ---------------------------------------------------------------- SDK

const SDK_PATH = path.join(ROOT_DIR, 'server', 'sdk', 'portfolio_manager.js');
router.get(['/portfolio_manager.js', '/embed.js', '/tracker.js', '/summary.js', '/sdk.js'], (req, res, next) => {
  fs.readFile(SDK_PATH, 'utf8', (err, js) => {
    if (err) return next(err);
    // Short browser cache so SDK fixes reach visitors quickly; stale copies are refreshed in the background.
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' }).send(js);
  });
});

router.get('/health', ah(async (req, res) => {
  await db.one('SELECT 1 AS ok');
  res.json({ status: 'ok', database: db.dialect, time: new Date().toISOString() });
}));

export default router;
