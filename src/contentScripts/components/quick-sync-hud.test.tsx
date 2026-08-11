/// <reference types="vitest/globals" />

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuickSyncHud } from './quick-sync-hud';

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
  return render(<QuickSyncHud message={message} />);
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

    expect(screen.getByRole('timer')).toHaveTextContent('1');
    act(() => vi.advanceTimersByTime(1));

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
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
    const view = renderHud(message);

    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).not.toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    view.rerender(<QuickSyncHud message={message} semanticOutcome="expired" />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      '다른 탭을 선택할 수 있는 시간이 끝났어요.',
    );

    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
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

  it('disables all motion when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    renderHud({ outcome: 'connecting', generation: 11 });

    expect(screen.getByRole('complementary')).toHaveStyle({
      animation: 'none',
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
