/**
 * Fetches extension rating/version/user data from Chrome Web Store and Firefox AMO,
 * then writes results to src/landing/public/store-stats.json.
 *
 * - CWS: HTML scraping via `webextension-store-meta` (no official API for ratings)
 * - AMO: Official REST API v5 (stable, no auth required)
 * - Fallback: if a store fetch fails, existing values in store-stats.json are preserved
 *
 * Designed to run in GitHub Actions on a weekly schedule.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ChromeWebStore } from 'webextension-store-meta/lib/chrome-web-store';

const STATS_PATH = join(process.cwd(), 'src', 'landing', 'public', 'store-stats.json');

const CWS_EXTENSION_ID = 'phceoocamipnafpgnchbfhkdlbleeafc';
const AMO_ADDON_SLUG = 'synchronize-tab-scrolling';
const AMO_API_BASE = 'https://addons.mozilla.org/api/v5/addons/addon';

interface StoreData {
  ratingValue: number;
  ratingCount: number;
  version: string;
  users: string;
}

interface StoreStats {
  updatedAt: string;
  chrome: StoreData;
  firefox: StoreData;
}

interface AmoAddonResponse {
  ratings: {
    average: number;
    count: number;
  };
  average_daily_users: number;
  current_version: {
    version: string;
  };
}

function loadExistingStats(): StoreStats {
  try {
    return JSON.parse(readFileSync(STATS_PATH, 'utf-8')) as StoreStats;
  } catch {
    console.warn('[fetch-stats] No existing store-stats.json found, using defaults');
    return {
      updatedAt: new Date().toISOString(),
      chrome: { ratingValue: 0, ratingCount: 0, version: '', users: '' },
      firefox: { ratingValue: 0, ratingCount: 0, version: '', users: '' },
    };
  }
}

async function fetchChromeWebStore(): Promise<StoreData | null> {
  try {
    console.log('[fetch-stats] Fetching Chrome Web Store data...');
    const cws = await ChromeWebStore.load({ id: CWS_EXTENSION_ID, qs: { hl: 'en' } });

    const ratingValue = parseFloat(cws.ratingValue() ?? '0');
    const ratingCountRaw = cws.ratingCount()?.replace(/,/g, '') ?? '0';
    const ratingCount = parseInt(ratingCountRaw, 10);
    const version = cws.version() ?? '';
    const users = cws.users() ?? '';

    // Validate: if ratingValue is 0 or NaN, the scraping likely failed silently
    if (Number.isNaN(ratingValue) || (ratingValue === 0 && ratingCount === 0)) {
      console.warn('[fetch-stats] CWS returned empty/invalid data — scraping may have broken');
      return null;
    }

    console.log(
      `[fetch-stats] CWS: rating=${ratingValue}, count=${ratingCount}, version=${version}, users=${users}`,
    );
    return { ratingValue, ratingCount, version, users };
  } catch (error) {
    console.error(
      '[fetch-stats] CWS fetch failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function fetchFirefoxAmo(): Promise<StoreData | null> {
  try {
    console.log('[fetch-stats] Fetching Firefox AMO data...');
    const response = await fetch(`${AMO_API_BASE}/${AMO_ADDON_SLUG}/`);

    if (!response.ok) {
      console.error(`[fetch-stats] AMO API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as AmoAddonResponse;
    const ratingValue = data.ratings?.average ?? 0;
    const ratingCount = data.ratings?.count ?? 0;
    const version = data.current_version?.version ?? '';
    const users = String(data.average_daily_users ?? '');

    console.log(
      `[fetch-stats] AMO: rating=${ratingValue}, count=${ratingCount}, version=${version}, users=${users}`,
    );
    return { ratingValue, ratingCount, version, users };
  } catch (error) {
    console.error(
      '[fetch-stats] AMO fetch failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function main() {
  const existing = loadExistingStats();

  const [chromeData, firefoxData] = await Promise.all([fetchChromeWebStore(), fetchFirefoxAmo()]);

  const updated: StoreStats = {
    updatedAt: new Date().toISOString(),
    chrome: chromeData ?? existing.chrome,
    firefox: firefoxData ?? existing.firefox,
  };

  if (!chromeData) {
    console.warn('[fetch-stats] Using existing Chrome data as fallback');
  }
  if (!firefoxData) {
    console.warn('[fetch-stats] Using existing Firefox data as fallback');
  }

  const hasChanged =
    updated.chrome.ratingValue !== existing.chrome.ratingValue ||
    updated.chrome.ratingCount !== existing.chrome.ratingCount ||
    updated.chrome.version !== existing.chrome.version ||
    updated.firefox.ratingValue !== existing.firefox.ratingValue ||
    updated.firefox.ratingCount !== existing.firefox.ratingCount ||
    updated.firefox.version !== existing.firefox.version;

  if (!hasChanged) {
    console.log('[fetch-stats] No changes detected — skipping write');
    return;
  }

  writeFileSync(STATS_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  console.log(`[fetch-stats] Updated ${STATS_PATH}`);
}

main().catch((error) => {
  console.error('[fetch-stats] Fatal error:', error);
  process.exit(1);
});
