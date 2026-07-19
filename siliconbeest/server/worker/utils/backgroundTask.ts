/* oxlint-disable fp/no-try-statements */
/**
 * Keep non-critical persistence work alive without adding it to response
 * latency. The await fallback is for local/test Hono invocations that do not
 * expose a usable Workers ExecutionContext.
 */
export async function scheduleBackgroundTask(
  getExecutionContext: () => { readonly waitUntil: (promise: Promise<unknown>) => void },
  task: Promise<unknown>,
  details: Readonly<Record<string, string>>,
): Promise<void> {
  const tracked = task.then(
    () => undefined,
    (error: unknown) => {
      console.error(JSON.stringify({
        message: 'Background task failed',
        ...details,
        error: error instanceof Error ? error.message : String(error),
      }));
    },
  );

  try {
    getExecutionContext().waitUntil(tracked);
  } catch {
    await tracked;
  }
}
