import { describe, expect, it } from 'vitest';
import {
  canCreateBlockOrMuteAccountRelationship,
  canStoreFetchedRemoteActor,
  canStoreFetchedRemoteStatus,
} from '../../packages/shared/permissions';

describe('remote resource permission policies', () => {
  it('allows only an active account to create a non-self relationship', () => {
    expect(canCreateBlockOrMuteAccountRelationship({
      actorAccountId: 'actor',
      targetAccountId: 'target',
      actorOperational: true,
      targetExists: true,
    })).toBe(true);
    expect(canCreateBlockOrMuteAccountRelationship({
      actorAccountId: 'actor',
      targetAccountId: 'actor',
      actorOperational: true,
      targetExists: true,
    })).toBe(false);
    expect(canCreateBlockOrMuteAccountRelationship({
      actorAccountId: 'actor',
      targetAccountId: 'target',
      actorOperational: false,
      targetExists: true,
    })).toBe(false);
    expect(canCreateBlockOrMuteAccountRelationship({
      actorAccountId: 'actor',
      targetAccountId: 'target',
      actorOperational: true,
      targetExists: false,
    })).toBe(false);
  });

  it('requires a fetched actor document to retain the requested remote identity', () => {
    expect(canStoreFetchedRemoteActor({
      requestedActorUri: 'https://remote.example/users/alice',
      actorUri: 'https://remote.example/users/alice',
      localInstanceDomain: 'local.example',
      actorSuspended: false,
    })).toBe(true);
    expect(canStoreFetchedRemoteActor({
      requestedActorUri: 'https://remote.example/users/alice',
      actorUri: 'https://remote.example/users/mallory',
      localInstanceDomain: 'local.example',
      actorSuspended: false,
    })).toBe(false);
    expect(canStoreFetchedRemoteActor({
      requestedActorUri: 'https://local.example/users/alice',
      actorUri: 'https://local.example/users/alice',
      localInstanceDomain: 'local.example',
      actorSuspended: false,
    })).toBe(false);
  });

  it('requires exact object identity and same-host remote attribution', () => {
    expect(canStoreFetchedRemoteStatus({
      requestedStatusUri: 'https://remote.example/notes/1',
      statusUri: 'https://remote.example/notes/1',
      authorUri: 'https://remote.example/users/alice',
      localInstanceDomain: 'local.example',
      authorSuspended: false,
    })).toBe(true);
    expect(canStoreFetchedRemoteStatus({
      requestedStatusUri: 'https://remote.example/notes/1',
      statusUri: 'https://remote.example/notes/2',
      authorUri: 'https://remote.example/users/alice',
      localInstanceDomain: 'local.example',
      authorSuspended: false,
    })).toBe(false);
    expect(canStoreFetchedRemoteStatus({
      requestedStatusUri: 'https://remote.example/notes/1',
      statusUri: 'https://remote.example/notes/1',
      authorUri: 'https://elsewhere.example/users/alice',
      localInstanceDomain: 'local.example',
      authorSuspended: false,
    })).toBe(false);
    expect(canStoreFetchedRemoteStatus({
      requestedStatusUri: 'https://remote.example/notes/1',
      statusUri: 'https://remote.example/notes/1',
      authorUri: 'https://local.example/users/alice',
      localInstanceDomain: 'local.example',
      authorSuspended: false,
    })).toBe(false);
  });
});
