import type { Status } from '@/types/mastodon'

export interface ThreadNode {
  status: Status
  children: ThreadNode[]
}

/**
 * Preserve the server-provided order while restoring the parent/child shape.
 * Replies whose parent is outside the returned context stay visible as roots.
 */
export function buildThreadTree(statuses: Status[]): ThreadNode[] {
  const nodes = new Map<string, ThreadNode>()
  const roots: ThreadNode[] = []

  for (const status of statuses) {
    nodes.set(status.id, { status, children: [] })
  }

  for (const status of statuses) {
    const node = nodes.get(status.id)!
    const parent = status.in_reply_to_id ? nodes.get(status.in_reply_to_id) : undefined

    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}
