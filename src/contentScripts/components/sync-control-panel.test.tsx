/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';

import { SyncControlPanel } from './sync-control-panel';

const { handleOpenChangeMock, usePanelStateMock } = vi.hoisted(() => ({
  handleOpenChangeMock: vi.fn(),
  usePanelStateMock: vi.fn(),
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
  usePanelState: usePanelStateMock,
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
    usePanelStateMock.mockReturnValue({
      isOpen: false,
      syncedTabs: [],
      syncStatusError: null,
      autoSyncEnabled: false,
      isAutoSyncActive: false,
      autoSyncGroupCount: 0,
      handleOpenChange: handleOpenChangeMock,
      handleAutoSyncToggle: vi.fn(),
    });
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

  it('preserves panel controls while rendering an unavailable authoritative row', () => {
    usePanelStateMock.mockReturnValue({
      isOpen: true,
      syncedTabs: [
        {
          id: 33,
          title: 'activeSyncTabUnavailable',
          offsetPixels: 0,
          isCurrent: false,
        },
      ],
      syncStatusError: null,
      autoSyncEnabled: false,
      isAutoSyncActive: false,
      autoSyncGroupCount: 0,
      handleOpenChange: handleOpenChangeMock,
      handleAutoSyncToggle: vi.fn(),
    });

    render(
      <SyncControlPanel
        urlSyncEnabled={true}
        urlSyncMode="follow-changed-tab"
        urlSyncNotice={null}
        onUrlSyncEnabledChange={vi.fn()}
        onUrlSyncModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('activeSyncTabUnavailable')).toBeInTheDocument();
    expect(screen.getByText('autoSyncSameUrl')).toBeInTheDocument();
  });
});
