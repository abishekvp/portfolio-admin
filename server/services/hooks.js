/**
 * Per-collection normalisation that goes beyond field-level validation.
 * Each hook receives the validated values (merged over the current row on update)
 * and returns the values to store. Throw HttpError(400, msg, { field: msg }) to reject.
 */
import { db } from '../db/index.js';
import { CUSTOM_FIELD_TYPES, CUSTOM_TYPES } from '../resources.js';
import { HttpError, isSafeUrl } from '../lib/validate.js';

const SLUG = /^[a-z][a-z0-9_]{0,59}$/;
export const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'k_$1').slice(0, 60);

const fail = (field, message) => {
  throw new HttpError(400, 'Please fix the highlighted fields.', { [field]: message });
};

// ------------------------------------------------------------------ contacts

function contactLink(type, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  switch (type) {
    case 'email': return `mailto:${v}`;
    case 'phone': return `tel:${v.replace(/[^\d+]/g, '')}`;
    case 'whatsapp': return `https://wa.me/${v.replace(/\D/g, '')}`;
    case 'telegram': return `https://t.me/${v.replace(/^@/, '')}`;
    case 'location': return `https://maps.google.com/?q=${encodeURIComponent(v)}`;
    default: return /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v) ? `https://${v}` : '';
  }
}

async function contacts(values) {
  if (!values.link) values.link = contactLink(values.type, values.value);
  if (!isSafeUrl(values.link)) fail('link', 'Enter a valid link');
  return values;
}

// ------------------------------------------------------------------ custom content

function normalizeField(type, raw, field) {
  switch (type) {
    case 'text':
    case 'textarea': {
      const s = String(raw ?? '').replace(/\u0000/g, '');
      if (s.length > 20000) fail(field, 'Too long (max 20,000 characters)');
      return s;
    }
    case 'number': {
      if (raw === '' || raw == null) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) fail(field, 'Must be a number');
      return n;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'url': {
      const s = String(raw ?? '').trim();
      if (!isSafeUrl(s)) fail(field, 'Enter a valid http(s), mailto:, tel: or relative link');
      return s;
    }
    case 'image': {
      if (raw === '' || raw == null) return null;
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) fail(field, 'Invalid image');
      return n;
    }
    default:
      return raw;
  }
}

function normalizeSchema(schema) {
  if (!Array.isArray(schema) || !schema.length) fail('schema', 'Add at least one field for the item list');
  if (schema.length > 20) fail('schema', 'At most 20 fields');
  const seen = new Set();
  return schema.map((f, i) => {
    const name = slugify(f?.name || f?.label);
    if (!name) fail('schema', `Field ${i + 1} needs a name`);
    if (seen.has(name)) fail('schema', `Duplicate field name “${name}”`);
    seen.add(name);
    const type = CUSTOM_FIELD_TYPES.includes(f?.type) ? f.type : 'text';
    return { name, label: String(f?.label || name).slice(0, 80), type };
  });
}

export function normalizeCustomValue(type, value, schema) {
  switch (type) {
    case 'list': {
      const arr = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
      if (arr.length > 200) fail('value', 'At most 200 items');
      return arr.map((s) => String(s ?? '').trim()).filter(Boolean);
    }
    case 'items': {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length > 100) fail('value', 'At most 100 items');
      return arr.map((obj) => Object.fromEntries(schema.map((f) => [f.name, normalizeField(f.type, obj?.[f.name], 'value')])));
    }
    case 'json': {
      let v = value;
      if (typeof v === 'string') {
        try {
          v = v.trim() ? JSON.parse(v) : null;
        } catch {
          fail('value', 'Invalid JSON');
        }
      }
      if (JSON.stringify(v ?? null).length > 100_000) fail('value', 'JSON is too large (max 100 KB)');
      return v ?? null;
    }
    default:
      return normalizeField(type, value, 'value');
  }
}

async function customContent(values, current, provided) {
  values.group_key = slugify(values.group_key);
  values.key = slugify(values.key || values.label);
  if (!SLUG.test(values.group_key)) fail('group_key', 'Use letters, numbers and underscores, starting with a letter');
  if (!SLUG.test(values.key)) fail('key', 'Use letters, numbers and underscores, starting with a letter');
  if (!CUSTOM_TYPES.includes(values.type)) fail('type', 'Unknown type');
  values.schema = values.type === 'items' ? normalizeSchema(values.schema) : [];
  // Changing the type resets an incompatible value instead of failing.
  const resetValue = current && current.type !== values.type && !provided.has('value');
  values.value = normalizeCustomValue(values.type, resetValue ? null : values.value, values.schema);
  if (!values.label) values.label = values.key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  const clash = await db.one('SELECT id FROM pm_custom_content WHERE group_key = ? AND key = ? AND id <> ?', [values.group_key, values.key, current?.id ?? 0]);
  if (clash) fail('key', `“${values.group_key}.${values.key}” already exists`);
  return values;
}

export const hooks = {
  pm_contacts: contacts,
  pm_custom_content: customContent,
};

/** Media ids referenced by a custom content row (for usage tracking and the bundle). */
export function customMediaIds(row) {
  const ids = [];
  if (row.type === 'image' && Number.isInteger(row.value)) ids.push(row.value);
  if (row.type === 'items' && Array.isArray(row.value)) {
    const imageFields = (row.schema || []).filter((f) => f.type === 'image').map((f) => f.name);
    for (const item of row.value) for (const f of imageFields) if (Number.isInteger(item?.[f])) ids.push(item[f]);
  }
  return ids;
}
