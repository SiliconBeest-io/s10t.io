/**
 * Inbox Processor: Like
 *
 * Handles incoming Like activities. Inserts a favourite record,
 * increments the favourites_count on the status, and creates
 * a notification for the status author.
 */

import type { APActivity } from '../../types/activitypub';
import { processEmojiReact } from './emojiReact';
import { BaseProcessor } from './BaseProcessor';
import { canProcessFederatedStatusInteraction } from '../../services/permissions';

class LikeProcessor extends BaseProcessor {
	async process(activity: APActivity): Promise<boolean> {
		// Check if this is actually an emoji reaction (Misskey-compatible)
		const anyActivity = activity as APActivity & Record<string, unknown>;
		if (anyActivity._misskey_reaction || anyActivity.content) {
			return processEmojiReact(anyActivity, this.recipientAccountId ?? '');
		}

		const statusUri = this.extractObjectUri(activity);
		if (!statusUri) {
			console.warn('[like] activity.object is not a string URI');
			return false;
		}

		const status = await this.findStatusByUri(statusUri);
		if (!status) {
			console.log(`[like] Status not found: ${statusUri}`);
			return false;
		}

		const actorAccountId = await this.resolveActor(activity.actor);
		if (!actorAccountId) {
			console.error('[like] Could not resolve remote actor');
			return false;
		}
		if (!await canProcessFederatedStatusInteraction(
			status.id,
			actorAccountId,
			this.recipientAccountId || null,
		)) return false;

		// Insert favourite (ignore duplicate)
		try {
			await this.favouriteRepo.create({
				account_id: actorAccountId,
				status_id: status.id,
				uri: activity.id ?? null,
			});
		} catch {
			return false; // Duplicate favourite
		}

		await this.statusRepo.incrementCount(status.id, 'favourites_count');
		await this.notifyIfLocal('favourite', status.account_id, actorAccountId, status.id);
		return true;
	}
}

export async function processLike(
	activity: APActivity,
	localAccountId: string,
): Promise<boolean> {
	return new LikeProcessor(localAccountId).process(activity);
}
