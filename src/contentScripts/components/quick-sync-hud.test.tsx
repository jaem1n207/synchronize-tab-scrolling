/// <reference types="vitest/globals" />

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuickSyncExpirationAnnouncement, QuickSyncHud } from './quick-sync-hud';

import type { QuickSyncHudMessage } from './quick-sync-hud';

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

function renderHud(message: QuickSyncHudMessage) {
  return render(<QuickSyncHud message={message} phase="visible" />);
}

const outcomeCopyCases = [
  {
    message: { outcome: 'start-succeeded', generation: 1, tabCount: 2 },
    title: '스크롤 동기화를 시작했어요 · 현재 2개 탭',
    supporting: null,
  },
  {
    message: { outcome: 'add-succeeded', generation: 2, tabCount: 3 },
    title: '이 탭을 동기화에 추가했어요 · 현재 3개 탭',
    supporting: null,
  },
  {
    message: { outcome: 'already-included', generation: 3, tabCount: 4 },
    title: '이 탭은 이미 현재 동기화에 포함되어 있어요 · 현재 4개 탭',
    supporting: null,
  },
  {
    message: {
      outcome: 'second-tab-failed',
      generation: 4,
      expiresAt: 30_000,
      reason: 'content-unreachable',
    },
    title: '이 탭을 연결하지 못했어요',
    supporting: '10초 안에 다른 탭에서 같은 단축키를 누르면 다시 시도할 수 있어요.',
  },
  {
    message: {
      outcome: 'add-failed',
      generation: 5,
      tabCount: 3,
      reason: 'content-unreachable',
    },
    title: '이 탭을 추가하지 못했어요',
    supporting: '기존 3개 탭은 계속 동기화되고 있어요.',
  },
] satisfies Array<{
  message: QuickSyncHudMessage;
  title: string;
  supporting: string | null;
}>;

describe('QuickSyncHud', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000));
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

  it('moves the same overlay through enter, visible, and exit phases', () => {
    const message: QuickSyncHudMessage = { outcome: 'connecting', generation: 11 };
    const view = render(<QuickSyncHud message={message} phase="enter" />);
    const hud = screen.getByRole('complementary');

    expect(hud).toHaveAttribute('data-quick-sync-phase', 'enter');
    expect(hud).toHaveStyle({
      opacity: '0',
      transform: 'translate(-50%, -4px)',
      transition:
        'opacity 150ms cubic-bezier(0.215, 0.61, 0.355, 1), transform 150ms cubic-bezier(0.215, 0.61, 0.355, 1)',
    });

    view.rerender(<QuickSyncHud message={message} phase="visible" />);

    expect(screen.getByRole('complementary')).toBe(hud);
    expect(hud).toHaveAttribute('data-quick-sync-phase', 'visible');
    expect(hud).toHaveStyle({
      opacity: '1',
      transform: 'translate(-50%, 0)',
    });

    view.rerender(<QuickSyncHud message={message} phase="exit" />);

    expect(screen.getByRole('complementary')).toBe(hud);
    expect(hud).toHaveAttribute('data-quick-sync-phase', 'exit');
    expect(hud).toHaveStyle({
      opacity: '0',
      transform: 'translate(-50%, -4px)',
    });
  });

  it('centers the add icon without relying on font glyph metrics', () => {
    renderHud({ outcome: 'add-succeeded', generation: 2, tabCount: 3 });

    const marker = document.querySelector<HTMLElement>('[data-quick-sync-marker]');
    const icon = marker?.querySelector('svg');
    expect(marker).toHaveStyle({
      alignSelf: 'center',
      boxSizing: 'border-box',
      display: 'grid',
      height: '24px',
      justifySelf: 'center',
      placeItems: 'center',
      width: '24px',
    });
    expect(icon).toHaveAttribute('height', '14');
    expect(icon).toHaveAttribute('width', '14');
    expect(icon).toHaveStyle({ display: 'block' });
  });

  it('keeps overlay and surface identity with fixed geometry across countdown ticks', () => {
    renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    const hud = screen.getByRole('complementary');
    const surface = document.querySelector<HTMLElement>('[data-quick-sync-surface]');
    const supportingText = document.querySelector<HTMLElement>('[data-quick-sync-supporting-text]');
    const announcement = screen.getByRole('status');
    if (surface === null || supportingText === null) {
      throw new Error('Expected Quick Sync HUD geometry');
    }

    expect(hud).toHaveStyle({
      boxSizing: 'border-box',
      left: '50%',
      maxWidth: 'calc(100vw - 32px)',
      position: 'fixed',
      top: '16px',
      width: '440px',
      zIndex: '2147483647',
    });
    expect(surface).toHaveStyle({
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '24px minmax(0, 1fr) 2ch',
      width: '100%',
    });
    expect(supportingText).toHaveStyle({
      fontVariantNumeric: 'tabular-nums',
    });
    expect(screen.getByRole('timer')).toHaveStyle({
      minWidth: '2ch',
    });

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByRole('complementary')).toBe(hud);
    expect(document.querySelector('[data-quick-sync-surface]')).toBe(surface);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(screen.getByRole('timer')).toHaveTextContent('9');
    expect(supportingText.textContent).toContain('\u20079초');
    expect(announcement).toHaveTextContent('10초 안에 다른 탭에서 같은 단축키를 누르면');
  });

  it('keeps terminal feedback visible until the runtime begins its exit phase', () => {
    const onLifetimeEnd = vi.fn();
    const message: QuickSyncHudMessage = {
      outcome: 'start-succeeded',
      generation: 8,
      tabCount: 2,
    };
    const view = render(
      <QuickSyncHud message={message} phase="visible" onLifetimeEnd={onLifetimeEnd} />,
    );
    const hud = screen.getByRole('complementary');

    act(() => vi.advanceTimersByTime(2_500));

    expect(onLifetimeEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('complementary')).toBe(hud);
    expect(screen.getByRole('status')).toHaveTextContent('스크롤 동기화를 시작했어요');

    view.rerender(<QuickSyncHud message={message} phase="exit" onLifetimeEnd={onLifetimeEnd} />);

    expect(screen.getByRole('complementary')).toBe(hud);
    expect(hud).toHaveAttribute('data-quick-sync-phase', 'exit');
  });

  it('updates the visual timer without re-announcing the status', () => {
    renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    const announcement = screen.getByRole('status');
    expect(announcement).toHaveTextContent('동기화할 탭 1개 선택됨');
    expect(announcement).toHaveTextContent('10초 안에 다른 탭에서 같은 단축키를 누르면');
    expect(screen.getByRole('timer')).toHaveTextContent('10');

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByRole('timer')).toHaveTextContent('9');
    expect(announcement).toHaveTextContent('동기화할 탭 1개 선택됨');
    expect(announcement).toHaveTextContent('10초 안에 다른 탭에서 같은 단축키를 누르면');
  });

  it('never renders zero seconds at the exact deadline', () => {
    vi.setSystemTime(new Date(29_999));
    renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    const surface = document.querySelector('[data-quick-sync-surface]');
    const supportingText = document.querySelector('[data-quick-sync-supporting-text]');
    const timer = document.querySelector('[data-quick-sync-timer]');
    expect(screen.getByRole('timer')).toBe(timer);
    expect(timer).toHaveTextContent('1');
    act(() => vi.advanceTimersByTime(1));

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(document.querySelector('[data-quick-sync-surface]')).toBe(surface);
    expect(document.querySelector('[data-quick-sync-supporting-text]')).toBe(supportingText);
    expect(document.querySelector('[data-quick-sync-timer]')).toBe(timer);
    expect(supportingText).toHaveStyle({ visibility: 'hidden' });
    expect(timer).toHaveStyle({ visibility: 'hidden' });
    expect(screen.getByRole('status')).toHaveTextContent('동기화할 탭 1개 선택됨');
    expect(screen.getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );
  });

  it('keeps the original deadline when the same candidate is selected again', () => {
    const view = renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    act(() => vi.advanceTimersByTime(4_000));
    view.rerender(
      <QuickSyncHud
        message={{
          outcome: 'same-candidate',
          generation: 7,
          expiresAt: 30_000,
        }}
        phase="visible"
      />,
    );

    expect(screen.getByRole('timer')).toHaveTextContent('6');
    expect(screen.getByRole('status')).toHaveTextContent('이 탭은 이미 선택되어 있어요');

    act(() => vi.advanceTimersByTime(6_000));

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('이 탭은 이미 선택되어 있어요');
    expect(screen.getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );
  });

  it('renders connecting feedback without a timer or supporting copy', () => {
    renderHud({ outcome: 'connecting', generation: 11 });

    expect(screen.getByRole('status')).toHaveTextContent('탭을 연결하고 있어요…');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).not.toHaveTextContent('초 안에');
  });

  it.each(outcomeCopyCases)(
    'renders the approved copy for $message.outcome',
    ({ message, title, supporting }) => {
      renderHud(message);

      expect(screen.getByRole('status')).toHaveTextContent(title);
      if (supporting !== null) {
        expect(screen.getByRole('status')).toHaveTextContent(supporting);
      }
    },
  );

  it('announces expiration exactly once only after an authoritative semantic outcome', () => {
    const message: QuickSyncHudMessage = {
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 21_000,
    };
    renderHud(message);

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    render(<QuickSyncExpirationAnnouncement />);

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status')[1]).toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status')[1]).toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );
  });

  it('does not expose focusable controls or move document focus', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: Date.now() + 10_000,
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);

    await user.tab();

    expect(document.activeElement).toBe(document.body);
  });

  it('applies phase changes immediately without animation when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const message: QuickSyncHudMessage = { outcome: 'connecting', generation: 11 };
    const view = render(<QuickSyncHud message={message} phase="enter" />);
    const hud = screen.getByRole('complementary');

    expect(hud).toHaveStyle({
      animation: 'none',
      opacity: '0',
      transition: 'none',
    });

    view.rerender(<QuickSyncHud message={message} phase="visible" />);

    expect(screen.getByRole('complementary')).toBe(hud);
    expect(hud).toHaveStyle({
      animation: 'none',
      opacity: '1',
      transition: 'none',
    });
  });

  it('uses tabular numerals for the visual countdown', () => {
    renderHud({
      outcome: 'candidate-selected',
      generation: 7,
      expiresAt: 30_000,
    });

    expect(screen.getByRole('timer')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' });
  });
});
