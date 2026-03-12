/// <reference types="vitest/globals" />

const USER_AGENTS = {
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:136.0) Gecko/20100101 Firefox/136.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.3179.54',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
  arc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Arc/1.90.0',
  dia: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Dia/0.23.2',
  unknown: 'MyCustomBrowser/1.0',
};

async function detectForUserAgent(userAgent: string) {
  vi.resetModules();
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  const { detectBrowser } = await import('~/landing/lib/detect-browser');
  return detectBrowser();
}

describe('detectBrowser', () => {
  it('detects Chrome', async () => {
    await expect(detectForUserAgent(USER_AGENTS.chrome)).resolves.toBe('chrome');
  });

  it('detects Firefox', async () => {
    await expect(detectForUserAgent(USER_AGENTS.firefox)).resolves.toBe('firefox');
  });

  it('detects Edge', async () => {
    await expect(detectForUserAgent(USER_AGENTS.edge)).resolves.toBe('edge');
  });

  it('detects Safari', async () => {
    await expect(detectForUserAgent(USER_AGENTS.safari)).resolves.toBe('safari');
  });

  it('classifies Arc user agent as chrome', async () => {
    await expect(detectForUserAgent(USER_AGENTS.arc)).resolves.toBe('chrome');
  });

  it('classifies Dia user agent as chrome', async () => {
    await expect(detectForUserAgent(USER_AGENTS.dia)).resolves.toBe('chrome');
  });

  it('returns unknown for non-matching user agent', async () => {
    await expect(detectForUserAgent(USER_AGENTS.unknown)).resolves.toBe('unknown');
  });

  it('returns cached result for repeated calls in same module instance', async () => {
    vi.resetModules();
    Object.defineProperty(window.navigator, 'userAgent', {
      value: USER_AGENTS.firefox,
      configurable: true,
    });

    const { detectBrowser } = await import('~/landing/lib/detect-browser');

    expect(detectBrowser()).toBe('firefox');

    Object.defineProperty(window.navigator, 'userAgent', {
      value: USER_AGENTS.chrome,
      configurable: true,
    });

    expect(detectBrowser()).toBe('firefox');
  });
});
