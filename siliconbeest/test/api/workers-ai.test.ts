import { beforeEach, describe, expect, it, vi } from 'vitest'
import { translateStatus } from '@/api/mastodon/statuses'
import {
  getRecommendedTimeline,
  getRecommendedTimelinePage,
} from '@/api/mastodon/timelines'

describe('Workers AI frontend API contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
  })

  it('uses the Mastodon POST translation route with the selected language', async () => {
    await translateStatus('status-1', 'zh', 'token-1')

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/statuses/status-1/translate?lang=zh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    )
  })

  it('preserves the opaque recommendation cursor from the Link header', async () => {
    await getRecommendedTimelinePage(
      '/api/v1/timelines/recommended?cursor=opaque%2Bcursor%2Fvalue&limit=20',
      'token-2',
    )

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/timelines/recommended?cursor=opaque%2Bcursor%2Fvalue&limit=20',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ Authorization: 'Bearer token-2' }),
      }),
    )
  })

  it('asks for a fresh recommendation snapshot explicitly', async () => {
    await getRecommendedTimeline({ token: 'token-2' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/timelines/recommended',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ Authorization: 'Bearer token-2' }),
      }),
    )
  })

  it('rejects a cursor URL for any other API endpoint', () => {
    expect(() => getRecommendedTimelinePage('/v1/accounts/1?cursor=x', 'token'))
      .toThrow('Invalid recommended timeline page')
  })
})
