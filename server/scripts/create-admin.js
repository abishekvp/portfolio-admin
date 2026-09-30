/**
 * Create an admin user or reset a password from the command line.
 *   npm run create-admin -- <username> <password>
 */
import { initDb, db } from '../db/index.js';
import { createUser, hashPassword, validatePassword } from '../services/auth.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-admin -- <username> <password>');
  process.exit(1);
}

await initDb();
const existing = await db.one('SELECT id FROM pm_users WHERE LOWER(username) = LOWER(?)', [username]);
try {
  if (existing) {
    validatePassword(password);
    await db.run('UPDATE pm_users SET password_hash = ? WHERE id = ?', [await hashPassword(password), existing.id]);
    await db.run('DELETE FROM pm_sessions WHERE user_id = ?', [existing.id]);
    console.log(`Password reset for "${username}" (all sessions signed out).`);
  } else {
    await createUser(username, password);
    console.log(`Admin user "${username}" created.`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
await db.close();
