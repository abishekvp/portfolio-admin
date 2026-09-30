import crypto from 'node:crypto';
import { resources } from '../resources.js';

const types = {
  pg: { ID: 'SERIAL PRIMARY KEY', BLOB: 'BYTEA' },
  sqlite: { ID: 'INTEGER PRIMARY KEY AUTOINCREMENT', BLOB: 'BLOB' },
};

// Tables that are not driven by a resource spec. Every account (pm_users row) owns its own
// portfolio: tenant tables carry a `user_id` column and every query is scoped by it.
const CORE_TABLES = `
CREATE TABLE IF NOT EXISTS pm_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS pm_users (
  id {{ID}},
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS pm_sessions (
  id {{ID}},
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES pm_users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pm_api_keys (
  id {{ID}},
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS pm_account_settings (
  id {{ID}},
  user_id INTEGER,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, key)
);

CREATE TABLE IF NOT EXISTS pm_media (
  id {{ID}},
  filename TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT NOT NULL,
  alt TEXT,
  source TEXT NOT NULL DEFAULT 'admin',
  data {{BLOB}} NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pm_daily_limits (
  id {{ID}},
  user_id INTEGER,
  kind TEXT NOT NULL,
  key_type TEXT NOT NULL,
  key_value TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  UNIQUE (user_id, kind, key_type, key_value, day)
);

CREATE TABLE IF NOT EXISTS pm_visitor_sessions (
  id {{ID}},
  user_id INTEGER,
  session_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  referrer TEXT,
  landing_path TEXT,
  day TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS pm_analytics_events (
  id {{ID}},
  session_id TEXT,
  event_type TEXT NOT NULL,
  path TEXT,
  referrer TEXT,
  title TEXT,
  extra TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pm_login_failures (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pm_activity (
  id {{ID}},
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);
`;

// Columns added to core tables after their first release (applied to old and new databases alike).
const CORE_COLUMNS = {
  pm_users: {
    email: 'TEXT',
    is_admin: 'INTEGER NOT NULL DEFAULT 0',
    disabled: 'INTEGER NOT NULL DEFAULT 0',
    content_version: 'TEXT',
  },
  pm_media: { user_id: 'INTEGER' },
  pm_analytics_events: { user_id: 'INTEGER' },
  pm_visitor_sessions: { country: 'TEXT', location: 'TEXT', origin: 'TEXT' },
  pm_activity: { ip: 'TEXT', user_agent: 'TEXT', location: 'TEXT' },
};

/** Every table holding one account's data (used to claim legacy rows and to delete an account). */
export const TENANT_TABLES = [
  ...Object.values(resources).map((s) => s.table),
  'pm_media', 'pm_account_settings', 'pm_daily_limits', 'pm_visitor_sessions',
  'pm_analytics_events', 'pm_activity', 'pm_api_keys',
];

const columnType = (def) => (['bool', 'int', 'media'].includes(def.type) ? 'INTEGER' : 'TEXT');

function columnDefault(def) {
  if (def.type === 'bool') return ` DEFAULT ${def.default ? 1 : 0}`;
  if (def.type === 'int' && def.default != null) return ` DEFAULT ${Number(def.default)}`;
  return '';
}

function resourceTableSql(spec) {
  const cols = Object.entries(spec.fields).map(([name, def]) => `  ${name} ${columnType(def)}${columnDefault(def)}`);
  return `CREATE TABLE IF NOT EXISTS ${spec.table} (
  id {{ID}},
  user_id INTEGER,
${cols.join(',\n')},
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;
}

async function existingColumns(db, table) {
  if (db.dialect === 'pg') {
    const rows = await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?', [table]);
    return new Set(rows.map((r) => r.name));
  }
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

async function tableExists(db, table) {
  const row = db.dialect === 'pg'
    ? await db.one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?', [table])
    : await db.one("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  return Boolean(row);
}

const EXTRA_INDEXES = [
  ...Object.values(resources).map((s) => `CREATE INDEX IF NOT EXISTS idx_${s.table}_user ON ${s.table} (user_id)`),
  'DROP INDEX IF EXISTS idx_pm_testimonials_status',
  'CREATE INDEX IF NOT EXISTS idx_pm_testimonials_user_status ON pm_testimonials (user_id, status)',
  'DROP INDEX IF EXISTS idx_pm_messages_created',
  'CREATE INDEX IF NOT EXISTS idx_pm_messages_user_created ON pm_messages (user_id, created_at)',
  'DROP INDEX IF EXISTS idx_pm_sessions_day',
  'DROP INDEX IF EXISTS idx_pm_custom_key',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_custom_user_key ON pm_custom_content (user_id, group_key, key)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_users_email ON pm_users (email)',
  'CREATE INDEX IF NOT EXISTS idx_pm_api_keys_user ON pm_api_keys (user_id)',
  'DROP INDEX IF EXISTS idx_pm_media_sha',
  'CREATE INDEX IF NOT EXISTS idx_pm_media_user_sha ON pm_media (user_id, sha256)',
  'DROP INDEX IF EXISTS idx_pm_events_day',
  'CREATE INDEX IF NOT EXISTS idx_pm_events_user_day ON pm_analytics_events (user_id, day, event_type)',
  'CREATE INDEX IF NOT EXISTS idx_pm_events_session ON pm_analytics_events (session_id)',
  'CREATE INDEX IF NOT EXISTS idx_pm_visitors_user_day ON pm_visitor_sessions (user_id, day)',
  'CREATE INDEX IF NOT EXISTS idx_pm_limits_day ON pm_daily_limits (day)',
  'CREATE INDEX IF NOT EXISTS idx_pm_activity_user ON pm_activity (user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_pm_account_settings_user ON pm_account_settings (user_id)',
];

// Fingerprint of the whole schema: when it matches the stored one, migrations are skipped
// (keeps serverless cold starts fast).
const SCHEMA_HASH = crypto
  .createHash('sha1')
  .update(CORE_TABLES + JSON.stringify(CORE_COLUMNS) + JSON.stringify(Object.values(resources).map((s) => [s.table, s.fields])) + EXTRA_INDEXES.join())
  .digest('hex');

/**
 * Single-tenant databases (before accounts owned their data) kept settings, submission limits
 * and visitor sessions in tables whose unique keys had no user_id. Copy them into the per-account
 * tables and drop the old ones. The rows go to the oldest account, or stay unowned (user_id NULL)
 * until the first account is created (see claimOrphans).
 */
async function migrateLegacyTables(t, owner) {
  const uid = owner == null ? 'NULL' : Number(owner);
  if (await tableExists(t, 'pm_settings')) {
    await t.exec(`INSERT INTO pm_account_settings (user_id, key, value, updated_at) SELECT ${uid}, key, value, updated_at FROM pm_settings`);
    await t.exec('DROP TABLE pm_settings');
  }
  if (await tableExists(t, 'pm_submission_limits')) {
    await t.exec(
      `INSERT INTO pm_daily_limits (user_id, kind, key_type, key_value, day, count, blocked, first_at, last_at)
       SELECT ${uid}, kind, key_type, key_value, day, count, blocked, first_at, last_at FROM pm_submission_limits`
    );
    await t.exec('DROP TABLE pm_submission_limits');
  }
  if (await tableExists(t, 'pm_analytics_sessions')) {
    await t.exec(
      `INSERT INTO pm_visitor_sessions (user_id, session_id, ip, user_agent, device_type, browser, os, referrer, landing_path, day, first_seen, last_seen, duration_seconds)
       SELECT ${uid}, session_id, ip, user_agent, device_type, browser, os, referrer, landing_path, day, first_seen, last_seen, duration_seconds FROM pm_analytics_sessions`
    );
    await t.exec('DROP TABLE pm_analytics_sessions');
  }
  await t.exec("DELETE FROM pm_meta WHERE key = 'content_version'");
}

/** Give every unowned row (legacy single-tenant data) to `userId`. */
export async function claimOrphans(runner, userId) {
  let claimed = 0;
  for (const table of TENANT_TABLES) {
    claimed += (await runner.run(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`, [userId])).changes;
  }
  return claimed;
}

async function migrateSchema(t) {
  const fill = (sql) => sql.replace(/\{\{(\w+)\}\}/g, (_, k) => types[t.dialect][k]);

  for (const statement of fill(CORE_TABLES).split(';').map((s) => s.trim()).filter(Boolean)) {
    await t.exec(statement);
  }
  for (const [table, columns] of Object.entries(CORE_COLUMNS)) {
    const cols = await existingColumns(t, table);
    for (const [name, type] of Object.entries(columns)) {
      if (!cols.has(name)) await t.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }

  for (const spec of Object.values(resources)) {
    await t.exec(fill(resourceTableSql(spec)));
    // Additive migrations: new fields in a spec become new columns.
    const cols = await existingColumns(t, spec.table);
    if (!cols.has('user_id')) await t.exec(`ALTER TABLE ${spec.table} ADD COLUMN user_id INTEGER`);
    for (const [name, def] of Object.entries(spec.fields)) {
      if (!cols.has(name)) {
        await t.exec(`ALTER TABLE ${spec.table} ADD COLUMN ${name} ${columnType(def)}${columnDefault(def)}`);
      }
    }
  }

  const owner = (await t.one('SELECT MIN(id) AS id FROM pm_users'))?.id ?? null;
  await migrateLegacyTables(t, owner);
  if (owner != null) {
    await claimOrphans(t, owner);
    // The original single admin becomes the platform admin.
    if (!(await t.one('SELECT id FROM pm_users WHERE is_admin = 1'))) {
      await t.run('UPDATE pm_users SET is_admin = 1 WHERE id = ?', [owner]);
    }
  }
  // Accounts from before API keys existed get one (same format as services/apikeys.js).
  for (const { id } of await t.all('SELECT id FROM pm_users WHERE id NOT IN (SELECT user_id FROM pm_api_keys)')) {
    await t.run('INSERT INTO pm_api_keys (user_id, name, token, created_at) VALUES (?, ?, ?, ?)', [
      id, 'Default', `pk_${crypto.randomBytes(24).toString('base64url')}`, new Date().toISOString(),
    ]);
  }
  for (const sql of EXTRA_INDEXES) await t.exec(sql);
}

export async function migrate(db) {
  try {
    const row = await db.one("SELECT value FROM pm_meta WHERE key = 'schema_hash'");
    if (row?.value === SCHEMA_HASH) return;
  } catch {
    /* first run: pm_meta does not exist yet */
  }

  // One transaction (and, on Postgres, an advisory lock) so concurrent cold starts cannot
  // run the migration twice or see it half-applied.
  await db.tx(async (t) => {
    if (t.dialect === 'pg') await t.one('SELECT pg_advisory_xact_lock(727274) AS locked');
    if (await tableExists(t, 'pm_meta')) {
      const row = await t.one("SELECT value FROM pm_meta WHERE key = 'schema_hash'");
      if (row?.value === SCHEMA_HASH) return;
    }
    await migrateSchema(t);
    await t.run(
      "INSERT INTO pm_meta (key, value) VALUES ('schema_hash', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [SCHEMA_HASH]
    );
  });
}
