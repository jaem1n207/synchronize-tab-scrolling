console.log("content loaded");

// eslint-disable-next-line @typescript-eslint/ban-types
const debounce = <A extends Function>(
  f: A,
  interval?: number,
  immediate?: boolean
): A & { clear(): void } & { flush(): void } => {
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

// eslint-disable-next-line @typescript-eslint/ban-types
const throttle = <A extends Function>(
  f: A,
  interval: number,
  immediate?: boolean
): A & { clear(): void } => {
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

document.addEventListener("scroll", (e) => {
  const scrollPosition =
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;

  const scrollYPercentage =
    scrollPosition / document.documentElement.scrollHeight;

  chrome.runtime.sendMessage({
    command: "scroll",
    data: { percentage: scrollYPercentage },
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "scroll") {
    const { percentage } = request.data;
    const newScrollPosition =
      percentage * document.documentElement.scrollHeight;
    console.log(
      percentage,
      "🚀 ~ file: index.ts:34 ~ chrome.runtime.onMessage.addListener ~ newScrollPosition:",
      newScrollPosition
    );
    window.scrollTo({
      top: newScrollPosition,
      behavior: "auto",
    });
  }
});

/**
 * @description
 * Chrome extensions don't support modules in content scripts.
 */
import("./components/Demo");
