/**
 * Monolithic server: JSON API + portfolio SDK + the built React admin (client/dist),
 * all from one Node process on one port.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config, ROOT_DIR } from './config.js';
import { initDb } from './db/index.js';
import { errorHandler, notFound } from './lib/http.js';
import publicRoutes from './routes/public.js';
import authRoutes, { loadUser } from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { scheduleDailyPurge } from './services/limits.js';
import { createUser, purgeExpiredSessions, userCount } from './services/auth.js';
import { getSetting } from './services/settings.js';
import { purgeAnalytics } from './services/analytics.js';

export async function createApp() {
  await initDb();

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
  app.use(loadUser);

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', notFound);

  // React admin (built with `npm run build`).
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

async function bootstrapAdmin() {
  if (config.adminUsername && config.adminPassword && (await userCount()) === 0) {
    await createUser(config.adminUsername, config.adminPassword);
    console.log(`[setup] created admin user "${config.adminUsername}" from ADMIN_USERNAME/ADMIN_PASSWORD`);
  }
}

async function housekeeping() {
  try {
    await purgeExpiredSessions();
    const { retention_days } = await getSetting('analytics');
    if (retention_days > 0) await purgeAnalytics(retention_days);
  } catch (err) {
    console.error('[housekeeping]', err.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT_DIR, 'server', 'index.js')) {
  const app = await createApp();
  await bootstrapAdmin();
  await scheduleDailyPurge();
  await housekeeping();
  setInterval(housekeeping, 6 * 3600_000).unref();

  const server = app.listen(config.port, () => {
    console.log(`Portfolio admin running on http://localhost:${config.port} (${config.env}, db: ${config.databaseUrl ? 'postgres' : 'sqlite'}, tz: ${config.timezone})`);
    if (!config.vaultKey) console.log('[vault] VAULT_KEY not set — the vault is locked.');
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
