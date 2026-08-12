/// <reference types="vitest/globals" />

import * as React from 'react';

import { act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

interface RegisteredMessage {
  data: unknown;
}

type RegisteredMessageHandler = (message: RegisteredMessage) => unknown;

interface MotionDivMockProps extends React.ComponentProps<'div'> {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  transition?: unknown;
}

const { messageHandlers, onMessageMock, sendMessageMock } = vi.hoisted(() => ({
  messageHandlers: new Map<string, RegisteredMessageHandler>(),
  onMessageMock: vi.fn(),
  sendMessageMock: vi.fn(),
}));
const originalAttachShadow = Element.prototype.attachShadow;
let capturedPanelShadowRoot: ShadowRoot | null = null;

vi.mock('webext-bridge/content-script', () => ({
  onMessage: onMessageMock,
  sendMessage: sendMessageMock,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: (path: string) => path,
    },
  },
}));

vi.mock('~/shared/lib/storage', () => ({
  loadUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  repairUrlSyncMode: vi.fn().mockResolvedValue({
    status: 'success',
    mode: 'follow-changed-tab',
  }),
  saveUrlSyncEnabled: vi.fn().mockResolvedValue(true),
  saveUrlSyncMode: vi.fn().mockResolvedValue(true),
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
  SyncControlPanel: () => (
    <div>
      sync-control-panel
      <span>Private synchronized title</span>
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
  });

  it('keeps synchronized titles inside a closed shadow root unavailable to the host document', async () => {
    await mountPanel();

    const container = document.querySelector('#scroll-sync-panel-root');
    expect(container?.shadowRoot).toBeNull();
    expect(capturedPanelShadowRoot?.textContent).toContain('Private synchronized title');
    expect(document.body.textContent).not.toContain('Private synchronized title');
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
