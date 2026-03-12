import { createServer, type Server } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { type AddressInfo } from 'node:net';

import { chromium, type Browser } from '@playwright/test';

const DIST_DIR = join(process.cwd(), 'dist-landing');
const LANDING_BASE = process.env.LANDING_BASE ?? '/';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

function startStaticServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const rawPath = req.url?.split('?')[0] ?? '/';
      const stripped = rawPath.startsWith(LANDING_BASE)
        ? '/' + rawPath.slice(LANDING_BASE.length)
        : rawPath;
      let filePath: string;

      if (stripped === '/' || stripped === '/index.html') {
        filePath = join(DIST_DIR, 'landing', 'index.html');
      } else {
        filePath = join(DIST_DIR, stripped);
      }

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, port });
    });
  });
}

async function prerender() {
  const landingHtml = join(DIST_DIR, 'landing', 'index.html');
  if (!existsSync(landingHtml)) {
    throw new Error(`[prerender] Build output not found: ${landingHtml}`);
  }

  console.log('[prerender] Starting static server...');
  const { server, port } = await startStaticServer();
  console.log(`[prerender] Server listening on port ${port}`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('pageerror', (err) => console.error(`[browser] error: ${err.message}`));

    await page.goto(`http://localhost:${port}${LANDING_BASE}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app > *', { timeout: 30_000 });

    const appHtml = await page.evaluate(() => {
      return document.getElementById('app')?.innerHTML ?? '';
    });

    if (!appHtml) {
      throw new Error('[prerender] Failed to capture rendered HTML — #app was empty');
    }

    console.log(`[prerender] Captured ${appHtml.length} chars of rendered HTML`);

    const htmlPaths = [join(DIST_DIR, 'landing', 'index.html'), join(DIST_DIR, 'index.html')];

    for (const htmlPath of htmlPaths) {
      try {
        const html = readFileSync(htmlPath, 'utf-8');
        const prerendered = html.replace('<div id="app"></div>', `<div id="app">${appHtml}</div>`);
        writeFileSync(htmlPath, prerendered, 'utf-8');
        console.log(`[prerender] Wrote prerendered HTML to ${htmlPath}`);
      } catch {
        console.warn(`[prerender] Skipped ${htmlPath} (file not found)`);
      }
    }

    console.log('[prerender] Done!');
  } finally {
    await browser?.close();
    server.close();
  }
}

prerender().catch((error) => {
  console.error('[prerender] Fatal error:', error);
  process.exit(1);
});
