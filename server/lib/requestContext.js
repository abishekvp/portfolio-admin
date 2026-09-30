/**
 * Where a request came from: IP, user agent and (on Vercel) the approximate location.
 * Kept in AsyncLocalStorage so the activity log can record it without every caller passing `req`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { clientIp } from './http.js';

const store = new AsyncLocalStorage();

function header(req, name) {
  const v = req.get(name);
  if (!v) return '';
  try {
    return decodeURIComponent(v).slice(0, 80);
  } catch {
    return v.slice(0, 80);
  }
}

/**
 * Vercel sets x-vercel-ip-* on every request and overwrites any client-sent value. Elsewhere
 * these headers could be forged by the client, so they are only read on Vercel.
 */
export function requestSource(req) {
  const onVercel = Boolean(process.env.VERCEL);
  const city = onVercel ? header(req, 'x-vercel-ip-city') : '';
  const region = onVercel ? header(req, 'x-vercel-ip-country-region') : '';
  const country = onVercel ? header(req, 'x-vercel-ip-country') : '';
  return {
    ip: clientIp(req),
    user_agent: String(req.get('user-agent') || '').slice(0, 500),
    country,
    location: [city, region, country].filter(Boolean).join(', '),
    origin: String(req.get('origin') || '').slice(0, 200),
  };
}

export function requestContextMiddleware(req, res, next) {
  store.run(requestSource(req), next);
}

/** Source of the request being handled, or null outside a request (CLI scripts, cron). */
export const currentSource = () => store.getStore() || null;
