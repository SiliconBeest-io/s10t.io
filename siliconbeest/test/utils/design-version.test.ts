import { describe, expect, it } from 'vitest'
import { toDeckPath } from '@/utils/designVersion'

describe('toDeckPath', () => {
  it.each([
    ['/aurora/recommended', '/timelines/recommended'],
    ['/old/recommended', '/timelines/recommended'],
    ['/aurora/recommended?from=banner#feed', '/timelines/recommended?from=banner#feed'],
    ['/old/recommended?from=banner#feed', '/timelines/recommended?from=banner#feed'],
    ['/aurora/recommended/', '/timelines/recommended'],
    ['/old/recommended/?from=banner#feed', '/timelines/recommended?from=banner#feed'],
  ])('maps the recommendation page across designs: %s', (source, expected) => {
    expect(toDeckPath(source)).toBe(expected)
  })

  it('preserves the existing mapping for ordinary pages', () => {
    expect(toDeckPath('/old/bookmarks?view=all')).toBe('/bookmarks?view=all')
    expect(toDeckPath('/aurora/home')).toBe('/home')
    expect(toDeckPath('/old?from=banner')).toBe('/?from=banner')
    expect(toDeckPath('/aurora#top')).toBe('/#top')
  })
})
