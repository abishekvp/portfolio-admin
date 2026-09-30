/**
 * Backup / restore from the command line (no request-size limits, unlike Vercel functions).
 *   npm run backup  -- [file.json] [--no-messages] [--no-media]
 *   npm run restore -- file.json
 * Uses DATABASE_URL (or the local SQLite file) from the environment / .env.
 */
import fs from 'node:fs';
import { initDb, db } from '../db/index.js';
import { restoreBackup, writeBackup } from '../services/backup.js';

const [mode, ...rest] = process.argv.slice(2);
const file = rest.find((a) => !a.startsWith('--'));
await initDb();

if (mode === 'restore') {
  if (!file) throw new Error('Usage: npm run restore -- <backup.json>');
  const stats = await restoreBackup(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log('Restored:', stats);
} else {
  const out = file || `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const stream = fs.createWriteStream(out);
  await writeBackup((chunk) => stream.write(chunk), { includeMessages: !rest.includes('--no-messages'), includeMedia: !rest.includes('--no-media') });
  await new Promise((resolve) => stream.end(resolve));
  console.log(`Backup written to ${out}`);
}
await db.close();
