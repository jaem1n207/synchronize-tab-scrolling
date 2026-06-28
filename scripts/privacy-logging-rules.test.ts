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
});
