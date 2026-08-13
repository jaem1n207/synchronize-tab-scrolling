/// <reference types="vitest/globals" />

import { render, screen, within } from '@testing-library/react';

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

  it('renders synchronized titles, current marker, and signed manual offsets accessibly', () => {
    const createPanel = () => (
      <SyncControlPanel
        urlSyncEnabled={true}
        urlSyncMode="follow-changed-tab"
        urlSyncNotice={null}
        onUrlSyncEnabledChange={vi.fn()}
        onUrlSyncModeChange={vi.fn()}
      />
    );
    const view = render(createPanel());

    usePanelStateMock.mockReturnValue({
      isOpen: true,
      syncedTabs: [
        {
          displayTitle: 'Current article',
          isCurrent: true,
          manualOffsetPixels: 136,
          connectionStatus: 'connected',
        },
        {
          displayTitle: 'Zero offset article',
          isCurrent: false,
          manualOffsetPixels: 0,
          connectionStatus: 'disconnected',
        },
        {
          displayTitle: 'Negative offset article',
          isCurrent: false,
          manualOffsetPixels: -42,
          connectionStatus: 'error',
        },
      ],
      syncStatusError: null,
      autoSyncEnabled: false,
      isAutoSyncActive: false,
      autoSyncGroupCount: 0,
      handleOpenChange: handleOpenChangeMock,
      handleAutoSyncToggle: vi.fn(),
    });
    view.rerender(createPanel());

    const list = screen.getByRole('list', { name: 'syncedTabs' });
    expect(within(list).getByText('syncedTabs')).toBeVisible();
    expect(within(list).getByText('Current article (current)')).toBeInTheDocument();
    expect(within(list).getByText('+136px')).toBeInTheDocument();
    expect(within(list).getByText('Zero offset article')).toBeInTheDocument();
    expect(within(list).getByText('+0px')).toBeInTheDocument();
    expect(within(list).getByText('Negative offset article')).toBeInTheDocument();
    expect(within(list).getByText('-42px')).toBeInTheDocument();
    expect(screen.getByText('autoSyncSameUrl')).toBeInTheDocument();
  });

  it('renders a truthful status error instead of synchronized rows', () => {
    usePanelStateMock.mockReturnValue({
      isOpen: true,
      syncedTabs: [],
      syncStatusError: 'manualSyncStateUnavailable',
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

    expect(screen.getByRole('alert')).toHaveTextContent('manualSyncStateUnavailable');
    expect(screen.queryByRole('list', { name: 'syncedTabs' })).not.toBeInTheDocument();
  });

  it('shows the persisted cross-site warning in the open in-page settings surface', () => {
    usePanelStateMock.mockReturnValue({
      isOpen: true,
      syncedTabs: [],
      syncStatusError: null,
      autoSyncEnabled: false,
      isAutoSyncActive: false,
      autoSyncGroupCount: 0,
      handleOpenChange: handleOpenChangeMock,
      handleAutoSyncToggle: vi.fn(),
    });

    render(
      <SyncControlPanel
        urlSyncEnabled={false}
        urlSyncMode="sync-page-path-across-sites"
        urlSyncNotice={null}
        onUrlSyncEnabledChange={vi.fn()}
        onUrlSyncModeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('urlSyncModeAcrossDifferentSites')).toBeInTheDocument();
    expect(screen.getAllByText('urlSyncModeAcrossDifferentSitesWarning')).toHaveLength(1);
  });
});
