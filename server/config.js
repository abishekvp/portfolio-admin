import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = (value, fallback) =>
  value == null || value === '' ? fallback : /^(1|true|yes|on)$/i.test(String(value).trim());

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function parseTrustProxy(value, isProd) {
  if (value == null || value === '') return isProd ? 1 : 'loopback';
  if (/^\d+$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return list(value);
}

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

export const config = {
  env,
  isProd,
  port: Number(process.env.PORT) || 4000,

  // Database: PostgreSQL when DATABASE_URL is set, otherwise an embedded SQLite file.
  // Vercel storage integrations may expose the direct URL as POSTGRES_URL (DATABASE_URL can be a
  // prisma+postgres:// proxy URL that plain Postgres drivers cannot use), so take the first postgres:// one.
  databaseUrl:
    [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.POSTGRES_URL_NON_POOLING]
      .find((u) => /^postgres(ql)?:\/\//i.test(u || '')) || '',
  databaseSsl: (process.env.DATABASE_SSL || '').toLowerCase(), // '', 'true', 'false', 'no-verify'
  sqlitePath: process.env.SQLITE_PATH || path.join(ROOT_DIR, 'data', 'portfolio.db'),

  // Day boundaries for the submission limits and analytics buckets.
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, isProd),
  // Origins allowed to call the public API ('*' = any). Admin routes are always same-origin.
  corsOrigins: list(process.env.CORS_ORIGINS || '*'),
  // Absolute base used for media URLs in the public bundle. Derived from the request when empty.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),

  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),

  // First-run bootstrap. Either set both, or use the /setup screen (guarded by SETUP_TOKEN in production).
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  setupToken: process.env.SETUP_TOKEN || '',

  // Serverless (Vercel): no background timers, no writable disk, 4.5 MB request/response cap.
  isServerless: Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
  // Largest accepted upload. Vercel rejects request bodies above 4.5 MB before they reach the app.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || (process.env.VERCEL ? 4 * 1024 * 1024 : 15 * 1024 * 1024),
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  cronSecret: process.env.CRON_SECRET || '',

  // Images at or below this size are inlined (base64) in the public bundle so the SDK can keep them in sessionStorage.
  inlineMediaMaxBytes: Number(process.env.INLINE_MEDIA_MAX_BYTES) || 350 * 1024,
  // Total inline budget per bundle (keeps it under sessionStorage quotas and Vercel's response cap).
  inlineMediaTotalBytes: Number(process.env.INLINE_MEDIA_TOTAL_BYTES) || 2.5 * 1024 * 1024,
};
