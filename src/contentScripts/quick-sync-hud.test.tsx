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

let nextAnimationFrameId = 1;
let animationFrames = new Map<number, FrameRequestCallback>();

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

function flushAnimationFrame(): void {
  const pendingFrames = [...animationFrames.values()];
  animationFrames.clear();
  act(() => {
    pendingFrames.forEach((callback) => callback(performance.now()));
  });
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
    nextAnimationFrameId = 1;
    animationFrames = new Map();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextAnimationFrameId;
        nextAnimationFrameId += 1;
        animationFrames.set(frameId, callback);
        return frameId;
      }),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((frameId: number) => {
        animationFrames.delete(frameId);
      }),
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

  it('renders self-contained candidate feedback before the enhancement stylesheet settles', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const response = await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(response).toEqual({ status: 'ready', generation: 7 });
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );

    act(() => getStyleLink().dispatchEvent(new Event('error')));

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );
  });

  it('renders the exact generation and connects the validated candidate Port before ready', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const response = await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(response).toEqual({ status: 'ready', generation: 7 });
    expect(browserState.connect).toHaveBeenCalledWith({ name: 'quick-sync-candidate:7' });
    expect(getHudUi().getByRole('status')).toHaveTextContent('동기화할 탭 1개 선택됨');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'enter');
    const announcement = getHudUi().getByRole('status');

    flushAnimationFrame();

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-phase',
      'visible',
    );
    expect(getHudUi().getByRole('status')).toBe(announcement);
  });

  it('returns port-unavailable and clears the provisional HUD when Port setup fails', async () => {
    browserState.connect.mockImplementation(() => {
      throw new Error('port unavailable');
    });
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    const response = await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(response).toEqual({
      status: 'failed',
      generation: 7,
      reason: 'port-unavailable',
    });
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('does not retain an older active generation after a replacement Port fails', async () => {
    const previousPort = createPort();
    browserState.connect.mockReturnValueOnce(previousPort).mockImplementationOnce(() => {
      throw new Error('port unavailable');
    });
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 6,
      expiresAt: 30_000,
    });
    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    await settleImmediateFeedback({ outcome: 'clear', generation: 6, reason: 'expired' });

    expect(previousPort.disconnect).toHaveBeenCalledOnce();
    expect(getHudUi().queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores a stale clear without removing the current generation', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    await settleImmediateFeedback({ outcome: 'clear', generation: 6, reason: 'invalidated' });

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '7',
    );
  });

  it('keeps the host mounted while matching clear feedback completes its exit motion', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();
    const host = getHost();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    flushAnimationFrame();

    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'invalidated' });

    expect(getHost()).toBe(host);
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    act(() => vi.advanceTimersByTime(149));
    expect(getHudUi().getByRole('complementary')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(getHost()).toBe(host);
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows and clears immediately without animation scheduling for reduced motion', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();
    const host = getHost();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-phase',
      'visible',
    );
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'invalidated' });

    expect(getHost()).toBe(host);
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    await settleImmediateFeedback({
      outcome: 'start-succeeded',
      generation: 8,
      tabCount: 2,
    });
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-phase',
      'visible',
    );
    act(() => vi.advanceTimersByTime(2_500));

    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an older exit cleanup remove a newer generation', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({ outcome: 'connecting', generation: 7 });
    flushAnimationFrame();
    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'invalidated' });
    act(() => vi.advanceTimersByTime(75));

    await settleImmediateFeedback({ outcome: 'connecting', generation: 8 });
    flushAnimationFrame();
    act(() => vi.advanceTimersByTime(75));

    expect(getHudUi().getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '8',
    );
  });

  it('treats a reused worker generation as a new presentation after disconnect', async () => {
    const firstPort = createPort();
    const replacementPort = createPort();
    browserState.connect.mockReturnValueOnce(firstPort).mockReturnValueOnce(replacementPort);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 1,
      expiresAt: 30_000,
    });
    flushAnimationFrame();
    const firstAnnouncement = getHudUi().getByRole('status');

    act(() => firstPort.triggerDisconnect());
    act(() => vi.advanceTimersByTime(75));
    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 1,
      expiresAt: 30_075,
    });

    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'enter');
    expect(getHudUi().getByRole('status')).not.toBe(firstAnnouncement);
    expect(getHudUi().getByRole('status')).toHaveTextContent(
      '10초 안에 다른 탭에서 같은 단축키를 누르면',
    );

    flushAnimationFrame();
    act(() => vi.advanceTimersByTime(9_925));

    expect(getHudUi().getByRole('timer')).toHaveTextContent('1');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-phase',
      'visible',
    );
  });

  it('exits before cleaning up when the matching candidate Port disconnects', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    flushAnimationFrame();

    act(() => port.triggerDisconnect());

    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    act(() => vi.advanceTimersByTime(150));
    expect(getHost()).toBeInTheDocument();
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('waits for matching clear:expired before announcing expiration exactly once', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 21_000,
    });
    flushAnimationFrame();

    act(() => vi.advanceTimersByTime(1_000));

    expect(getHudUi().queryByRole('timer')).not.toBeInTheDocument();
    expect(getHudUi().getAllByRole('status')).toHaveLength(1);
    expect(getHudUi().getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    act(() => port.triggerDisconnect());

    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    expect(document.body).not.toHaveTextContent('다른 탭을 선택할 수 있는 시간이 끝났어요.');

    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'expired' });
    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'expired' });

    expect(getHudUi().getAllByText('다른 탭을 선택할 수 있는 시간이 끝났어요.')).toHaveLength(1);
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');

    act(() => vi.advanceTimersByTime(149));
    expect(getHudUi().getByRole('complementary')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
    expect(getHudUi().getByRole('status')).toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );
    act(() => vi.advanceTimersByTime(350));

    expect(getHost()).toBeInTheDocument();
    expect(getHudUi().queryByRole('status')).not.toBeInTheDocument();
  });

  it('cleans up silently when a reserved attempt disconnects after the deadline then clears consumed', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 21_000,
    });
    flushAnimationFrame();

    act(() => vi.advanceTimersByTime(1_000));

    expect(getHudUi().getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    act(() => port.triggerDisconnect());
    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'consumed' });
    act(() => vi.advanceTimersByTime(150));

    expect(getHost()).toBeInTheDocument();
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('다른 탭을 선택할 수 있는 시간이 끝났어요.');
  });

  it('does not let an older terminal exit timer clear a newer generation', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'start-succeeded',
      generation: 8,
      tabCount: 2,
    });
    flushAnimationFrame();
    act(() => vi.advanceTimersByTime(2_500));
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    act(() => vi.advanceTimersByTime(75));
    await settleImmediateFeedback({ outcome: 'connecting', generation: 9 });
    flushAnimationFrame();
    act(() => vi.advanceTimersByTime(75));

    expect(getHudUi().getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '9',
    );
  });

  it('does not let an older expiration announcement cleanup clear a newer generation', async () => {
    const port = createPort();
    browserState.connect.mockReturnValue(port);
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 21_000,
    });
    act(() => port.triggerDisconnect());
    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'expired' });
    expect(getHudUi().getAllByText('다른 탭을 선택할 수 있는 시간이 끝났어요.')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(250));

    await settleImmediateFeedback({ outcome: 'connecting', generation: 8 });
    flushAnimationFrame();
    act(() => vi.advanceTimersByTime(250));
    await settleImmediateFeedback({ outcome: 'clear', generation: 7, reason: 'expired' });

    expect(getHudUi().getByRole('complementary')).toHaveAttribute(
      'data-quick-sync-generation',
      '8',
    );
    expect(getHudUi().getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
  });

  it('uses exact success and failure lifetimes', async () => {
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'add-succeeded',
      generation: 10,
      tabCount: 3,
    });
    flushAnimationFrame();

    act(() => vi.advanceTimersByTime(2_499));
    expect(getHudUi().getByRole('status')).toHaveTextContent(
      '이 탭을 동기화에 추가했어요 · 현재 3개 탭',
    );
    act(() => vi.advanceTimersByTime(1));
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    act(() => vi.advanceTimersByTime(150));
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();

    await settleImmediateFeedback({
      outcome: 'add-failed',
      generation: 11,
      tabCount: 3,
      reason: 'content-unreachable',
    });
    flushAnimationFrame();

    act(() => vi.advanceTimersByTime(3_999));
    expect(getHudUi().getByRole('status')).toHaveTextContent('이 탭을 추가하지 못했어요');
    act(() => vi.advanceTimersByTime(1));
    expect(getHudUi().getByRole('complementary')).toHaveAttribute('data-quick-sync-phase', 'exit');
    act(() => vi.advanceTimersByTime(150));
    expect(getHost()).toBeInTheDocument();
    expect(getHudUi().queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('clears terminal and restart state without a false expiration announcement', async () => {
    browserState.connect.mockReturnValue(createPort());
    const { initQuickSyncHud } = await import('./quick-sync-hud');
    initQuickSyncHud();

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });
    flushAnimationFrame();

    await settleImmediateFeedback({
      outcome: 'clear',
      generation: 7,
      reason: 'worker-disconnected',
    });
    act(() => vi.advanceTimersByTime(150));

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

    await settleImmediateFeedback({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(document.activeElement).toBe(focusedBefore);
    expect(getHudUi().queryByRole('button')).not.toBeInTheDocument();
    expect(getHudUi().queryByRole('link')).not.toBeInTheDocument();
  });
});
