import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { useInstanceStore } from '@/stores/instance';
import type { Instance } from '@/types/mastodon';
import { useDeckColumns, DECK_COLUMN_TYPES } from '@/deck/composables/useDeckColumns';

beforeEach(() => {
  setActivePinia(createPinia());
});

function enableRecommendedTimeline() {
  useAuthStore().setToken('deck-columns-token');
  useInstanceStore().instance = {
    configuration: {
      ai: { enabled: true, recommended_timeline: true, image_description: false },
    },
  } as Instance;
}

describe('useDeckColumns', () => {
  it('defaults to no desktop columns while keeping every type configurable', () => {
    enableRecommendedTimeline();
    const { columns, configRows, isEnabled } = useDeckColumns();
    expect(columns.value).toEqual([]);
    expect(configRows.value).toEqual([
      'recommended', 'home', 'social', 'local', 'federated', 'notifications', 'search', 'follow_requests',
    ]);
    expect(isEnabled('recommended')).toBe(false);
    expect(DECK_COLUMN_TYPES).toEqual([
      'recommended', 'home', 'social', 'local', 'federated', 'notifications', 'search', 'follow_requests',
    ]);
  });

  it('hides the recommended option when the instance feature is disabled', () => {
    const ui = useUiStore();
    ui.columns = ['recommended', 'home'];

    const { columns, configRows } = useDeckColumns();

    expect(columns.value).toEqual(['home']);
    expect(configRows.value).not.toContain('recommended');
    expect(ui.columns).toEqual(['recommended', 'home']);
  });

  it('keeps normal append behavior when the first default option is selected', () => {
    enableRecommendedTimeline();
    const ui = useUiStore();
    ui.columns = ['home'];
    const { toggle } = useDeckColumns();

    toggle('recommended');

    expect(ui.columns).toEqual(['home', 'recommended']);
  });

  it('toggle adds a column at the end and removes it preserving order', () => {
    const ui = useUiStore();
    ui.columns = ['home', 'local', 'federated'];
    const { columns, toggle, isEnabled } = useDeckColumns();
    toggle('notifications');
    expect(columns.value).toEqual(['home', 'local', 'federated', 'notifications']);
    expect(isEnabled('notifications')).toBe(true);

    toggle('local');
    expect(columns.value).toEqual(['home', 'federated', 'notifications']);
    expect(isEnabled('local')).toBe(false);
  });

  it('toggle persists through the ui store setColumns (server-synced path)', () => {
    const ui = useUiStore();
    ui.columns = ['home', 'local', 'federated'];
    const { toggle } = useDeckColumns();
    toggle('home');
    expect(ui.columns).toEqual(['local', 'federated']);
  });

  it('move shifts a column up/down within bounds', () => {
    const ui = useUiStore();
    ui.columns = ['home', 'local', 'federated'];
    const { columns, move } = useDeckColumns();
    move('federated', -1);
    expect(columns.value).toEqual(['home', 'federated', 'local']);
    move('home', -1); // already first — no-op
    expect(columns.value).toEqual(['home', 'federated', 'local']);
    move('local', 1); // already last — no-op
    expect(columns.value).toEqual(['home', 'federated', 'local']);
    move('home', 1);
    expect(columns.value).toEqual(['federated', 'home', 'local']);
  });

  it('reorder moves rows within the enabled region only', () => {
    const ui = useUiStore();
    ui.columns = ['home', 'local', 'federated'];
    const { columns, reorder } = useDeckColumns();
    reorder(0, 2);
    expect(columns.value).toEqual(['local', 'federated', 'home']);
    // Row 3 is the disabled notifications row — not a valid target
    reorder(0, 3);
    expect(columns.value).toEqual(['local', 'federated', 'home']);
    reorder(2, 0);
    expect(columns.value).toEqual(['home', 'local', 'federated']);
  });

  it('dedupes and drops unknown values coming from server prefs', () => {
    const ui = useUiStore();
    ui.columns = ['home', 'home', 'bogus', 'notifications'] as never;
    const { columns, configRows } = useDeckColumns();
    expect(columns.value).toEqual(['home', 'notifications']);
    expect(configRows.value).toEqual([
      'home', 'notifications', 'social', 'local', 'federated', 'search', 'follow_requests',
    ]);
  });
});
