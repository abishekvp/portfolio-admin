/**
 * Import content from the previous Django admin (admin-abishek) database.
 *
 *   DJANGO_DATABASE_URL=postgres://... npm run import:django -- [--media=../admin-abishek/media] [--replace]
 *
 * Reads the Django tables (info_profile, info_experience, info_education, info_skill,
 * info_project, info_achievement, info_testimonial, info_contactmessage) read-only and
 * writes them into this app's database (DATABASE_URL or the SQLite file). Uploaded files
 * referenced by the old app (testimonial photos, resume) are read from --media and stored
 * as binary media. Without --replace, collections that already contain data are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT_DIR } from '../config.js';
import { initDb, db } from '../db/index.js';
import { resources } from '../resources.js';
import { createItem } from '../services/collections.js';
import { getSetting, setSetting } from '../services/settings.js';
import { storeMedia } from '../services/media.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const sourceUrl = process.env.DJANGO_DATABASE_URL || args.source;
if (!sourceUrl) {
  console.error('Set DJANGO_DATABASE_URL (the old Django DATABASE_URL) or pass --source=<url>.');
  process.exit(1);
}
const mediaDir = path.resolve(ROOT_DIR, args.media || '../admin-abishek/media');
const replace = Boolean(args.replace);

const source = new pg.Client({ connectionString: sourceUrl, ssl: /sslmode=require|neon|prisma|render/.test(sourceUrl) ? { rejectUnauthorized: false } : undefined });
await source.connect();
await initDb();

async function rows(table, order = 'id') {
  try {
    return (await source.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
  } catch (err) {
    console.warn(`- ${table}: not found (${err.message.split('\n')[0]})`);
    return [];
  }
}

async function importFile(rel, opts) {
  if (!rel) return null;
  const file = path.join(mediaDir, rel);
  if (!fs.existsSync(file)) {
    console.warn(`  ! missing file ${file}`);
    return null;
  }
  try {
    return (await storeMedia(fs.readFileSync(file), { filename: path.basename(rel), ...opts })).id;
  } catch (err) {
    console.warn(`  ! could not import ${rel}: ${err.message}`);
    return null;
  }
}

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const iso = (d) => (d ? new Date(d).toISOString() : new Date().toISOString());

async function importCollection(name, sourceRows, map) {
  const spec = resources[name];
  const existing = Number((await db.one(`SELECT COUNT(*) AS n FROM ${spec.table}`)).n);
  if (existing && !replace) {
    console.log(`- ${name}: already has ${existing} items, skipped (use --replace)`);
    return;
  }
  if (replace) await db.run(`DELETE FROM ${spec.table}`);
  let n = 0;
  for (const r of sourceRows) {
    const input = await map(r);
    const item = await createItem(spec, { ...input, sort_order: r.order ?? n }, { allowReadonly: true });
    if (r.created_at) await db.run(`UPDATE ${spec.table} SET created_at = ? WHERE id = ?`, [iso(r.created_at), item.id]);
    n++;
  }
  console.log(`✓ ${name}: ${n} imported`);
}

// Profile & contacts ---------------------------------------------------------
const [profile] = await rows('info_profile');
if (profile) {
  const current = await getSetting('profile');
  const resumeId = current.resume_id && !replace ? current.resume_id : await importFile(profile.resume_file, { accept: 'document' });
  await setSetting('profile', {
    full_name: profile.full_name,
    headline: profile.headline,
    summary: current.summary && !replace ? current.summary : profile.bio || '',
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    resume_url: profile.resume_url,
    resume_id: resumeId || current.resume_id,
  });
  console.log('✓ profile');

  const links = [
    ['email', 'Email', profile.email, ''],
    ['phone', 'Phone', profile.phone, ''],
    ['website', 'Website', profile.website_url, profile.website_url],
    ['github', 'GitHub', profile.github_url, profile.github_url],
    ['linkedin', 'LinkedIn', profile.linkedin_url, profile.linkedin_url],
    ['twitter', 'X / Twitter', profile.twitter_url, profile.twitter_url],
    ...(Array.isArray(profile.custom_links) ? profile.custom_links : []).map((l) => ['other', l.label, l.url, l.url]),
  ].filter(([, , value]) => value);
  await importCollection('contacts', links.map(([type, label, value, link], i) => ({ id: i, type, label, value, link })), (r) => r);
}

await importCollection('experience', await rows('info_experience', '"order", id'), (r) => ({
  job_title: r.job_title, company: r.company, company_url: r.organization_site || '', job_type: r.job_type || 'full_time',
  location: r.location, start_date: r.start_date, end_date: r.end_date, is_current: r.is_current,
  // The old app kept achievements as "•" bullet lines inside the description.
  description: String(r.description || '').split(/\n/)[0].trim(),
  achievements: String(r.description || '').split(/\n/).filter((l) => /^\s*[•\-*]/.test(l)).map((l) => l.replace(/^\s*[•\-*]\s*/, '')),
  technologies: list(r.technologies),
}));

await importCollection('education', await rows('info_education', '"order", id'), (r) => ({
  institution: r.institution, degree: r.degree, field_of_study: r.field_of_study, start_date: r.start_date, end_date: r.end_date, grade: r.grade, description: r.description,
}));

await importCollection('skills', await rows('info_skill', '"order", id'), (r) => ({
  name: r.name, category: r.category || 'Other', proficiency: r.proficiency ?? 80, icon: r.icon,
}));

await importCollection('projects', await rows('info_project', '"order", id'), (r) => ({
  title: r.title, description: r.description, tags: list(r.tech_stack), demo_url: r.demo_url, github_url: r.github_url, is_featured: r.is_featured,
}));

await importCollection('achievements', await rows('info_achievement', '"order", id'), (r) => ({
  title: r.title, description: r.description, issuer: r.issuer, link: r.link,
  date_label: r.timeperiod || [r.date, r.month, r.year].filter(Boolean).join(' '),
}));

await importCollection('testimonials', await rows('info_testimonial', 'id'), async (r) => ({
  name: r.name, role: r.role, company: r.company, content: r.content, rating: r.rating || 5, email: r.client_email || '',
  photo_url: /^https?:\/\//.test(r.photo_url || '') ? r.photo_url : '',
  photo_id: await importFile(r.photo, { accept: 'image', preset: 'photo', source: 'website' }),
  status: r.is_approved ? 'approved' : 'pending', source: 'website',
}));

await importCollection('messages', await rows('info_contactmessage', 'id'), (r) => ({
  name: r.name, email: r.email, subject: r.subject, phone: r.phone, message: r.message, is_read: r.is_read, ip: r.ip_address || '',
}));

await source.end();
await db.close();
console.log('Import finished.');
