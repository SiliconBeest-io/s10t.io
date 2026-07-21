/**
 * Federation Signer Resolution
 *
 * Centralized policy for choosing which local account's key to sign
 * outbound ActivityPub fetches with (HTTP Signatures).
 *
 * The chosen username must satisfy: Fedify's auto-generated keyId
 * (https://{instance}/users/{username}#main-key) matches our actor
 * dispatcher's publicKey.id — which holds for any regular local user
 * (auth.ts persists key_id as `${uri}#main-key`), but NOT for the
 * `__instance__` actor (whose actor doc reports id `/actor`).
 *
 * Policy:
 *   1. If `env.FEDERATION_SIGNER_USERNAME` is set and resolves to an active
 *      local account with an actor_keys row, use it (explicit operator pin).
 *   2. Else if a preferred account ID is given and resolves to an active
 *      local account with keys, use that account's username (per-request).
 *   3. Otherwise fall back to the oldest active local account that has keys.
 *   4. Return `null` only if no local accounts with keys exist at all.
 */

import { env } from 'cloudflare:workers';

/**
 * Resolve the username of the local account that should sign an outbound
 * authenticated fetch.
 *
 * @param db             D1 database.
 * @param preferredAccountId  Account ID providing natural request context
 *                            (e.g. inbox recipient, authenticated API user).
 *                            Pass `null` when no contextual user exists.
 * @returns The chosen username, or `null` if no local accounts exist.
 */
export async function pickSignerUsername(
	db: D1Database,
	preferredAccountId: string | null,
): Promise<string | null> {
	// Explicit operator override (highest priority).
	const overrideName = (env as unknown as Record<string, unknown>).FEDERATION_SIGNER_USERNAME;
	if (typeof overrideName === 'string' && overrideName.trim() !== '') {
		const row = await db
			.prepare(
				`SELECT a.username
				 FROM accounts a
				 JOIN actor_keys k ON k.account_id = a.id
				 WHERE a.username = ?1 AND a.domain IS NULL AND a.suspended_at IS NULL
				 LIMIT 1`,
			)
			.bind(overrideName.trim())
			.first<{ username: string }>();
		if (row?.username) return row.username;
		console.warn(`[pickSignerUsername] FEDERATION_SIGNER_USERNAME='${overrideName}' did not resolve to a local account with actor_keys — falling back.`);
	}

	// Only consider local accounts that actually have an actor_keys row —
	// otherwise Fedify's `getRsaKeyPairFromIdentifier` returns null and
	// silently falls back to the unauthenticated documentLoader
	// (middleware-huKeo4t5.js:3989), producing 401 from authorized-fetch
	// remote servers.
	if (preferredAccountId) {
		const row = await db
			.prepare(
				`SELECT a.username
				 FROM accounts a
				 JOIN actor_keys k ON k.account_id = a.id
				 WHERE a.id = ?1 AND a.domain IS NULL AND a.suspended_at IS NULL
				 LIMIT 1`,
			)
			.bind(preferredAccountId)
			.first<{ username: string }>();
		if (row?.username) return row.username;
	}

	const fallback = await db
		.prepare(
			`SELECT a.username
			 FROM accounts a
			 JOIN actor_keys k ON k.account_id = a.id
			 WHERE a.domain IS NULL AND a.suspended_at IS NULL
			 ORDER BY a.created_at ASC
			 LIMIT 1`,
		)
		.first<{ username: string }>();
	return fallback?.username ?? null;
}

/**
 * Pick a signer for shared-inbox key fetches, deterministically mapping each
 * remote server to one local user. Each remote always sees the same local
 * signer (stable from their logs/cache perspective), and the load is
 * distributed across the local user pool — no single user is pinned.
 *
 * If `FEDERATION_SIGNER_USERNAME` is set it overrides this entirely.
 *
 * @param db            D1 database.
 * @param remoteDomain  Hostname extracted from the inbound request's
 *                      `Signature` header `keyId`. Pass `null` when not
 *                      determinable (handler falls back to oldest user).
 */
export async function pickSignerForRemote(
	db: D1Database,
	remoteDomain: string | null,
): Promise<string | null> {
	// Honor explicit operator override first.
	const overrideName = (env as unknown as Record<string, unknown>).FEDERATION_SIGNER_USERNAME;
	if (typeof overrideName === 'string' && overrideName.trim() !== '') {
		const row = await db
			.prepare(
				`SELECT a.username
				 FROM accounts a
				 JOIN actor_keys k ON k.account_id = a.id
				 WHERE a.username = ?1 AND a.domain IS NULL AND a.suspended_at IS NULL
				 LIMIT 1`,
			)
			.bind(overrideName.trim())
			.first<{ username: string }>();
		if (row?.username) return row.username;
	}

	const result = await db
		.prepare(
			`SELECT a.username
			 FROM accounts a
			 JOIN actor_keys k ON k.account_id = a.id
			 WHERE a.domain IS NULL AND a.suspended_at IS NULL
			 ORDER BY a.created_at ASC`,
		)
		.all<{ username: string }>();
	const users = result.results ?? [];
	if (users.length === 0) return null;
	if (users.length === 1 || !remoteDomain) return users[0].username;

	const hashBuf = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(remoteDomain.toLowerCase()),
	);
	const idx = new DataView(hashBuf).getUint32(0) % users.length;
	return users[idx].username;
}
