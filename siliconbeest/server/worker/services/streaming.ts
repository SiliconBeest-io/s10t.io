/**
 * Streaming service helper.
 *
 * Used by the queue consumer (and other internal callers) to push events
 * into a user's StreamingDO instance, which then broadcasts to all
 * connected WebSocket clients.
 */

import { env } from 'cloudflare:workers';
export type StreamEventPayload = {
  /** Mastodon event type: update, notification, delete, status.update, filters_changed */
  event: string;
  /** JSON-stringified payload */
  payload: string;
  /** Target stream names (e.g. ["user", "user:notification"]) */
  stream?: string[];
};

/**
 * Send an event to a user's StreamingDO instance.
 *
 * @param userId       The user ID (used as DO name)
 * @param event        The event to broadcast
 */
export async function sendStreamEvent(
  userId: string,
  event: StreamEventPayload,
): Promise<void> {
  const doId = env.STREAMING_DO.idFromName(userId);
  const stub = env.STREAMING_DO.get(doId);

  await stub.fetch('https://streaming/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

/**
 * Broadcast a `reaction` event for a status whose emoji reactions changed.
 *
 * Clients receive `{ status_id }` and refetch that status's reactions if
 * they render it. Delivered to the users whose home timelines can show the
 * status (local author + their local followers) and, for public statuses,
 * to the shared __public__ instance for the public/local timelines —
 * mirroring how timelineFanout targets `update` events.
 *
 * Best-effort: streaming failures never fail the reaction itself.
 */
export async function broadcastReactionEvent(statusId: string): Promise<void> {
  try {
    const status = await env.DB.prepare(
      `SELECT s.account_id, s.visibility, a.domain AS author_domain
       FROM statuses s JOIN accounts a ON a.id = s.account_id
       WHERE s.id = ?1`,
    ).bind(statusId).first<{ account_id: string; visibility: string | null; author_domain: string | null }>();
    if (!status) return;

    const payload = JSON.stringify({ status_id: statusId });

    const { results } = await env.DB.prepare(
      `SELECT u.id FROM users u WHERE u.account_id = ?1
       UNION
       SELECT u.id FROM follows f JOIN users u ON u.account_id = f.account_id
       WHERE f.target_account_id = ?1`,
    ).bind(status.account_id).all<{ id: string }>();

    const sends = (results ?? []).map((r) =>
      sendStreamEvent(r.id, { event: 'reaction', payload, stream: ['user'] }).catch(() => {}),
    );

    if ((status.visibility ?? 'public') === 'public') {
      sends.push(
        sendStreamEvent('__public__', {
          event: 'reaction',
          payload,
          stream: status.author_domain ? ['public'] : ['public', 'public:local'],
        }).catch(() => {}),
      );
    }

    await Promise.allSettled(sends);
  } catch {
    // Best-effort only
  }
}
