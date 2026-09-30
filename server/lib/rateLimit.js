import { HttpError } from './validate.js';
import { clientIp } from './http.js';

/** Small fixed-window, in-memory request limiter for burst protection. */
export function rateLimit({ windowMs, max, message = 'Too many requests. Please slow down.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = clientIp(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - entry.start)) / 1000)));
      return next(new HttpError(429, message));
    }
    next();
  };
}
