/**
 * Binary media store. Uploads arrive either as multipart files or as base64 data-URI
 * strings; both are decoded to a Buffer, sniffed by magic bytes (never trusting the
 * client's MIME type), re-encoded with sharp (auto-orient, resize, strip EXIF/GPS)
 * and stored in pm_media.data.
 */
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { HttpError } from '../lib/validate.js';
import { nowIso } from '../lib/time.js';

let sharp = null;
try {
  sharp = (await import('sharp')).default;
  sharp.cache(false);
} catch (err) {
  console.warn('[media] sharp unavailable, images will be stored without re-encoding:', err.message);
}

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const DOC_MIMES = ['application/pdf'];

export function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.subarray(4, 12).toString('ascii') === 'ftypavif' || buf.subarray(4, 12).toString('ascii') === 'ftypavis') return 'image/avif';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

/** Decode 'data:image/png;base64,....' or bare base64 into a Buffer. */
export function decodeDataUri(input, maxBytes) {
  if (typeof input !== 'string' || !input) return null;
  const match = /^data:([\w/+.-]+)?(;[\w-]+=[\w-]+)*;base64,/i.exec(input);
  const b64 = match ? input.slice(match[0].length) : input;
  if (!/^[A-Za-z0-9+/=\s_-]+$/.test(b64.slice(0, 200))) throw new HttpError(400, 'Image must be a base64 data URI');
  if ((b64.length * 3) / 4 > maxBytes * 1.02) throw new HttpError(413, `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
  return Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const PRESETS = {
  default: { width: 1600, height: 1600, fit: 'inside', quality: 82 },
  avatar: { width: 512, height: 512, fit: 'cover', quality: 82 },
  photo: { width: 320, height: 320, fit: 'cover', quality: 80 }, // public testimonial photos
  logo: { width: 400, height: 400, fit: 'inside', quality: 85 },
  original: null,
};

async function processImage(buffer, mime, presetName = 'default') {
  const preset = PRESETS[presetName] ?? PRESETS.default;
  if (!sharp || !preset) {
    return { data: buffer, mime, width: null, height: null };
  }
  try {
    const animated = mime === 'image/gif' || mime === 'image/webp';
    const img = sharp(buffer, { animated, limitInputPixels: 40_000_000 }).rotate();
    const { data, info } = await img
      .resize({ width: preset.width, height: preset.height, fit: preset.fit, withoutEnlargement: true })
      .webp({ quality: preset.quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: 'image/webp', width: info.width, height: info.pageHeight || info.height };
  } catch (err) {
    throw new HttpError(400, 'The image could not be processed. Please upload a valid JPG, PNG, WebP or GIF file.');
  }
}

/**
 * Store a file. `accept` limits the allowed kinds ('image' | 'document' | 'any').
 * Returns the media row without binary data.
 */
export async function storeMedia(buffer, { filename = '', accept = 'any', preset = 'default', source = 'admin', alt = '' } = {}) {
  if (!buffer || !buffer.length) throw new HttpError(400, 'Empty file');
  const sniffed = sniffMime(buffer);
  const isImage = IMAGE_MIMES.includes(sniffed);
  const isDoc = DOC_MIMES.includes(sniffed);
  if (!sniffed || (accept === 'image' && !isImage) || (accept === 'document' && !isDoc) || (!isImage && !isDoc)) {
    throw new HttpError(415, accept === 'image' ? 'Only JPG, PNG, WebP, GIF or AVIF images are allowed' : 'Unsupported file type (images or PDF only)');
  }

  const processed = isImage ? await processImage(buffer, sniffed, preset) : { data: buffer, mime: sniffed, width: null, height: null };
  const sha256 = crypto.createHash('sha256').update(processed.data).digest('hex');

  // De-duplicate identical uploads.
  const existing = await db.one('SELECT id, filename, mime, size, width, height, sha256, alt, source, created_at FROM pm_media WHERE sha256 = ?', [sha256]);
  if (existing) return existing;

  let name = String(filename || '').replace(/[^\w.\- ]+/g, '').trim().slice(0, 120) || (isImage ? 'image' : 'document');
  if (processed.mime === 'image/webp') name = name.replace(/\.[a-z0-9]+$/i, '') + '.webp';
  else if (isDoc && !/\.pdf$/i.test(name)) name += '.pdf';

  const { rows } = await db.run(
    `INSERT INTO pm_media (filename, mime, size, width, height, sha256, alt, source, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, filename, mime, size, width, height, sha256, alt, source, created_at`,
    [name, processed.mime, processed.data.length, processed.width, processed.height, sha256, String(alt).slice(0, 300), source, processed.data, nowIso()]
  );
  return rows[0];
}

export async function getMediaMeta(ids) {
  const list = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (!list.length) return new Map();
  const rows = await db.all(
    `SELECT id, filename, mime, size, width, height, sha256 FROM pm_media WHERE id IN (${list.map(() => '?').join(',')})`,
    list
  );
  return new Map(rows.map((r) => [Number(r.id), r]));
}

export async function getMediaData(ids) {
  const list = [...new Set(ids)];
  if (!list.length) return new Map();
  const rows = await db.all(`SELECT id, mime, data FROM pm_media WHERE id IN (${list.map(() => '?').join(',')})`, list);
  return new Map(rows.map((r) => [Number(r.id), { mime: r.mime, data: db.toBuffer(r.data) }]));
}

export const mediaPath = (row) => `/api/media/${row.id}/${encodeURIComponent(row.filename || 'file')}`;
