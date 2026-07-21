declare namespace Cloudflare {
  interface Env {
    STREAMING_DO?: DurableObjectNamespace<
      import('../../siliconbeest/server/worker/durableObjects/streaming').StreamingDO
    >;
  }
}
