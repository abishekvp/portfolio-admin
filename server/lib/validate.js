export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);

/** Allow http(s), mailto:, tel:, protocol-relative-free relative paths and #anchors. Rejects javascript: etc. */
export function isSafeUrl(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return true;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return !/\s/.test(s.replace(/^mailto:[^?]*/i, ''));
  if (s.startsWith('#')) return true;
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  return false;
}

const clean = (v) => String(v ?? '').replace(/\u0000/g, '').trim();

function coerce(name, def, value, errors) {
  switch (def.type) {
    case 'string':
    case 'text': {
      const s = clean(value);
      if (s.length > def.max) errors[name] = `Must be at most ${def.max} characters`;
      return s;
    }
    case 'url': {
      const s = clean(value);
      if (s.length > def.max) errors[name] = 'URL is too long';
      else if (!isSafeUrl(s)) errors[name] = 'Enter a valid http(s), mailto: or tel: link';
      return s;
    }
    case 'email': {
      const s = clean(value).toLowerCase();
      if (s && !isEmail(s)) errors[name] = 'Enter a valid email address';
      return s;
    }
    case 'enum': {
      const s = clean(value);
      if (!def.options.includes(s)) errors[name] = `Must be one of: ${def.options.join(', ')}`;
      return s;
    }
    case 'bool':
      return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
    case 'int': {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n)) {
        errors[name] = 'Must be a number';
        return def.default ?? 0;
      }
      return Math.min(def.max ?? n, Math.max(def.min ?? n, n));
    }
    case 'media': {
      if (value === null || value === '' || value === undefined) return null;
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0) errors[name] = 'Invalid media reference';
      return n;
    }
    case 'list': {
      let arr = value;
      if (typeof arr === 'string') arr = arr.split(/\r?\n|,/);
      if (!Array.isArray(arr)) arr = [];
      arr = arr.map(clean).filter(Boolean);
      if (arr.length > def.maxItems) errors[name] = `At most ${def.maxItems} items`;
      if (def.itemMax && arr.some((x) => x.length > def.itemMax)) errors[name] = `Each item must be at most ${def.itemMax} characters`;
      return arr;
    }
    case 'json':
      return value ?? null;
    default:
      return value;
  }
}

/**
 * Validate an input object against a spec. With `partial`, only provided keys are touched.
 * Returns a plain object of column -> JS value (lists/json still as JS values).
 */
export function validateInput(spec, input, { partial = false, allowReadonly = false } = {}) {
  const out = {};
  const errors = {};
  const body = input && typeof input === 'object' ? input : {};

  for (const [name, def] of Object.entries(spec.fields)) {
    if (def.readonly && !allowReadonly) continue;
    const provided = Object.prototype.hasOwnProperty.call(body, name);
    if (!provided) {
      if (partial) continue;
      out[name] = def.default ?? (def.type === 'media' ? null : def.type === 'list' ? [] : def.type === 'bool' ? false : '');
    } else {
      out[name] = coerce(name, def, body[name], errors);
    }
    if (def.required && (out[name] === '' || out[name] == null)) errors[name] = 'This field is required';
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors);
  return out;
}

/** Convert a DB row to API JSON according to the spec. */
export function rowToJson(spec, row) {
  if (!row) return null;
  const out = { id: row.id };
  for (const [name, def] of Object.entries(spec.fields)) {
    const v = row[name];
    if (def.type === 'bool') out[name] = v === 1 || v === true || v === '1';
    else if (def.type === 'list' || def.type === 'json') {
      try {
        out[name] = v == null || v === '' ? def.default ?? null : JSON.parse(v);
      } catch {
        out[name] = def.default ?? null;
      }
    } else if (def.type === 'int' || def.type === 'media') out[name] = v == null ? null : Number(v);
    else out[name] = v ?? '';
  }
  out.sort_order = Number(row.sort_order) || 0;
  out.created_at = row.created_at;
  out.updated_at = row.updated_at;
  return out;
}

/** Serialise validated values for SQL parameters. */
export function toDbValue(def, value) {
  if (def.type === 'list' || def.type === 'json') return JSON.stringify(value ?? def.default ?? null);
  if (def.type === 'bool') return value ? 1 : 0;
  return value;
}
