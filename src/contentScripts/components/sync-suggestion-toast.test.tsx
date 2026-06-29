/// <reference types="vitest/globals" />

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import type { AddTabToSyncMessage } from '~/shared/types/messages';

import { AddTabToSyncToast } from './sync-suggestion-toast';

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

interface MotionDivMockProps extends React.ComponentProps<'div'> {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  transition?: unknown;
}

vi.mock('~/shared/lib/animations', () => ({
  ANIMATION_DURATIONS: { normal: 0.2 },
  EASING_FUNCTIONS: { easeOutCubic: [0.33, 1, 0.68, 1] },
  getMotionTransition: () => ({}),
  prefersReducedMotion: () => true,
}));

vi.mock('~/shared/i18n', () => ({
  t: (key: string) => {
    const messages: Record<string, string> = {
      addTabButton: '동기화에 추가하기',
      addTabToCurrentSyncBody: '추가하면 이 탭도 지금 동기화 중인 탭들과 함께 스크롤돼요.',
      dismiss: '닫기',
      neverShowAgainForDomain: '이 도메인에서 다시 보지 않기',
      newTabMayBeTranslation: '현재 동기화에 이 탭을 추가할까요?',
      newTabSameTranslatedPage: '현재 동기화에 이 탭을 추가할까요?',
      newTabSameUrl: '현재 동기화에 이 탭을 추가할까요?',
      skipButton: '다음에 하기',
      warningResetScrollOffsets: '추가하면 조정한 스크롤 차이는 초기화돼요.',
    };

    const message = messages[key];
    if (!message) {
      throw new Error(`Missing test translation for ${key}`);
    }

    return message;
  },
}));

describe('AddTabToSyncToast', () => {
  const suggestion: AddTabToSyncMessage = {
    hasManualOffsets: true,
    normalizedUrl: 'example.com/docs',
    tabId: 3,
    tabTitle: 'Example Docs',
  };

  it('renders copy that clearly adds the tab to the current sync', () => {
    render(<AddTabToSyncToast suggestion={suggestion} onAccept={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText('현재 동기화에 이 탭을 추가할까요?')).toBeInTheDocument();
    expect(
      screen.getByText('추가하면 이 탭도 지금 동기화 중인 탭들과 함께 스크롤돼요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('추가하면 조정한 스크롤 차이는 초기화돼요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동기화에 추가하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음에 하기' })).toBeInTheDocument();
  });
});
