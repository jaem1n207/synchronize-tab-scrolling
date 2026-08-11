import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { onMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { getQuickSyncPortName } from '~/shared/lib/quick-sync';
import type {
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
} from '~/shared/types/quick-sync';

import { QuickSyncHud } from './components';

import type { QuickSyncHudMessage } from './components/quick-sync-hud';

const HUD_HOST_ID = 'scroll-sync-quick-sync-hud-root';
const HUD_APP_ID = 'scroll-sync-quick-sync-hud-app';
const EXPIRATION_ANNOUNCEMENT_GRACE_MS = 500;

interface CandidatePort {
  disconnect(): void;
  onDisconnect: {
    addListener(listener: () => void): void;
  };
}

interface ActiveHud {
  message: QuickSyncHudMessage;
  port?: CandidatePort;
}

type CandidateHudMessage = Extract<
  QuickSyncHudMessage,
  { outcome: 'candidate-selected' | 'same-candidate' | 'second-tab-failed' }
>;

let hudHost: HTMLDivElement | null = null;
let hudRoot: ReturnType<typeof createRoot> | null = null;
let stylesheetReady: Promise<boolean> | null = null;
let settleStylesheet: ((ready: boolean) => void) | null = null;
let activeHud: ActiveHud | null = null;
let pendingGeneration: number | null = null;
let feedbackSequence = 0;
let handlerRegistered = false;
let initializationFailed = false;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

function isCandidateMessage(message: QuickSyncHudMessage): message is CandidateHudMessage {
  return (
    message.outcome === 'candidate-selected' ||
    message.outcome === 'same-candidate' ||
    message.outcome === 'second-tab-failed'
  );
}

function clearScheduledCleanup(): void {
  if (cleanupTimer !== undefined) {
    clearTimeout(cleanupTimer);
    cleanupTimer = undefined;
  }
}

function removeHudHost(disconnectPort: boolean): void {
  clearScheduledCleanup();
  const previous = activeHud;
  activeHud = null;
  if (disconnectPort) {
    previous?.port?.disconnect();
  }
  if (hudRoot !== null) {
    hudRoot.unmount();
    hudRoot = null;
  }
  if (hudHost !== null) {
    hudHost.remove();
    hudHost = null;
  }
  settleStylesheet?.(false);
  settleStylesheet = null;
  stylesheetReady = null;
}

function createHudHost(): void {
  const existingHosts = document.querySelectorAll(`#${HUD_HOST_ID}`);
  existingHosts.forEach((host) => host.remove());

  const host = document.createElement('div');
  host.id = HUD_HOST_ID;
  host.className = 'tailwind tailwind-no-preflight';
  host.setAttribute('style', 'all: revert;');
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = browser.runtime.getURL('dist/contentScripts/synchronize-tab-scrolling.css');

  stylesheetReady = new Promise<boolean>((resolve) => {
    let settled = false;
    settleStylesheet = (ready) => {
      if (settled) {
        return;
      }
      settled = true;
      settleStylesheet = null;
      resolve(ready);
    };
    styleLink.onload = () => settleStylesheet?.(true);
    styleLink.onerror = () => settleStylesheet?.(false);
  });
  shadowRoot.appendChild(styleLink);

  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    :host {
      all: initial;
      display: block;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
  `;
  shadowRoot.appendChild(baseStyle);

  const app = document.createElement('div');
  app.id = HUD_APP_ID;
  app.style.cssText = `
    font-size: 16px;
    line-height: 1.5;
    pointer-events: none;
  `;
  shadowRoot.appendChild(app);

  hudHost = host;
  hudRoot = createRoot(app);
}

function ensureHudHost(): void {
  if (
    hudHost !== null &&
    hudRoot !== null &&
    stylesheetReady !== null &&
    document.body.contains(hudHost)
  ) {
    const hosts = document.querySelectorAll(`#${HUD_HOST_ID}`);
    hosts.forEach((host) => {
      if (host !== hudHost) {
        host.remove();
      }
    });
    return;
  }

  if (hudHost !== null || hudRoot !== null) {
    removeHudHost(false);
  }
  createHudHost();
}

function scheduleExpirationAnnouncementCleanup(message: QuickSyncHudMessage): void {
  if (cleanupTimer !== undefined) {
    return;
  }
  cleanupTimer = setTimeout(() => {
    if (
      activeHud?.message.generation === message.generation &&
      activeHud.message.outcome === message.outcome
    ) {
      removeHudHost(true);
    }
  }, EXPIRATION_ANNOUNCEMENT_GRACE_MS);
}

function handleLifetimeEnd(message: QuickSyncHudMessage): void {
  if (
    activeHud?.message.generation !== message.generation ||
    activeHud.message.outcome !== message.outcome
  ) {
    return;
  }
  if (isCandidateMessage(message)) {
    scheduleExpirationAnnouncementCleanup(message);
    return;
  }
  removeHudHost(false);
}

function renderMessage(message: QuickSyncHudMessage): void {
  if (hudRoot === null) {
    throw new Error('quick-sync-hud-root-unavailable');
  }
  clearScheduledCleanup();
  flushSync(() => {
    hudRoot?.render(
      <QuickSyncHud
        key={`${message.generation}:${message.outcome}`}
        message={message}
        onLifetimeEnd={() => handleLifetimeEnd(message)}
      />,
    );
  });
}

function connectCandidatePort(message: QuickSyncHudMessage): CandidatePort | undefined {
  if (message.outcome !== 'candidate-selected') {
    return activeHud?.message.generation === message.generation ? activeHud.port : undefined;
  }

  const port = browser.runtime.connect({ name: getQuickSyncPortName(message.generation) });
  port.onDisconnect.addListener(() => {
    if (activeHud?.message.generation === message.generation && activeHud.port === port) {
      if (message.expiresAt <= Date.now()) {
        activeHud = { message };
        renderMessage(message);
        scheduleExpirationAnnouncementCleanup(message);
        return;
      }
      removeHudHost(false);
    }
  });
  return port;
}

async function handleClearMessage(
  message: Extract<QuickSyncFeedbackMessage, { outcome: 'clear' }>,
): Promise<QuickSyncFeedbackResponse> {
  if (pendingGeneration === message.generation) {
    feedbackSequence += 1;
    pendingGeneration = null;
    removeHudHost(false);
    return { status: 'ready', generation: message.generation };
  }
  if (activeHud?.message.generation !== message.generation) {
    return { status: 'ready', generation: message.generation };
  }

  if (
    message.reason === 'expired' &&
    isCandidateMessage(activeHud.message) &&
    activeHud.message.expiresAt <= Date.now()
  ) {
    renderMessage(activeHud.message);
    scheduleExpirationAnnouncementCleanup(activeHud.message);
    return { status: 'ready', generation: message.generation };
  }

  removeHudHost(false);
  return { status: 'ready', generation: message.generation };
}

async function handleFeedback(
  message: QuickSyncFeedbackMessage,
): Promise<QuickSyncFeedbackResponse> {
  if (message.outcome === 'clear') {
    return handleClearMessage(message);
  }
  if (initializationFailed) {
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }

  feedbackSequence += 1;
  const requestSequence = feedbackSequence;
  pendingGeneration = message.generation;
  try {
    ensureHudHost();
  } catch {
    pendingGeneration = null;
    initializationFailed = true;
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }

  const ready = await stylesheetReady;
  if (!ready) {
    if (feedbackSequence === requestSequence) {
      pendingGeneration = null;
      removeHudHost(false);
    }
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }
  if (feedbackSequence !== requestSequence || pendingGeneration !== message.generation) {
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }
  pendingGeneration = null;

  let port: CandidatePort | undefined;
  try {
    port = connectCandidatePort(message);
  } catch {
    removeHudHost(false);
    return { status: 'failed', generation: message.generation, reason: 'port-unavailable' };
  }

  activeHud = port === undefined ? { message } : { message, port };
  try {
    renderMessage(message);
  } catch {
    activeHud = null;
    port?.disconnect();
    removeHudHost(false);
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }

  return { status: 'ready', generation: message.generation };
}

function registerFeedbackHandler(): void {
  if (handlerRegistered) {
    return;
  }
  onMessage('quick-sync:feedback', ({ data }) => handleFeedback(data));
  handlerRegistered = true;
}

export function initQuickSyncHud(): void {
  registerFeedbackHandler();
  try {
    ensureHudHost();
    initializationFailed = false;
  } catch {
    initializationFailed = true;
  }
}
