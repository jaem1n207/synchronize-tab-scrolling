import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { onMessage } from 'webext-bridge/content-script';
import browser from 'webextension-polyfill';

import { prefersReducedMotion } from '~/shared/lib/animations';
import { getQuickSyncPortName, QUICK_SYNC_HUD_MOTION_DURATION_MS } from '~/shared/lib/quick-sync';
import type {
  QuickSyncFeedbackMessage,
  QuickSyncFeedbackResponse,
} from '~/shared/types/quick-sync';

import { QuickSyncExpirationAnnouncement, QuickSyncHud } from './components';

import type { QuickSyncHudMessage, QuickSyncHudPhase } from './components/quick-sync-hud';

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
  phase: QuickSyncHudPhase;
  presentationId: number;
  port?: CandidatePort;
}

interface DisconnectedCandidate {
  message: QuickSyncHudMessage;
}

let hudHost: HTMLDivElement | null = null;
let hudRoot: ReturnType<typeof createRoot> | null = null;
let activeHud: ActiveHud | null = null;
let disconnectedCandidate: DisconnectedCandidate | null = null;
let nextPresentationId = 1;
let visualSequence = 0;
let announcedExpirationGeneration: number | null = null;
let handlerRegistered = false;
let initializationFailed = false;
let enterAnimationFrame: number | undefined;
let exitTimer: ReturnType<typeof setTimeout> | undefined;
let expirationAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;

function clearEnterAnimationFrame(): void {
  if (enterAnimationFrame !== undefined) {
    window.cancelAnimationFrame(enterAnimationFrame);
    enterAnimationFrame = undefined;
  }
}

function clearExitTimer(): void {
  if (exitTimer !== undefined) {
    clearTimeout(exitTimer);
    exitTimer = undefined;
  }
}

function clearExpirationAnnouncementTimer(): void {
  if (expirationAnnouncementTimer !== undefined) {
    clearTimeout(expirationAnnouncementTimer);
    expirationAnnouncementTimer = undefined;
  }
}

function clearVisualScheduling(): void {
  clearEnterAnimationFrame();
  clearExitTimer();
  clearExpirationAnnouncementTimer();
}

function destroyHudHost(disconnectPort: boolean): void {
  clearVisualScheduling();
  const previous = activeHud;
  activeHud = null;
  announcedExpirationGeneration = null;
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
  if (hudHost !== null && hudRoot !== null && document.body.contains(hudHost)) {
    const hosts = document.querySelectorAll(`#${HUD_HOST_ID}`);
    hosts.forEach((host) => {
      if (host !== hudHost) {
        host.remove();
      }
    });
    return;
  }

  if (hudHost !== null || hudRoot !== null) {
    destroyHudHost(false);
  }
  createHudHost();
}

function renderHudState(): void {
  if (hudRoot === null) {
    throw new Error('quick-sync-hud-root-unavailable');
  }
  const current = activeHud;
  const expirationGeneration = announcedExpirationGeneration;
  flushSync(() => {
    hudRoot?.render(
      <>
        {current === null ? null : (
          <QuickSyncHud
            key={`visual:${current.presentationId}`}
            message={current.message}
            phase={current.phase}
            onLifetimeEnd={() => handleLifetimeEnd(current.message)}
          />
        )}
        {expirationGeneration === null ? null : (
          <QuickSyncExpirationAnnouncement key={`expiration:${expirationGeneration}`} />
        )}
      </>,
    );
  });
}

function isSameMessage(active: ActiveHud, message: QuickSyncHudMessage): boolean {
  return (
    active.message.generation === message.generation && active.message.outcome === message.outcome
  );
}

function finishExit(message: QuickSyncHudMessage, sequence: number): void {
  const current = activeHud;
  if (
    current === null ||
    visualSequence !== sequence ||
    !isSameMessage(current, message) ||
    current.phase !== 'exit'
  ) {
    return;
  }
  exitTimer = undefined;
  activeHud = null;
  renderHudState();
}

function startExit(message: QuickSyncHudMessage, disconnectPort: boolean): void {
  const current = activeHud;
  if (current === null || !isSameMessage(current, message)) {
    return;
  }
  if (current.phase === 'exit') {
    return;
  }

  clearEnterAnimationFrame();
  clearExitTimer();
  clearExpirationAnnouncementTimer();
  const previousPort = current.port;
  const presentationId = current.presentationId;
  const sequence = visualSequence + 1;
  visualSequence = sequence;
  activeHud = { message, phase: 'exit', presentationId };
  if (disconnectPort) {
    previousPort?.disconnect();
  }
  renderHudState();

  if (prefersReducedMotion()) {
    finishExit(message, sequence);
    return;
  }
  exitTimer = setTimeout(() => finishExit(message, sequence), QUICK_SYNC_HUD_MOTION_DURATION_MS);
}

function handleLifetimeEnd(message: QuickSyncHudMessage): void {
  startExit(message, false);
}

function scheduleVisiblePhase(message: QuickSyncHudMessage, sequence: number): void {
  enterAnimationFrame = window.requestAnimationFrame(() => {
    enterAnimationFrame = undefined;
    const current = activeHud;
    if (
      current === null ||
      visualSequence !== sequence ||
      !isSameMessage(current, message) ||
      current.phase !== 'enter'
    ) {
      return;
    }
    activeHud = { ...current, phase: 'visible' };
    renderHudState();
  });
}

function commitEnterStyles(): void {
  hudHost?.shadowRoot
    ?.querySelector<HTMLElement>('[data-quick-sync-phase="enter"]')
    ?.getBoundingClientRect();
}

function getCandidateExpiration(message: QuickSyncHudMessage): number | null {
  switch (message.outcome) {
    case 'candidate-selected':
    case 'same-candidate':
    case 'second-tab-failed':
      return message.expiresAt;
    case 'connecting':
    case 'start-succeeded':
    case 'add-succeeded':
    case 'already-included':
    case 'add-failed':
      return null;
  }
}

function shouldPreservePresentation(message: QuickSyncHudMessage): boolean {
  if (
    activeHud === null ||
    activeHud.phase === 'exit' ||
    activeHud.message.generation !== message.generation
  ) {
    return false;
  }
  if (message.outcome !== 'candidate-selected') {
    return true;
  }
  return getCandidateExpiration(activeHud.message) === message.expiresAt;
}

function showMessage(message: QuickSyncHudMessage, port?: CandidatePort): void {
  clearVisualScheduling();
  const previousPort = activeHud?.port;
  const previousPresentationId = activeHud?.presentationId;
  const preservesVisualIdentity = shouldPreservePresentation(message);
  const presentationId =
    preservesVisualIdentity && previousPresentationId !== undefined
      ? previousPresentationId
      : nextPresentationId++;
  const phase: QuickSyncHudPhase =
    prefersReducedMotion() || preservesVisualIdentity ? 'visible' : 'enter';
  const sequence = visualSequence + 1;
  visualSequence = sequence;
  activeHud =
    port === undefined
      ? { message, phase, presentationId }
      : { message, phase, presentationId, port };
  if (previousPort !== undefined && previousPort !== port) {
    previousPort.disconnect();
  }
  renderHudState();
  if (phase === 'enter') {
    commitEnterStyles();
    scheduleVisiblePhase(message, sequence);
  }
}

function scheduleExpirationAnnouncementCleanup(generation: number): void {
  clearExpirationAnnouncementTimer();
  expirationAnnouncementTimer = setTimeout(() => {
    if (announcedExpirationGeneration !== generation) {
      return;
    }
    expirationAnnouncementTimer = undefined;
    announcedExpirationGeneration = null;
    renderHudState();
  }, EXPIRATION_ANNOUNCEMENT_GRACE_MS);
}

function connectCandidatePort(message: QuickSyncHudMessage): CandidatePort | undefined {
  if (message.outcome !== 'candidate-selected') {
    return activeHud?.message.generation === message.generation ? activeHud.port : undefined;
  }

  const port = browser.runtime.connect({ name: getQuickSyncPortName(message.generation) });
  port.onDisconnect.addListener(() => {
    if (activeHud?.message.generation === message.generation && activeHud.port === port) {
      const disconnectedMessage = activeHud.message;
      const presentationId = activeHud.presentationId;
      activeHud = { message: disconnectedMessage, phase: activeHud.phase, presentationId };
      disconnectedCandidate = { message: disconnectedMessage };
      startExit(disconnectedMessage, false);
    }
  });
  return port;
}

async function handleClearMessage(
  message: Extract<QuickSyncFeedbackMessage, { outcome: 'clear' }>,
): Promise<QuickSyncFeedbackResponse> {
  const hasMatchingMessage =
    activeHud?.message.generation === message.generation ||
    disconnectedCandidate?.message.generation === message.generation;
  if (!hasMatchingMessage) {
    return { status: 'ready', generation: message.generation };
  }

  if (message.reason === 'expired') {
    if (announcedExpirationGeneration === message.generation) {
      return { status: 'ready', generation: message.generation };
    }
    try {
      ensureHudHost();
    } catch {
      disconnectedCandidate = null;
      return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
    }
    disconnectedCandidate = null;
    if (activeHud?.message.generation === message.generation && activeHud.phase !== 'exit') {
      startExit(activeHud.message, true);
    }
    announcedExpirationGeneration = message.generation;
    renderHudState();
    scheduleExpirationAnnouncementCleanup(message.generation);
    return { status: 'ready', generation: message.generation };
  }

  disconnectedCandidate = null;
  if (activeHud?.message.generation === message.generation) {
    startExit(activeHud.message, false);
  }
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

  disconnectedCandidate = null;
  announcedExpirationGeneration = null;
  try {
    ensureHudHost();
  } catch {
    initializationFailed = true;
    return { status: 'failed', generation: message.generation, reason: 'hud-unavailable' };
  }

  const previousPort = activeHud?.port;
  let port: CandidatePort | undefined;
  try {
    port = connectCandidatePort(message);
  } catch {
    clearVisualScheduling();
    activeHud = null;
    previousPort?.disconnect();
    renderHudState();
    return { status: 'failed', generation: message.generation, reason: 'port-unavailable' };
  }

  try {
    showMessage(message, port);
  } catch {
    activeHud = null;
    port?.disconnect();
    destroyHudHost(false);
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
