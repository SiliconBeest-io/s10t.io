import { describe, expect, it } from 'vitest'
import {
  canUseAuthenticatedActions,
  getStatusActionPermissions,
} from '@/utils/permissions'

describe('frontend status action permissions', () => {
  it('fails closed until the authenticated account is loaded and operational', () => {
    expect(canUseAuthenticatedActions({
      authenticated: true,
      accountLoaded: false,
      accountSuspended: undefined,
      accountMemorial: undefined,
    })).toBe(false)

    expect(canUseAuthenticatedActions({
      authenticated: true,
      accountLoaded: true,
      accountSuspended: true,
      accountMemorial: false,
    })).toBe(false)

    expect(canUseAuthenticatedActions({
      authenticated: true,
      accountLoaded: true,
      accountSuspended: false,
      accountMemorial: false,
    })).toBe(true)
  })

  it('keeps anonymous public sharing but denies all authenticated mutations', () => {
    expect(getStatusActionPermissions({
      accountCanAct: false,
      isOwnStatus: false,
      visibility: 'public',
      quotePolicyAllows: true,
    })).toEqual({
      reply: false,
      reblog: false,
      quote: false,
      favourite: false,
      react: false,
      bookmark: false,
      share: true,
      edit: false,
      delete: false,
      report: false,
      block: false,
      mute: false,
    })
  })

  it('uses the API quote decision and restricts edit/delete to the owner', () => {
    const permissions = getStatusActionPermissions({
      accountCanAct: true,
      isOwnStatus: true,
      visibility: 'private',
      quotePolicyAllows: true,
    })

    expect(permissions.quote).toBe(true)
    expect(permissions.reblog).toBe(false)
    expect(permissions.share).toBe(true)
    expect(permissions.edit).toBe(true)
    expect(permissions.delete).toBe(true)
    expect(permissions.report).toBe(false)
  })
})
