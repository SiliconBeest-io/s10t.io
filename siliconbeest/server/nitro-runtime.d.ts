declare module 'crossws/adapters/cloudflare' {
  export default function wsAdapter(
    hooks: unknown,
  ): {
    handleUpgrade(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response>;
  };
}

declare module 'nitropack/runtime' {
  export function useNitroApp(): {
    h3App: {
      websocket: unknown;
    };
    hooks: {
      callHook(name: string, payload: unknown): Promise<void>;
    };
    localFetch(
      request: string,
      init: RequestInit & {
        context: unknown;
        host: string;
        protocol: string;
      },
    ): Promise<Response>;
  };
}

declare module 'nitropack/runtime/internal' {
  export function requestHasBody(request: Request): boolean;
  export function runCronTasks(
    cron: string,
    options: {
      context: unknown;
      payload: unknown;
    },
  ): Promise<void>;
}

declare module '#nitro-internal-virtual/public-assets' {
  export function isPublicAssetURL(pathname: string): boolean;
}

interface ImportMeta {
  _tasks?: boolean;
  _websocket?: boolean;
}

declare namespace Cloudflare {
  interface Env {
    INTERNAL_CONNECTION_MAIN?: import('./worker/internal-contract').InternalRpc;
  }
}
