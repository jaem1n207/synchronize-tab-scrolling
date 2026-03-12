/// <reference types="vitest/globals" />

vi.mock('~/shared/lib/platform', () => ({
  getPlatform: vi.fn(),
}));

import { renderHook } from '@testing-library/react';

import { useModifierKey, usePlatform } from '~/landing/hooks/use-platform';
import { getPlatform } from '~/shared/lib/platform';

const mockedGetPlatform = vi.mocked(getPlatform);

describe('usePlatform', () => {
  it('returns detected platform from getPlatform', () => {
    mockedGetPlatform.mockReturnValue('linux');

    const { result } = renderHook(() => usePlatform());

    expect(result.current).toBe('linux');
    expect(mockedGetPlatform).toHaveBeenCalledTimes(1);
  });
});

describe('useModifierKey', () => {
  it('returns Option key for macOS', () => {
    mockedGetPlatform.mockReturnValue('macos');

    const { result } = renderHook(() => useModifierKey());

    expect(result.current).toEqual({ name: 'Option', symbol: '⌥' });
  });

  it('returns Alt key for windows', () => {
    mockedGetPlatform.mockReturnValue('windows');

    const { result } = renderHook(() => useModifierKey());

    expect(result.current).toEqual({ name: 'Alt', symbol: 'Alt' });
  });

  it('returns Alt key for linux', () => {
    mockedGetPlatform.mockReturnValue('linux');

    const { result } = renderHook(() => useModifierKey());

    expect(result.current).toEqual({ name: 'Alt', symbol: 'Alt' });
  });
});
