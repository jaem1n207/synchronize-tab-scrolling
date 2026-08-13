import { describe, expect, it } from 'vitest';

import { getManifest } from './manifest';

describe('getManifest', () => {
  it('defines exactly one Quick Sync command', async () => {
    const commands = (await getManifest()).commands;

    expect(commands).toEqual({
      'quick-sync-start-or-add': {
        suggested_key: {
          default: 'Ctrl+Shift+Period',
          mac: 'Command+Shift+Period',
        },
        description: '__MSG_quickSyncCommandDescription__',
      },
    });
  });

  it('does not add a commands permission', async () => {
    const permissions = (await getManifest()).permissions;

    expect(permissions).not.toContain('commands');
  });

  it('includes local file URL match patterns for manual sync injection', async () => {
    const manifest = await getManifest();
    const webAccessibleResource = manifest.web_accessible_resources?.[0];

    expect(manifest.host_permissions).toContain('file:///*');
    expect(manifest.content_scripts?.[0]?.matches).toContain('file:///*');

    if (!webAccessibleResource || typeof webAccessibleResource === 'string') {
      throw new Error('Expected object web accessible resource manifest entry');
    }

    expect(webAccessibleResource.matches).toContain('file:///*');
  });
});
