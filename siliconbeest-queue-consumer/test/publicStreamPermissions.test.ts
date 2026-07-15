import { describe, expect, it } from 'vitest';
import {
  canBroadcastStatusToPublicStreams,
  type PublicStatusBroadcastFacts,
} from '../../packages/shared/permissions';

function publicStatusFacts(
  overrides: Partial<PublicStatusBroadcastFacts> = {},
): PublicStatusBroadcastFacts {
  return {
    visibility: 'public',
    statusDeleted: false,
    authorSuspended: false,
    authorSilenced: false,
    ...overrides,
  };
}

describe('public status stream permissions', () => {
  it('allows an active public status from a normal author', () => {
    expect(canBroadcastStatusToPublicStreams(publicStatusFacts())).toBe(true);
  });

  it.each([
    ['unlisted visibility', { visibility: 'unlisted' }],
    ['private visibility', { visibility: 'private' }],
    ['direct visibility', { visibility: 'direct' }],
    ['invalid visibility', { visibility: 'mystery' }],
    ['a deleted status', { statusDeleted: true }],
    ['an unknown deleted state', { statusDeleted: null }],
    ['a suspended author', { authorSuspended: true }],
    ['an unknown suspension state', { authorSuspended: null }],
    ['a silenced author', { authorSilenced: true }],
    ['an unknown silence state', { authorSilenced: null }],
  ] satisfies [string, Partial<PublicStatusBroadcastFacts>][])(
    'denies %s',
    (_label, overrides) => {
      expect(
        canBroadcastStatusToPublicStreams(publicStatusFacts(overrides)),
      ).toBe(false);
    },
  );
});
