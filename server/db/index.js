/**
 * Tiny database adapter over PostgreSQL (`pg`) or embedded SQLite (`node:sqlite`).
 * SQL is written once with `?` placeholders; booleans are stored as 0/1 integers,
 * JSON as text and timestamps as ISO-8601 text so the same queries run on both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { migrate } from './schema.js';

export let db = null;

function normalizeParams(params = []) {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Uint8Array || v === null) return v;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function toBuffer(value) {
  if (value == null || Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return value;
}

async function createPg() {
  const pg = (await import('pg')).default;
  // COUNT/SUM (int8) and AVG (numeric) come back as strings by default.
  pg.types.setTypeParser(20, (v) => parseInt(v, 10));
  pg.types.setTypeParser(1700, (v) => parseFloat(v));

  let ssl;
  if (config.databaseSsl === 'no-verify') ssl = { rejectUnauthorized: false };
  else if (config.databaseSsl === 'true') ssl = true;
  else if (config.databaseSsl === 'false') ssl = false;

  const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl, max: 10, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));

  const wrap = (runner) => ({
    dialect: 'pg',
    async all(sql, params) {
      const res = await runner.query(toPgSql(sql), normalizeParams(params));
      return res.rows;
    },
    async one(sql, params) {
      const res = await runner.query(toPgSql(sql), normalizeParams(params));
      return res.rows[0] ?? null;
    },
    async run(sql, params) {
      const res = await runner.query(toPgSql(sql), normalizeParams(params));
      return { changes: res.rowCount ?? 0, rows: res.rows };
    },
    async exec(sql) {
      await runner.query(sql);
    },
  });

  const api = wrap(pool);
  api.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrap(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  api.close = () => pool.end();
  api.toBuffer = toBuffer;
  return api;
}

async function createSqlite() {
  // Silence the one-time ExperimentalWarning emitted by node:sqlite.
  const origEmit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : origEmit.call(process, w, ...rest));
  const { DatabaseSync } = await import('node:sqlite');
  process.emitWarning = origEmit;

  if (config.sqlitePath !== ':memory:') fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  const conn = new DatabaseSync(config.sqlitePath);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = conn.prepare(sql);
      if (cache.size > 500) cache.clear();
      cache.set(sql, s);
    }
    return s;
  };
  const plain = (row) => (row ? { ...row } : row);

  // Serialise transactions: statements are synchronous, but a transaction callback may await.
  let chain = Promise.resolve();

  const api = {
    dialect: 'sqlite',
    async all(sql, params) {
      return stmt(sql).all(...normalizeParams(params)).map(plain);
    },
    async one(sql, params) {
      const rows = stmt(sql).all(...normalizeParams(params));
      return rows.length ? plain(rows[0]) : null;
    },
    async run(sql, params) {
      if (/\breturning\b/i.test(sql)) {
        const rows = stmt(sql).all(...normalizeParams(params)).map(plain);
        return { changes: rows.length, rows };
      }
      const res = stmt(sql).run(...normalizeParams(params));
      return { changes: Number(res.changes), rows: [] };
    },
    async exec(sql) {
      conn.exec(sql);
    },
    tx(fn) {
      const run = async () => {
        conn.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(api);
          conn.exec('COMMIT');
          return result;
        } catch (err) {
          try { conn.exec('ROLLBACK'); } catch { /* already rolled back */ }
          throw err;
        }
      };
      const next = chain.then(run, run);
      chain = next.catch(() => {});
      return next;
    },
    close: () => conn.close(),
    toBuffer,
  };
  return api;
}

export async function initDb() {
  db = config.databaseUrl ? await createPg() : await createSqlite();
  await migrate(db);
  return db;
}
