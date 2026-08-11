/// <reference types="vitest/globals" />

import { act, within } from '@testing-library/react';

import type {
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
} from '~/shared/types/quick-sync';

interface FeedbackEnvelope {
  data: QuickSyncFeedbackMessage;
}

type FeedbackHandler = (
  envelope: FeedbackEnvelope,
) => QuickSyncFeedbackResponse | Promise<QuickSyncFeedbackResponse>;

interface TestPort {
  disconnect: ReturnType<typeof vi.fn>;
  onDisconnect: {
    addListener: ReturnType<typeof vi.fn>;
  };
  triggerDisconnect(): void;
}

const bridgeState = vi.hoisted(() => {
  const state: { feedbackHandler?: FeedbackHandler } = {};
  return state;
});

const browserState = vi.hoisted(() => ({
  connect: vi.fn(),
  getURL: vi.fn((path: string) => `extension://${path}`),
}));

const translations: Record<string, string> = {
  quickSyncCandidateSelectedTitle: '동기화할 탭 1개 선택됨',
  quickSyncCandidateInstruction:
    '$REMAININGSECONDS$초 안에 다른 탭에서 같은 단축키를 누르면 이 탭과 함께 스크롤 동기화됩니다.',
  quickSyncSameCandidateTitle: '이 탭은 이미 선택되어 있어요',
  quickSyncConnectingTitle: '탭을 연결하고 있어요…',
  quickSyncStartSucceededTitle: '스크롤 동기화를 시작했어요 · 현재 $TABCOUNT$개 탭',
  quickSyncAddSucceededTitle: '이 탭을 동기화에 추가했어요 · 현재 $TABCOUNT$개 탭',
  quickSyncAlreadyIncludedTitle:
    '이 탭은 이미 현재 동기화에 포함되어 있어요 · 현재 $TABCOUNT$개 탭',
  quickSyncSecondTabFailedTitle: '이 탭을 연결하지 못했어요',
  quickSyncSecondTabRetryInstruction:
    '$REMAININGSECONDS$초 안에 다른 탭에서 같은 단축키를 누르면 다시 시도할 수 있어요.',
  quickSyncAddFailedTitle: '이 탭을 추가하지 못했어요',
  quickSyncExistingTabsContinue: '기존 $TABCOUNT$개 탭은 계속 동기화되고 있어요.',
  quickSyncCandidateExpiredAnnouncement: '다른 탭을 선택할 수 있는 시간이 끝났어요.',
};

vi.mock('webext-bridge/content-script', () => ({
  onMessage: (message: string, handler: FeedbackHandler) => {
    if (message === 'quick-sync:feedback') {
      bridgeState.feedbackHandler = handler;
    }
    return vi.fn();
  },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      connect: browserState.connect,
      getURL: browserState.getURL,
    },
  },
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string, substitutions?: string | string[]) => {
    const template = translations[key];
    if (template === undefined) {
      throw new Error(`Missing test translation for ${key}`);
    }
    const values = typeof substitutions === 'string' ? [substitutions] : (substitutions ?? []);
    return values.reduce(
      (message, value, index) =>
        message.replaceAll(`$${index + 1}`, value).replace(/\$[A-Z]+(?:SECONDS|COUNT)\$/u, value),
      template,
    );
  },
}));

function createPort(): TestPort {
  let disconnectListener: (() => void) | undefined;
  return {
    disconnect: vi.fn(),
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListener = listener;
      }),
    },
    triggerDisconnect() {
      disconnectListener?.();
    },
  };
}

function getHost(): HTMLElement {
  const host = document.querySelector<HTMLElement>('#scroll-sync-quick-sync-hud-root');
  if (host === null) {
    throw new Error('Expected Quick Sync HUD host');
  }
  return host;
}

function getStyleLink(): HTMLLinkElement {
  const styleLink = getHost().shadowRoot?.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (styleLink === null || styleLink === undefined) {
    throw new Error('Expected Quick Sync HUD stylesheet');
  }
  return styleLink;
}

function getHudUi() {
  const app = getHost().shadowRoot?.querySelector<HTMLElement>('#scroll-sync-quick-sync-hud-app');
  if (app === null || app === undefined) {
    throw new Error('Expected Quick Sync HUD app');
  }
  return within(app);
}

async function sendFeedback(message: QuickSyncFeedbackMessage): Promise<QuickSyncFeedbackResponse> {
  const handler = bridgeState.feedbackHandler;
  if (handler === undefined) {
    throw new Error('Expected Quick Sync feedback handler');
  }
  return handler({ data: message });
}

async function settleFeedback(
  responsePromise: Promise<QuickSyncFeedbackResponse>,
  stylesheetEvent?: 'load' | 'error',
): Promise<QuickSyncFeedbackResponse> {
  let response: QuickSyncFeedbackResponse | undefined;
  await act(async () => {
    if (stylesheetEvent !== undefined) {
      getStyleLink().dispatchEvent(new Event(stylesheetEvent));
    }
    response = await responsePromise;
  });
  if (response === undefined) {
    throw new Error('Expected Quick Sync feedback response');
  }
  return response;
}

async function settleImmediateFeedback(
  message: QuickSyncFeedbackMessage,
): Promise<QuickSyncFeedbackResponse> {
  let response: QuickSyncFeedbackResponse | undefined;
  await act(async () => {
    response = await sendFeedback(message);
  });
  if (response === undefined) {
    throw new Error('Expected immediate Quick Sync feedback response');
  }
  return response;
}

describe('initQuickSyncHud', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000));
    document.body.innerHTML = '';
    bridgeState.feedbackHandler = undefined;
    browserState.connect.mockReset();
    browserState.getURL.mockClear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes orphaned hosts and keeps exactly one host after repeated initialization', async () => {
    const firstOrphan = document.createElement('div');
    firstOrphan.id = 'scroll-sync-quick-sync-hud-root';
    const secondOrphan = document.createElement('div');
    secondOrphan.id = 'scroll-sync-quick-sync-hud-root';
    document.body.append(firstOrphan, secondOrphan);

    const { initQuickSyncHud } = await import('./quick-sync-hud');

    initQuickSyncHud();
    initQuickSyncHud();

    expect(document.querySelectorAll('#scroll-sync-quick-sync-hud-root')).toHaveLength(1);
    expect(bridgeState.feedbackHandler).toBeTypeOf('function');
  });

  it('fails closed when the existing content stylesheet cannot load', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const responsePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    const response = await settleFeedback(responsePromise, 'error');

    expect(response).toEqual({
      status: 'failed',
      generation: 7,
      reason: 'hud-unavailable',
    });
    expect(browserState.connect).not.toHaveBeenCalled();
    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('renders the exact generation and connects the validated candidate Port before ready', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const responsePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    const response = await settleFeedback(responsePromise, 'load');

    expect(response).toEqual({ status: 'ready', generation: 7 });
    expect(browserState.connect).toHaveBeenCalledWith({ name: 'quick-sync-candidate:7' });
    expect(getHudUi().getByRole('status')).toHaveTextContent('동기화할 탭 1개 선택됨');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );
  });

  it('returns port-unavailable and clears the provisional HUD when Port setup fails', async () => {
    browserState.connect.mockImplementation(() => {
      throw new Error('port unavailable');
    });
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const responsePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    const response = await settleFeedback(responsePromise, 'load');

    expect(response).toEqual({
      status: 'failed',
      generation: 7,
      reason: 'port-unavailable',
    });
    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('ignores a stale clear without removing the current generation', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    await settleFeedback(candidatePromise, 'load');

    await settleImmediateFeedback({ outcome: 'clear', generation: 6, reason: 'invalidated' });

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );
  });

  it('cancels a provisional generation before a delayed stylesheet can arm it', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'invalidated' });
    const response = await settleFeedback(candidatePromise);

    expect(response).toEqual({
      status: 'failed',
      generation: 7,
      reason: 'hud-unavailable',
    });
    expect(browserState.connect).not.toHaveBeenCalled();
    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('lets the newest pending generation win a shared stylesheet handshake', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const stalePromise = sendFeedback({ outcome: 'connecting', generation: 7 });
    const currentPromise = sendFeedback({ outcome: 'connecting', generation: 8 });

    let staleResponse: QuickSyncFeedbackResponse | undefined;
    let currentResponse: QuickSyncFeedbackResponse | undefined;
    await act(async () => {
      getStyleLink().dispatchEvent(new Event('load'));
      [staleResponse, currentResponse] = await Promise.all([stalePromise, currentPromise]);
    });

    expect(staleResponse).toEqual({
      status: 'failed',
      generation: 7,
      reason: 'hud-unavailable',
    });
    expect(currentResponse).toEqual({ status: 'ready', generation: 8 });
    expect(getHudUi().getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '8',
    );
  });

  it('unmounts immediately when the matching candidate Port disconnects', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    await settleFeedback(candidatePromise, 'load');

    act(() => port.triggerDisconnect());

    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('ends the visible candidate at the absolute deadline and removes the host after one announcement', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 21_000,
    });
    await settleFeedback(candidatePromise, 'load');

    act(() => {
      vi.advanceTimersByTime(1_000);
      port.triggerDisconnect();
    });

    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
    expect(getHudUi().getAllByRole('status')).toHaveLength(1);
    expect(getHudUi().getByRole('status')).toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    act(() => vi.advanceTimersByTime(500));

    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('does not let an older terminal timer clear a newer generation', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const startedPromise = sendFeedback({
      outcome: 'start-succeeded',
      generation: 8,
      tabCount: 2,
    });
    await settleFeedback(startedPromise, 'load');

    act(() => vi.advanceTimersByTime(2_000));
    await settleFeedback(sendFeedback({ outcome: 'connecting', generation: 9 }));
    act(() => vi.advanceTimersByTime(1_000));

    expect(getHudUi().getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
  });

  it('uses exact success and failure lifetimes', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const successPromise = sendFeedback({
      outcome: 'add-succeeded',
      generation: 10,
      tabCount: 3,
    });
    await settleFeedback(successPromise, 'load');

    act(() => vi.advanceTimersByTime(2_499));
    expect(getHudUi().getByRole('status')).toHaveTextContent(
      '이 탭을 동기화에 추가했어요 · 현재 3개 탭',
    );
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();

    const failurePromise = sendFeedback({
      outcome: 'add-failed',
      generation: 11,
      tabCount: 3,
      reason: 'content-unreachable',
    });
    await settleFeedback(failurePromise, 'load');

    act(() => vi.advanceTimersByTime(3_999));
    expect(getHudUi().getByRole('status')).toHaveTextContent('이 탭을 추가하지 못했어요');
    act(() => vi.advanceTimersByTime(1));
    expect(document.querySelector('#scroll-sync-quick-sync-hud-root')).toBeNull();
  });

  it('clears terminal and restart state without a false expiration announcement', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    await settleFeedback(candidatePromise, 'load');

    await settleImmediateFeedback({
      outcome: 'clear',
      generation: 7,
      reason: 'worker-disconnected',
    });

    expect(document.body).not.toHaveTextContent('다른 탭을 선택할 수 있는 시간이 끝났어요.');

    const orphan = document.createElement('div');
    orphan.id = 'scroll-sync-quick-sync-hud-root';
    orphan.textContent = '동기화할 탭 1개 선택됨';
    document.body.appendChild(orphan);
    const reloadedModule = await import('./quick-sync-hud');
    act(() => reloadedModule.initQuickSyncHud());

    expect(document.body).not.toHaveTextContent('다른 탭을 선택할 수 있는 시간이 끝났어요.');
  });

  it('never moves page focus while handling feedback', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();
    const focusedBefore = document.activeElement;

    const candidatePromise = sendFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    await settleFeedback(candidatePromise, 'load');

    expect(document.activeElement).toBe(focusedBefore);
    expect(getHudUi().queryByRole('button')).not.toBeInTheDocument();
    expect(getHudUi().queryByRole('link')).not.toBeInTheDocument();
  });
});
