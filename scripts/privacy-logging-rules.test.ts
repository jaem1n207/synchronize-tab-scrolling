import { describe, expect, it } from 'vitest';

import { analyzePrivacyLoggingSource } from './privacy-logging-rules';

function messagesFor(sourceText: string): Array<string> {
  return analyzePrivacyLoggingSource('src/example.ts', sourceText).map(
    (violation) => violation.message,
  );
}

describe('privacy logging rules', () => {
  it('allows ids, modes, reasons, booleans, counts, and sanitized domains', () => {
    expect(
      messagesFor(`
        logger.info('Relaying URL sync mode change', {
          sourceTabId,
          targetTabId,
          mode,
          reason: 'user-change',
          enabled: true,
          tabCount: 2,
          domain: 'example.com',
        });
      `),
    ).toEqual([]);
  });

  it('allows non-browser url and title properties', () => {
    expect(
      messagesFor(`
        logger.info('Workflow state', { workflowTitle: workflow.title, apiUrl: api.url });
      `),
    ).toEqual([]);
  });

  it('inspects simple same-file metadata aliases', () => {
    expect(
      messagesFor(`
        const meta = { url: window.location.href };
        logger.info('x', { meta });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('allows safe simple same-file metadata aliases', () => {
    expect(
      messagesFor(`
        const meta = { tabCount: 2, domain: 'example.com' };
        logger.info('x', { meta });
      `),
    ).toEqual([]);
  });

  it('inspects nested metadata object literals recursively', () => {
    expect(
      messagesFor(`
        logger.info('Nested', { meta: { url: window.location.href } });
        logger.info('Nested payload', { meta: { payload } });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('allows safe nested metadata object literals', () => {
    expect(
      messagesFor(`
        logger.info('Nested safe', { meta: { tabCount: 2, domain: 'example.com' } });
      `),
    ).toEqual([]);
  });

  it('inspects nested metadata objects inside arrays and conditional expressions', () => {
    expect(
      messagesFor(`
        logger.info('Nested array', { meta: [{ url: window.location.href }] });
        logger.info('Nested conditional', { meta: condition ? { url: window.location.href } : { tabCount: 1 } });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('allows safe nested arrays and conditional metadata', () => {
    expect(
      messagesFor(`
        logger.info('Safe array', { meta: [{ tabCount: 2, domain: 'example.com', enabled: true }] });
        logger.info('Safe conditional', { meta: condition ? { tabCount: 1, enabled: true } : { domain: 'example.com' } });
      `),
    ).toEqual([]);
  });

  it('rejects bracket-notation browser data inside safe metadata keys', () => {
    expect(
      messagesFor(`
        logger.info('x', { meta: { raw: window.location['href'] } });
        logger.info('x', { meta: { raw: document['title'] } });
        logger.info('x', { meta: { raw: window['location'].href } });
      `),
    ).toEqual([
      'Do not log "href". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "title". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "href". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects computed sensitive browser access with identifier keys', () => {
    expect(
      messagesFor(`
        const key = 'href';
        const prop = 'title';
        logger.info('x', { raw: window.location[key] });
        logger.info('x', { raw: document[prop] });
        logger.info('x', { safe: workflow[key] });
      `),
    ).toEqual([
      'Do not log "raw". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "raw". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('keeps outer unsafe alias visible outside inner safe shadowing block', () => {
    expect(
      messagesFor(`
        const meta = { url: window.location.href };
        if (enabled) {
          const meta = { tabCount: 2 };
        }
        logger.info('x', { meta });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('keeps outer safe alias isolated from later inner unsafe shadowing block', () => {
    expect(
      messagesFor(`
        const meta = { tabCount: 2 };
        if (enabled) {
          const meta = { url: window.location.href };
        }
        logger.info('x', { meta });
      `),
    ).toEqual([]);
  });

  it('uses inner alias shadowing inside its block', () => {
    expect(
      messagesFor(`
        const meta = { tabCount: 2 };
        if (enabled) {
          const meta = { url: window.location.href };
          logger.info('x', { meta });
        }
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('treats parameter bindings as shadowing outer unsafe aliases', () => {
    expect(
      messagesFor(`
        const meta = { url: window.location.href };
        function run(meta) {
          logger.info('x', { meta });
        }
      `),
    ).toEqual([]);
  });

  it('treats catch bindings as shadowing outer unsafe aliases', () => {
    expect(
      messagesFor(`
        const meta = { url: window.location.href };
        try {
          throw new Error('x');
        } catch (meta) {
          logger.info('x', { meta });
        }
      `),
    ).toEqual([]);
  });

  it('rejects raw URL metadata keys', () => {
    expect(
      messagesFor(`
        logger.info('URL changed', { url: window.location.href });
        logger.debug('Relaying URL sync message', { sourceUrl, targetUrl, normalizedUrl });
      `),
    ).toEqual([
      'Do not log "url". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "sourceUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "targetUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "normalizedUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects shorthand payload-like metadata', () => {
    expect(
      messagesFor(`
        logger.debug('Received message', { payload });
        logger.debug('Relaying scroll sync message', { data, sender });
        logger.error('Invalid acknowledgment', { response });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "data". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "sender". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "response". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects direct browser URL and title expressions', () => {
    expect(
      messagesFor(`
        logger.info('Processing tab', { tabId: tab.id, currentUrl: tab.url });
        logger.info('Page metadata', { pageTitle: document.title });
      `),
    ).toEqual([
      'Do not log "currentUrl". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "pageTitle". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects browser location path, query, and fragment expressions', () => {
    expect(
      messagesFor(`
        logger.info('Path changed', { raw: window.location.pathname });
        logger.info('Query changed', { raw: location.search });
        logger.info('Fragment changed', { raw: window.location.hash });
      `),
    ).toEqual([
      'Do not log "pathname". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "search". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "hash". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects destructured aliases from sensitive browser and payload sources', () => {
    expect(
      messagesFor(`
        const { pathname: rawPath } = window.location;
        const { search } = location;
        const { url: rawUrl } = payload;
        logger.info('x', { rawPath });
        logger.info('x', { search });
        logger.info('x', { rawUrl });
      `),
    ).toEqual([
      'Do not log "pathname". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "search". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects aliases created by later assignments', () => {
    expect(
      messagesFor(`
        let raw;
        raw = payload.url;
        logger.info('x', { raw });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('uses the latest visible assignment when checking aliases', () => {
    expect(
      messagesFor(`
        let raw;
        raw = payload.url;
        raw = { tabCount: 2 };
        logger.info('x', { raw });
      `),
    ).toEqual([]);
  });

  it('allows static primary log messages', () => {
    expect(
      messagesFor(`
        logger.info('URL changed');
        logger.info(\`URL changed\`);
      `),
    ).toEqual([]);
  });

  it('rejects dynamic primary log message expressions', () => {
    expect(
      messagesFor(`
        const message = \`Navigating \${window.location.href}\`;
        logger.info(\`Navigating \${window.location.href}\`);
        logger.info('Navigating ' + tab.url);
        logger.info(message);
      `),
    ).toEqual([
      'Do not log "href". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "tab". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "href". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects nested sensitive member paths inside safe metadata keys', () => {
    expect(
      messagesFor(`
        logger.info('x', { safe: payload.nested.url });
        logger.info('x', { safe: tab.metadata.title });
        const nestedUrl = payload.deep.link.url;
        logger.info('x', { safe: nestedUrl });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "tab". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects logger.with calls and aliases derived from logger.with', () => {
    expect(
      messagesFor(`
        logger.with({ tabId }).info('x', { payload });
        const scopedLogger = logger.with({ tabId });
        scopedLogger.warn('x', { safe: window.location.href });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "href". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });

  it('rejects nested raw object members under sensitive roots', () => {
    expect(
      messagesFor(`
        logger.info('x', { safe: payload.response });
        logger.info('x', { safe: response.payload });
        logger.info('x', { safe: syncState.tab });
      `),
    ).toEqual([
      'Do not log "payload". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "response". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
      'Do not log "syncState". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.',
    ]);
  });
});
