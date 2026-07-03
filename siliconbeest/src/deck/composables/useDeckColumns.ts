import { computed } from 'vue';
import { useUiStore, type ColumnType } from '@/stores/ui';

/**
 * Deck column configuration — which columns the multi-column deck shows and
 * in what order. Backed by the ui store's `columns` preference (ordered,
 * synced to the server per-account via `ui:columns`), so the arrangement
 * follows the user across devices.
 */
export type DeckColumnType = ColumnType;

/** Every column type the deck can host, in default order. */
export const DECK_COLUMN_TYPES: ColumnType[] = [
  'home',
  'social',
  'local',
  'federated',
  'notifications',
  'search',
  'follow_requests',
];

export function useDeckColumns() {
  const ui = useUiStore();

  /** Enabled columns in display order (deduped, unknown values dropped). */
  const columns = computed<ColumnType[]>(() =>
    ui.columns.filter((c, i) => DECK_COLUMN_TYPES.includes(c) && ui.columns.indexOf(c) === i),
  );

  /** All column types: enabled ones first (in order), then disabled ones. */
  const configRows = computed<ColumnType[]>(() => [
    ...columns.value,
    ...DECK_COLUMN_TYPES.filter((t) => !columns.value.includes(t)),
  ]);

  function isEnabled(type: ColumnType): boolean {
    return columns.value.includes(type);
  }

  /** Add a column (at the end) or remove it, preserving the rest's order. */
  function toggle(type: ColumnType) {
    if (isEnabled(type)) {
      ui.setColumns(columns.value.filter((c) => c !== type));
    } else {
      ui.setColumns([...columns.value, type]);
    }
  }

  /** Move an enabled column up (-1) or down (+1) one slot. */
  function move(type: ColumnType, delta: -1 | 1) {
    const arr = [...columns.value];
    const from = arr.indexOf(type);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= arr.length) return;
    arr.splice(from, 1);
    arr.splice(to, 0, type);
    ui.setColumns(arr);
  }

  /**
   * Drag-and-drop reorder between two rows of `configRows`. Only the enabled
   * region (indexes < columns.length) is reorderable.
   */
  function reorder(fromRow: number, toRow: number) {
    const len = columns.value.length;
    if (fromRow === toRow) return;
    if (fromRow < 0 || toRow < 0 || fromRow >= len || toRow >= len) return;
    const arr = [...columns.value];
    const [item] = arr.splice(fromRow, 1);
    arr.splice(toRow, 0, item!);
    ui.setColumns(arr);
  }

  return { columns, configRows, isEnabled, toggle, move, reorder };
}
