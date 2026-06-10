import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { applyMigration, createTestUser } from './helpers';

const BASE = 'https://test.siliconbeest.local';

/**
 * Regression tests for OAuth redirect_uri validation.
 *
 * The authorize endpoint must reject any redirect_uri that does not exactly
 * match the application's registered value. Otherwise an attacker can have an
 * authorization code issued to an attacker-controlled URL (code leakage /
 * open redirect) just by getting a logged-in victim to open a crafted link.
 */
describe('OAuth Authorize — redirect_uri validation', () => {
	let token: string;
	let clientId: string;
	const REGISTERED = 'https://example.com/callback';
	const EVIL = 'https://attacker.example/steal';

	beforeAll(async () => {
		await applyMigration();
		token = (await createTestUser('oauth_redir_user')).token;

		const res = await SELF.fetch(`${BASE}/api/v1/apps`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Redirect Test Client',
				redirect_uris: REGISTERED,
				scopes: 'read write',
			}),
		});
		clientId = (await res.json<Record<string, string>>()).client_id;
	});

	it('rejects a mismatched redirect_uri on the JSON consent lookup (GET)', async () => {
		const res = await SELF.fetch(
			`${BASE}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(EVIL)}&scope=read&response_type=code`,
			{ headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } },
		);
		expect(res.status).toBe(400);
	});

	it('rejects a mismatched redirect_uri on POST approve and issues no code', async () => {
		const res = await SELF.fetch(`${BASE}/oauth/authorize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				client_id: clientId,
				redirect_uri: EVIL,
				scope: 'read write',
				response_type: 'code',
				decision: 'approve',
			}),
		});
		expect(res.status).toBe(400);
		const body = await res.json<Record<string, unknown>>();
		// Must not leak a redirect target / code back to the caller.
		expect(body.redirect_uri).toBeUndefined();
	});

	it('still allows the exact registered redirect_uri', async () => {
		const res = await SELF.fetch(`${BASE}/oauth/authorize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				client_id: clientId,
				redirect_uri: REGISTERED,
				scope: 'read write',
				response_type: 'code',
				decision: 'approve',
			}),
		});
		expect(res.status).toBe(200);
		const body = await res.json<Record<string, string>>();
		expect(body.redirect_uri).toContain(REGISTERED);
		expect(body.redirect_uri).toContain('code=');
	});
});
