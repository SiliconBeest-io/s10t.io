import { canReblogStatus } from '../../../packages/shared/permissions'

export interface FrontendAccountActionFacts {
  authenticated: boolean
  accountLoaded: boolean
  accountSuspended: boolean | undefined
  accountMemorial: boolean | undefined
}

export function canUseAuthenticatedActions(
  facts: FrontendAccountActionFacts,
): boolean {
  return facts.authenticated
    && facts.accountLoaded
    && facts.accountSuspended !== true
    && facts.accountMemorial !== true
}

export interface StatusActionPermissionFacts {
  accountCanAct: boolean
  isOwnStatus: boolean
  visibility: string | null | undefined
  quotePolicyAllows: boolean | undefined
}

export interface StatusActionPermissions {
  reply: boolean
  reblog: boolean
  quote: boolean
  favourite: boolean
  react: boolean
  bookmark: boolean
  share: boolean
  edit: boolean
  delete: boolean
  report: boolean
  block: boolean
  mute: boolean
}

/**
 * Frontend affordances for status actions. The API remains the authority, but
 * every frontend variant uses this fail-closed policy so it does not offer an
 * action that the current account cannot perform.
 */
export function getStatusActionPermissions(
  facts: StatusActionPermissionFacts,
): StatusActionPermissions {
  const accountAction = facts.accountCanAct
  const otherAccountAction = accountAction && !facts.isOwnStatus

  return {
    reply: accountAction,
    reblog: accountAction && canReblogStatus(facts.visibility),
    // quotePolicyAllows is calculated per viewer by the API. It intentionally
    // also covers an author's private post, which can be quoted by that author.
    quote: accountAction && facts.quotePolicyAllows === true,
    favourite: accountAction,
    react: accountAction,
    bookmark: accountAction,
    // Copying/sharing the canonical URL does not widen its server-side audience.
    share: true,
    edit: accountAction && facts.isOwnStatus,
    delete: accountAction && facts.isOwnStatus,
    report: otherAccountAction,
    block: otherAccountAction,
    mute: otherAccountAction,
  }
}
