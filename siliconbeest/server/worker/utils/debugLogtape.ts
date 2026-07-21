/**
 * Route Fedify's internal LogTape records to the console when `DEBUG` is
 * enabled. Fedify logs its federation internals (inbound signature
 * verification, document loader fetches, outbox delivery) through LogTape,
 * which discards everything until a sink is configured.
 */

import { configure, type LogRecord } from '@logtape/logtape';
import {
  isDebugEnabled,
  redactUltraSensitive,
  safeStringify,
} from '../../../../packages/shared/utils/debugLog';

function formatRecord(record: LogRecord): string {
  const message = record.message
    .map((part) => (typeof part === 'string' ? part : safeStringify(redactUltraSensitive(part))))
    .join('');
  const properties = Object.keys(record.properties).length > 0
    ? ` ${safeStringify(redactUltraSensitive(record.properties))}`
    : '';
  return `[debug][${record.category.join('.')}] ${record.level}: ${message}${properties}`;
}

let configured: Promise<void> | null = null;

/**
 * Configure LogTape once per isolate. No-op (and cheap) when `DEBUG` is off.
 */
export function ensureFedifyDebugLogging(): Promise<void> {
  if (!isDebugEnabled()) return Promise.resolve();
  configured ??= configure({
    sinks: {
      debugConsole: (record: LogRecord) => {
        console.log(formatRecord(record));
      },
    },
    loggers: [
      { category: 'fedify', sinks: ['debugConsole'], lowestLevel: 'debug' },
      // Silence LogTape's own meta logger warnings.
      { category: ['logtape', 'meta'], sinks: [] },
    ],
  }).catch((err: unknown) => {
    console.warn('[debug] LogTape configuration failed:', err);
  });
  return configured;
}
