import { describe, expect, it } from 'vitest';

import { getManifest } from './manifest';

describe('getManifest', () => {
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
