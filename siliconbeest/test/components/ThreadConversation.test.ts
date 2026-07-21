import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Status } from '@/types/mastodon'
import ThreadConversation from '@/components/timeline/ThreadConversation.vue'
import { buildThreadTree } from '@/components/timeline/threadTree'
import { createTestI18n } from '../helpers'

function status(id: string, parentId: string | null = null): Status {
  return {
    id,
    in_reply_to_id: parentId,
    content: `<p>${id}</p>`,
    object_type: 'Note',
    title: '',
    account: {
      id: `account-${id}`,
      username: id,
      acct: id,
      display_name: id,
    },
  } as Status
}

describe('thread conversation', () => {
  it('restores parent, child, and sibling relationships in server order', () => {
    const replies = [
      status('reply-a', 'current'),
      status('nested-a', 'reply-a'),
      status('reply-b', 'current'),
      status('nested-b', 'reply-b'),
    ]

    const tree = buildThreadTree(replies)

    expect(tree.map((node) => node.status.id)).toEqual(['reply-a', 'reply-b'])
    expect(tree[0]?.children.map((node) => node.status.id)).toEqual(['nested-a'])
    expect(tree[1]?.children.map((node) => node.status.id)).toEqual(['nested-b'])
  })

  it('marks the current post and renders nested replies as nested lists', () => {
    const wrapper = mount(ThreadConversation, {
      props: {
        status: status('current'),
        ancestors: [status('ancestor')],
        descendants: [
          status('reply-a', 'current'),
          status('nested-a', 'reply-a'),
          status('reply-b', 'current'),
        ],
      },
      global: {
        plugins: [createTestI18n()],
        stubs: {
          StatusCard: {
            props: {
              status: { type: Object, required: true },
              expanded: { type: Boolean, default: false },
            },
            template: '<article class="status-stub" :data-status-id="status.id" :data-expanded="String(Boolean(expanded))" />',
          },
          DeckStatusCard: true,
        },
      },
    })

    expect(wrapper.get('.thread-current').attributes('aria-label')).toBe('Post you are viewing')
    expect(wrapper.get('[data-status-id="current"]').attributes('data-expanded')).toBe('true')
    expect(wrapper.findAll('.thread-branch')).toHaveLength(2)
    expect(wrapper.findAll('.thread-reply-card')).toHaveLength(3)
    expect(wrapper.get('.thread-replies').attributes('aria-label')).toBe('3 replies')
  })
})
