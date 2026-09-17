import { describe, expect, it } from 'vitest';

import { createProposalRegistry } from './suggestion-authorization';

const SYNC_CLAIMS = {
  kind: 'sync' as const,
  normalizedUrl: 'https://fixture.invalid/group',
  expectedRevision: 6,
};

describe('createProposalRegistry', () => {
  it('binds a proposal to its content-script recipient and consumes sibling tokens once', () => {
    let tokenSequence = 0;
    const registry = createProposalRegistry({
      now: () => 1_000,
      createToken: () => `token-${++tokenSequence}`,
    });
    const tokens = registry.issue({ ...SYNC_CLAIMS, responderTabIds: [11, 22] });

    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: tokens.get(11),
        senderContext: 'popup',
        senderTabId: 11,
      }),
    ).toBe(false);
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: tokens.get(11),
        senderContext: 'content-script',
        senderTabId: 22,
      }),
    ).toBe(false);
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: tokens.get(11),
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(true);
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: tokens.get(11),
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(false);
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: tokens.get(22),
        senderContext: 'content-script',
        senderTabId: 22,
      }),
    ).toBe(false);
  });

  it('rejects expired and mismatched proposal claims', () => {
    let now = 1_000;
    const registry = createProposalRegistry({
      now: () => now,
      createToken: () => 'token-1',
      lifetimeMs: 500,
    });
    const tokens = registry.issue({ ...SYNC_CLAIMS, responderTabIds: [11] });
    const token = tokens.get(11);

    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        expectedRevision: 7,
        token,
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(false);

    now = 1_500;
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token,
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(false);
  });

  it('keeps a later sibling token valid when an earlier token expires', () => {
    let now = 1_000;
    let tokenSequence = 0;
    const registry = createProposalRegistry({
      now: () => now,
      createToken: () => `token-${++tokenSequence}`,
      lifetimeMs: 500,
    });
    const earlierToken = registry.issue({ ...SYNC_CLAIMS, responderTabIds: [11] }).get(11);

    now = 1_200;
    const laterToken = registry.issue({ ...SYNC_CLAIMS, responderTabIds: [22] }).get(22);

    now = 1_500;
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: earlierToken,
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(false);
    expect(
      registry.consume({
        ...SYNC_CLAIMS,
        token: laterToken,
        senderContext: 'content-script',
        senderTabId: 22,
      }),
    ).toBe(true);
  });

  it('binds add-tab proposals to the suggested tab identity', () => {
    const registry = createProposalRegistry({
      now: () => 1_000,
      createToken: () => 'token-1',
    });
    const claims = {
      kind: 'add-tab' as const,
      normalizedUrl: 'https://fixture.invalid/group',
      expectedRevision: 6,
      suggestedTabId: 33,
    };
    const tokens = registry.issue({ ...claims, responderTabIds: [11] });

    expect(
      registry.consume({
        ...claims,
        suggestedTabId: 44,
        token: tokens.get(11),
        senderContext: 'content-script',
        senderTabId: 11,
      }),
    ).toBe(false);
  });
});
