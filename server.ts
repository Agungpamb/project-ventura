import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for CSV responses (5-minute TTL) to make repeated loads instantaneous (<10ms)
const csvCache = new Map<string, { text: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // CORS headers for all API routes
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // High-performance, server-side CSV proxy that avoids browser CORS redirect issues and proxy timeouts
  app.get('/api/proxy-csv', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Invalid URL protocol' });
      }

      // Check in-memory cache first
      const cached = csvCache.get(targetUrl);
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Cache', 'HIT');
        return res.send(cached.text);
      }

      // Fetch upstream using Node native fetch (automatically follows 307/302 redirects)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,text/plain,*/*'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Upstream returned status ${response.status}: ${response.statusText}`
        });
      }

      const csvText = await response.text();

      // Ensure response is not an HTML error or login page
      if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
        return res.status(422).json({
          error: 'Spreadsheet returned HTML instead of CSV. Ensure it is published to web as CSV.'
        });
      }

      // Store in memory cache
      csvCache.set(targetUrl, {
        text: csvText,
        expiresAt: now + CACHE_TTL_MS
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=180');
      res.setHeader('X-Cache', 'MISS');
      return res.send(csvText);
    } catch (err: any) {
      console.error('[CSV Proxy Error]', err?.message || err);
      return res.status(500).json({
        error: `Failed to fetch CSV: ${err?.message || 'Network error'}`
      });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Project Ventura Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
