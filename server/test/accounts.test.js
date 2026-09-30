/**
 * Accounts end to end over HTTP: sign-up, API keys, and that one account can never read or
 * change another account's portfolio (content, media, messages, analytics, backups).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Never touch the database from .env (production): in-memory SQLite, development mode.
// TEST_DATABASE_URL runs the same tests on an empty, throwaway Postgres database instead.
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL || '', POSTGRES_URL: '', POSTGRES_URL_NON_POOLING: '', SQLITE_PATH: ':memory:',
  NODE_ENV: 'test', PUBLIC_URL: '', SETUP_TOKEN: '', ADMIN_USERNAME: '', ADMIN_PASSWORD: '', DEFAULT_SITE: '',
  SIGNUP_ENABLED: 'true', ACCOUNT_STORAGE_MB: '50',
});

let server;
let base;
let sharp;

before(async () => {
  const { createApp } = await import('../index.js');
  sharp = (await import('sharp')).default;
  const app = await createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  const { db } = await import('../db/index.js');
  await db.close();
});

/** Minimal browser: keeps the session cookie and sends the admin CSRF header. */
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const headers = { 'X-Requested-With': 'portfolio-admin', Accept: 'application/json' };
    let payload = body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
  };
}

const pub = async (path, init) => {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch { /* binary */ }
  return { status: res.status, data, res };
};

async function pngUpload(c, color) {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'pic.png');
  const r = await c.post('/api/admin/media?preset=original&accept=image', fd);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

const alice = client();
const bob = client();
const ctx = {};

test('first sign-up becomes the platform admin, later ones are regular accounts', async () => {
  assert.equal((await alice.get('/api/auth/status')).data.needs_setup, true);
  assert.equal((await alice.post('/api/auth/signup', { username: 'alice', email: 'Alice@Example.com', password: 'alice-password-1' })).status, 201);
  assert.equal((await bob.post('/api/auth/signup', { username: 'bob', email: 'bob@example.com', password: 'bob-password-12' })).status, 201);

  const a = (await alice.get('/api/auth/status')).data;
  const b = (await bob.get('/api/auth/status')).data;
  assert.equal(a.user.is_admin, true);
  assert.equal(a.user.email, 'alice@example.com');
  assert.equal(b.user.is_admin, false);
  assert.equal(b.needs_setup, false);

  const dup = await client().post('/api/auth/signup', { username: 'ALICE', password: 'whatever-password' });
  assert.equal(dup.status, 409);
  const dupMail = await client().post('/api/auth/signup', { username: 'carol', email: 'bob@EXAMPLE.com', password: 'whatever-password' });
  assert.equal(dupMail.status, 409);

  // login works with the email too
  const again = client();
  assert.equal((await again.post('/api/auth/login', { username: 'BOB@example.com', password: 'bob-password-12' })).status, 200);
});

test('every account gets its own API key', async () => {
  const ka = (await alice.get('/api/admin/keys')).data.items;
  const kb = (await bob.get('/api/admin/keys')).data.items;
  assert.equal(ka.length, 1);
  assert.equal(kb.length, 1);
  assert.match(ka[0].token, /^pk_[\w-]{20,}$/);
  assert.notEqual(ka[0].token, kb[0].token);
  ctx.aliceKey = ka[0].token;
  ctx.bobKey = kb[0].token;
  ctx.bobKeyId = kb[0].id;
});

test('content is separate per account and the bundle is picked by key', async () => {
  const ap = await alice.post('/api/admin/c/projects', { title: 'Alice project' });
  const bp = await bob.post('/api/admin/c/projects', { title: 'Bob project' });
  assert.equal(ap.status, 201);
  assert.equal(bp.status, 201);
  ctx.aliceProjectId = ap.data.id;
  await bob.put('/api/admin/settings/profile', { full_name: 'Bob Builder', headline: 'Builds things' });

  const listA = (await alice.get('/api/admin/c/projects')).data.items.map((p) => p.title);
  const listB = (await bob.get('/api/admin/c/projects')).data.items.map((p) => p.title);
  assert.deepEqual(listA, ['Alice project']);
  assert.deepEqual(listB, ['Bob project']);

  const bundleA = await pub(`/api/portfolio?key=${ctx.aliceKey}`);
  const bundleB = await pub('/api/portfolio', { headers: { 'X-Portfolio-Key': ctx.bobKey } });
  const bundleB2 = await pub('/api/portfolio', { headers: { Authorization: `Bearer ${ctx.bobKey}` } });
  assert.deepEqual(bundleA.data.data.projects.map((p) => p.title), ['Alice project']);
  assert.deepEqual(bundleB.data.data.projects.map((p) => p.title), ['Bob project']);
  assert.equal(bundleB.data.data.profile.full_name, 'Bob Builder');
  assert.equal(bundleB2.data.data.profile.full_name, 'Bob Builder');

  // No key: the default site (oldest account) keeps legacy embeds working.
  const legacy = await pub('/api/portfolio');
  assert.deepEqual(legacy.data.data.projects.map((p) => p.title), ['Alice project']);

  assert.equal((await pub('/api/portfolio?key=pk_not_a_real_key_000000000000')).status, 401);
});

test("an account cannot read or change another account's items", async () => {
  const id = ctx.aliceProjectId;
  assert.equal((await bob.get(`/api/admin/c/projects/${id}`)).status, 404);
  assert.equal((await bob.patch(`/api/admin/c/projects/${id}`, { title: 'hacked' })).status, 404);
  assert.equal((await bob.del(`/api/admin/c/projects/${id}`)).status, 404);
  assert.equal((await bob.post('/api/admin/c/projects/bulk', { action: 'delete', ids: [id] })).data.affected, 0);
  await bob.post('/api/admin/c/projects/reorder', { ids: [id] });
  assert.equal((await alice.get(`/api/admin/c/projects/${id}`)).data.title, 'Alice project');
});

test('media is private to its account and served from unguessable URLs', async () => {
  const media = await pngUpload(alice, '#ff0000');
  ctx.aliceMedia = media;
  assert.match(media.url, new RegExp(`^/api/media/${media.id}/[0-9a-f]{16}/`));
  assert.equal((await pub(media.url)).status, 200);
  // wrong hash / legacy id-only URL of the default site
  assert.equal((await pub(`/api/media/${media.id}/0000000000000000/pic.webp`)).status, 404);
  assert.equal((await pub(`/api/media/${media.id}/pic.webp`)).status, 200);

  // Bob points his profile photo at Alice's media id: it must not resolve.
  await bob.put('/api/admin/settings/profile', { full_name: 'Bob Builder', photo_id: media.id });
  const bundle = await pub(`/api/portfolio?key=${ctx.bobKey}&inline=1`);
  assert.equal(bundle.data.data.profile.photo_url, '');
  assert.deepEqual(bundle.data.media, {});
  assert.equal((await bob.get('/api/admin/media')).data.items.length, 0);
  assert.equal((await bob.del(`/api/admin/media/${media.id}`)).status, 404);

  // Bob's own upload: identical bytes are still stored separately (per-account de-duplication).
  const own = await pngUpload(bob, '#ff0000');
  assert.notEqual(own.id, media.id);
  assert.equal((await pub(`/api/media/${own.id}/pic.webp`)).status, 404); // legacy URLs: default site only
});

test('visitor submissions and analytics go to the account of the key', async () => {
  const sent = await pub(`/api/messages/send?key=${ctx.bobKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.org', message: 'Hello Bob, nice portfolio!' }),
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal((await bob.get('/api/admin/c/messages')).data.total, 1);
  assert.equal((await alice.get('/api/admin/c/messages')).data.total, 0);
  // daily limit is per portfolio: the same visitor can still write to Alice
  const toAlice = await pub(`/api/messages/send?key=${ctx.aliceKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.org', message: 'Hello Alice, nice portfolio!' }),
  });
  assert.equal(toAlice.status, 201);

  const ev = await pub(`/api/analytics/collect?key=${ctx.bobKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' },
    body: JSON.stringify({ session_id: 'sid_test_1', event_type: 'pageview', path: '/' }),
  });
  assert.equal(ev.status, 202);
  assert.equal((await bob.get('/api/admin/analytics')).data.views.total, 1);
  assert.equal((await alice.get('/api/admin/analytics')).data.views.total, 0);
});

test('keys can be rotated and revoked', async () => {
  const rolled = (await bob.post(`/api/admin/keys/${ctx.bobKeyId}/roll`)).data;
  assert.notEqual(rolled.token, ctx.bobKey);
  assert.equal((await pub(`/api/portfolio?key=${ctx.bobKey}`)).status, 401);
  assert.equal((await pub(`/api/portfolio?key=${rolled.token}`)).status, 200);
  ctx.bobKey = rolled.token;

  const extra = (await bob.post('/api/admin/keys', { name: 'Staging site' })).data;
  assert.equal(extra.name, 'Staging site');
  assert.equal((await alice.del(`/api/admin/keys/${extra.id}`)).status, 404); // not Alice's key
  assert.equal((await bob.del(`/api/admin/keys/${extra.id}`)).status, 200);
  assert.equal((await pub(`/api/portfolio?key=${extra.token}`)).status, 401);
});

test('a backup restored into another account gets fresh ids and remapped media', async () => {
  await alice.put('/api/admin/settings/profile', { full_name: 'Alice A', photo_id: ctx.aliceMedia.id });
  const backup = (await alice.get('/api/admin/backup')).data;
  assert.equal(backup.format, 'portfolio-admin-backup');
  assert.equal(backup.media.length, 1);

  const carol = client();
  await carol.post('/api/auth/signup', { username: 'carol', password: 'carol-password-1' });
  const r = await carol.post('/api/admin/backup/restore', backup);
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const carolProjects = (await carol.get('/api/admin/c/projects')).data.items;
  assert.deepEqual(carolProjects.map((p) => p.title), ['Alice project']);
  assert.notEqual(carolProjects[0].id, ctx.aliceProjectId);
  const carolMedia = (await carol.get('/api/admin/media')).data.items;
  assert.equal(carolMedia.length, 1);
  assert.notEqual(carolMedia[0].id, ctx.aliceMedia.id);
  const profile = (await carol.get('/api/admin/settings/profile')).data;
  assert.equal(profile.photo_id, carolMedia[0].id);

  // Alice is untouched.
  assert.equal((await alice.get(`/api/admin/c/projects/${ctx.aliceProjectId}`)).status, 200);
  assert.equal((await alice.get('/api/admin/media')).data.items.length, 1);
  ctx.carol = carol;
});

test('platform admins manage accounts; others cannot', async () => {
  assert.equal((await bob.get('/api/platform/accounts')).status, 403);
  const list = (await alice.get('/api/platform/accounts')).data.items;
  assert.deepEqual(list.map((u) => u.username), ['alice', 'bob', 'carol']);
  const bobRow = list.find((u) => u.username === 'bob');

  assert.equal((await alice.patch(`/api/platform/accounts/${bobRow.id}`, { disabled: true })).status, 200);
  assert.equal((await pub(`/api/portfolio?key=${ctx.bobKey}`)).status, 403);
  assert.equal((await bob.get('/api/admin/overview')).status, 401); // signed out everywhere
  assert.equal((await client().post('/api/auth/login', { username: 'bob', password: 'bob-password-12' })).status, 403);

  assert.equal((await alice.del(`/api/platform/accounts/${bobRow.id}`)).status, 200);
  const after = (await alice.get('/api/platform/accounts')).data.items.map((u) => u.username);
  assert.deepEqual(after, ['alice', 'carol']);
  const { db } = await import('../db/index.js');
  for (const table of ['pm_projects', 'pm_messages', 'pm_media', 'pm_api_keys', 'pm_analytics_events', 'pm_account_settings']) {
    assert.equal(Number((await db.one(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [bobRow.id])).n), 0, table);
  }
});

test('an account can delete itself (password required)', async () => {
  const carol = ctx.carol;
  assert.equal((await carol.post('/api/auth/delete-account', { password: 'wrong' })).status, 400);
  assert.equal((await carol.post('/api/auth/delete-account', { password: 'carol-password-1' })).status, 200);
  assert.equal((await carol.get('/api/admin/overview')).status, 401);
  // the last platform admin cannot delete themselves while other accounts exist
  await client().post('/api/auth/signup', { username: 'dave', password: 'dave-password-1' });
  assert.equal((await alice.post('/api/auth/delete-account', { password: 'alice-password-1' })).status, 409);
});
