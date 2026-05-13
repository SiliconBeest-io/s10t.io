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
 *   1. If a preferred account ID is given and resolves to an active local
 *      account, use that account's username (per-request signing).
 *   2. Otherwise fall back to the oldest active local account (deterministic).
 *   3. Return `null` only if no local accounts exist at all.
 */

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
	if (preferredAccountId) {
		const row = await db
			.prepare(
				"SELECT username FROM accounts WHERE id = ?1 AND domain IS NULL AND suspended_at IS NULL LIMIT 1",
			)
			.bind(preferredAccountId)
			.first<{ username: string }>();
		if (row?.username) return row.username;
	}

	const fallback = await db
		.prepare(
			"SELECT username FROM accounts WHERE domain IS NULL AND suspended_at IS NULL ORDER BY created_at ASC LIMIT 1",
		)
		.first<{ username: string }>();
	return fallback?.username ?? null;
}
