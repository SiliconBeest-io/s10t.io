import { describe, expect, it } from 'vitest';
import {
  canAttachMediaToStatus,
  canMutateOwnedStatus,
  canVoteInPoll,
  resolveStatusCreationVisibility,
  type OwnedStatusMutationFacts,
} from '../../../packages/shared/permissions';

function mutationFacts(
  overrides: Partial<OwnedStatusMutationFacts> = {},
): OwnedStatusMutationFacts {
  return {
    actorAccountId: 'owner',
    authorAccountId: 'owner',
    statusDeleted: false,
    statusLocal: true,
    reblogOfStatusId: null,
    visibility: 'public',
    ...overrides,
  };
}

describe('status mutation pure permission policy', () => {
  it('allows edit/source only for an active owned local original', () => {
    expect(canMutateOwnedStatus(mutationFacts(), 'edit')).toBe(true);
    expect(canMutateOwnedStatus(mutationFacts(), 'source')).toBe(true);

    for (const facts of [
      mutationFacts({ authorAccountId: 'other' }),
      mutationFacts({ statusDeleted: true }),
      mutationFacts({ statusLocal: false }),
      mutationFacts({ reblogOfStatusId: 'original' }),
    ]) {
      expect(canMutateOwnedStatus(facts, 'edit')).toBe(false);
      expect(canMutateOwnedStatus(facts, 'source')).toBe(false);
    }
  });

  it('rejects direct and reblog pins while allowing cleanup of legacy pins', () => {
    expect(canMutateOwnedStatus(mutationFacts({ visibility: 'private' }), 'pin')).toBe(true);
    expect(canMutateOwnedStatus(mutationFacts({ visibility: 'direct' }), 'pin')).toBe(false);
    expect(canMutateOwnedStatus(mutationFacts({ visibility: 'invalid' }), 'pin')).toBe(false);
    expect(canMutateOwnedStatus(
      mutationFacts({ reblogOfStatusId: 'original' }),
      'pin',
    )).toBe(false);
    expect(canMutateOwnedStatus(
      mutationFacts({ reblogOfStatusId: 'original', visibility: 'direct' }),
      'unpin',
    )).toBe(true);
  });

  it('attaches only owned media that is free or already on the target', () => {
    const base = {
      actorAccountId: 'owner',
      mediaOwnerAccountId: 'owner',
      mediaStatusId: null,
      targetStatusId: 'target',
    };
    expect(canAttachMediaToStatus(base)).toBe(true);
    expect(canAttachMediaToStatus({ ...base, mediaStatusId: 'target' })).toBe(true);
    expect(canAttachMediaToStatus({ ...base, mediaStatusId: 'other' })).toBe(false);
    expect(canAttachMediaToStatus({ ...base, mediaOwnerAccountId: 'other' })).toBe(false);
  });

  it('votes only when both actor and parent status are allowed and poll is open', () => {
    expect(canVoteInPoll({
      actorOperational: true,
      statusViewable: true,
      pollExpired: false,
    })).toBe(true);
    expect(canVoteInPoll({
      actorOperational: false,
      statusViewable: true,
      pollExpired: false,
    })).toBe(false);
    expect(canVoteInPoll({
      actorOperational: true,
      statusViewable: false,
      pollExpired: false,
    })).toBe(false);
    expect(canVoteInPoll({
      actorOperational: true,
      statusViewable: true,
      pollExpired: true,
    })).toBe(false);
  });

  it('clamps limited public posts and rejects ineligible creators', () => {
    const base = {
      actorOperational: true,
      actorIsLocal: true,
      actorMoved: false,
      actorSilenced: false,
      requestedVisibility: 'public',
    } as const;
    expect(resolveStatusCreationVisibility(base)).toBe('public');
    expect(resolveStatusCreationVisibility({ ...base, actorSilenced: true })).toBe('unlisted');
    expect(resolveStatusCreationVisibility({ ...base, requestedVisibility: 'direct' })).toBe('direct');
    expect(resolveStatusCreationVisibility({ ...base, actorMoved: true })).toBeNull();
    expect(resolveStatusCreationVisibility({ ...base, actorIsLocal: false })).toBeNull();
    expect(resolveStatusCreationVisibility({ ...base, actorOperational: false })).toBeNull();
    expect(resolveStatusCreationVisibility({
      ...base,
      requestedVisibility: 'followers-or-public',
    })).toBeNull();
  });
});
