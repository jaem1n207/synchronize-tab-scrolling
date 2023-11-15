import { debounce, throttle } from "@shared/utils/utils";

// This is a variable to avoid getting stuck in a loop that keeps the scroll position synchronized between multiple tabs.
let scrolling = false;

const resetScrolling = debounce(() => {
  scrolling = false;
  console.debug("Scrolling reset to", scrolling);
}, 250);

const onScrollHandler = throttle(() => {
  try {
    console.debug("Scroll event triggered");
    if (scrolling) return;

    const scrollPosition =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const scrollYPercentage =
      scrollPosition / document.documentElement.scrollHeight;

    console.debug(
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
    console.debug("Content script loaded for tab", request.data);
    window.addEventListener("scroll", onScrollHandler);
    console.debug("Scroll event listener registered");
  }

  if (request.command === "stopSyncTab") {
    window.removeEventListener("scroll", onScrollHandler);
  }

  if (request.command === "syncScrollForTab") {
    scrolling = true;
    console.debug("Received syncScrollForTab message with data", request.data);

    const { scrollYPercentage } = request.data;
    const scrollPosition =
      scrollYPercentage * document.documentElement.scrollHeight;

    window.scrollTo({
      top: scrollPosition,
      behavior: "instant",
    });

    resetScrolling();
  }
});
