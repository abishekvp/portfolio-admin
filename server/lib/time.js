import { config } from '../config.js';

const dayFormatters = new Map();
const clockFormatters = new Map();

function dayFormatter(tz) {
  if (!dayFormatters.has(tz)) {
    dayFormatters.set(
      tz,
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }
  return dayFormatters.get(tz);
}

function clockFormatter(tz) {
  if (!clockFormatters.has(tz)) {
    clockFormatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  }
  return clockFormatters.get(tz);
}

/** 'YYYY-MM-DD' for the given instant in the app timezone. */
export function dayKey(date = new Date(), tz = config.timezone) {
  return dayFormatter(tz).format(date);
}

/** Milliseconds until the next local midnight in the app timezone. */
export function msUntilNextDay(date = new Date(), tz = config.timezone) {
  const parts = Object.fromEntries(clockFormatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  const elapsed = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + date.getMilliseconds();
  return Math.max(1000, 86_400_000 - elapsed);
}

/** Day keys for the last `count` days, oldest first, ending today. */
export function lastDays(count, tz = config.timezone) {
  const out = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) out.push(dayKey(new Date(now - i * 86_400_000), tz));
  return [...new Set(out)];
}

export const nowIso = () => new Date().toISOString();

export function formatDuration(seconds) {
  seconds = Math.round(Number(seconds) || 0);
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
