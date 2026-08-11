import { useCallback, useEffect, useRef, useState } from 'react';

import { sendMessage } from 'webext-bridge/popup';
import browser from 'webextension-polyfill';

import type {
  ManualReconnectResult,
  SyncStatusRequestMessage,
  SyncStatusResponseMessage,
} from '~/shared/types/sync-session';

export type PopupSessionState =
  | { status: 'loading' }
  | SyncStatusResponseMessage
  | { status: 'error'; reason: 'transport-error' };

export interface UseManualSyncSessionResult {
  state: PopupSessionState;
  isStopping: boolean;
  isReconnecting: boolean;
  warning?: 'cleanup-incomplete';
  refetch: () => Promise<void>;
  stop: () => Promise<void>;
  reconnect: () => Promise<void>;
}

const OPERATION_TIMEOUT_MS = 1_000;

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function resolvePopupViewerRequest(): Promise<SyncStatusRequestMessage> {
  const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
  const viewerTab = activeTabs.find(
    (tab) => isPositiveSafeInteger(tab.id) && isPositiveSafeInteger(tab.windowId),
  );

  if (
    viewerTab === undefined ||
    !isPositiveSafeInteger(viewerTab.id) ||
    !isPositiveSafeInteger(viewerTab.windowId)
  ) {
    throw new Error('Popup viewer context unavailable');
  }

  return {
    source: 'popup',
    viewerTabId: viewerTab.id,
    viewerWindowId: viewerTab.windowId,
  };
}

function removeRecentQuickSyncOutcome(
  response: SyncStatusResponseMessage,
): SyncStatusResponseMessage {
  if (response.status === 'active') {
    return {
      status: 'active',
      snapshot: response.snapshot,
    };
  }

  if (response.status === 'inactive') {
    return {
      status: 'inactive',
      revision: response.revision,
      sessionEpoch: response.sessionEpoch,
    };
  }

  return {
    status: 'error',
    reason: response.reason,
  };
}

function withOperationTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Manual session operation timed out')),
      OPERATION_TIMEOUT_MS,
    );

    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function useManualSyncSession(): UseManualSyncSessionResult {
  const [state, setState] = useState<PopupSessionState>({ status: 'loading' });
  const [isStopping, setIsStopping] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [warning, setWarning] = useState<'cleanup-incomplete'>();
  const requestGenerationRef = useRef(0);
  const outcomeExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  const clearOutcomeExpiryTimer = useCallback((): void => {
    if (outcomeExpiryTimerRef.current !== undefined) {
      clearTimeout(outcomeExpiryTimerRef.current);
      outcomeExpiryTimerRef.current = undefined;
    }
  }, []);

  const applyAuthoritativeState = useCallback(
    (response: SyncStatusResponseMessage, generation: number): void => {
      if (!mountedRef.current || requestGenerationRef.current !== generation) {
        return;
      }

      clearOutcomeExpiryTimer();
      const recentOutcome = response.recentQuickSyncOutcome;
      if (recentOutcome === undefined) {
        setState(response);
        return;
      }

      const remainingMs = recentOutcome.expiresAt - Date.now();
      if (remainingMs <= 0) {
        setState(removeRecentQuickSyncOutcome(response));
        return;
      }

      setState(response);
      outcomeExpiryTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || requestGenerationRef.current !== generation) {
          return;
        }

        setState((currentState) => {
          if (currentState.status === 'loading') {
            return currentState;
          }
          if (currentState.status === 'error' && currentState.reason === 'transport-error') {
            return currentState;
          }
          if (
            currentState.recentQuickSyncOutcome === undefined ||
            currentState.recentQuickSyncOutcome.expiresAt !== recentOutcome.expiresAt
          ) {
            return currentState;
          }

          return removeRecentQuickSyncOutcome(currentState);
        });
        outcomeExpiryTimerRef.current = undefined;
      }, remainingMs);
    },
    [clearOutcomeExpiryTimer],
  );

  const refetch = useCallback(async (): Promise<void> => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    try {
      const request = await resolvePopupViewerRequest();
      const response = await sendMessage('sync:get-status', request, 'background');
      applyAuthoritativeState(response, generation);
    } catch {
      if (mountedRef.current && requestGenerationRef.current === generation) {
        clearOutcomeExpiryTimer();
        setState({
          status: 'error',
          reason: 'transport-error',
        });
      }
    }
  }, [applyAuthoritativeState, clearOutcomeExpiryTimer]);

  useEffect(() => {
    mountedRef.current = true;
    void refetch();

    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      clearOutcomeExpiryTimer();
    };
  }, [clearOutcomeExpiryTimer, refetch]);

  const stop = useCallback(async (): Promise<void> => {
    if (state.status !== 'active' || isStopping) {
      return;
    }

    setIsStopping(true);
    setWarning(undefined);
    try {
      const result = await withOperationTimeout(
        sendMessage('scroll:stop', { expectedRevision: state.snapshot.revision }, 'background'),
      );
      if (
        'status' in result &&
        result.status === 'committed' &&
        result.warning === 'cleanup-incomplete'
      ) {
        setWarning('cleanup-incomplete');
      }
    } catch {
      setWarning(undefined);
    } finally {
      await refetch();
      if (mountedRef.current) {
        setIsStopping(false);
      }
    }
  }, [isStopping, refetch, state]);

  const reconnect = useCallback(async (): Promise<void> => {
    if (state.status !== 'active' || isReconnecting) {
      return;
    }

    setIsReconnecting(true);
    try {
      const operation: Promise<ManualReconnectResult> = sendMessage(
        'sync:reconnect-session',
        { expectedRevision: state.snapshot.revision },
        'background',
      );
      await withOperationTimeout(operation);
    } catch {
      // The authoritative refetch below determines the visible result.
    } finally {
      await refetch();
      if (mountedRef.current) {
        setIsReconnecting(false);
      }
    }
  }, [isReconnecting, refetch, state]);

  return {
    state,
    isStopping,
    isReconnecting,
    warning,
    refetch,
    stop,
    reconnect,
  };
}
