import { useState } from 'react';
import { Ban, Copy, ShieldCheck } from 'lucide-react';
import { api, copyText } from '../lib/api.js';
import { Badge, IconButton, useConfirm, useFetch, useToast } from './ui.jsx';

/**
 * Blocked IPs (Spam & limits) for the signed-in account. Blocked visitors cannot send messages
 * or testimonials, cannot use download links, and are left out of analytics.
 */
export function useIpRules() {
  const { data, setData } = useFetch('/api/admin/ip-rules');
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = new Set(data?.blocked || []);

  // Visitor IPs are stored normalised (IPv6 by /64), which is also the form the server blocks.
  const isBlocked = (ip) => Boolean(ip) && (blocked.has(ip) || blocked.has(ip.replace(/^::ffff:/, '')));

  async function toggle(ip) {
    const unblock = isBlocked(ip);
    if (!unblock) {
      const ok = await confirm({
        title: `Block ${ip}?`,
        message: 'This IP will not be able to send messages or testimonials or use your download links, and its visits are left out of analytics. You can unblock it at any time.',
        confirmLabel: 'Block IP',
      });
      if (!ok) return;
    }
    try {
      const r = await api.post('/api/admin/ip-rules', { ip, action: unblock ? 'unblock' : 'block' });
      setData({ blocked: r.blocked });
      toast.success(unblock ? `${r.ip} unblocked` : `${r.ip} blocked`);
    } catch (err) {
      toast.error(err);
    }
  }

  return { isBlocked, toggle, loaded: Boolean(data) };
}

/** An IP address with copy and block/unblock actions. */
export function IpAddress({ ip, rules, compact }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!ip || ip === 'unknown') return <span className="muted">—</span>;
  const blocked = rules?.isBlocked(ip);
  return (
    <span className="ip-address">
      <span className="mono">{ip}</span>
      {blocked && <Badge tone="danger">Blocked</Badge>}
      {!compact && <IconButton icon={Copy} label="Copy IP" size={13} onClick={async () => (await copyText(ip)) && toast.success('IP copied')} />}
      {rules?.loaded && (
        <IconButton
          icon={blocked ? ShieldCheck : Ban}
          label={blocked ? 'Unblock this IP' : 'Block this IP'}
          variant={blocked ? 'ghost' : 'danger'}
          size={13}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await rules.toggle(ip);
            setBusy(false);
          }}
        />
      )}
    </span>
  );
}

/** 'Chrome · Windows' from a user-agent string (same rules as the server's analytics). */
export function describeUserAgent(ua = '') {
  const s = ua.toLowerCase();
  if (!s) return '';
  const browser = /edg\//.test(s) ? 'Edge' : /opr\/|opera/.test(s) ? 'Opera' : /samsungbrowser/.test(s) ? 'Samsung'
    : /chrome|crios|chromium/.test(s) ? 'Chrome' : /firefox|fxios/.test(s) ? 'Firefox' : /safari/.test(s) ? 'Safari'
    : /curl|wget|python|node|axios|postman|insomnia/.test(s) ? 'Script' : 'Other';
  const os = /windows/.test(s) ? 'Windows' : /android/.test(s) ? 'Android' : /iphone|ipad|ipod/.test(s) ? 'iOS'
    : /mac os|macintosh/.test(s) ? 'macOS' : /cros/.test(s) ? 'ChromeOS' : /linux/.test(s) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
}
