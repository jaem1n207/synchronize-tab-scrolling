import '~/shared/styles';
import { initQuickSyncHud } from './quick-sync-hud';
import { initScrollSync } from './scroll-sync';

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
(() => {
  // Register Quick Sync feedback before synchronization work can begin.
  initQuickSyncHud();

  // Initialize scroll synchronization system
  initScrollSync();

  Reflect.set(globalThis, '__synchronizeTabScrollingRuntimeReady', true);

  // Note: Keyboard handler requires tab ID which will be provided when sync starts
  // Cannot use browser.tabs.getCurrent() in content scripts due to Chrome restrictions
})();
