import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFileSchemeAccessInfo,
  getFileSchemeSettingsUrl,
  type FileSchemeAccessRoot,
} from './file-scheme-access';

const { runtimeIdMock } = vi.hoisted(() => ({
  runtimeIdMock: 'extension-id-123',
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      id: runtimeIdMock,
    },
  },
}));

describe('getFileSchemeSettingsUrl', () => {
  it('builds Chrome extension settings URLs', () => {
    expect(getFileSchemeSettingsUrl('chrome', 'abc123')).toBe('chrome://extensions/?id=abc123');
  });

  it('builds Edge extension settings URLs', () => {
    expect(getFileSchemeSettingsUrl('edge', 'abc123')).toBe('edge://extensions/?id=abc123');
  });

  it('falls back to Chrome settings URLs for unknown Chromium-like browsers', () => {
    expect(getFileSchemeSettingsUrl('unknown', 'abc123')).toBe('chrome://extensions/?id=abc123');
  });
});

describe('getFileSchemeAccessInfo', () => {
  const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalUserAgentDescriptor) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgentDescriptor);
      return;
    }

    Reflect.deleteProperty(navigator, 'userAgent');
  });

  it('returns allowed=true when Chrome reports file scheme access enabled', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(true),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: true,
      allowed: true,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('returns allowed=false when Chrome reports file scheme access disabled', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockResolvedValue(false),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: true,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('falls back conservatively when the API is unavailable', async () => {
    const root: FileSchemeAccessRoot = {};

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: false,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });

  it('falls back conservatively when the API rejects', async () => {
    const root: FileSchemeAccessRoot = {
      chrome: {
        extension: {
          isAllowedFileSchemeAccess: vi.fn().mockRejectedValue(new Error('blocked')),
        },
      },
    };

    await expect(getFileSchemeAccessInfo(root)).resolves.toEqual({
      canCheck: false,
      allowed: false,
      settingsUrl: 'chrome://extensions/?id=extension-id-123',
    });
  });
});
