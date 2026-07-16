/* oxlint-disable fp/no-classes, fp/no-class-inheritance, fp/no-this-expressions */

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { InternalRpc, StreamEventPayload } from './internal-contract';
import { sendStreamEventToDurableObject } from './services/streaming';

/**
 * Capability-scoped RPC entrypoint for calls from other SiliconBeest Workers.
 *
 * This named entrypoint is only reachable through an explicit Service Binding;
 * it is not attached to the main Worker's public HTTP routes.
 */
export class Internal extends WorkerEntrypoint<Env> implements InternalRpc {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  }

  async sendStreamEvent(
    userId: string,
    event: StreamEventPayload,
  ): Promise<void> {
    await sendStreamEventToDurableObject(userId, event);
  }
}
