import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import DeckRail from '@/deck/layout/DeckRail.vue';
import { useUiStore } from '@/stores/ui';
import { createTestI18n } from '../helpers';

describe('DeckRail', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
  });

  async function mountRail(showMobileDeck: boolean) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/home', name: 'home', component: { template: '<div />' } }],
    });
    await router.push('/home');
    await router.isReady();
    return mount(DeckRail, {
      props: { showMobileDeck },
      global: {
        plugins: [pinia, createTestI18n(), router],
        stubs: { Avatar: true },
      },
    });
  }

  it('only describes the Columns button with guidance rendered by the desktop branch', async () => {
    const ui = useUiStore();
    ui.hydrateFromServer('token', {
      'ui:columns': '[]',
      'ui:show_trending': null,
    });

    const desktop = await mountRail(false);
    expect(desktop.get('#deck-column-picker-button').attributes('aria-describedby'))
      .toBe('deck-empty-columns-guidance');
    desktop.unmount();

    const mobile = await mountRail(true);
    expect(mobile.get('#deck-column-picker-button').attributes('aria-describedby'))
      .toBeUndefined();
  });
});
