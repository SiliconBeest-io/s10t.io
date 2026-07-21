import { describe, it, expect, beforeEach } from 'vitest';
import { shouldPlayForStatus, _resetNewPostSound } from '@/utils/newPostSound';

describe('new post sound dedupe', () => {
  beforeEach(() => {
    _resetNewPostSound();
  });

  it('plays the first time a status arrives', () => {
    expect(shouldPlayForStatus('s1', 1000)).toBe(true);
  });

  it('stays silent when the same post arrives on another timeline within the window', () => {
    expect(shouldPlayForStatus('s1', 1000)).toBe(true);
    expect(shouldPlayForStatus('s1', 1200)).toBe(false); // home + local delivery
    expect(shouldPlayForStatus('s1', 4000)).toBe(false);
  });

  it('plays different posts independently', () => {
    expect(shouldPlayForStatus('s1', 1000)).toBe(true);
    expect(shouldPlayForStatus('s2', 1001)).toBe(true);
  });

  it('forgets ids after a few seconds instead of accumulating them', () => {
    expect(shouldPlayForStatus('s1', 1000)).toBe(true);
    // Past the dedupe window the id has been pruned — a (theoretical)
    // re-delivery plays again rather than being remembered forever
    expect(shouldPlayForStatus('s1', 7000)).toBe(true);
  });

  it('prunes expired ids from memory on each call', () => {
    for (let i = 0; i < 50; i++) {
      shouldPlayForStatus(`old-${i}`, 1000);
    }
    // A call far in the future sweeps all expired entries
    expect(shouldPlayForStatus('fresh', 60_000)).toBe(true);
    expect(shouldPlayForStatus('old-1', 60_001)).toBe(true); // was pruned, plays again
  });
});
