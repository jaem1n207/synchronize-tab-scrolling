/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

const debounce = <A extends Function>(
  f: A,
  interval?: number,
  immediate?: boolean
): A & { clear: () => void } & { flush: () => void } => {
  let timeout: number | NodeJS.Timeout | undefined;
  const debounced = function (this: any, ...args: any[]) {
    const callNow = immediate && !timeout;
    const later = () => {
      timeout = undefined;
      if (!immediate) {
        f.apply(this, args);
      }
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, interval);
    if (callNow) {
      f.apply(this, args);
    }
  };
  debounced.clear = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };
  debounced.flush = () => {
    if (timeout) {
      f();
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  return debounced as any;
};

const throttle = <A extends Function>(
  f: A,
  interval: number,
  immediate?: boolean
): A & { clear: () => void } => {
  let timeout: number | NodeJS.Timeout | undefined;
  let initialCall = true;
  const throttled = function (this: any, ...args: any[]) {
    if (initialCall) {
      initialCall = false;
      if (immediate) {
        f.apply(this, args);
      }
    }
    if (timeout) {
      return;
    }
    timeout = setTimeout(() => {
      f.apply(this, args);
      timeout = undefined;
    }, interval);
  };
  throttled.clear = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    initialCall = true;
  };

  return throttled as any;
};

// This is the variable used to apply 'scrollPosition' at the right time when 'syncScrollForTab' is received.
let scrolling = false;

const onScrollHandler = throttle(() => {
  if (scrolling) return;

  const scrollPosition =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;

  const scrollYPercentage =
    scrollPosition / document.documentElement.scrollHeight;

  chrome.runtime.sendMessage({
    command: "syncScroll",
    data: { scrollYPercentage },
  });
}, 50);

chrome.runtime.onMessage.addListener((request) => {
  if (request.command === "startSyncTab") {
    window.addEventListener("scroll", onScrollHandler);
  }

  if (request.command === "stopSyncTab") {
    window.removeEventListener("scroll", onScrollHandler);
  }

  if (request.command === "syncScrollForTab") {
    scrolling = true;

    const { scrollYPercentage } = request.data;
    const scrollPosition =
      scrollYPercentage * document.documentElement.scrollHeight;
    console.log("syncScrollForTab", scrollPosition);

    window.scrollTo({
      top: scrollPosition,
      behavior: "auto",
    });

    debounce(() => {
      scrolling = false;
    }, 250);
  }
});

/**
 * @description
 * Chrome extensions don't support modules in content scripts.
 */
import("./components/Demo");
