import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupRemoteSoftware } from '../../../siliconbeest-queue-consumer/src/utils/nodeinfo';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queue consumer NodeInfo SSRF protection', () => {
  it('rejects a hostname that resolves to loopback in the Workers runtime', async () => {
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
        return realFetch(input, init);
      }
      return new Response(null, { status: 502 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      lookupRemoteSoftware('localtest.me', 'SiliconBeest/Test'),
    ).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([input]) => requestUrl(input)))
      .not.toContain('https://localtest.me/.well-known/nodeinfo');
  });
});

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}
