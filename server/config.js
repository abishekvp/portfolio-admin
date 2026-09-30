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
  databaseUrl: process.env.DATABASE_URL || '',
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
  sessionDays: Number(process.env.SESSION_DAYS) || 14,

  // First-run bootstrap. Either set both, or use the /setup screen (guarded by SETUP_TOKEN in production).
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  setupToken: process.env.SETUP_TOKEN || '',

  // 32+ byte secret used to encrypt vault entries (AES-256-GCM). The vault is disabled without it.
  vaultKey: process.env.VAULT_KEY || '',

  // Images at or below this size are inlined (base64) in the public bundle so the SDK can keep them in sessionStorage.
  inlineMediaMaxBytes: Number(process.env.INLINE_MEDIA_MAX_BYTES) || 350 * 1024,
};
