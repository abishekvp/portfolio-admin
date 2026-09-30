import { config } from '../config.js';
import { HttpError } from './validate.js';

/** Wrap an async route handler (Express 5 forwards rejections, this just keeps call sites tidy). */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const clientIp = (req) => req.ip || req.socket?.remoteAddress || '';

export function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}

/** CORS for the public API: any configured origin (or '*'), no credentials. */
export function publicCors(req, res, next) {
  const origin = req.get('origin');
  const allowAll = config.corsOrigins.includes('*');
  if (origin && (allowAll || config.corsOrigins.includes(origin))) {
    res.set('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    if (!allowAll) res.vary('Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.get('access-control-request-headers') || 'Content-Type, Accept, X-Requested-With');
    res.set('Access-Control-Expose-Headers', 'X-Content-Version, Retry-After, ETag');
    res.set('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.vary('Access-Control-Request-Headers');
    return res.sendStatus(204);
  }
  next();
}

export function notFound(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'The upload is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body.';
  } else if (err.name === 'MulterError') {
    status = 400;
  }
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (config.isProd) message = 'Internal server error';
  }
  if (res.headersSent) return;
  res.status(status).json({ status: 'error', message, errors: err.details || undefined });
}
