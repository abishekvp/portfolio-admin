/** Shared by the CLI scripts: which account they work on (`--user=<username>`, default: the oldest). */
import { db } from '../db/index.js';

export async function targetAccount(username) {
  const row = typeof username === 'string' && username
    ? await db.one('SELECT id, username FROM pm_users WHERE LOWER(username) = LOWER(?)', [username])
    : await db.one('SELECT id, username FROM pm_users ORDER BY id LIMIT 1');
  if (!row) {
    console.error(username
      ? `No account named "${username}".`
      : 'No accounts yet. Create one first: npm run create-admin -- <username> <password>');
    await db.close();
    process.exit(1);
  }
  console.log(`Account: ${row.username} (#${row.id})`);
  return row;
}
