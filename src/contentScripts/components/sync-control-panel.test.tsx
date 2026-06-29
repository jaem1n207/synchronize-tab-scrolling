/// <reference types="vitest/globals" />

import { render } from '@testing-library/react';

import { SyncControlPanel } from './sync-control-panel';

const { handleOpenChangeMock } = vi.hoisted(() => ({
  handleOpenChangeMock: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useDragPosition: () => ({
    BUTTON_SIZE: 48,
    position: { x: 24, y: 24 },
    isDragging: false,
    dragTransform: { x: 24, y: 24 },
    toolbarRef: { current: null },
    wasDraggedRef: { current: false },
    handleMouseDown: vi.fn(),
  }),
  usePanelState: () => ({
    isOpen: false,
    syncedTabs: [],
    autoSyncEnabled: false,
    isAutoSyncActive: false,
    autoSyncGroupCount: 0,
    handleOpenChange: handleOpenChangeMock,
    handleAutoSyncToggle: vi.fn(),
  }),
}));

vi.mock('~/shared/hooks/use-system-theme', () => ({
  useSystemTheme: () => 'light',
}));

vi.mock('~/shared/hooks/use-modifier-key', () => ({
  useModifierKey: () => ({ controlKey: 'Alt' }),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('~/shared/lib/animations', () => ({
  ANIMATION_DURATIONS: { fast: 150 },
  EASING_FUNCTIONS: { easeOutCubic: [0.33, 1, 0.68, 1] },
  PANEL_ANIMATIONS: {
    edgeSnap: { duration: 180, easing: 'ease-out' },
  },
  getMotionTransition: () => ({ duration: 0 }),
  prefersReducedMotion: () => true,
}));

describe('SyncControlPanel', () => {
  beforeEach(() => {
    handleOpenChangeMock.mockClear();
  });

  it('consumes the URL Sync settings open token after opening the panel', () => {
    const onUrlSyncSettingsTokenHandled = vi.fn();

    render(
      <SyncControlPanel
        openUrlSyncSettingsToken={1}
        urlSyncEnabled={true}
        urlSyncMode="follow-changed-tab"
        urlSyncNotice={null}
        onUrlSyncEnabledChange={vi.fn()}
        onUrlSyncModeChange={vi.fn()}
        onUrlSyncSettingsTokenHandled={onUrlSyncSettingsTokenHandled}
      />,
    );

    expect(handleOpenChangeMock).toHaveBeenCalledWith(true);
    expect(onUrlSyncSettingsTokenHandled).toHaveBeenCalledTimes(1);
  });
});
