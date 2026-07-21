/**
 * D1 Database Row Types
 *
 * Re-exported from packages/shared/types/db for the single source of truth.
 */
import type { StatusWithJoinedAccountRow } from '../../../../packages/shared/types/db';

export * from '../../../../packages/shared/types/db';

/** Exact row projection returned by timeline.ts's shared ACCOUNT_COLUMNS. */
export type TimelineStatusRow = StatusWithJoinedAccountRow & {
  readonly a_id: string;
  readonly a_last_status_at: string | null;
  readonly a_suspended_at: string | null;
  readonly a_memorial: number;
  readonly a_moved_to_account_id: string | null;
  readonly a_emoji_tags: string | null;
};
