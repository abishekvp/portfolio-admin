// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json) and
// handled by the same Express app used by `npm start`.
import { createApp } from '../server/index.js';

export default async function handler(req, res) {
  try {
    const app = await createApp();
    return app(req, res);
  } catch (err) {
    console.error('[startup]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'error', message: 'Server failed to start. Check DATABASE_URL and the function logs.' }));
  }
}
