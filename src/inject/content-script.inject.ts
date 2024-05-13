const debounce = <T extends (...args: Parameters<T>) => void>(func: T, wait: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    clearTimeout(timeoutId);
  };
  const debouncedFn = (...args: Parameters<T>) => {
    clear();
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      func(...args);
    }, wait);
  };

  return debouncedFn;
};

const throttle = <T extends (...args: Parameters<T>) => void>(func: T, wait: number) => {
  let lastCalled = 0;

  return (...args: Parameters<T>) => {
    const now = new Date().getTime();
    if (now - lastCalled < wait) {
      return;
    }
    lastCalled = now;
    return func(...args);
  };
};

// This is a variable to avoid getting stuck in a loop that keeps the scroll position synchronized between multiple tabs.
let scrolling = false;

const resetScrolling = debounce(() => {
  scrolling = false;
  console.debug('Scrolling reset to', scrolling);
}, 250);

const onScrollHandler = throttle(() => {
  try {
    console.debug('Scroll event triggered');
    if (scrolling) return;

    const scrollPosition =
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    const scrollYPercentage =
      scrollHeight === clientHeight ? 0 : scrollPosition / (scrollHeight - clientHeight);

    console.debug(
      'Scroll event triggered, sending syncScroll message with percentage:',
      scrollYPercentage
    );

    chrome.runtime.sendMessage({
      command: 'syncScroll',
      data: { scrollYPercentage }
    });
  } catch (err) {
    console.error(`Error in onScrollHandler: ${err}`);
  }
}, 50);

chrome.runtime.onMessage.addListener((request) => {
  if (request.command === 'startSyncTab') {
    console.debug('Content script loaded for tab', request.data);
    window.addEventListener('scroll', onScrollHandler);
    console.debug('Scroll event listener registered');
  }

  if (request.command === 'stopSyncTab') {
    window.removeEventListener('scroll', onScrollHandler);
  }

  if (request.command === 'syncScrollForTab') {
    scrolling = true;
    console.debug('Received syncScrollForTab message with data', request.data);

    const { scrollYPercentage } = request.data;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    const scrollPosition = scrollYPercentage * (scrollHeight - clientHeight);

    window.scrollTo({
      top: scrollPosition,
      behavior: 'instant'
    });

    resetScrolling();
  }
});
