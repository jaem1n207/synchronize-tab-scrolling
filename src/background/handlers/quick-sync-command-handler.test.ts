import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import type { QuickSyncFeedbackMessage } from '~/shared/types/quick-sync';
import type { SyncState } from '~/shared/types/sync-state';

import { isContentScriptAlive } from '../lib/content-script-manager';
import { createQuickSyncCandidateStore } from '../lib/quick-sync-candidate';
import { createQuickSyncCoordinator } from '../lib/quick-sync-coordinator';
import {
  createQuickSyncHandshakeRegistry,
  createRecentQuickSyncOutcomeStore,
} from '../lib/quick-sync-feedback';
import { createSyncSessionOrchestrator } from '../lib/sync-session-orchestrator';

import {
  ensureQuickSyncContentScript,
  QUICK_SYNC_COMMAND,
  registerQuickSyncCommandHandler,
} from './quick-sync-command-handler';

import type { QuickSyncCommandHandlerDependencies } from './quick-sync-command-handler';
import type { QuickSyncPort } from '../lib/quick-sync-feedback';
import type { SyncTransitionGate } from '../lib/sync-transition-gate';
import type WebExtensionBrowser from 'webextension-polyfill';

vi.mock('webextension-polyfill', () => ({
  default: {
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
    commands: { onCommand: { addListener: vi.fn() } },
    i18n: { getMessage: vi.fn().mockReturnValue('unsupported') },
    runtime: { onConnect: { addListener: vi.fn() } },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    tabs: {
      get: vi.fn(),
      query: vi.fn(),
    },
  },
}));

vi.mock('webext-bridge/background', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../lib/content-script-manager', () => ({
  isContentScriptAlive: vi.fn(),
}));

function createTab(id: number, windowId: number): WebExtensionBrowser.Tabs.Tab {
  return {
    id,
    windowId,
    index: 0,
    highlighted: true,
    active: true,
    pinned: false,
    incognito: false,
    url: `https://example.test/${id}`,
  };
}

function createSerialGate(getRevision: () => number): SyncTransitionGate {
  let tail: Promise<void> = Promise.resolve();
  let operationGeneration = 0;
  return {
    run(transition) {
      const result = tail.then(() =>
        transition({
          operationGeneration: ++operationGeneration,
          expectedRevision: getRevision(),
        }),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

describe('registerQuickSyncCommandHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects a missing content runtime and requires the endpoint to become ready', async () => {
    vi.mocked(browser.tabs.get).mockResolvedValue(createTab(33, 3));
    vi.mocked(isContentScriptAlive).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(ensureQuickSyncContentScript(33)).resolves.toBe(true);

    expect(isContentScriptAlive).toHaveBeenNthCalledWith(1, 33);
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 33 },
      files: ['dist/contentScripts/index.global.js'],
    });
    expect(isContentScriptAlive).toHaveBeenNthCalledWith(2, 33);
  });

  it('rejects a reinjected runtime whose endpoint never becomes ready', async () => {
    vi.mocked(browser.tabs.get).mockResolvedValue(createTab(33, 3));
    vi.mocked(isContentScriptAlive).mockResolvedValue(false);

    await expect(ensureQuickSyncContentScript(33)).resolves.toBe(false);

    expect(browser.scripting.executeScript).toHaveBeenCalledOnce();
    expect(isContentScriptAlive).toHaveBeenCalledTimes(2);
  });

  it('commits two supplied eligible tabs through the real coordinator and orchestrator', async () => {
    let state: SyncState = {
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision: 0,
      sessionEpoch: 0,
    };
    let commandListener: Parameters<
      QuickSyncCommandHandlerDependencies['addCommandListener']
    >[0] = () => undefined;
    const committed = Promise.withResolvers<Array<number>>();
    const transitionGate = createSerialGate(() => state.revision);
    const candidateStore = createQuickSyncCandidateStore();
    const handshakeRegistry = createQuickSyncHandshakeRegistry({ now: () => 10_000 });
    const port: QuickSyncPort = {
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    };
    const orchestrator = createSyncSessionOrchestrator({
      getState: () => state,
      persistState: async () => ({ status: 'persisted' }),
      commitState: (nextState) => {
        state = nextState;
        if (nextState.isActive) {
          committed.resolve([...nextState.linkedTabs]);
        }
      },
      ensureContentScript: async () => true,
      sendStart: async (tabId) => ({ success: true, tabId }),
      sendStop: async (tabId) => ({ success: true, tabId }),
      revalidate: async () => true,
      overrideAdapter: {
        prepare: async (operationGeneration, joiningTabIds) => ({
          operationGeneration,
          joiningTabIds: [...joiningTabIds],
          previousOverrideTabIds: [],
          affectedGroupIds: [],
        }),
        commit: async () => ({ status: 'committed' }),
        rollbackUncommitted: async () => ({ status: 'rolled-back' }),
        rollback: async () => ({ status: 'rolled-back' }),
        cleanupResidualRuntime: async () => ({ status: 'cleaned' }),
      },
      startKeepAlive: vi.fn(),
      stopKeepAlive: vi.fn(),
      clearManualOverrides: async () => undefined,
      cleanupScheduler: {
        schedule: vi.fn(),
        cancelForTab: vi.fn(),
        cancelAll: vi.fn(),
      },
      broadcastStatus: async () => undefined,
      recordRecentOutcome: vi.fn(),
    });
    const coordinator = createQuickSyncCoordinator({
      candidateStore,
      handshakeRegistry,
      transitionGate,
      now: () => 10_000,
      getState: () => state,
      ensureContentScript: async () => true,
      revalidateInvocationTab: async () => undefined,
      sendFeedback: async (tabId, message: QuickSyncFeedbackMessage) => {
        if (message.outcome === 'candidate-selected') {
          handshakeRegistry.bindPort({
            generation: message.generation,
            senderTabId: tabId,
            port,
          });
        }
        return { status: 'ready', generation: message.generation };
      },
      startManualSession: orchestrator.startManualSession,
      addTabToManualSession: orchestrator.addTabToManualSession,
      setRecentOutcome: vi.fn(),
      showUnsupportedBadge: vi.fn().mockResolvedValue(undefined),
      setTimer: setTimeout,
    });
    const tabs = new Map([
      [11, createTab(11, 1)],
      [22, createTab(22, 2)],
    ]);

    registerQuickSyncCommandHandler({
      now: () => 10_000,
      addCommandListener(listener) {
        commandListener = listener;
      },
      addConnectListener: vi.fn(),
      addDismissListener: vi.fn(),
      waitForBackgroundInitialization: async () => ({
        manual: { status: 'ready', state },
        auto: { status: 'ready' },
      }),
      queryActiveTab: async () => undefined,
      getTab: async (tabId) => tabs.get(tabId),
      isEligibleTab: () => true,
      transitionGate,
      coordinator,
      handshakeRegistry,
      recentOutcomeStore: createRecentQuickSyncOutcomeStore({ now: () => 10_000 }),
      rejectInvocation: vi.fn(),
    });

    commandListener(QUICK_SYNC_COMMAND, tabs.get(11));
    commandListener(QUICK_SYNC_COMMAND, tabs.get(22));

    await expect(committed.promise).resolves.toEqual([11, 22]);
  });

  it('starts the fallback tab lookup before readiness resolves', async () => {
    const events: Array<string> = [];
    let commandListener: Parameters<
      QuickSyncCommandHandlerDependencies['addCommandListener']
    >[0] = () => undefined;
    let releaseReadiness = (): void => undefined;
    const readiness = new Promise<{
      manual: { status: 'ready'; state: SyncState };
      auto: { status: 'ready' };
    }>((resolve) => {
      releaseReadiness = () =>
        resolve({
          manual: { status: 'ready', state: state },
          auto: { status: 'ready' },
        });
    });
    const state: SyncState = {
      isActive: false,
      linkedTabs: [],
      connectionStatuses: {},
      lastActiveSyncedTabId: null,
      revision: 0,
      sessionEpoch: 0,
    };
    const transitionGate = createSerialGate(() => 0);
    const coordinator = {
      handle: vi.fn().mockResolvedValue({
        status: 'candidate-armed',
        generation: 1,
        expiresAt: 20_000,
      }),
      expireCandidate: vi.fn(),
      handleCandidatePortDisconnect: vi.fn(),
      invalidateCandidate: vi.fn(),
      invalidateCandidateForTab: vi.fn(),
    };

    registerQuickSyncCommandHandler({
      now: () => 10_000,
      addCommandListener(listener) {
        commandListener = listener;
      },
      addConnectListener: vi.fn(),
      addDismissListener: vi.fn(),
      waitForBackgroundInitialization: async () => {
        events.push('readiness');
        return readiness;
      },
      queryActiveTab: async () => {
        events.push('query');
        return createTab(11, 1);
      },
      getTab: async () => createTab(11, 1),
      isEligibleTab: () => true,
      transitionGate,
      coordinator,
      handshakeRegistry: createQuickSyncHandshakeRegistry({ now: () => 10_000 }),
      recentOutcomeStore: createRecentQuickSyncOutcomeStore({ now: () => 10_000 }),
      rejectInvocation: vi.fn(),
    });

    commandListener(QUICK_SYNC_COMMAND);
    expect(events).toEqual(['query', 'readiness']);
    releaseReadiness();
    await vi.waitFor(() => expect(coordinator.handle).toHaveBeenCalledOnce());
  });
});
