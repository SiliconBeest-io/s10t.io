/**
 * Inbox Processor: Reject(Follow)
 *
 * Handles incoming Reject activities. Removes the pending follow_request
 * that corresponds to a Follow we sent.
 */

import type { APActivity, APObject } from '../../types/activitypub';
import { BaseProcessor } from './BaseProcessor';
import { env } from 'cloudflare:workers';
import { FEP044F_QUOTE_REQUEST, getId } from '../helpers/quote';

class RejectProcessor extends BaseProcessor {
	async process(activity: APActivity): Promise<void> {
		const object = activity.object;
		if (!object) {
			console.warn('[reject] activity.object is missing');
			return;
		}

		if (typeof object === 'object') {
			const objectType = (object as APObject).type;
			if (objectType === 'QuoteRequest' || objectType === FEP044F_QUOTE_REQUEST) {
				await this.processQuoteReject(object as APObject);
				return;
			}
		}

		const remoteAccount = await this.findAccountByUri(activity.actor);
		if (!remoteAccount) {
			console.warn(`[reject] Remote actor not found: ${activity.actor}`);
			return;
		}

		// Try to find the follow_request by URI
		let deleted = false;

		if (typeof object === 'string') {
			const result = await env.DB.prepare(
				`DELETE FROM follow_requests WHERE uri = ?1`,
			)
				.bind(object)
				.run();
			deleted = (result.meta?.changes ?? 0) > 0;
		} else {
			const obj = object as APObject;
			if (obj.id) {
				const result = await env.DB.prepare(
					`DELETE FROM follow_requests WHERE uri = ?1`,
				)
					.bind(obj.id)
					.run();
				deleted = (result.meta?.changes ?? 0) > 0;
			}
		}

		// Fallback: delete by account pair
		if (!deleted) {
			await env.DB.prepare(
				`DELETE FROM follow_requests
				 WHERE target_account_id = ?1
				 AND account_id IN (SELECT id FROM accounts WHERE domain IS NULL)`,
			)
				.bind(remoteAccount.id)
				.run();
		}
	}

	private async processQuoteReject(quoteRequest: APObject): Promise<void> {
		const instrumentUri = getId(quoteRequest.instrument);
		const quotedUri = getId(quoteRequest.object);
		if (!instrumentUri || !quotedUri) {
			console.warn('[reject] QuoteRequest Reject missing instrument or object');
			return;
		}

		await env.DB.prepare(
			`UPDATE statuses
			 SET quote_id = NULL,
			     quote_authorization_uri = NULL,
			     quote_approval_status = 'rejected',
			     updated_at = ?1
			 WHERE uri = ?2
			   AND local = 1
			   AND quote_id IN (SELECT id FROM statuses WHERE uri = ?3)`,
		).bind(new Date().toISOString(), instrumentUri, quotedUri).run();
	}
}

export async function processReject(
	activity: APActivity,
	localAccountId: string,
): Promise<void> {
	await new RejectProcessor(localAccountId).process(activity);
}
