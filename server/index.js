/**
 * The application. Two ways to run it:
 *  - `npm start`: one long-running Node process serving the API, the SDK and the built
 *    React admin (client/dist) on one port — any VPS, Docker, Render, Railway...
 *  - Vercel: api/index.js hands every /api/* request to the same Express app as a
 *    serverless function, and Vercel serves client/dist as static files (see vercel.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config, ROOT_DIR } from './config.js';
import { initDb } from './db/index.js';
import { ah, errorHandler, notFound } from './lib/http.js';
import { requestContextMiddleware } from './lib/requestContext.js';
import { HttpError } from './lib/validate.js';
import publicRoutes from './routes/public.js';
import authRoutes, { loadUser } from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import platformRoutes from './routes/platform.js';
import { purgeExpired, scheduleDailyPurge } from './services/limits.js';
import { createUser, purgeExpiredSessions, purgeLoginFailures, userCount } from './services/auth.js';
import { getSetting } from './services/settings.js';
import { db } from './db/index.js';
import { purgeAnalytics } from './services/analytics.js';

async function bootstrapAdmin() {
  if (!config.adminUsername || !config.adminPassword || (await userCount()) > 0) return;
  try {
    await createUser(config.adminUsername, config.adminPassword, '', { isAdmin: true });
    console.log(`[setup] created admin user "${config.adminUsername}" from ADMIN_USERNAME/ADMIN_PASSWORD`);
  } catch (err) {
    // e.g. password shorter than 10 characters — keep serving so the setup screen can explain.
    console.error(`[setup] could not create admin from ADMIN_USERNAME/ADMIN_PASSWORD: ${err.message}`);
  }
}

/** Daily maintenance: expired submission limits, sessions, login throttles, old analytics. */
export async function housekeeping() {
  const result = { limits: await purgeExpired() };
  await purgeExpiredSessions();
  await purgeLoginFailures();
  // Analytics retention is chosen per account.
  result.analytics = { events: 0, sessions: 0 };
  for (const { id } of await db.all('SELECT id FROM pm_users')) {
    const { retention_days } = await getSetting(id, 'analytics');
    if (retention_days > 0) {
      const r = await purgeAnalytics(id, retention_days);
      result.analytics.events += r.events;
      result.analytics.sessions += r.sessions;
    }
  }
  return result;
}

function buildApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      // The portfolio (another origin) embeds media and the SDK from this server.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(requestContextMiddleware);

  // Vercel Cron (or any scheduler) calls this daily with `Authorization: Bearer $CRON_SECRET`.
  app.get('/api/cron/daily', ah(async (req, res) => {
    if (!config.cronSecret || req.get('authorization') !== `Bearer ${config.cronSecret}`) throw new HttpError(401, 'Unauthorized');
    res.json({ status: 'success', ...(await housekeeping()) });
  }));

  app.use(loadUser);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', notFound);

  // React admin (built with `npm run build`). On Vercel these files are served by the CDN instead.
  const dist = path.join(ROOT_DIR, 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) =>
      res.type('text').send('Admin UI not built yet. Run `npm run build` (or `npm run dev` for the Vite dev server on :5173).')
    );
  }

  app.use(errorHandler);
  return app;
}

let appPromise = null;

/** Initialise the database once per process (or serverless instance) and return the app. */
export function createApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await initDb();
      await bootstrapAdmin();
      return buildApp();
    })().catch((err) => {
      appPromise = null; // retry on the next request instead of caching the failure
      throw err;
    });
  }
  return appPromise;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, 'server', 'index.js')) {
  const app = await createApp();
  await scheduleDailyPurge();
  const runHousekeeping = () => housekeeping().catch((err) => console.error('[housekeeping]', err.message));
  await runHousekeeping();
  setInterval(runHousekeeping, 6 * 3600_000).unref();

  const server = app.listen(config.port, () => {
    console.log(`Portfolio admin running on http://localhost:${config.port} (${config.env}, db: ${config.databaseUrl ? 'postgres' : 'sqlite'}, tz: ${config.timezone})`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
