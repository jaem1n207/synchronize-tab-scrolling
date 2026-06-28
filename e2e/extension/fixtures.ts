import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';

interface FixtureSite {
  name: string;
  origin: string;
  url: (path: string) => string;
  close: () => Promise<void>;
}

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
  fixtureSites: {
    primary: FixtureSite;
    comparison: FixtureSite;
  };
  openPopup: () => Promise<Page>;
}

const URL_SYNC_SWITCH_NAME = /URL Sync|URL 동기화 여부/i;

function titleFor(siteName: string, pathname: string): string {
  const pageName = pathname.includes('/about') ? 'About' : 'Home';
  return `${siteName} ${pageName}`;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startFixtureSite(name: string): Promise<FixtureSite> {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const title = titleFor(name, requestUrl.pathname);

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p data-site="${name}" data-path="${requestUrl.pathname}">URL Sync fixture</p>
      <div style="height: 2400px"></div>
    </main>
  </body>
</html>`);
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error(`Fixture site ${name} did not expose a TCP address`);
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    name,
    origin,
    url: (path) => `${origin}${path}`,
    close: () => closeServer(server),
  };
}

async function getExtensionId(context: BrowserContext): Promise<string> {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;
  if (!extensionId) {
    throw new Error(
      `Could not discover extension id from service worker URL: ${serviceWorker.url()}`,
    );
  }

  return extensionId;
}

export const test = base.extend<ExtensionFixtures>({
  fixtureSites: async ({}, run) => {
    const primary = await startFixtureSite('Primary');
    const comparison = await startFixtureSite('Comparison');

    await run({ primary, comparison });

    await Promise.all([primary.close(), comparison.close()]);
  },

  extensionContext: async ({}, run) => {
    const extensionPath = resolve(process.env.EXTENSION_E2E_DIR ?? 'extension');
    const userDataDir = await mkdtemp(join(tmpdir(), 'synchronize-tab-scrolling-e2e-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    await run(context);

    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
  },

  extensionId: async ({ extensionContext }, run) => {
    await run(await getExtensionId(extensionContext));
  },

  openPopup: async ({ extensionContext, extensionId }, run) => {
    await run(async () => {
      const popup = await extensionContext.newPage();
      await popup.goto(`chrome-extension://${extensionId}/dist/popup/index.html`);
      await expect(popup.getByRole('switch', { name: URL_SYNC_SWITCH_NAME })).toBeVisible();
      return popup;
    });
  },
});

export { expect };
