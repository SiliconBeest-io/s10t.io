import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, type PropType } from 'vue';
import { useAudibleTimelineScope } from '@/composables/useAudibleTimelineScope';
import { useTimelinesStore, type TimelineType } from '@/stores/timelines';

const ScopeView = defineComponent({
  props: {
    timelineType: {
      type: String as PropType<TimelineType>,
      required: true,
    },
  },
  setup(props) {
    useAudibleTimelineScope('deck-home', () => [props.timelineType]);
    return () => h('div');
  },
});

describe('useAudibleTimelineScope', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('uses one stable unique key per mounted instance', async () => {
    const store = useTimelinesStore();
    const setScope = vi.spyOn(store, 'setAudibleTimelineScope');
    const clearScope = vi.spyOn(store, 'clearAudibleTimelineScope');

    const oldView = mount(ScopeView, { props: { timelineType: 'local' } });
    const oldKey = setScope.mock.calls.at(-1)![0];
    const newView = mount(ScopeView, { props: { timelineType: 'public' } });
    const newKey = setScope.mock.calls.at(-1)![0];

    expect(typeof oldKey).toBe('symbol');
    expect(typeof newKey).toBe('symbol');
    expect(newKey).not.toBe(oldKey);

    await newView.setProps({ timelineType: 'home' });
    expect(setScope).toHaveBeenLastCalledWith(newKey, ['home']);

    oldView.unmount();
    expect(clearScope).toHaveBeenLastCalledWith(oldKey);
    expect(clearScope).not.toHaveBeenCalledWith(newKey);

    newView.unmount();
    expect(clearScope).toHaveBeenLastCalledWith(newKey);
  });
});
