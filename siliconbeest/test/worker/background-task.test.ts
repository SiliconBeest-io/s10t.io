import { describe, expect, it, vi } from 'vitest';
import { scheduleBackgroundTask } from '../../server/worker/utils/backgroundTask';

describe('scheduleBackgroundTask', () => {
  it('registers unfinished work with waitUntil without waiting for completion', async () => {
    let finish: (() => void) | undefined;
    const task = new Promise<void>((resolve) => { finish = resolve; });
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

    await scheduleBackgroundTask(
      () => ({ waitUntil }),
      task,
      { operation: 'test_background_task' },
    );

    expect(waitUntil).toHaveBeenCalledOnce();
    finish?.();
    await waitUntil.mock.calls[0]?.[0];
  });

  it('awaits the tracked task when no execution context is available', async () => {
    let finished = false;
    const task = Promise.resolve().then(() => { finished = true; });

    await scheduleBackgroundTask(
      () => { throw new Error('missing execution context'); },
      task,
      { operation: 'test_background_fallback' },
    );

    expect(finished).toBe(true);
  });
});
