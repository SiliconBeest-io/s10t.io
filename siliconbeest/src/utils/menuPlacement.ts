const CLIPPING_OVERFLOW = /^(auto|scroll|hidden|clip)$/

function findClippingBoundary(anchor: HTMLElement): DOMRect | null {
  const explicitBoundary = anchor.closest<HTMLElement>('[data-status-scroll], [data-deck-scroll]')
  if (explicitBoundary) return explicitBoundary.getBoundingClientRect()

  let parent = anchor.parentElement
  while (parent) {
    const style = window.getComputedStyle(parent)
    if (CLIPPING_OVERFLOW.test(style.overflowY) || CLIPPING_OVERFLOW.test(style.overflowX)) {
      return parent.getBoundingClientRect()
    }
    parent = parent.parentElement
  }
  return null
}

/** Choose a dropdown direction that stays inside both its scroll area and viewport. */
export function shouldOpenMenuDown(anchor: HTMLElement | null, menu: HTMLElement | null): boolean {
  if (!anchor || !menu) return false

  const anchorRect = anchor.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const menuHeight = Math.max(menu.offsetHeight, menuRect.height)
  const boundary = findClippingBoundary(anchor)
  const boundaryTop = Math.max(8, boundary?.top ?? 8)
  const boundaryBottom = Math.min(window.innerHeight - 8, boundary?.bottom ?? window.innerHeight - 8)
  const spaceAbove = anchorRect.top - boundaryTop
  const spaceBelow = boundaryBottom - anchorRect.bottom

  return spaceAbove < menuHeight + 6 && spaceBelow > spaceAbove
}
