import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.SQLITE_PATH = ':memory:';

const UID = 1; // account whose portfolio receives the submissions

let db, limits, validate, resources, time;
const settings = { per_email_daily: 1, per_ip_daily: 1 };

before(async () => {
  const dbm = await import('../db/index.js');
  await dbm.initDb();
  db = dbm.db;
  limits = await import('../services/limits.js');
  validate = await import('../lib/validate.js');
  resources = (await import('../resources.js')).resources;
  time = await import('../lib/time.js');
});

test('email normalisation groups aliases', () => {
  assert.equal(limits.normalizeEmail(' A.B+promo@GMail.com '), 'ab@gmail.com');
  assert.equal(limits.normalizeEmail('ab@googlemail.com'), 'ab@gmail.com');
  assert.equal(limits.normalizeEmail('first.last+x@example.com'), 'first.last@example.com');
});

test('IP normalisation', () => {
  assert.equal(limits.normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(limits.normalizeIp('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(limits.normalizeIp('2001:db8:1:2:bbbb::9'), '2001:db8:1:2::/64');
  assert.equal(limits.normalizeIp('::1'), '::1');
});

test('one message per email and per IP per day', async () => {
  const run = (identity) => limits.consumeAndRun(UID, 'message', identity, settings, async () => 'stored');
  assert.equal((await run({ email: 'x@example.com', ip: '198.51.100.1' })).ok, true);
  const sameEmail = await run({ email: 'X@example.com', ip: '198.51.100.2' });
  assert.equal(sameEmail.ok, false);
  assert.equal(sameEmail.reason, 'email');
  assert.ok(sameEmail.retryAfterSeconds > 0 && sameEmail.retryAfterSeconds <= 86400);
  const sameIp = await run({ email: 'y@example.com', ip: '198.51.100.1' });
  assert.equal(sameIp.ok, false);
  assert.equal(sameIp.reason, 'ip');
  // testimonials are limited independently of messages
  assert.equal((await limits.consumeAndRun(UID, 'testimonial', { email: 'x@example.com', ip: '198.51.100.1' }, settings, async () => 1)).ok, true);
  // pre-check agrees and records the blocked attempt
  assert.equal((await limits.checkLimit(UID, 'message', { email: 'x@example.com', ip: '203.0.113.50' }, settings)).ok, false);
  // another account's portfolio has its own limits
  assert.equal((await limits.consumeAndRun(UID + 1, 'message', { email: 'x@example.com', ip: '198.51.100.1' }, settings, async () => 1)).ok, true);
  assert.equal((await limits.listToday(UID + 1)).length, 2);
});

test('a failed write does not consume the slot', async () => {
  await assert.rejects(limits.consumeAndRun(UID, 'message', { email: 'z@example.com', ip: '192.0.2.9' }, settings, async () => {
    throw new Error('insert failed');
  }));
  assert.equal((await limits.consumeAndRun(UID, 'message', { email: 'z@example.com', ip: '192.0.2.9' }, settings, async () => 1)).ok, true);
});

test('entries from previous days are purged, so visitors can send again', async () => {
  await db.run("UPDATE pm_daily_limits SET day = '2000-01-01'");
  assert.ok((await limits.purgeExpired()) > 0);
  assert.equal((await db.all('SELECT * FROM pm_daily_limits')).length, 0);
  assert.equal((await limits.consumeAndRun(UID, 'message', { email: 'x@example.com', ip: '198.51.100.1' }, settings, async () => 1)).ok, true);
});

test('limits of 0 disable a key', async () => {
  const open = { per_email_daily: 0, per_ip_daily: 0 };
  for (let i = 0; i < 3; i++) {
    assert.equal((await limits.consumeAndRun(UID, 'message', { email: 'free@example.com', ip: '192.0.2.77' }, open, async () => 1)).ok, true);
  }
});

test('day keys and midnight countdown', () => {
  assert.match(time.dayKey(), /^\d{4}-\d{2}-\d{2}$/);
  const ms = time.msUntilNextDay(new Date('2026-01-01T18:29:00Z'), 'Asia/Kolkata'); // 23:59 IST
  assert.equal(ms, 60_000);
});

test('input validation rejects unsafe links and enforces required fields', () => {
  assert.throws(() => validate.validateInput(resources.projects, { title: 'x', demo_url: 'javascript:alert(1)' }), /fix the highlighted/);
  assert.throws(() => validate.validateInput(resources.projects, { title: '' }), /fix the highlighted/);
  const ok = validate.validateInput(resources.projects, { title: 'Ok', tags: 'a, b', github_url: 'https://github.com/x' });
  assert.deepEqual(ok.tags, ['a', 'b']);
  assert.equal(ok.visible, true);
});
