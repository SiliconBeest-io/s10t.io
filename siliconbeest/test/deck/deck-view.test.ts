import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, renderToString } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import DeckView from '@/deck/views/DeckView.vue';
import { useUiStore } from '@/stores/ui';
import { useTimelinesStore } from '@/stores/timelines';
import { createTestI18n } from '../helpers';

function deckGlobal(pinia: ReturnType<typeof createPinia>) {
  return {
    plugins: [pinia, createTestI18n()],
    stubs: {
      DeckShell: { template: '<main><slot /></main>' },
      DeckColumn: {
        props: ['type', 'fluid'],
        template: '<div data-deck-column :data-column-type="type" />',
      },
      DeckNotificationsColumn: {
        props: ['fluid'],
        template: '<div data-deck-column data-column-type="notifications" />',
      },
      DeckSearchColumn: {
        props: ['fluid'],
        template: '<div data-deck-column data-column-type="search" />',
      },
      DeckFollowRequestsColumn: {
        props: ['fluid'],
        template: '<div data-deck-column data-column-type="follow_requests" />',
      },
    },
  };
}

function mountDeck(pinia: ReturnType<typeof createPinia>) {
  return mount(DeckView, { global: deckGlobal(pinia) });
}

function renderDeck(pinia: ReturnType<typeof createPinia>) {
  return renderToString(DeckView, { global: deckGlobal(pinia) });
}

describe('DeckView', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
  });

  it('renders only the server-selected desktop columns, in order', () => {
    const ui = useUiStore();
    ui.isMobile = false;
    ui.hydrateFromServer('token', {
      'ui:columns': '["notifications","home"]',
      'ui:show_trending': null,
    });
    const timelines = useTimelinesStore();
    const soundScope = vi.spyOn(timelines, 'setAudibleTimelineScope');

    const wrapper = mountDeck(pinia);

    expect(
      wrapper.findAll('[data-deck-column]').map((column) => column.attributes('data-column-type')),
    ).toEqual(['notifications', 'home']);
    expect(wrapper.text()).not.toContain('No columns are selected.');
    const [scopeOwner, scopeTypes] = soundScope.mock.calls.at(-1)!;
    expect(typeof scopeOwner).toBe('symbol');
    expect((scopeOwner as symbol).description).toBe('deck-home');
    expect(scopeTypes).toEqual(['home']);
  });

  it('includes the selected column order in the server-rendered HTML', async () => {
    const ui = useUiStore();
    ui.hydrateFromServer('token', {
      'ui:columns': '["notifications","home"]',
      'ui:show_trending': null,
    });

    const html = await renderDeck(pinia);

    const notifications = html.indexOf('data-column-type="notifications"');
    const home = html.indexOf('data-column-type="home"');
    expect(notifications).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(notifications);
    expect(html).not.toContain('data-column-type="local"');
    expect(html).not.toContain('data-column-type="federated"');
  });

  it('shows a left-pointing column-picker prompt when desktop selection is empty', () => {
    const ui = useUiStore();
    ui.isMobile = false;
    ui.hydrateFromServer('token', {
      'ui:columns': '[]',
      'ui:show_trending': null,
    });

    const wrapper = mountDeck(pinia);

    expect(wrapper.findAll('[data-deck-column]')).toHaveLength(0);
    expect(wrapper.text()).toContain(
      'No columns are selected. Use the Columns button in the upper-left to choose what to load.',
    );
    expect(wrapper.text()).toContain('←');
  });

  it('keeps every column selectable on mobile and only makes the active feed audible', async () => {
    const ui = useUiStore();
    ui.hydrateFromServer('token', {
      'ui:columns': '[]',
      'ui:show_trending': null,
    });
    ui.isMobile = true;
    ui.setMobileColumn('home');

    const timelines = useTimelinesStore();
    const setSoundScope = vi.spyOn(timelines, 'setAudibleTimelineScope');
    const clearSoundScope = vi.spyOn(timelines, 'clearAudibleTimelineScope');
    const wrapper = mountDeck(pinia);
    await nextTick();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(7);
    expect(tabs.map((tab) => tab.text())).toEqual([
      'home',
      'social',
      'local',
      'federated',
      'alerts',
      'search',
      'follow requests',
    ]);
    expect(wrapper.text()).not.toContain('No columns are selected.');
    const [scopeOwner, initialTypes] = setSoundScope.mock.calls.at(-1)!;
    expect(typeof scopeOwner).toBe('symbol');
    expect((scopeOwner as symbol).description).toBe('deck-home');
    expect(initialTypes).toEqual(['home']);

    await tabs[3]!.trigger('click');
    await nextTick();

    expect(ui.mobileColumn).toBe('federated');
    expect(setSoundScope).toHaveBeenLastCalledWith(scopeOwner, ['public']);

    wrapper.unmount();
    expect(clearSoundScope).toHaveBeenCalledWith(scopeOwner);
  });
});
