import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const submit = vi.hoisted(() => vi.fn());

vi.mock('@plasmohq/edge-addons-api', () => ({
  EdgeAddonsAPI: class {
    submit = submit;
  },
}));

const originalArgv = [...process.argv];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('EDGE_PRODUCT_ID', 'product-id');
  vi.stubEnv('EDGE_CLIENT_ID', 'client-id');
  vi.stubEnv('EDGE_API_KEY', 'api-key');
  process.argv.splice(
    0,
    process.argv.length,
    process.execPath,
    path.resolve(import.meta.dirname, 'publish-edge.mjs'),
    '2.15.0',
  );
  submit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.argv.splice(0, process.argv.length, ...originalArgv);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('submits the Edge package without certification notes', async () => {
  await import('./publish-edge.mjs');

  expect(submit).toHaveBeenCalledWith({
    filePath: 'synchronize-tab-scrolling-chrome.zip',
    notes: '',
  });
});
