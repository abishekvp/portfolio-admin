/**
 * Populate an empty database with the current portfolio content.
 *   npm run seed            -> only seeds collections/settings that are still empty
 *   npm run seed -- --force -> replaces all portfolio content (messages & testimonials are kept)
 *   --avatar=<path>  --resume=<path>  optional files to import (defaults look in ../abishek.in)
 *   --user=<username>  account to seed (default: the oldest account)
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config.js';
import { initDb, db } from '../db/index.js';
import { resources } from '../resources.js';
import { createItem } from '../services/collections.js';
import { getSetting, setSetting } from '../services/settings.js';
import { storeMedia } from '../services/media.js';
import * as content from '../seed/content.js';
import { applyCustomPreset } from '../seed/custom-presets.js';
import { targetAccount } from './account.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const force = Boolean(args.force);
const siteDir = fs.existsSync(path.resolve(ROOT_DIR, '..', 'abishek.in'))
  ? path.resolve(ROOT_DIR, '..', 'abishek.in')
  : path.resolve(ROOT_DIR, '..', 'abishek');

await initDb();
const { id: uid } = await targetAccount(args.user);

async function isEmpty(table) {
  return Number((await db.one(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [uid])).n) === 0;
}

async function importFile(filePath, opts) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const media = await storeMedia(uid, fs.readFileSync(filePath), { filename: path.basename(filePath), ...opts });
  return media.id;
}

for (const name of ['contacts', 'experience', 'education', 'skills', 'projects', 'mentorship', 'events', 'achievements']) {
  const spec = resources[name];
  if (!spec || !content[name]) continue;
  if (force) await db.run(`DELETE FROM ${spec.table} WHERE user_id = ?`, [uid]);
  if (!(await isEmpty(spec.table))) {
    console.log(`- ${name}: already has data, skipped`);
    continue;
  }
  for (const raw of content[name]) {
    const item = { ...raw };
    if (item._image_file) {
      const imgPath = path.join(siteDir, 'src', 'assets', 'img', 'events', item._image_file);
      const imageId = await importFile(imgPath, { accept: 'image', alt: item.title });
      if (imageId) item.image_id = imageId;
      delete item._image_file;
    }
    await createItem(uid, spec, item);
  }
  console.log(`✓ ${name}: ${content[name].length} items`);
}

for (const [key, value] of Object.entries(content.settings)) {
  const exists = await db.one('SELECT key FROM pm_account_settings WHERE user_id = ? AND key = ?', [uid, key]);
  if (exists && !force) {
    console.log(`- settings.${key}: already set, skipped`);
    continue;
  }
  await setSetting(uid, key, value, { partial: true });
  console.log(`✓ settings.${key}`);
}

const profile = await getSetting(uid, 'profile');
if (!profile.photo_id || force) {
  const id = await importFile(args.avatar || path.join(siteDir, 'src', 'assets', 'img', 'abi.jpg'), { accept: 'image', preset: 'avatar', alt: profile.full_name });
  if (id) {
    await setSetting(uid, 'profile', { photo_id: id });
    console.log(`✓ photo imported (media #${id})`);
  }
}
if (!profile.resume_id || force) {
  const id = await importFile(args.resume || path.join(siteDir, 'public', 'resume.pdf'), { accept: 'document' });
  if (id) {
    await setSetting(uid, 'profile', { resume_id: id });
    console.log(`✓ resume imported (media #${id})`);
  }
}

if (force) {
  await db.run('DELETE FROM pm_custom_content WHERE user_id = ?', [uid]);
}
const preset = await applyCustomPreset(uid, 'abishek-portfolio', { overwrite: force });
console.log(`✓ custom content preset: ${preset.added} added, ${preset.updated} updated`);

console.log('Seed complete.');
await db.close();
