/// <reference types="vitest/globals" />

import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ContextualHintToast } from './contextual-hint-toast';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    aside: (props: MotionAsideMockProps) => {
      const { children, animate, exit, initial, transition, ...domProps } = props;
      void animate;
      void exit;
      void initial;
      void transition;
      return <aside {...domProps}>{children}</aside>;
    },
    div: (props: MotionDivMockProps) => {
      const { children, animate, initial, transition, ...domProps } = props;
      void animate;
      void initial;
      void transition;
      return <div {...domProps}>{children}</div>;
    },
  },
}));

interface MotionAsideMockProps extends React.ComponentProps<'aside'> {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  transition?: unknown;
}

interface MotionDivMockProps extends React.ComponentProps<'div'> {
  animate?: unknown;
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
  t: (key: string, substitution?: string) => {
    const messages: Record<string, string> = {
      contextualHintManualScrollTitle: 'Adjust one page while sync stays on',
      contextualHintManualScrollDifferentLengths:
        'When synced pages have different lengths, the scroll position can feel offset.',
      contextualHintManualScrollShortcut:
        'Hold $SHORTCUT$ and scroll to move only the current page.',
      contextualHintManualScrollResume:
        'Release the key and sync continues from the adjusted position.',
      contextualHintManualScrollHideButton: 'Hide this hint',
      contextualHintPageChangeSyncedTitle: 'Other tabs moved to the same page',
      contextualHintPageChangeSyncedBody: 'Turn off page-change sync if you do not want this.',
      contextualHintKeepWebsitePathSyncedTitle: 'Each tab kept its website',
      contextualHintKeepWebsitePathSyncedBody: 'Only the matching path was opened when possible.',
      contextualHintChangeSettingAction: 'Change setting',
      contextualHintShowLaterAction: 'Show later',
      contextualHintHideAction: 'Hide this hint',
    };

    const message = messages[key];
    if (!message) {
      throw new Error(`Missing test translation for ${key}`);
    }

    return substitution ? message.replace('$SHORTCUT$', substitution) : message;
  },
}));

describe('ContextualHintToast', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders manual scroll adjustment copy with the shortcut label', () => {
    render(
      <ContextualHintToast
        hintId="manual-scroll-adjustment"
        shortcutLabel="⌥ Option"
        onAutoDismiss={vi.fn()}
        onHidePermanently={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('status', { name: 'Adjust one page while sync stays on' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'When synced pages have different lengths, the scroll position can feel offset.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hold ⌥ Option and scroll to move only the current page.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Release the key and sync continues from the adjusted position.'),
    ).toBeInTheDocument();
  });

  it('auto-dismisses temporarily without hiding the hint permanently', () => {
    vi.useFakeTimers();
    const onAutoDismiss = vi.fn();
    const onHidePermanently = vi.fn();

    render(
      <ContextualHintToast
        autoDismissDelayMs={10}
        hintId="manual-scroll-adjustment"
        shortcutLabel="Alt"
        onAutoDismiss={onAutoDismiss}
        onHidePermanently={onHidePermanently}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(310);
    });

    expect(onAutoDismiss).toHaveBeenCalledTimes(1);
    expect(onHidePermanently).not.toHaveBeenCalled();
  });

  it('persists dismissal only when the explicit hide action is clicked', () => {
    vi.useFakeTimers();
    const onAutoDismiss = vi.fn();
    const onHidePermanently = vi.fn();

    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="manual-scroll-adjustment"
        shortcutLabel="Alt"
        onAutoDismiss={onAutoDismiss}
        onHidePermanently={onHidePermanently}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide this hint' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onHidePermanently).toHaveBeenCalledTimes(1);
    expect(onAutoDismiss).not.toHaveBeenCalled();
  });

  it('renders URL Sync page-change copy with settings and dismissal actions', () => {
    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="page-change-synced"
        onAutoDismiss={vi.fn()}
        onHidePermanently={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('status', { name: 'Other tabs moved to the same page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Turn off page-change sync if you do not want this.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change setting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide this hint' })).toBeInTheDocument();
  });

  it('renders URL Sync keep-website copy', () => {
    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="keep-website-path-synced"
        onAutoDismiss={vi.fn()}
        onHidePermanently={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Each tab kept its website' })).toBeInTheDocument();
    expect(
      screen.getByText('Only the matching path was opened when possible.'),
    ).toBeInTheDocument();
  });

  it('opens URL Sync settings from the CTA without persisting dismissal', () => {
    vi.useFakeTimers();
    const onAutoDismiss = vi.fn();
    const onHidePermanently = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="page-change-synced"
        onAutoDismiss={onAutoDismiss}
        onHidePermanently={onHidePermanently}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change setting' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onHidePermanently).not.toHaveBeenCalled();
    expect(onAutoDismiss).not.toHaveBeenCalled();
  });

  it('temporarily dismisses URL Sync hints without persisting dismissal', () => {
    vi.useFakeTimers();
    const onAutoDismiss = vi.fn();
    const onHidePermanently = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="page-change-synced"
        onAutoDismiss={onAutoDismiss}
        onHidePermanently={onHidePermanently}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show later' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onAutoDismiss).toHaveBeenCalledTimes(1);
    expect(onHidePermanently).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('persists URL Sync hint dismissal only from the hide action', () => {
    vi.useFakeTimers();
    const onAutoDismiss = vi.fn();
    const onHidePermanently = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <ContextualHintToast
        autoDismissDelayMs={10_000}
        hintId="page-change-synced"
        onAutoDismiss={onAutoDismiss}
        onHidePermanently={onHidePermanently}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide this hint' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onHidePermanently).toHaveBeenCalledTimes(1);
    expect(onAutoDismiss).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});
