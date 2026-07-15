import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    FEDIFY_KV: {},
    QUEUE_FEDERATION: {},
    INSTANCE_DOMAIN: 'local.example',
    SKIP_SIGNATURE_VERIFICATION: false,
  },
  federation: { name: 'federation' },
  createFederation: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({ env: mocks.env }));
vi.mock('@fedify/fedify', () => ({ createFederation: mocks.createFederation }));
vi.mock('@fedify/cfworkers', () => ({
  WorkersKvStore: class WorkersKvStore {
    constructor(readonly namespace: object) {}
  },
  WorkersMessageQueue: class WorkersMessageQueue {
    constructor(readonly queue: object) {}
  },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.createFederation.mockReset();
  mocks.createFederation.mockReturnValue(mocks.federation);
});

describe('Fedify queue-consumer configuration', () => {
  it.each([false, true])(
    'passes the explicit signature verification override (%s) to Fedify',
    async (skipSignatureVerification) => {
      mocks.env.SKIP_SIGNATURE_VERIFICATION = skipSignatureVerification;
      const { createFed } = await import('../src/fedify');

      expect(createFed()).toBe(mocks.federation);
      expect(createFed()).toBe(mocks.federation);
      expect(mocks.createFederation).toHaveBeenCalledTimes(1);
      expect(mocks.createFederation.mock.calls[0]?.[0]).toMatchObject({
        skipSignatureVerification,
        userAgent: {
          software: 'SiliconBeest/1.0',
          url: new URL('https://local.example/'),
        },
      });
    },
  );
});
