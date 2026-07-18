import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import StatusActions from '@/components/status/StatusActions.vue'
import DeckStatusActions from '@/deck/components/DeckStatusActions.vue'
import LegacyStatusActions from '@/legacy/components/status/StatusActions.vue'
import { mountWithPlugins } from '../helpers'

const baseProps = {
  statusId: 'status-1',
  repliesCount: 0,
  reblogsCount: 0,
  favouritesCount: 0,
  accountCanAct: true,
  viewerAuthenticated: true,
  isOwnStatus: true,
  accountId: 'owner',
  accountAcct: 'owner',
  visibility: 'public',
  quotePolicyAllows: true,
}

const variants: Array<[string, Component]> = [
  ['Aurora', StatusActions],
  ['Deck', DeckStatusActions],
  ['Classic', LegacyStatusActions],
]

function rect(top: number, bottom: number, height = bottom - top): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    left: 0,
    right: 300,
    width: 300,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe.each(variants)('%s status action menu placement', (_name, component) => {
  it('opens below the trigger when an upper scroll boundary would clip it', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.dataset.statusScroll = ''
    scrollContainer.dataset.deckScroll = ''
    document.body.appendChild(scrollContainer)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this === scrollContainer) return rect(100, 600)
      if ((this as HTMLElement).matches('[data-test="more-action"]')) return rect(120, 160, 40)
      if ((this as HTMLElement).classList.contains('absolute')) return rect(0, 240, 240)
      return rect(0, 0, 0)
    })

    const wrapper = mountWithPlugins(component, {
      props: baseProps,
      attachTo: scrollContainer,
    })

    await wrapper.get('[data-test="more-action"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('.top-full').classes()).toContain('top-full')
    expect(wrapper.find('.bottom-full').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes another card menu before opening its own', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.dataset.statusScroll = ''
    scrollContainer.dataset.deckScroll = ''
    document.body.appendChild(scrollContainer)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this === scrollContainer) return rect(0, 700)
      if ((this as HTMLElement).matches('[data-test="more-action"]')) return rect(300, 340, 40)
      if ((this as HTMLElement).classList.contains('absolute')) return rect(0, 180, 180)
      return rect(0, 0, 0)
    })

    const first = mountWithPlugins(component, { props: { ...baseProps, statusId: 'first' }, attachTo: scrollContainer })
    const second = mountWithPlugins(component, { props: { ...baseProps, statusId: 'second' }, attachTo: scrollContainer })

    await first.get('[data-test="more-action"]').trigger('click')
    await flushPromises()
    expect(first.find('.top-full, .bottom-full').exists()).toBe(true)

    await second.get('[data-test="more-action"]').trigger('click')
    await flushPromises()
    expect(first.find('.top-full, .bottom-full').exists()).toBe(false)
    expect(second.find('.top-full, .bottom-full').exists()).toBe(true)

    first.unmount()
    second.unmount()
  })
})
