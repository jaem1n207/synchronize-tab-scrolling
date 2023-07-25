function debounce(func, wait) {
  let timeout;
  return function (...args) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return (...args) => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// This is a variable to avoid getting stuck in a loop that keeps the scroll position synchronized between multiple tabs.
let scrolling = false;

const resetScrolling = debounce(() => {
  scrolling = false;
  console.log("Scrolling reset to", scrolling);
}, 250);

const onScrollHandler = throttle(() => {
  try {
    console.log("Scroll event triggered");
    if (scrolling) return;

    const scrollPosition =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const scrollYPercentage =
      scrollPosition / document.documentElement.scrollHeight;

    console.log(
      "Scroll event triggered, sending syncScroll message with percentage:",
      scrollYPercentage
    );

    chrome.runtime.sendMessage({
      command: "syncScroll",
      data: { scrollYPercentage },
    });
  } catch (err) {
    console.error(`Error in onScrollHandler: ${err}`);
  }
}, 50);

chrome.runtime.onMessage.addListener((request) => {
  if (request.command === "startSyncTab") {
    console.log("Content script loaded for tab", request.data);
    window.addEventListener("scroll", onScrollHandler);
    console.log("Scroll event listener registered");
  }

  if (request.command === "stopSyncTab") {
    window.removeEventListener("scroll", onScrollHandler);
  }

  if (request.command === "syncScrollForTab") {
    scrolling = true;
    console.log("Received syncScrollForTab message with data", request.data);

    const { scrollYPercentage } = request.data;
    const scrollPosition =
      scrollYPercentage * document.documentElement.scrollHeight;

    window.scrollTo({
      top: scrollPosition,
      behavior: "auto",
    });

    resetScrolling();
  }
});

/**
 * @description
 * Chrome extensions don't support modules in content scripts.
 */
import("./components/Demo");
