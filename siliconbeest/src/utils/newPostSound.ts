/**
 * New-post chime for live streaming updates.
 *
 * The same status can arrive on several streams at once (e.g. a local post
 * shows up on both the home and local timelines), so plays are deduped by
 * status id. Ids are only remembered for a few seconds — long enough to
 * cover near-simultaneous deliveries across streams, short enough that the
 * set never grows with the session.
 */

// Extracted (lossless) from public/new.mov — QuickTime containers don't play
// in <audio> everywhere, the mp3 inside does.
export const NEW_POST_SOUND_URL = '/new.mp3';

const DEDUPE_WINDOW_MS = 5000;

const recentlyPlayed = new Map<string, number>();
let audio: HTMLAudioElement | null = null;

/**
 * Pure dedupe check: true the first time a status id is seen inside the
 * window, false for repeats. Prunes expired ids on every call so the map
 * only ever holds the last few seconds of activity.
 */
export function shouldPlayForStatus(statusId: string, now: number = Date.now()): boolean {
  for (const [id, ts] of recentlyPlayed) {
    if (now - ts > DEDUPE_WINDOW_MS) recentlyPlayed.delete(id);
  }
  if (recentlyPlayed.has(statusId)) return false;
  recentlyPlayed.set(statusId, now);
  return true;
}

/** Play the chime once for this status, no matter how many streams deliver it. */
export function playNewPostSound(statusId: string) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  if (!shouldPlayForStatus(statusId)) return;
  try {
    if (!audio) {
      audio = new Audio(NEW_POST_SOUND_URL);
      audio.preload = 'auto';
    }
    // A burst of posts restarts the short chime instead of stacking plays
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay is blocked until the user interacts with the page — fine
    });
  } catch {
    // Audio unavailable (unsupported environment) — stay silent
  }
}

/** Test-only: forget recently played ids. */
export function _resetNewPostSound() {
  recentlyPlayed.clear();
  audio = null;
}

// Extracted (lossless) from public/compose.mov, same reason as NEW_POST_SOUND_URL
export const COMPOSE_SOUND_URL = '/compose.mp3';

let composeAudio: HTMLAudioElement | null = null;

/** Play the compose chime after the user publishes a post. */
export function playComposeSound() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try {
    if (!composeAudio) {
      composeAudio = new Audio(COMPOSE_SOUND_URL);
      composeAudio.preload = 'auto';
    }
    composeAudio.currentTime = 0;
    void composeAudio.play().catch(() => {});
  } catch {
    // Audio unavailable — stay silent
  }
}
