import { onScopeDispose, shallowRef, watch } from 'vue'

const activeMenuOwner = shallowRef<symbol | null>(null)

/** Ensures only one status action menu is open across the current UI. */
export function useActionMenuCoordinator(closeMenus: () => void) {
  const owner = Symbol('status-action-menu')

  watch(activeMenuOwner, (activeOwner) => {
    if (activeOwner && activeOwner !== owner) closeMenus()
  }, { flush: 'sync' })

  function claim() {
    activeMenuOwner.value = owner
  }

  function release() {
    if (activeMenuOwner.value === owner) activeMenuOwner.value = null
  }

  onScopeDispose(release)

  return { claim, release }
}
