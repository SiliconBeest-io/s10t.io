/**
 * Inbox Processor: Accept(Follow)
 *
 * Handles incoming Accept activities, confirming that a remote actor
 * has accepted our outgoing follow request. Moves the pending request
 * from follow_requests to follows and updates counts.
 */
import { env } from 'cloudflare:workers';
import type { APActivity, APObject } from '../../types/activitypub';
import { generateUlid } from '../../utils/ulid';
import { BaseProcessor } from './BaseProcessor';
import { AS_PUBLIC, FEP044F_QUOTE_REQUEST, addQuoteProperties, getId, quoteContext } from '../helpers/quote';

class AcceptProcessor extends BaseProcessor {
	async process(activity: APActivity): Promise<void> {
		const object = activity.object;
		if (!object) {
			console.warn('[accept] activity.object is missing');
			return;
		}

		if (typeof object === 'object') {
			const objectType = (object as APObject).type;
			if (objectType === 'QuoteRequest' || objectType === FEP044F_QUOTE_REQUEST) {
				await this.processQuoteAccept(activity, object as APObject);
				return;
			}
		}

		// Relay Accept handling
		const followId = typeof object === 'string' ? object : (object as APObject).id;
		if (followId) {
			const relay = await env.DB.prepare(
				'SELECT id FROM relays WHERE follow_activity_id = ?1',
			)
				.bind(followId)
				.first<{ id: string }>();

			if (relay) {
				await env.DB.prepare(
					"UPDATE relays SET state = 'accepted', actor_uri = ?1, updated_at = ?2 WHERE id = ?3",
				)
					.bind(String(activity.actor), new Date().toISOString(), relay.id)
					.run();
				return;
			}
		}

		const remoteAccount = await this.findAccountByUri(activity.actor);
		if (!remoteAccount) {
			console.warn(`[accept] Remote actor not found: ${activity.actor}`);
			return;
		}

		// Try to find the pending follow_request
		let followRequest: { id: string; account_id: string; target_account_id: string; uri: string | null } | null = null;

		if (typeof object === 'string') {
			followRequest = await env.DB.prepare(
				`SELECT id, account_id, target_account_id, uri FROM follow_requests
				 WHERE uri = ?1 LIMIT 1`,
			)
				.bind(object)
				.first();
		} else {
			const obj = object as APObject;
			if (obj.id) {
				followRequest = await env.DB.prepare(
					`SELECT id, account_id, target_account_id, uri FROM follow_requests
					 WHERE uri = ?1 LIMIT 1`,
				)
					.bind(obj.id)
					.first();
			}
		}

		// Fallback: find by account pair
		if (!followRequest) {
			followRequest = await env.DB.prepare(
				`SELECT id, account_id, target_account_id, uri FROM follow_requests
				 WHERE target_account_id = ?1
				 AND account_id IN (SELECT id FROM accounts WHERE domain IS NULL)
				 LIMIT 1`,
			)
				.bind(remoteAccount.id)
				.first();
		}

		if (!followRequest) {
			console.warn('[accept] No matching follow_request found');
			return;
		}

		const now = new Date().toISOString();
		const newFollowId = generateUlid();

		// Move from follow_requests to follows
		try {
			await env.DB.batch([
				env.DB.prepare(
					`INSERT INTO follows (id, account_id, target_account_id, uri, created_at, updated_at)
					 VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
				).bind(newFollowId, followRequest.account_id, followRequest.target_account_id, followRequest.uri, now, now),
				env.DB.prepare(
					`DELETE FROM follow_requests WHERE id = ?1`,
				).bind(followRequest.id),
			]);

			await this.accountRepo.incrementCount(followRequest.account_id, 'following_count');
			await this.accountRepo.incrementCount(followRequest.target_account_id, 'followers_count');
		} catch (err) {
			console.error('[accept] Failed to move follow_request to follows:', err);
		}
	}

	private async processQuoteAccept(activity: APActivity, quoteRequest: APObject): Promise<void> {
		const instrumentUri = getId(quoteRequest.instrument);
		const quotedUri = getId(quoteRequest.object);
		const authorizationUri = getId(activity.result);
		if (!instrumentUri || !quotedUri || !authorizationUri) {
			console.warn('[accept] QuoteRequest Accept missing instrument, object, or result');
			return;
		}

		const status = await env.DB.prepare(
			`SELECT s.id, s.quote_id, qs.uri AS quoted_uri
			 FROM statuses s
			 LEFT JOIN statuses qs ON qs.id = s.quote_id
			 WHERE s.uri = ?1 AND s.local = 1 AND s.deleted_at IS NULL
			 LIMIT 1`,
		).bind(instrumentUri).first<{ id: string; quote_id: string | null; quoted_uri: string | null }>();

		if (!status || status.quoted_uri !== quotedUri) return;

		await env.DB.prepare(
			`UPDATE statuses
			 SET quote_authorization_uri = ?1, quote_approval_status = 'accepted', updated_at = ?2
			 WHERE id = ?3`,
		).bind(authorizationUri, new Date().toISOString(), status.id).run();

		await this.enqueueQuoteUpdate(status.id, authorizationUri);
	}

	private async enqueueQuoteUpdate(statusId: string, authorizationUri: string): Promise<void> {
		const row = await env.DB.prepare(
			`SELECT s.id, s.uri, s.url, s.content, s.content_warning, s.visibility, s.sensitive,
			        s.language, s.created_at, s.quote_id, qs.uri AS quoted_uri,
			        a.id AS account_id, a.uri AS actor_uri, a.username
			 FROM statuses s
			 JOIN accounts a ON a.id = s.account_id
			 LEFT JOIN statuses qs ON qs.id = s.quote_id
			 WHERE s.id = ?1 AND s.local = 1 AND s.deleted_at IS NULL
			 LIMIT 1`,
		).bind(statusId).first<{
			id: string;
			uri: string;
			url: string | null;
			content: string;
			content_warning: string;
			visibility: string;
			sensitive: number;
			language: string;
			created_at: string;
			quote_id: string | null;
			quoted_uri: string | null;
			account_id: string;
			actor_uri: string;
			username: string;
		}>();
		if (!row?.quoted_uri) return;

		const followersUri = `${row.actor_uri}/followers`;
		const to: string[] = [];
		const cc: string[] = [];
		switch (row.visibility) {
			case 'public':
				to.push(AS_PUBLIC);
				cc.push(followersUri);
				break;
			case 'unlisted':
				to.push(followersUri);
				cc.push(AS_PUBLIC);
				break;
			case 'private':
				to.push(followersUri);
				break;
			default:
				return;
		}

		const note: Record<string, unknown> = {
			'@context': ['https://www.w3.org/ns/activitystreams', quoteContext()],
			type: 'Note',
			id: row.uri,
			attributedTo: row.actor_uri,
			to,
			cc,
			content: row.content,
			summary: row.content_warning || null,
			sensitive: row.sensitive === 1,
			published: row.created_at,
			url: row.url,
		};
		addQuoteProperties(note, row.quoted_uri, authorizationUri);

		const update = {
			'@context': ['https://www.w3.org/ns/activitystreams', quoteContext()],
			type: 'Update',
			id: `https://${env.INSTANCE_DOMAIN}/activities/${generateUlid()}`,
			actor: row.actor_uri,
			to,
			cc,
			object: note,
		};

		await env.QUEUE_FEDERATION.send({
			type: 'deliver_activity_fanout',
			activity: update,
			actorAccountId: row.account_id,
			statusId: row.id,
		});
	}
}

export async function processAccept(
	activity: APActivity,
	localAccountId: string,
): Promise<void> {
	await new AcceptProcessor(localAccountId).process(activity);
}
