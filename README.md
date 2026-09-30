# Portfolio Admin (Node.js + React)

A portfolio content manager with an Express API, a React admin (built with Vite) and an embeddable SDK. It runs on **Vercel** (the static admin plus one serverless function on the same domain) or as **one long-running Node server** (`npm start`).

```
portfolio-admin/
├── api/index.js       Vercel serverless entry → the Express app
├── server/            Express API, SDK, database layer (PostgreSQL, or SQLite locally)
│   ├── index.js       createApp() + `npm start` server
│   ├── resources.js   content collections (schema + validation + public shape)
│   ├── services/      settings, media, limits, analytics, bundle, auth, hooks, backup
│   ├── routes/        public.js (portfolio API), auth.js, admin.js
│   ├── sdk/portfolio_manager.js   script embedded on portfolio sites
│   └── seed/, scripts/            seed data, presets, CLI tools
├── client/            React admin → client/dist
└── vercel.json
```

## Content model

| Area | What lives there |
|---|---|
| **Content** | Personal data only. **Profile** covers name, headline, *about summary*, location, availability, email, phone, photo and resume PDF. **Contacts** covers email, phone, WhatsApp, LinkedIn, GitHub and more; links are generated automatically. The rest are **Experience, Education, Skills, Projects, Achievements** and **Testimonials**. |
| **Custom content** | Anything template-specific, such as hero taglines, badges, highlight cards and button labels. You define groups and fields yourself (text, long text, number, on/off, link, image, list, *list of items with your own fields*, or JSON). The site reads them as `data.custom.<group>.<key>` and keeps its own built-in defaults for anything not defined. **Presets** add a theme's full set of keys in one click. |
| **Notes** | Private notes with tags, colours and pinning. Never public. |

The design stays in the portfolio's code. The admin only provides data, plus whatever overrides you choose to put in Custom content.

## Local development

```bash
npm install
cp .env.example .env     # no DATABASE_URL → local SQLite file in ./data
npm run seed             # imports the current abishek.in content, photo, resume and theme preset
npm run dev              # API on :4000 + Vite admin on :5173
```

Other modes: `npm run build && npm start` (single server on :4000), or `npm test`.

## Deploying on Vercel

1. **Database:** create a Postgres database (Vercel Postgres/Neon, Prisma Postgres, Supabase, etc.) and copy its connection string. Serverless functions have no persistent disk, so SQLite is local-only.
2. **Import the project in Vercel** with `portfolio-admin/` as the *Root Directory*. `vercel.json` sets everything else:
   - Build `npm run build`; output `client/dist` is served from the CDN.
   - `/api/*` goes to the Express function (`api/index.js`), and everything else to the admin app.
   - A daily cron at 18:30 UTC (midnight IST) runs `/api/cron/daily`.
3. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Postgres connection string (add `?sslmode=require` if your provider needs it) |
   | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | First admin, created on first request when no users exist (or use `SETUP_TOKEN` + the setup screen) |
   | `CRON_SECRET` | Long random string; Vercel Cron sends it automatically |
   | `APP_TIMEZONE` | Day boundary for the once-a-day limits (default `Asia/Kolkata`) |
   | `CORS_ORIGINS` | Default `*`: any website, on any domain, can use the public API |

4. **Custom domain:** add `admin.abishek.in` in Vercel. Then set `VITE_ADMIN_URL` in the portfolio (`abishek/.env.production`) to that URL.
5. **Seed production (optional):** run locally with `DATABASE_URL=<prod url> npm run seed`. To import the old Django data: `DJANGO_DATABASE_URL=… DATABASE_URL=<prod url> npm run import:django`.

**Serverless-specific behaviour:**
- **No caches that can go stale.** Settings and the content version are read from the database on each request. The public bundle is cached per content version, so a warm instance never serves outdated content.
- **Fast cold starts.** Migrations run only when the schema changes (a stored schema hash).
- **Shared state lives in the database:** login throttling, sessions and submission limits. Limits from previous days are cleared by the daily cron, and also automatically by the first submission of a new day.
- **Uploads are capped at 4 MB** because Vercel's request limit is 4.5 MB. The admin shrinks large photos in the browser before uploading. For backups larger than that, use the CLI: `DATABASE_URL=… npm run backup` / `npm run restore -- file.json`.
- Functions run in your project's default region. Put the database in the same region for the lowest latency. The API itself is public to any origin (CORS `*`), and media plus the SDK are CDN-cacheable.

## How a portfolio site uses it

```html
<script src="https://admin.abishek.in/api/portfolio_manager.js" async></script>
```

The SDK loads `/api/portfolio?inline=1`: one bundle with profile, contacts, all collections, approved testimonials, `custom`, and SEO. Small images come as base64. It keeps everything, images included, in **sessionStorage**:
- Later page loads in the tab session render instantly.
- The data is revalidated in the background with `?since=<version>`.
- Events: `portfolio:data` and `PortfolioManager.onData(cb)`.

The SDK also handles `<form data-abishek-contact>` and `<form data-abishek-testimonial>`. For the testimonial form, the photo is scaled down in the browser and sent as a base64 string. The server decodes it, checks the real file type, converts it to WebP, strips metadata and stores the binary in the database.

## Once-per-day submissions

Contact messages and testimonials are each limited per day, **per email and per IP** (default 1; configurable under *Spam & limits*):
- Gmail dots and `+tags` are normalised.
- The check and the insert happen in one transaction.
- Blocked visitors get HTTP 429 with a friendly message and `Retry-After`.
- Entries clear at midnight in `APP_TIMEZONE`.
- The admin can unblock someone for today.
- Honeypot fields and email/domain/IP block lists are included too.

## API summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/portfolio?inline=1&since=<v>` | Public bundle |
| POST | `/api/messages/send` | Contact message |
| POST | `/api/testimonials/submit` | Testimonial (JSON with base64 `photo`, or multipart) |
| POST | `/api/analytics/collect` | Analytics event (`text/plain` JSON, beacon-friendly) |
| GET | `/api/media/:id/:name` | Binary media (immutable cache) |
| GET | `/api/resume` | Latest resume PDF |
| GET | `/api/portfolio_manager.js` | SDK |
| GET | `/api/cron/daily` | Maintenance (Bearer `CRON_SECRET`) |
| * | `/api/auth/*`, `/api/admin/*` | Admin API (session cookie + `X-Requested-With: portfolio-admin`) |

Session length is configurable in **Account → Security** (1–365 days). `SESSION_DAYS` is only the initial default.
