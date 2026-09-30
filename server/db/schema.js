import { resources } from '../resources.js';

const types = {
  pg: { ID: 'SERIAL PRIMARY KEY', BLOB: 'BYTEA' },
  sqlite: { ID: 'INTEGER PRIMARY KEY AUTOINCREMENT', BLOB: 'BLOB' },
};

// Tables that are not driven by a resource spec.
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

CREATE TABLE IF NOT EXISTS pm_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS pm_submission_limits (
  id {{ID}},
  kind TEXT NOT NULL,
  key_type TEXT NOT NULL,
  key_value TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  UNIQUE (kind, key_type, key_value, day)
);

CREATE TABLE IF NOT EXISTS pm_analytics_sessions (
  id {{ID}},
  session_id TEXT NOT NULL UNIQUE,
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
  duration_seconds INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS pm_vault (
  id {{ID}},
  title TEXT NOT NULL,
  category TEXT,
  url TEXT,
  secret TEXT NOT NULL,
  attachment {{BLOB}},
  attachment_name TEXT,
  attachment_mime TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_pm_events_day ON pm_analytics_events (day, event_type);
CREATE INDEX IF NOT EXISTS idx_pm_events_session ON pm_analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_pm_sessions_day ON pm_analytics_sessions (day);
CREATE INDEX IF NOT EXISTS idx_pm_limits_day ON pm_submission_limits (day);
CREATE INDEX IF NOT EXISTS idx_pm_activity_created ON pm_activity (created_at);
CREATE INDEX IF NOT EXISTS idx_pm_media_sha ON pm_media (sha256);
`;

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
${cols.join(',\n')},
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;
}

async function existingColumns(db, table) {
  if (db.dialect === 'pg') {
    const rows = await db.all('SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?', [table]);
    return new Set(rows.map((r) => r.name));
  }
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

export async function migrate(db) {
  const t = types[db.dialect];
  const fill = (sql) => sql.replace(/\{\{(\w+)\}\}/g, (_, k) => t[k]);

  for (const statement of fill(CORE_TABLES).split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(statement);
  }

  for (const spec of Object.values(resources)) {
    await db.exec(fill(resourceTableSql(spec)));
    // Additive migrations: new fields in a spec become new columns.
    const cols = await existingColumns(db, spec.table);
    for (const [name, def] of Object.entries(spec.fields)) {
      if (!cols.has(name)) {
        await db.exec(`ALTER TABLE ${spec.table} ADD COLUMN ${name} ${columnType(def)}${columnDefault(def)}`);
      }
    }
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_pm_testimonials_status ON pm_testimonials (status)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_pm_messages_created ON pm_messages (created_at)');
}
