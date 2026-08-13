/// <reference types="vitest/globals" />

import * as React from 'react';

import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UrlSyncMode, UrlSyncNotice } from '~/shared/types/url-sync';

interface RegisteredMessage {
  data: unknown;
}

type RegisteredMessageHandler = (message: RegisteredMessage) => unknown;
type StorageChangeHandler = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => void;

interface MotionDivMockProps extends React.ComponentProps<'div'> {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  transition?: unknown;
}

const {
  messageHandlers,
  onMessageMock,
  sendMessageMock,
  repairUrlSyncModeMock,
  saveUrlSyncModeMock,
  storageChangeHandlers,
} = vi.hoisted(() => ({
  messageHandlers: new Map<string, RegisteredMessageHandler>(),
  onMessageMock: vi.fn(),
  sendMessageMock: vi.fn(),
  repairUrlSyncModeMock: vi.fn(),
  saveUrlSyncModeMock: vi.fn(),
  storageChangeHandlers: new Set<StorageChangeHandler>(),
}));
const originalAttachShadow = Element.prototype.attachShadow;
let capturedPanelShadowRoot: ShadowRoot | null = null;
let storedUrlSyncMode: unknown = 'follow-changed-tab';

vi.mock('webext-bridge/content-script', () => ({
  onMessage: onMessageMock,
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: (path: string) => path,
    },
    storage: {
      onChanged: {
        addListener: (handler: StorageChangeHandler) => {
          storageChangeHandlers.add(handler);
        },
        removeListener: (handler: StorageChangeHandler) => {
          storageChangeHandlers.delete(handler);
        },
      },
    },
  },
}));

vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  repairUrlSyncMode: repairUrlSyncModeMock,
  saveUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  saveUrlSyncMode: saveUrlSyncModeMock,
}));

vi.mock('~/shared/lib/logger', () => ({
  ExtensionLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('~/shared/lib/animations', () => ({
  ANIMATION_DURATIONS: { normal: 0.2 },
  EASING_FUNCTIONS: { easeOutCubic: [0.33, 1, 0.68, 1] },
  getMotionTransition: () => ({}),
  prefersReducedMotion: () => true,
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: (props: MotionDivMockProps) => {
      const { children, animate, exit, initial, transition, ...domProps } = props;
      void animate;
      void exit;
      void initial;
      void transition;
      return <div {...domProps}>{children}</div>;
    },
  },
}));

vi.mock('./components', () => ({
  SyncControlPanel: ({
    urlSyncMode,
    urlSyncNotice,
    onUrlSyncModeChange,
  }: {
    urlSyncMode: UrlSyncMode;
    urlSyncNotice: UrlSyncNotice | null;
    onUrlSyncModeChange: (mode: UrlSyncMode) => Promise<boolean>;
  }) => (
    <div>
      <span>Private synchronized title</span>
      <span data-testid="panel-url-sync-mode">{urlSyncMode}</span>
      <span data-testid="panel-url-sync-notice">{urlSyncNotice?.key ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          void onUrlSyncModeChange('sync-page-path-across-sites');
        }}
      >
        choose-cross-site
      </button>
    </div>
  ),
}));

function getRequiredHandler(messageId: string): RegisteredMessageHandler {
  const handler = messageHandlers.get(messageId);
  if (!handler) {
    throw new Error(`Expected panel message handler: ${messageId}`);
  }
  return handler;
}

function dispatchStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName = 'local',
) {
  if (areaName === 'local' && changes.urlSyncMode) {
    storedUrlSyncMode = changes.urlSyncMode.newValue;
  }
  storageChangeHandlers.forEach((handler) => {
    handler(changes, areaName);
  });
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise resolve called before initialization');
  };
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function mountPanel() {
  const { showPanel } = await import('./panel');
  await act(async () => {
    showPanel();
  });

  await waitFor(() => {
    expect(messageHandlers.has('sync-suggestion:show')).toBe(true);
    expect(messageHandlers.has('sync-suggestion:add-tab')).toBe(true);
  });

  const app = capturedPanelShadowRoot?.querySelector<HTMLElement>('#scroll-sync-app');
  if (!app) {
    throw new Error('Expected panel app to exist');
  }

  return within(app);
}

describe('panel suggestion transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    messageHandlers.clear();
    storageChangeHandlers.clear();
    storedUrlSyncMode = 'follow-changed-tab';
    capturedPanelShadowRoot = null;
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      options,
    ) {
      const shadowRoot = originalAttachShadow.call(this, options);
      if (this instanceof HTMLElement && this.id === 'scroll-sync-panel-root') {
        capturedPanelShadowRoot = shadowRoot;
      }
      return shadowRoot;
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    onMessageMock.mockImplementation((messageId: string, handler: RegisteredMessageHandler) => {
      messageHandlers.set(messageId, handler);
      return vi.fn();
    });
    sendMessageMock.mockResolvedValue(undefined);
    repairUrlSyncModeMock.mockResolvedValue({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: false,
    });
    saveUrlSyncModeMock.mockResolvedValue(true);
  });

  it('keeps synchronized titles inside a closed shadow root unavailable to the host document', async () => {
    await mountPanel();

    const container = document.querySelector('#scroll-sync-panel-root');
    expect(container?.shadowRoot).toBeNull();
    expect(capturedPanelShadowRoot?.textContent).toContain('Private synchronized title');
    expect(document.body.textContent).not.toContain('Private synchronized title');
  });

  it('loads the persisted cross-site mode into the in-page panel', async () => {
    repairUrlSyncModeMock.mockResolvedValue({
      status: 'success',
      mode: 'sync-page-path-across-sites',
      repaired: false,
    });
    const ui = await mountPanel();

    expect(await ui.findByTestId('panel-url-sync-mode')).toHaveTextContent(
      'sync-page-path-across-sites',
    );
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
  });

  it('keeps the previous panel mode and exposes a notice when local persistence fails', async () => {
    repairUrlSyncModeMock.mockResolvedValue({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: false,
    });
    saveUrlSyncModeMock.mockResolvedValue(false);
    const user = userEvent.setup();
    const ui = await mountPanel();

    await user.click(ui.getByRole('button', { name: 'choose-cross-site' }));

    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('follow-changed-tab');
    expect(await ui.findByTestId('panel-url-sync-notice')).toHaveTextContent(
      'urlSyncSettingSaveFailedNotice',
    );
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      'sync:url-mode-changed',
      expect.anything(),
      'background',
    );
  });

  it('applies an incoming persisted cross-site mode without redundantly saving it', async () => {
    repairUrlSyncModeMock.mockResolvedValue({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: false,
    });
    saveUrlSyncModeMock.mockResolvedValue(false);
    const ui = await mountPanel();

    await act(async () => {
      await getRequiredHandler('sync:url-mode-changed')({
        data: {
          mode: 'sync-page-path-across-sites',
          notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
        },
      });
    });

    expect(saveUrlSyncModeMock).not.toHaveBeenCalled();
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('urlSyncModeResetNotice');
  });

  it('applies a persisted cross-site mode from storage without a relay', async () => {
    const ui = await mountPanel();

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'sync-page-path-across-sites',
        },
      });
    });

    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
    expect(saveUrlSyncModeMock).not.toHaveBeenCalled();
  });

  it('restores the default mode when the persisted mode is removed', async () => {
    repairUrlSyncModeMock.mockResolvedValue({
      status: 'success',
      mode: 'sync-page-path-across-sites',
      repaired: false,
    });
    const ui = await mountPanel();
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'sync-page-path-across-sites',
          newValue: undefined,
        },
      });
    });

    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('follow-changed-tab');
  });

  it('repairs a malformed persisted mode and exposes the repair notice', async () => {
    const ui = await mountPanel();
    repairUrlSyncModeMock.mockResolvedValueOnce({
      status: 'success',
      mode: 'follow-changed-tab',
      repaired: true,
      notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
    });

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'malformed-mode',
        },
      });
    });

    expect(await ui.findByTestId('panel-url-sync-notice')).toHaveTextContent(
      'urlSyncModeResetNotice',
    );
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('follow-changed-tab');
    expect(repairUrlSyncModeMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer valid persisted mode when malformed repair resolves after its reset write', async () => {
    const ui = await mountPanel();
    const externalRepair = createDeferred<{
      status: 'success';
      mode: UrlSyncMode;
      repaired: true;
      notice: UrlSyncNotice;
    }>();
    repairUrlSyncModeMock.mockReturnValueOnce(externalRepair.promise);

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'malformed-mode',
        },
      });
    });
    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'malformed-mode',
          newValue: 'follow-changed-tab',
        },
      });
    });
    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'keep-each-tabs-website',
        },
      });
    });
    repairUrlSyncModeMock.mockImplementation(async () => {
      if (
        storedUrlSyncMode === 'follow-changed-tab' ||
        storedUrlSyncMode === 'keep-each-tabs-website' ||
        storedUrlSyncMode === 'sync-page-path-across-sites'
      ) {
        return {
          status: 'success',
          mode: storedUrlSyncMode,
          repaired: false,
        };
      }
      throw new Error('Expected a valid authoritative mode');
    });

    await act(async () => {
      externalRepair.resolve({
        status: 'success',
        mode: 'follow-changed-tab',
        repaired: true,
        notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
      });
      await externalRepair.promise;
    });

    expect(storedUrlSyncMode).toBe('keep-each-tabs-website');
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('keep-each-tabs-website');
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
  });

  it('exposes a truthful notice when malformed mode repair fails', async () => {
    const ui = await mountPanel();
    repairUrlSyncModeMock.mockResolvedValueOnce({
      status: 'failed',
      reason: 'write-failed',
      repaired: false,
      notice: { key: 'urlSyncSettingSaveFailedNotice', severity: 'error' },
    });

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'malformed-mode',
        },
      });
    });

    expect(await ui.findByTestId('panel-url-sync-notice')).toHaveTextContent(
      'urlSyncSettingSaveFailedNotice',
    );
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('follow-changed-tab');
  });

  it('does not let a delayed initial repair overwrite a newer storage mode', async () => {
    const initialRepair = createDeferred<{
      status: 'success';
      mode: UrlSyncMode;
      repaired: false;
    }>();
    repairUrlSyncModeMock.mockReturnValueOnce(initialRepair.promise);
    const ui = await mountPanel();

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'sync-page-path-across-sites',
        },
      });
    });
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');

    await act(async () => {
      initialRepair.resolve({
        status: 'success',
        mode: 'follow-changed-tab',
        repaired: false,
      });
      await initialRepair.promise;
    });

    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
  });

  it('does not let an older malformed-mode repair overwrite a newer broadcast', async () => {
    const ui = await mountPanel();
    const externalRepair = createDeferred<{
      status: 'success';
      mode: UrlSyncMode;
      repaired: true;
      notice: UrlSyncNotice;
    }>();
    repairUrlSyncModeMock.mockReturnValueOnce(externalRepair.promise);
    repairUrlSyncModeMock.mockImplementation(async () => {
      if (
        storedUrlSyncMode === 'follow-changed-tab' ||
        storedUrlSyncMode === 'keep-each-tabs-website' ||
        storedUrlSyncMode === 'sync-page-path-across-sites'
      ) {
        return {
          status: 'success',
          mode: storedUrlSyncMode,
          repaired: false,
        };
      }
      throw new Error('Expected a valid authoritative mode');
    });
    saveUrlSyncModeMock.mockImplementation(async (mode: UrlSyncMode) => {
      storedUrlSyncMode = mode;
      return true;
    });

    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'malformed-mode',
        },
      });
    });
    await act(async () => {
      await getRequiredHandler('sync:url-mode-changed')({
        data: { mode: 'sync-page-path-across-sites' },
      });
    });
    storedUrlSyncMode = 'sync-page-path-across-sites';
    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'malformed-mode',
          newValue: 'follow-changed-tab',
        },
      });
    });

    await act(async () => {
      externalRepair.resolve({
        status: 'success',
        mode: 'follow-changed-tab',
        repaired: true,
        notice: { key: 'urlSyncModeResetNotice', severity: 'warning' },
      });
      await externalRepair.promise;
    });

    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
  });

  it('restores newer persisted storage after an older local save writes late', async () => {
    const saveMode = createDeferred<boolean>();
    saveUrlSyncModeMock.mockImplementationOnce(() => saveMode.promise);
    saveUrlSyncModeMock.mockImplementation(async (mode: UrlSyncMode) => {
      storedUrlSyncMode = mode;
      return true;
    });
    repairUrlSyncModeMock.mockImplementation(async () => {
      if (
        storedUrlSyncMode === 'follow-changed-tab' ||
        storedUrlSyncMode === 'keep-each-tabs-website' ||
        storedUrlSyncMode === 'sync-page-path-across-sites'
      ) {
        return {
          status: 'success',
          mode: storedUrlSyncMode,
          repaired: false,
        };
      }
      throw new Error('Expected a valid authoritative mode');
    });
    const user = userEvent.setup();
    const ui = await mountPanel();

    await user.click(ui.getByRole('button', { name: 'choose-cross-site' }));
    await act(async () => {
      await getRequiredHandler('sync:url-mode-changed')({
        data: {
          mode: 'keep-each-tabs-website',
          notice: { key: 'urlSyncLanguagePreservationNotice', severity: 'info' },
        },
      });
    });
    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'sync-page-path-across-sites',
        },
      });
    });

    await act(async () => {
      storedUrlSyncMode = 'sync-page-path-across-sites';
      saveMode.resolve(true);
      await saveMode.promise;
    });

    expect(storedUrlSyncMode).toBe('keep-each-tabs-website');
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('keep-each-tabs-website');
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent(
      'urlSyncLanguagePreservationNotice',
    );
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      'sync:url-mode-changed',
      { mode: 'sync-page-path-across-sites' },
      'background',
    );
  });

  it('keeps a valid same-value external mode without a false save failure notice', async () => {
    const saveMode = createDeferred<boolean>();
    saveUrlSyncModeMock.mockReturnValueOnce(saveMode.promise);
    repairUrlSyncModeMock.mockImplementation(async () => ({
      status: 'success',
      mode: 'sync-page-path-across-sites',
      repaired: false,
    }));
    const user = userEvent.setup();
    const ui = await mountPanel();

    await user.click(ui.getByRole('button', { name: 'choose-cross-site' }));
    act(() => {
      dispatchStorageChange({
        urlSyncMode: {
          oldValue: 'follow-changed-tab',
          newValue: 'sync-page-path-across-sites',
        },
      });
    });

    await act(async () => {
      saveMode.resolve(false);
      await saveMode.promise;
    });

    expect(storedUrlSyncMode).toBe('sync-page-path-across-sites');
    expect(ui.getByTestId('panel-url-sync-mode')).toHaveTextContent('sync-page-path-across-sites');
    expect(ui.getByTestId('panel-url-sync-notice')).toHaveTextContent('none');
  });

  it('removes the storage listener when the panel is destroyed', async () => {
    await mountPanel();
    expect(storageChangeHandlers).toHaveLength(1);

    const { destroyPanel } = await import('./panel');
    act(() => {
      destroyPanel();
    });

    expect(storageChangeHandlers).toHaveLength(0);
  });

  it.each([
    {
      actionName: 'startSyncButton',
      accepted: true,
      label: 'accept',
    },
    {
      actionName: 'notNowButton',
      accepted: false,
      label: 'decline',
    },
  ])('echoes the initial suggestion revision on panel $label', async ({ actionName, accepted }) => {
    const user = userEvent.setup();
    const ui = await mountPanel();

    await act(async () => {
      getRequiredHandler('sync-suggestion:show')({
        data: {
          normalizedUrl: 'https://fixture.invalid/group',
          tabCount: 2,
          tabIds: [11, 22],
          tabTitles: ['First', 'Second'],
          expectedRevision: 14,
        },
      });
    });
    await user.click(ui.getByRole('button', { name: actionName }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        'sync-suggestion:response',
        {
          normalizedUrl: 'https://fixture.invalid/group',
          accepted,
          expectedRevision: 14,
        },
        'background',
      );
    });
  });

  it.each([
    {
      actionName: 'addTabButton',
      accepted: true,
      label: 'accept',
    },
    {
      actionName: 'skipButton',
      accepted: false,
      label: 'decline',
    },
  ])('echoes the add-tab suggestion revision on panel $label', async ({ actionName, accepted }) => {
    const user = userEvent.setup();
    const ui = await mountPanel();

    await act(async () => {
      getRequiredHandler('sync-suggestion:add-tab')({
        data: {
          tabId: 33,
          tabTitle: 'Third',
          hasManualOffsets: false,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 15,
        },
      });
    });
    await user.click(ui.getByRole('button', { name: actionName }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        'sync-suggestion:add-tab-response',
        {
          tabId: 33,
          accepted,
          expectedRevision: 15,
        },
        'background',
      );
    });
  });

  it('announces degraded cleanup after a committed panel add', async () => {
    const user = userEvent.setup();
    sendMessageMock.mockResolvedValueOnce({
      success: true,
      revision: 16,
      warning: 'auto-sync-degraded',
    });
    const ui = await mountPanel();

    await act(async () => {
      getRequiredHandler('sync-suggestion:add-tab')({
        data: {
          tabId: 33,
          tabTitle: 'Third',
          hasManualOffsets: false,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 15,
        },
      });
    });
    await user.click(ui.getByRole('button', { name: 'addTabButton' }));

    const notice = await ui.findByRole('status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveTextContent('syncSuggestionCleanupRetrying');
    expect(ui.queryByText('successSyncStarted')).not.toBeInTheDocument();
  });

  it('does not render a degraded notice after a normal committed panel add', async () => {
    const user = userEvent.setup();
    sendMessageMock.mockResolvedValueOnce({ success: true, revision: 16 });
    const ui = await mountPanel();

    await act(async () => {
      getRequiredHandler('sync-suggestion:add-tab')({
        data: {
          tabId: 33,
          tabTitle: 'Third',
          hasManualOffsets: false,
          normalizedUrl: 'https://fixture.invalid/group',
          expectedRevision: 15,
        },
      });
    });
    await user.click(ui.getByRole('button', { name: 'addTabButton' }));

    await waitFor(() => {
      expect(ui.queryByRole('button', { name: 'addTabButton' })).not.toBeInTheDocument();
    });
    expect(ui.queryByRole('status')).not.toBeInTheDocument();
  });
});
