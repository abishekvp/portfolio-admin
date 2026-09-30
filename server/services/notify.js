import { getSetting } from './settings.js';

/**
 * Fire-and-forget webhook for new submissions. The payload carries both `text` (Slack)
 * and `content` (Discord) so either kind of incoming webhook works.
 */
export async function notify(title, lines) {
  try {
    const { notify_webhook_url: url } = await getSetting('submissions');
    if (!url || !/^https:\/\//i.test(url)) return;
    const text = `**${title}**\n${lines.filter(Boolean).join('\n')}`.slice(0, 1900);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.warn('[notify] webhook failed:', err.message);
  }
}
