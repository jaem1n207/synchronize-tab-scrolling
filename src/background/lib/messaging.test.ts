import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendMessageWithTimeout } from './messaging';

import type { JsonValue } from 'type-fest';

interface TypedResponse {
  [key: string]: JsonValue;
  synced: boolean;
  position: number;
  meta: {
    source: string;
  };
}

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock('webext-bridge/background', () => ({
  sendMessage: sendMessageMock,
}));

describe('sendMessageWithTimeout', () => {
  const destination = { context: 'content-script' as const, tabId: 123 };

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('returns response when sendMessage resolves before timeout', async () => {
    const response = { ok: true, progress: 0.5 };
    sendMessageMock.mockResolvedValue(response);

    await expect(
      sendMessageWithTimeout('scroll:sync', { y: 200 }, destination, 1000),
    ).resolves.toEqual(response);
  });

  it('calls sendMessage with message id, data, and destination', async () => {
    const payload = { ratio: 0.25 };
    sendMessageMock.mockResolvedValue({ accepted: true });

    await sendMessageWithTimeout('scroll:sync', payload, destination, 1000);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith('scroll:sync', payload, destination);
  });

  it('uses default timeout of 2000ms when timeout is omitted', async () => {
    vi.useFakeTimers();
    sendMessageMock.mockImplementation(() => new Promise(() => {}));

    const promise = sendMessageWithTimeout('scroll:sync', { y: 100 }, destination);

    vi.advanceTimersByTime(1999);
    await Promise.resolve();

    const onRejected = vi.fn();
    promise.catch(onRejected);
    await Promise.resolve();
    expect(onRejected).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow('Timeout after 2000ms');
  });

  it('rejects with timeout error using custom timeout value', async () => {
    vi.useFakeTimers();
    sendMessageMock.mockImplementation(() => new Promise(() => {}));

    const promise = sendMessageWithTimeout('scroll:sync', { y: 400 }, destination, 300);

    vi.advanceTimersByTime(299);
    await Promise.resolve();

    const onRejected = vi.fn();
    promise.catch(onRejected);
    await Promise.resolve();
    expect(onRejected).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow('Timeout after 300ms');
  });

  it('returns typed generic response', async () => {
    const typedResponse: TypedResponse = {
      synced: true,
      position: 540,
      meta: {
        source: 'scroll-listener',
      },
    };
    sendMessageMock.mockResolvedValue(typedResponse);

    const result = await sendMessageWithTimeout<TypedResponse>(
      'scroll:sync',
      { y: 540 },
      destination,
      1000,
    );

    expect(result.synced).toBe(true);
    expect(result.position).toBe(540);
    expect(result.meta.source).toBe('scroll-listener');
  });

  it('propagates rejection when sendMessage fails', async () => {
    const rejection = new Error('network error');
    sendMessageMock.mockRejectedValue(rejection);

    await expect(sendMessageWithTimeout('scroll:sync', { y: 100 }, destination, 1000)).rejects.toBe(
      rejection,
    );
  });

  it('propagates synchronous sendMessage throw as rejection', async () => {
    const thrownError = new Error('sync failure');
    sendMessageMock.mockImplementation(() => {
      throw thrownError;
    });

    await expect(sendMessageWithTimeout('scroll:sync', { y: 300 }, destination, 1000)).rejects.toBe(
      thrownError,
    );
  });

  it('resolves message when sendMessage settles at the same timeout boundary', async () => {
    vi.useFakeTimers();
    const boundaryResponse = { synced: true, at: 'boundary' };

    sendMessageMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(boundaryResponse), 500);
        }),
    );

    const promise = sendMessageWithTimeout('scroll:sync', { y: 321 }, destination, 500);

    vi.advanceTimersByTime(500);

    await expect(promise).resolves.toEqual(boundaryResponse);
  });

  it('times out immediately when timeout is zero and message does not resolve', async () => {
    vi.useFakeTimers();
    sendMessageMock.mockImplementation(() => new Promise(() => {}));

    const promise = sendMessageWithTimeout('scroll:sync', { y: 200 }, destination, 0);

    vi.advanceTimersByTime(0);

    await expect(promise).rejects.toThrow('Timeout after 0ms');
  });
});
