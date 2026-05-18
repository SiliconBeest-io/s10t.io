import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { applyMigration, createTestUser, authHeaders } from './helpers';

const BASE = 'https://test.siliconbeest.local';

describe('Accounts API', () => {
  let alice: { accountId: string; userId: string; token: string };
  let bob: { accountId: string; userId: string; token: string };

  beforeAll(async () => {
    await applyMigration();
    alice = await createTestUser('alice');
    bob = await createTestUser('bob');
  });

  // -------------------------------------------------------------------
  // GET /api/v1/accounts/:id
  // -------------------------------------------------------------------
  describe('GET /api/v1/accounts/:id', () => {
    it('returns the account', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${alice.accountId}`, {
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.id).toBe(alice.accountId);
      expect(body.username).toBe('alice');
    });

    it('returns 404 for a non-existent account', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/00000000000000000000000000`, {
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // GET /api/v1/accounts/:id/statuses
  // -------------------------------------------------------------------
  describe('GET /api/v1/accounts/:id/statuses', () => {
    it('returns an empty array initially', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${alice.accountId}/statuses`, {
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Follow / Unfollow
  // -------------------------------------------------------------------
  describe('Follow and Unfollow', () => {
    it('POST /api/v1/accounts/:id/follow creates a follow relationship', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/follow`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.following).toBe(true);
    });

    it('GET /api/v1/accounts/:id/followers includes the follower', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/followers`, {
        headers: authHeaders(bob.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(Array.isArray(body)).toBe(true);
      const aliceInList = body.some((a: any) => a.id === alice.accountId);
      expect(aliceInList).toBe(true);
    });

    it('POST /api/v1/accounts/:id/unfollow removes the follow', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/unfollow`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.following).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Block / Unblock
  // -------------------------------------------------------------------
  describe('Block and Unblock', () => {
    it('POST /api/v1/accounts/:id/block blocks a user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/block`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.blocking).toBe(true);
    });

    it('GET /api/v1/blocks includes the blocked user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/blocks`, {
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(Array.isArray(body)).toBe(true);
      const bobBlocked = body.some((a: any) => a.id === bob.accountId);
      expect(bobBlocked).toBe(true);
    });

    it('POST /api/v1/accounts/:id/unblock unblocks a user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/unblock`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.blocking).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Mute / Unmute
  // -------------------------------------------------------------------
  describe('Mute and Unmute', () => {
    it('POST /api/v1/accounts/:id/mute mutes a user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/mute`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.muting).toBe(true);
    });

    it('GET /api/v1/mutes includes the muted user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/mutes`, {
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(Array.isArray(body)).toBe(true);
      const bobMuted = body.some((a: any) => a.id === bob.accountId);
      expect(bobMuted).toBe(true);
    });

    it('POST /api/v1/accounts/:id/unmute unmutes a user', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/${bob.accountId}/unmute`, {
        method: 'POST',
        headers: authHeaders(alice.token),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.muting).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Relationships
  // -------------------------------------------------------------------
  describe('GET /api/v1/accounts/relationships', () => {
    it('returns relationship status for given IDs', async () => {
      const res = await SELF.fetch(
        `${BASE}/api/v1/accounts/relationships?id[]=${bob.accountId}`,
        { headers: authHeaders(alice.token) },
      );
      expect(res.status).toBe(200);
      const body = await res.json<any[]>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      const rel = body.find((r: any) => r.id === bob.accountId);
      expect(rel).toBeDefined();
      expect(typeof rel.following).toBe('boolean');
      expect(typeof rel.blocking).toBe('boolean');
      expect(typeof rel.muting).toBe('boolean');
    });
  });

  // -------------------------------------------------------------------
  // Update credentials
  // -------------------------------------------------------------------
  describe('PATCH /api/v1/accounts/update_credentials', () => {
    it('updates profile display name', async () => {
      const res = await SELF.fetch(`${BASE}/api/v1/accounts/update_credentials`, {
        method: 'PATCH',
        headers: authHeaders(alice.token),
        body: JSON.stringify({ display_name: 'Alice Wonderland' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.display_name).toBe('Alice Wonderland');
    });

    it('clears profile metadata when multipart fields_attributes is empty', async () => {
      const setFields = new FormData();
      setFields.append('fields_attributes[0][name]', 'Website');
      setFields.append('fields_attributes[0][value]', 'https://example.com');

      const setRes = await SELF.fetch(`${BASE}/api/v1/accounts/update_credentials`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${alice.token}` },
        body: setFields,
      });
      expect(setRes.status).toBe(200);
      const setBody = await setRes.json<Record<string, any>>();
      expect(setBody.fields).toEqual([
        { name: 'Website', value: 'https://example.com', verified_at: null },
      ]);

      const clearFields = new FormData();
      clearFields.append('fields_attributes', '[]');

      const clearRes = await SELF.fetch(`${BASE}/api/v1/accounts/update_credentials`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${alice.token}` },
        body: clearFields,
      });
      expect(clearRes.status).toBe(200);
      const clearBody = await clearRes.json<Record<string, any>>();
      expect(clearBody.fields).toEqual([]);
      expect(clearBody.source.fields).toEqual([]);
    });

    it('ignores blank profile metadata rows', async () => {
      const fields = new FormData();
      fields.append('fields_attributes[0][name]', '');
      fields.append('fields_attributes[0][value]', '');
      fields.append('fields_attributes[1][name]', 'Website');
      fields.append('fields_attributes[1][value]', 'https://example.com');

      const res = await SELF.fetch(`${BASE}/api/v1/accounts/update_credentials`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${alice.token}` },
        body: fields,
      });
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, any>>();
      expect(body.fields).toEqual([
        { name: 'Website', value: 'https://example.com', verified_at: null },
      ]);
    });
  });
});
