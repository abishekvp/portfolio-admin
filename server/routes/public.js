/**
 * Public API used by the portfolio website (cross-origin, no credentials).
 * Legacy Django paths (/api/portfolio/, /api/messages/send/, /api/testimonials/submit/,
 * /api/analytics/collect/, /api/portfolio_manager.js ...) keep working unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { ROOT_DIR } from '../config.js';
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

const router = express.Router();
router.use(publicCors);

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

router.get(['/portfolio', '/portfolio/data'], ah(async (req, res) => {
  const inline = ['1', 'true', 'yes'].includes(String(req.query.inline || '').toLowerCase());
  const bundle = await buildBundle({ baseUrl: baseUrl(req), inline });
  res.set('Cache-Control', 'no-cache');
  res.set('X-Content-Version', bundle.version);
  if (req.query.since && req.query.since === bundle.version) {
    return res.json({ status: 'not_modified', version: bundle.version });
  }
  res.set('ETag', bundle.etag);
  if (req.fresh) return res.status(304).end();
  res.type('application/json').send(bundle.body);
}));

router.get('/portfolio/version', ah(async (req, res) => {
  const bundle = await buildBundle({ baseUrl: baseUrl(req), inline: false });
  res.set('Cache-Control', 'no-cache').json({ status: 'success', version: bundle.version });
}));

router.get('/testimonials', ah(async (req, res) => {
  const bundle = JSON.parse((await buildBundle({ baseUrl: baseUrl(req) })).body);
  res.set('Cache-Control', 'no-cache').json({ status: 'success', data: bundle.data.testimonials });
}));

// ---------------------------------------------------------------- media

router.get('/media/:id{/:name}', ah(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(404, 'Not found');
  const row = await db.one('SELECT id, filename, mime, size, sha256, data FROM pm_media WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Not found');
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

router.get('/resume', ah(async (req, res) => {
  const profile = await getSetting('profile');
  if (!profile.resume_id) {
    if (profile.resume_url && /^https?:\/\//i.test(profile.resume_url)) return res.redirect(302, profile.resume_url);
    throw new HttpError(404, 'No resume uploaded yet');
  }
  const row = await db.one('SELECT mime, data, sha256 FROM pm_media WHERE id = ?', [profile.resume_id]);
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
  ...smallJson,
  ah(async (req, res) => {
    const settings = await getSetting('submissions');
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

    const verdict = await consumeAndRun('message', { email, ip }, settings, (t) =>
      createItem(resources.messages, {
        name, email, message,
        subject: s(body.subject, 255) || `New portfolio message from ${name}`,
        phone: s(body.phone, 50),
        ip: normalizeIp(ip),
        user_agent: s(req.get('user-agent'), 500),
        session_id: s(body.session_id, 64),
      }, { allowReadonly: true, runner: t })
    );
    if (!verdict.ok) return sendLimited(res, verdict);

    notify('New portfolio message', [`From: ${name} <${email}>`, body.subject && `Subject: ${s(body.subject, 255)}`, message.slice(0, 500)]);
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
  upload.single('photo'),
  ...photoJson,
  ah(async (req, res) => {
    const settings = await getSetting('submissions');
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
    const pre = await checkLimit('testimonial', { email, ip }, settings);
    if (!pre.ok) return sendLimited(res, pre);

    // Photo: multipart file, or a base64 data-URI string ("binary string") from the SDK.
    let photoId = null;
    const photoBuffer = req.file?.buffer || (typeof body.photo === 'string' && body.photo ? decodeDataUri(body.photo, PHOTO_MAX) : null);
    if (photoBuffer) {
      const media = await storeMedia(photoBuffer, { filename: `testimonial-${name}`, accept: 'image', preset: 'photo', source: 'website', alt: name });
      photoId = media.id;
    }

    const rating = Math.min(5, Math.max(1, Number.parseInt(body.rating, 10) || 5));
    const verdict = await consumeAndRun('testimonial', { email, ip }, settings, (t) =>
      createItem(resources.testimonials, {
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

    notify('New testimonial submitted', [`From: ${name}${email ? ` <${email}>` : ''}`, content.slice(0, 500)]);
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
    await collectEvent(payload || {}, { ip: clientIp(req), userAgent: req.get('user-agent') });
    res.status(202).json({ status: 'success' });
  })
);

// ---------------------------------------------------------------- SDK

const SDK_PATH = path.join(ROOT_DIR, 'server', 'sdk', 'portfolio_manager.js');
router.get(['/portfolio_manager.js', '/embed.js', '/tracker.js', '/summary.js', '/sdk.js'], (req, res, next) => {
  fs.readFile(SDK_PATH, 'utf8', (err, js) => {
    if (err) return next(err);
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' }).send(js);
  });
});

router.get('/health', ah(async (req, res) => {
  await db.one('SELECT 1 AS ok');
  res.json({ status: 'ok', database: db.dialect, time: new Date().toISOString() });
}));

export default router;
