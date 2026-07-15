import { describe, expect, it } from 'vitest';
import {
  canFeatureAccount,
  canFollowAccount,
  canSearchAccount,
  canSurfaceAccount,
  canViewAccount,
  canViewAccountRelationship,
} from '../../../packages/shared/permissions';
import {
  buildAccountAvailabilitySqlPredicate,
  buildAccountDiscoverySqlPredicate,
  buildAccountInteractionListSqlPredicate,
  buildAccountSearchSqlPredicate,
} from '../../server/worker/services/permissions';

describe('account permission policies', () => {
  it('keeps frozen and memorial profiles canonical while suspension removes them', () => {
    expect(canViewAccount({ accountSuspended: false })).toBe(true);
    expect(canViewAccount({ accountSuspended: true })).toBe(false);
    expect(canViewAccount({ accountSuspended: null })).toBe(false);
  });

  it('surfaces limited accounts only to themselves or followers', () => {
    const base = {
      accountSuspended: false,
      isLocalAccount: true,
      localUserApproved: true,
      accountSilenced: true,
      viewerMutesAccount: false,
      viewerBlocksAccount: false,
      viewerBlocksAccountDomain: false,
      accountBlocksViewer: false,
    } as const;

    expect(canSurfaceAccount({
      ...base,
      viewerIsAccount: false,
      viewerFollowsAccount: false,
    })).toBe(false);
    expect(canSurfaceAccount({
      ...base,
      viewerIsAccount: false,
      viewerFollowsAccount: true,
    })).toBe(true);
    expect(canSurfaceAccount({
      ...base,
      viewerIsAccount: true,
      viewerFollowsAccount: false,
    })).toBe(true);
  });

  it('keeps limited accounts searchable but omits moved accounts', () => {
    const base = {
      accountSuspended: false,
      isLocalAccount: true,
      localUserApproved: true,
      accountMoved: false,
      viewerMutesAccount: false,
      viewerBlocksAccount: false,
      viewerBlocksAccountDomain: false,
      accountBlocksViewer: false,
    } as const;

    expect(canSearchAccount(base)).toBe(true);
    expect(canSearchAccount({ ...base, accountMoved: true })).toBe(false);
    expect(canSearchAccount({ ...base, accountMoved: null })).toBe(false);
  });

  it('fails account discovery closed for pending approval and relationship suppression', () => {
    const base = {
      accountSuspended: false,
      isLocalAccount: true,
      localUserApproved: true,
      accountSilenced: false,
      viewerIsAccount: false,
      viewerFollowsAccount: false,
      viewerMutesAccount: false,
      viewerBlocksAccount: false,
      viewerBlocksAccountDomain: false,
      accountBlocksViewer: false,
    } as const;

    expect(canSurfaceAccount({ ...base, localUserApproved: false })).toBe(false);
    expect(canSurfaceAccount({ ...base, viewerMutesAccount: true })).toBe(false);
    expect(canSurfaceAccount({ ...base, viewerBlocksAccount: true })).toBe(false);
    expect(canSurfaceAccount({ ...base, viewerBlocksAccountDomain: true })).toBe(false);
    expect(canSurfaceAccount({ ...base, accountBlocksViewer: true })).toBe(false);
  });

  it('rejects new follows across either block direction or unavailable targets', () => {
    const base = {
      actorAccountId: 'actor',
      targetAccountId: 'target',
      targetViewable: true,
      targetMemorial: false,
      targetMoved: false,
      actorBlocksTarget: false,
      actorBlocksTargetDomain: false,
      targetBlocksActor: false,
    } as const;

    expect(canFollowAccount(base)).toBe(true);
    expect(canFollowAccount({ ...base, actorBlocksTarget: true })).toBe(false);
    expect(canFollowAccount({ ...base, actorBlocksTargetDomain: true })).toBe(false);
    expect(canFollowAccount({ ...base, targetBlocksActor: true })).toBe(false);
    expect(canFollowAccount({ ...base, targetViewable: false })).toBe(false);
    expect(canFollowAccount({ ...base, targetMemorial: true })).toBe(false);
    expect(canFollowAccount({ ...base, targetMoved: true })).toBe(false);
    expect(canFollowAccount({ ...base, targetAccountId: 'actor' })).toBe(false);
  });

  it('requires an active followed target for profile featuring', () => {
    const base = {
      actorAccountId: 'actor',
      targetAccountId: 'target',
      targetViewable: true,
      actorFollowsTarget: true,
    } as const;

    expect(canFeatureAccount(base)).toBe(true);
    expect(canFeatureAccount({ ...base, actorFollowsTarget: false })).toBe(false);
    expect(canFeatureAccount({ ...base, targetViewable: false })).toBe(false);
  });

  it('omits suspended relationship targets unless explicitly requested', () => {
    expect(canViewAccountRelationship({
      targetExists: true,
      targetSuspended: true,
      includeSuspended: false,
    })).toBe(false);
    expect(canViewAccountRelationship({
      targetExists: true,
      targetSuspended: true,
      includeSuspended: true,
    })).toBe(true);
  });

  it('keeps SQL-shaped viewer IDs in bindings and accepts only fixed sources', () => {
    const viewerId = "viewer' OR 1 = 1 --";
    const discovery = buildAccountDiscoverySqlPredicate(
      'account',
      viewerId,
      '2026-07-15T00:00:00.000Z',
    );
    const canonical = buildAccountAvailabilitySqlPredicate('account');
    const interactionList = buildAccountInteractionListSqlPredicate(
      'account',
      viewerId,
      '2026-07-15T00:00:00.000Z',
    );
    const search = buildAccountSearchSqlPredicate(
      'account',
      viewerId,
      '2026-07-15T00:00:00.000Z',
    );

    expect(discovery.sql).not.toContain(viewerId);
    expect(discovery.bindings.filter((value) => value === viewerId)).toHaveLength(6);
    expect(interactionList.sql).not.toContain(viewerId);
    expect(interactionList.bindings.filter((value) => value === viewerId)).toHaveLength(4);
    expect(interactionList.sql).toContain('a.suspended_at IS NULL');
    expect(search.sql).not.toContain(viewerId);
    expect(search.bindings.filter((value) => value === viewerId)).toHaveLength(4);
    expect(search.sql).toContain('a.moved_to_account_id IS NULL');
    expect(canonical.sql).toContain('a.suspended_at IS NULL');
    expect(() => buildAccountDiscoverySqlPredicate(
      'unsafe_source' as 'account',
      viewerId,
      '2026-07-15T00:00:00.000Z',
    )).toThrow('Invalid SQL source');
  });
});
