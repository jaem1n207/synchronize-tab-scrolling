import { onMessage, sendMessage } from 'webext-bridge/background';
import browser from 'webextension-polyfill';

import {
  QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
  parseQuickSyncPortGeneration,
} from '~/shared/lib/quick-sync';
import { isForbiddenUrl } from '~/shared/lib/url-utils';
import type { StartSyncContentResponse } from '~/shared/types/messages';
import type {
  DismissQuickSyncRecentOutcomeMessage,
  DismissQuickSyncRecentOutcomeResponse,
  QuickSyncFailureReason,
} from '~/shared/types/quick-sync';

import { manualSyncOverriddenTabs, withAutoSyncLock } from '../lib/auto-sync-state';
import { waitForBackgroundInitialization } from '../lib/background-initialization';
import { isContentScriptAlive } from '../lib/content-script-manager';
import { startKeepAlive, stopKeepAlive } from '../lib/keep-alive';
import { manualOverrideAdapter } from '../lib/manual-override-adapter';
import { sendMessageWithTimeout } from '../lib/messaging';
import { quickSyncCandidateStore } from '../lib/quick-sync-candidate';
import { createQuickSyncCoordinator } from '../lib/quick-sync-coordinator';
import {
  createQuickSyncBadgeController,
  createQuickSyncFeedbackSender,
  quickSyncHandshakeRegistry,
  recentQuickSyncOutcomeStore,
} from '../lib/quick-sync-feedback';
import { createManualCleanupRetryScheduler } from '../lib/sync-cleanup-retry';
import { createSyncSessionOrchestrator } from '../lib/sync-session-orchestrator';
import {
  broadcastSyncStatus,
  commitSyncState,
  getSyncStateSnapshot,
  persistSyncState,
} from '../lib/sync-state';
import { syncTransitionGate } from '../lib/sync-transition-gate';

import type { QuickSyncCoordinator } from '../lib/quick-sync-coordinator';
import type {
  QuickSyncHandshakeRegistry,
  QuickSyncPort,
  RecentQuickSyncOutcomeStore,
} from '../lib/quick-sync-feedback';
import type { SyncTransitionGate } from '../lib/sync-transition-gate';

export const QUICK_SYNC_COMMAND = 'quick-sync-start-or-add';

interface QuickSyncInvocationTab {
  id?: number;
  windowId?: number;
  url?: string;
}

interface QuickSyncRuntimePort extends QuickSyncPort {
  name: string;
  sender?: {
    tab?: {
      id?: number;
    };
  };
}

export interface QuickSyncCommandInvocation {
  commandReceivedAt: number;
  activeTabPromise: Promise<QuickSyncInvocationTab | undefined>;
}

export interface QuickSyncCommandHandlerDependencies {
  now: () => number;
  addCommandListener: (
    listener: (command: string, suppliedTab?: QuickSyncInvocationTab) => void,
  ) => void;
  addConnectListener: (listener: (port: QuickSyncRuntimePort) => void) => void;
  addDismissListener: (
    listener: (
      message: DismissQuickSyncRecentOutcomeMessage,
    ) => DismissQuickSyncRecentOutcomeResponse,
  ) => void;
  waitForBackgroundInitialization: typeof waitForBackgroundInitialization;
  queryActiveTab: () => Promise<QuickSyncInvocationTab | undefined>;
  getTab: (tabId: number) => Promise<QuickSyncInvocationTab | undefined>;
  isEligibleTab: (tab: QuickSyncInvocationTab) => boolean;
  transitionGate: SyncTransitionGate;
  coordinator: QuickSyncCoordinator;
  handshakeRegistry: QuickSyncHandshakeRegistry;
  recentOutcomeStore: RecentQuickSyncOutcomeStore;
  rejectInvocation: (tabId: number, reason: QuickSyncFailureReason) => void;
}

function isPositiveSafeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

export async function handleQuickSyncCommand(
  pending: QuickSyncCommandInvocation,
  dependencies: QuickSyncCommandHandlerDependencies,
): Promise<void> {
  const [readiness, capturedTab] = await Promise.all([
    dependencies.waitForBackgroundInitialization(),
    pending.activeTabPromise,
  ]);
  const capturedTabId = capturedTab?.id;
  const capturedWindowId = capturedTab?.windowId;
  if (!isPositiveSafeInteger(capturedTabId) || !isPositiveSafeInteger(capturedWindowId)) {
    return;
  }
  if (readiness.manual.status !== 'ready') {
    dependencies.rejectInvocation(capturedTabId, 'session-state-unavailable');
    return;
  }

  let currentTab: QuickSyncInvocationTab | undefined;
  try {
    currentTab = await dependencies.getTab(capturedTabId);
  } catch {
    dependencies.rejectInvocation(capturedTabId, 'unsupported-page');
    return;
  }
  if (
    currentTab?.id !== capturedTabId ||
    currentTab.windowId !== capturedWindowId ||
    !dependencies.isEligibleTab(currentTab)
  ) {
    dependencies.rejectInvocation(capturedTabId, 'unsupported-page');
    return;
  }

  await dependencies.transitionGate.run((context) =>
    dependencies.coordinator.handle(context, {
      commandReceivedAt: pending.commandReceivedAt,
      tabId: capturedTabId,
      windowId: capturedWindowId,
    }),
  );
}

export function registerQuickSyncCommandHandler(
  dependencies: QuickSyncCommandHandlerDependencies = defaultQuickSyncCommandHandlerDependencies,
): void {
  dependencies.addCommandListener((command, suppliedTab) => {
    if (command !== QUICK_SYNC_COMMAND) {
      return;
    }
    const commandReceivedAt = dependencies.now();
    const activeTabPromise =
      suppliedTab?.id !== undefined ? Promise.resolve(suppliedTab) : dependencies.queryActiveTab();
    void handleQuickSyncCommand({ commandReceivedAt, activeTabPromise }, dependencies);
  });

  dependencies.addConnectListener((port) => {
    if (!port.name.startsWith('quick-sync-candidate:')) {
      return;
    }
    const generation = parseQuickSyncPortGeneration(port.name);
    const senderTabId = port.sender?.tab?.id;
    if (
      generation === null ||
      !isPositiveSafeInteger(senderTabId) ||
      !dependencies.handshakeRegistry.bindPort({
        generation,
        senderTabId,
        port,
      })
    ) {
      port.disconnect();
    }
  });

  dependencies.addDismissListener((message) => ({
    status: dependencies.recentOutcomeStore.dismiss(message),
  }));
}

const cleanupScheduler = createManualCleanupRetryScheduler({
  transitionGate: syncTransitionGate,
  getState: getSyncStateSnapshot,
  sendStop: (tabId) =>
    sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      { tabIds: [tabId], isAutoSync: false },
      { context: 'content-script', tabId },
      1_000,
    ),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
});

const quickSyncSessionOrchestrator = createSyncSessionOrchestrator({
  getState: getSyncStateSnapshot,
  persistState: persistSyncState,
  commitState: commitSyncState,
  ensureContentScript: async (tabId) => {
    try {
      await browser.tabs.get(tabId);
      if (await isContentScriptAlive(tabId)) {
        return true;
      }
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['dist/contentScripts/index.global.js'],
      });
      return true;
    } catch {
      return false;
    }
  },
  sendStart: (tabId, message) => {
    if (message.isAutoSync === true) {
      return sendMessageWithTimeout<StartSyncContentResponse>(
        'scroll:start',
        {
          tabIds: [...message.tabIds],
          mode: message.mode,
          currentTabId: message.currentTabId,
          isAutoSync: true,
          autoSyncGeneration: message.autoSyncGeneration,
        },
        { context: 'content-script', tabId },
        1_000,
      );
    }
    if (message.isAutoSync === false) {
      return sendMessageWithTimeout<StartSyncContentResponse>(
        'scroll:start',
        {
          tabIds: [...message.tabIds],
          mode: message.mode,
          currentTabId: message.currentTabId,
          isAutoSync: false,
          sessionEpoch: message.sessionEpoch,
        },
        { context: 'content-script', tabId },
        1_000,
      );
    }
    return Promise.resolve({ success: false, tabId });
  },
  sendStop: (tabId, message) =>
    sendMessageWithTimeout<{ success: boolean; tabId?: number; reason?: string }>(
      'scroll:stop',
      {
        ...(message.tabIds === undefined ? {} : { tabIds: [...message.tabIds] }),
        ...(message.isAutoSync === undefined ? {} : { isAutoSync: message.isAutoSync }),
      },
      { context: 'content-script', tabId },
      1_000,
    ),
  revalidate: async (context, tabIds) => {
    if (getSyncStateSnapshot().revision !== context.expectedRevision) {
      return false;
    }
    const tabs = await Promise.allSettled(tabIds.map((tabId) => browser.tabs.get(tabId)));
    return tabs.every((tab) => tab.status === 'fulfilled');
  },
  overrideAdapter: manualOverrideAdapter,
  startKeepAlive,
  stopKeepAlive,
  clearManualOverrides: (tabIds) =>
    withAutoSyncLock(async () => {
      for (const tabId of tabIds) {
        manualSyncOverriddenTabs.delete(tabId);
      }
    }),
  cleanupScheduler,
  broadcastStatus: broadcastSyncStatus,
  recordRecentOutcome: () => undefined,
});

const badgeController = createQuickSyncBadgeController({
  setBadgeText: (details) => browser.action.setBadgeText(details),
  setTitle: (details) => browser.action.setTitle(details),
  getUnsupportedTitle: () => browser.i18n.getMessage('quickSyncUnsupportedTab'),
  setTimer: setTimeout,
});

const feedbackSender = createQuickSyncFeedbackSender((tabId, message) =>
  sendMessage('quick-sync:feedback', message, { context: 'content-script', tabId }),
);

export const quickSyncCoordinator = createQuickSyncCoordinator({
  candidateStore: quickSyncCandidateStore,
  handshakeRegistry: quickSyncHandshakeRegistry,
  transitionGate: syncTransitionGate,
  now: Date.now,
  getState: getSyncStateSnapshot,
  revalidateInvocationTab: async (tabId) => {
    const tab = await browser.tabs.get(tabId);
    if (tab.id !== tabId || isForbiddenUrl(tab.url)) {
      throw new Error('candidate-tab-missing');
    }
  },
  sendFeedback: feedbackSender,
  startManualSession: quickSyncSessionOrchestrator.startManualSession,
  addTabToManualSession: quickSyncSessionOrchestrator.addTabToManualSession,
  setRecentOutcome: recentQuickSyncOutcomeStore.set,
  showUnsupportedBadge: (tabId, generation) => badgeController.showUnsupported(tabId, generation),
  setTimer: setTimeout,
});

const defaultQuickSyncCommandHandlerDependencies: QuickSyncCommandHandlerDependencies = {
  now: Date.now,
  addCommandListener: (listener) => browser.commands.onCommand.addListener(listener),
  addConnectListener: (listener) => browser.runtime.onConnect.addListener(listener),
  addDismissListener: (listener) => {
    onMessage('quick-sync:dismiss-recent-outcome', ({ data }) => listener(data));
  },
  waitForBackgroundInitialization,
  queryActiveTab: () =>
    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs[0]),
  getTab: (tabId) => browser.tabs.get(tabId),
  isEligibleTab: (tab) => !isForbiddenUrl(tab.url),
  transitionGate: syncTransitionGate,
  coordinator: quickSyncCoordinator,
  handshakeRegistry: quickSyncHandshakeRegistry,
  recentOutcomeStore: recentQuickSyncOutcomeStore,
  rejectInvocation: (tabId, reason) => {
    recentQuickSyncOutcomeStore.set({
      tabId,
      resultKind: reason === 'session-state-unavailable' ? reason : 'unsupported',
      reason,
      expiresAt: Date.now() + QUICK_SYNC_RECENT_OUTCOME_DURATION_MS,
    });
    void badgeController.showUnsupported(tabId, 0).catch(() => undefined);
  },
};
