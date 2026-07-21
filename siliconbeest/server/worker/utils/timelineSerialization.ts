import { env } from 'cloudflare:workers';
import type { Status as MastodonStatus } from '../types/mastodon';
import type { AccountRow, TimelineStatusRow } from '../types/db';
import { serializeAccount, serializeStatus } from './mastodonSerializer';
import { enrichStatuses } from './statusEnrichment';

function joinedAccountRow(row: TimelineStatusRow): AccountRow {
  return {
    id: row.a_id,
    username: row.a_username,
    domain: row.a_domain,
    display_name: row.a_display_name || '',
    note: row.a_note || '',
    uri: row.a_uri,
    url: row.a_url || '',
    avatar_url: row.a_avatar_url || '',
    avatar_static_url: row.a_avatar_static_url || '',
    header_url: row.a_header_url || '',
    header_static_url: row.a_header_static_url || '',
    locked: row.a_locked || 0,
    bot: row.a_bot || 0,
    discoverable: row.a_discoverable,
    manually_approves_followers: 0,
    statuses_count: row.a_statuses_count || 0,
    followers_count: row.a_followers_count || 0,
    following_count: row.a_following_count || 0,
    last_status_at: row.a_last_status_at,
    created_at: row.a_created_at,
    updated_at: row.a_created_at,
    suspended_at: row.a_suspended_at,
    silenced_at: null,
    memorial: row.a_memorial || 0,
    moved_to_account_id: row.a_moved_to_account_id,
    emoji_tags: row.a_emoji_tags || null,
  };
}

/**
 * Batch-enrich and serialize timeline rows that already contain the shared
 * `a_*` account projection. This path is intended for original statuses; a
 * caller that allows boosts must attach the reblog object separately.
 */
export async function serializeOriginalTimelineRows(
  rows: readonly TimelineStatusRow[],
  currentAccountId: string | null,
  preferredLanguages: readonly string[] = [],
): Promise<MastodonStatus[]> {
  const statusIds = rows.map((row) => row.id);
  const enrichments = await enrichStatuses(
    env.INSTANCE_DOMAIN,
    statusIds,
    currentAccountId,
    env.CACHE,
  );

  return rows.map((row) => {
    const enrichment = enrichments.get(row.id);
    return serializeStatus(row, {
      account: serializeAccount(joinedAccountRow(row), {
        instanceDomain: env.INSTANCE_DOMAIN,
      }),
      mediaAttachments: enrichment?.mediaAttachments,
      mentions: enrichment?.mentions,
      favourited: enrichment?.favourited,
      reblogged: enrichment?.reblogged,
      bookmarked: enrichment?.bookmarked,
      card: enrichment?.card,
      poll: enrichment?.poll,
      quote: enrichment?.quote,
      emojis: enrichment?.emojis,
      quotePolicyAllows: enrichment?.quotePolicyAllows,
      quotePolicyReason: enrichment?.quotePolicyReason,
      preferredLanguages,
    });
  });
}
