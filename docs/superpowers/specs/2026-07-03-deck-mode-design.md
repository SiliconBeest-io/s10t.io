# Deck Mode — design spec

Date: 2026-07-03
Status: approved by SJang1 (brainstorming session)

## Summary

"Deck Mode" is SiliconBeest's next default UI: a dark-first, TweetDeck-style
multi-column client based on the two mockups at the repo root
(`SiliconBeest Deck (standalone).html` and
`SiliconBeest Deck (standalone) with navvar.html` — self-extracting bundles;
the design markup lives in each file's `__bundler/template` script).

Deck is built as a **separate component tree** (`siliconbeest/src/deck/`),
becomes the default at the root routes, and the current Aurora UI is
**preserved verbatim under `/aurora/*`** — the same pattern used when Aurora
replaced the classic UI (still at `/old/*`). Three UIs share one set of
stores, API clients, composables, types, and i18n.

The accent color (mockup default `#c6f24e`, rgb(198, 242, 78)) becomes an
**instance-admin setting** applied for every visitor.

## Decisions log

| Decision | Choice |
| --- | --- |
| Relation to Aurora | Deck replaces Aurora as the default UI |
| Implementation | Separate tree `src/deck/` (not an in-place retheme) |
| Aurora fate | Preserved at `/aurora/*`, like classic at `/old/*` |
| Layout | Full deck (multi-column) on desktop; single column + tabs on mobile |
| Navbar | Top bar + 78px left icon rail (per navvar mockup); Home/Local/Federated rail entries toggle deck columns; other entries navigate |
| Top bar branding | Instance logo in the accent tile + instance title; the mockup's subtitle line ("by siliconsjang · cloudflare workers") is dropped |
| Accent selection | Admin: 3 preset swatches + free color picker; stored instance-wide; no per-user override |

## 1. Structure & routing

- New tree: `siliconbeest/src/deck/{layout,components,views}/`. It imports
  the existing `src/stores`, `src/api`, `src/composables`, `src/types`,
  `src/i18n`. No server or store logic changes except the accent setting
  (§4).
- Deck owns the root routes and is the default UI. Aurora's routes move
  under an `/aurora` prefix; absolute `router-link` paths inside Aurora
  views/components are mechanically prefixed (template-only edits, no logic
  changes). Classic remains at `/old/*` untouched.
- **Incremental flip**: Phase 1 mounts Deck at `/` and `/home` only; every
  other root route keeps rendering its Aurora view until its Deck
  replacement lands (Phases 2–3). `/aurora/*` aliases are registered from
  Phase 1 so the preserved tree is reachable throughout. When the last Deck
  view ships, root routes are 100 % Deck.

### Phases (each gets its own implementation plan)

1. **Foundation** — `deck.css` tokens/recipes, fonts, `DeckShell` (top bar,
   rail, mobile nav), deck home with three toggleable timeline columns,
   admin accent color end-to-end, `/aurora` aliases.
2. **Core social views** — status detail, profile, notifications, compose
   flow, search/explore, favourites, bookmarks, lists.
3. **The rest** — settings pages, admin pages, auth/landing, remaining
   views (directory, followed tags, conversations, about, terms/privacy,
   errors); final route flip and completed Aurora prefix move.

## 2. Shell & navigation

`DeckShell.vue` wraps every Deck route: full-width top bar, left rail
(desktop), content region, bottom nav (mobile).

### Top bar (`DeckTopBar.vue`)

Per mockup header: 38px rounded-12 accent tile containing the instance
logo (site logo from instance settings; fallback `src/assets/logo.svg`),
instance title (weight 800, tight letter-spacing). No subtitle line.
Right side:

- **Streaming pill** — mono text + pulsing accent dot; visible while any
  `StreamingClient` in the timelines store is connected.
- **Theme toggle pill** — cycles the existing ui-store theme
  (light/dark/system persistence unchanged).
- **＋ Note button** — accent background, `--dk-acc-ink` text; opens the
  existing compose modal (`ui.openComposeModal()`).

### Left rail (`DeckRail.vue`, ≥ md, 78px)

Button style per navvar mockup: 58px wide, rounded-15, emoji icon 19px +
8.5px mono label, active = accent-tinted bg + accent border, badge = acc2
pill top-right, hover lift.

Entries, top to bottom:

1. **Home 🏠, Local 🦬, Federated 📡** — on the deck route these toggle
   that column's visibility (accent-active = visible; `aria-pressed`).
   From any other route they navigate to `/` and ensure the column is
   visible.
2. **Notifications 🔔** — navigates; unread count badge.
3. **Search 🔭** — navigates.
4. **⋯ More** — `dk-menu` popover: bookmarks, favourites, lists, followed
   tags, directory, follow requests (count badge), about.
5. **Settings ⚙️** — navigates.
6. **Admin 🛡** — navigates; staff only.
7. *(bottom, after spacer)* **Avatar button** — 44px, accent ring; opens a
   `dk-menu`: my profile, language picker, links to Aurora (`/aurora`) and
   classic (`/old`), logout.

Emoji glyphs above are placeholders from the mockup; final icons may be
the existing Heroicons paths restyled — pick per-item during
implementation, but keep icon + mono label structure.

### Mobile (< md)

Compact top bar (logo tile + title + ＋). Deck-styled bottom nav: deck
home, notifications, center accent ＋ (compose), search, avatar (opens the
same avatar menu). Deck home shows one column at a time with
`~/home · ~/local · ~/federated` switcher chips above the feed.

## 3. Deck home & post card

### `DeckView.vue` (route `/`)

Horizontal-scrolling flex row of fixed-width 392px columns inside the
shell's content region; page itself never scrolls vertically (mockup:
`height:100vh` shell, columns scroll internally). Column visibility is
persisted to localStorage (`siliconbeest_deck_columns`); order is fixed
(home, local, federated) — no drag-reorder in v1.

### `DeckColumn.vue`

- Header card: emoji, mono `~/home` / `~/local` / `~/federated` title,
  scope chip (`following`, the instance domain, `known network`), pulsing
  **LIVE** indicator while that stream's client is connected.
- Body: independently scrolling feed backed by the existing timelines
  store (per-stream state, streaming auto-connect, infinite-scroll
  pagination all reused as-is).

### `DeckStatusCard.vue`

New component, existing behavior (logic mirrored from the Aurora status
components; Aurora files stay untouched):

- Boost header: `⇄ renoted by @handle` in acc2 mono.
- Avatar: real image in a 42px rounded-13 square tile; fallback = gradient
  tile with the initial glyph (mockup style).
- Identity row: display name (bold) + mono @handle + **instance chip**
  (mono pill with a dot whose color is hashed from the instance domain) +
  relative timestamp.
- CW: dashed-border collapse button with ⚠, `show more`/`hide` accent
  label, `aria-expanded`.
- Content: rendered through the shared `.status-content` pipeline —
  wrapped by Deck styles, the class itself is never restyled (shared with
  classic).
- Media: attachment grid, rounded, Deck borders; existing NSFW blur/reveal
  behavior preserved.
- Quote: acc2 left-border card with mono author line (quote support
  already exists — FEP-044f).
- Poll: option buttons with animated percentage fill bars
  (accent fill for own vote, acc2 tint otherwise), votes/time-left mono
  footer.
- Reactions: emoji chips with counts (accent-tinted when the user has
  reacted, chipPop animation) + ＋ picker popover — wired to the real
  reactions API (`/v1/statuses/:id/reactions`).
- Action row: reply ↩ (count), boost ⇄ (count, accent when boosted),
  quote ❝, favourite, bookmark, ⋯ overflow menu.

## 4. Theming, tokens & admin accent

### Tokens (`src/assets/deck.css`, scoped under `.dk-app`)

CSS custom properties, values from the mockup:

```css
.dk-app {            /* dark set (default aesthetic) */
  --dk-bg: oklch(0.15 0.02 300);
  --dk-surface: oklch(0.205 0.025 300);
  --dk-surface2: oklch(0.26 0.03 300);
  --dk-border: oklch(0.32 0.03 300);
  --dk-text: oklch(0.95 0.01 300);
  --dk-dim: oklch(0.68 0.02 300);
  --dk-acc2: oklch(0.74 0.17 305);
  --dk-pad: 16px; --dk-gap: 12px; --dk-fs: 15px;
}
/* light set applies when <html> lacks .dark (existing theme system) */
```

Light values per mockup's `data-theme="light"` block (warm paper hue 95;
acc2 `oklch(0.58 0.18 305)`). Which set applies is keyed off the existing
`.dark` class on `<html>` — the ui store's light/dark/system handling is
unchanged. `--dk-acc` / `--dk-acc-ink` are set at runtime (below).
Density: `data-density="compact"` on `.dk-app` switches pad/gap/fs
(11px/9px/14px); exposed as a user appearance setting in Phase 3, default
cozy. Backdrop: the mockup's two radial `color-mix` accent glows over
`--dk-bg`.

Recipe classes (`dk-card`, `dk-chip`, `dk-pill-btn`, `dk-btn-accent`,
`dk-rail-item` + `-active`, `dk-menu`, `dk-menu-item`, `dk-input`,
`dk-label`, `dk-mono`, `dk-glow-bg`) get a "Deck" section appended to
`docs/design-system.md`.

Fonts: `@fontsource/bricolage-grotesque` (UI) and
`@fontsource/jetbrains-mono` (mono/meta), applied inside `.dk-app` only.
Bricolage has no hangul/CJK coverage: the family stacks are explicitly
`'Bricolage Grotesque', <existing Inter/system stack>` so Korean text
falls back cleanly.

### Admin accent pipeline

- **Storage**: instance-settings key `accent_color`, hex `#rrggbb`,
  written via the existing generic `PATCH /api/v1/admin/settings`.
  Server-side validation rejects non-`^#[0-9a-fA-F]{6}$` values.
- **Exposure**: `accent_color` added to the `getSettings([...])` whitelist
  in `GET /api/v1/instance` (same mechanism as `site_logo_url`), so the
  accent reaches every visitor pre-login. Frontend `Instance` type
  extended.
- **Admin UI**: AdminSettingsView (Aurora version first — it's the live
  admin UI; the Deck admin view in Phase 3 reuses the same field): three
  preset swatches `#c6f24e` / `#4ed9c6` / `#ff8a5c`, a native
  `<input type="color">`, and a hex text input.
- **Application**: `applyAccent(hex)` util (new, in `src/utils/`), called
  from App.vue after `instance.init()` and re-run on theme change:
  - parses hex → oklch;
  - dark theme: `--dk-acc` = the color as-is; light theme: lightness
    reduced ≈ 0.09 (mockup: 0.87 → 0.78) for contrast on paper;
  - `--dk-acc-ink` = near-black ink (`oklch(0.22 0.06 h)`) or white,
    chosen by relative-luminance threshold, so text on accent is always
    readable;
  - invalid or missing value → default `#c6f24e` + console warning.
- `--dk-acc2` stays fixed (not admin-configurable).
- Scope: accent affects the Deck tree only. Aurora and classic keep their
  own branding.

## 5. Behavior, errors, testing

- **i18n**: every new user-facing string behind vue-i18n under `deck.*`
  (or reused existing keys). No hardcoded copy.
- **a11y**: icon rail buttons carry `title` + `aria-label`; column toggles
  use `aria-pressed`; CW uses `aria-expanded`; visible `focus-visible`
  rings on all interactive elements; the horizontal deck region is
  keyboard-scrollable; `.status-content` semantics (`aria-*`, `alt`,
  `role`) preserved.
- **Errors**: invalid accent → default + warn; stream disconnect → LIVE
  pill/badge off and the store's existing reconnect behavior; missing
  instance logo → bundled logo fallback.
- **Tests** (vitest):
  - `applyAccent`: ink selection both ways, light-variant derivation,
    invalid input fallback.
  - Deck column visibility store logic + localStorage persistence.
  - Rail: active/toggle state, badges, staff-only Admin entry.
  - `DeckStatusCard` behavior parity mirrored from the Aurora card tests
    (CW toggle, `aria-pressed`, action button order, reaction toggle).
  - Server: `accent_color` PATCH validation; `/api/v1/instance` exposes
    the value.
  - Existing Aurora/classic suites keep passing (only route-prefix
    expectations updated when the `/aurora` move lands).
- **Per-phase verification**: `pnpm test`, `pnpm lint`, `pnpm build`.

## Out of scope (v1)

- Column drag-reorder, custom column types (lists/hashtags as columns),
  antennas, drive (mockup nav placeholders — not app features).
- Per-user accent override.
- Admin-configurable `--dk-acc2`.
