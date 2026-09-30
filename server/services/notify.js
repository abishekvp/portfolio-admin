import dns from 'node:dns/promises';
import net from 'node:net';
import { getSetting } from './settings.js';

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(ip) {
  let s = String(ip || '').toLowerCase();
  if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
  if (net.isIPv4(s)) {
    const [a, b] = s.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(s)) return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
  return true;
}

/**
 * Fire-and-forget webhook for new submissions. The payload carries both `text` (Slack)
 * and `content` (Discord) so either kind of incoming webhook works. Accounts choose the URL,
 * so only public https hosts are called (no requests into the server's own network).
 */
export async function notify(uid, title, lines) {
  try {
    const { notify_webhook_url: url } = await getSetting(uid, 'submissions');
    if (!url || !/^https:\/\//i.test(url)) return;
    const { hostname } = new URL(url);
    const addresses = await dns.lookup(hostname.replace(/^\[|\]$/g, ''), { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      console.warn(`[notify] skipped webhook to non-public host ${hostname}`);
      return;
    }
    const text = `**${title}**\n${lines.filter(Boolean).join('\n')}`.slice(0, 1900);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      redirect: 'error',
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.warn('[notify] webhook failed:', err.message);
  }
}
