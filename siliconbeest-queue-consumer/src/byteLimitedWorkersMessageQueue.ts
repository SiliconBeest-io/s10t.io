import { WorkersMessageQueue } from '@fedify/cfworkers';
import type { MessageQueueEnqueueOptions } from '@fedify/fedify';

// Cloudflare Queues accepts at most 100 messages or 256,000 bytes in one
// sendBatch() call.  Leave room for the approximately 100 bytes of platform
// metadata attached to every message and for serialization overhead that is
// not visible to this adapter.
const MAX_BATCH_MESSAGES = 100;
const MAX_ESTIMATED_BATCH_BYTES = 240_000;
const ESTIMATED_PLATFORM_BYTES_PER_MESSAGE = 128;

const textEncoder = new TextEncoder();

function estimateRequestBytes(
  message: unknown,
  options?: MessageQueueEnqueueOptions,
): number {
  // Keep this envelope in sync with WorkersMessageQueue.enqueueMany().
  const serialized = JSON.stringify({
    __fedify_ordering_key__: options?.orderingKey,
    __fedify_payload__: message,
  });

  if (serialized === undefined) {
    throw new TypeError('Fedify queue messages must be JSON-serializable');
  }

  return textEncoder.encode(serialized).byteLength + ESTIMATED_PLATFORM_BYTES_PER_MESSAGE;
}

/**
 * WorkersMessageQueue variant that respects Cloudflare's total sendBatch()
 * byte limit.  Fedify's stock adapter does not chunk by count or bytes, so
 * fan-out of a moderately large activity can exceed the 256 KB batch cap.
 */
export class ByteLimitedWorkersMessageQueue extends WorkersMessageQueue {
  override async enqueueMany(
    messages: readonly unknown[],
    options?: MessageQueueEnqueueOptions,
  ): Promise<void> {
    let batch: unknown[] = [];
    let estimatedBatchBytes = 0;

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      await super.enqueueMany(batch, options);
      batch = [];
      estimatedBatchBytes = 0;
    };

    for (const message of messages) {
      const estimatedMessageBytes = estimateRequestBytes(message, options);
      const wouldExceedLimit =
        batch.length >= MAX_BATCH_MESSAGES ||
        estimatedBatchBytes + estimatedMessageBytes > MAX_ESTIMATED_BATCH_BYTES;

      if (wouldExceedLimit) await flush();

      batch.push(message);
      estimatedBatchBytes += estimatedMessageBytes;
    }

    await flush();
  }
}
