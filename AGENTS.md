# While We Wait

Pocket games for people stuck waiting somewhere — originally built for little kids in line, now also includes a couples' conversation-starter game (Date Night) for date nights waiting on food, etc. Offline-capable PWA, no dependencies, no build step.

**Live:** https://whale-cobra.exe.xyz/while-we-wait/

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | App shell: HTML, CSS, and game engine JS |
| `games.js` | **All game data** — the only file you need to edit to add/change games |
| `sw.js` | Service worker for offline support + background update detection |
| `manifest.webmanifest` | PWA manifest (name, icons, theme) |
| `icon-192.png`, `icon-512.png` | PWA icons (🎴 on cream background) |
| `plans/` | Optional scratch notes/content plans from subagents (e.g. content design docs) — not required for the app to run |

## Architecture

### Data vs Code Separation

`games.js` contains `const GAMES = [...]` — a plain JS array loaded via `<script src="games.js">` before the engine. No build step, no bundler. Edit `games.js`, reload, done.

### Game Data Format

Each game is one object in the `GAMES` array. Required fields:

```js
{
  id: 'unique-slug',        // URL-safe identifier
  name: 'Display Name',     // shown on home screen
  emoji: '🎯',               // home screen icon
  energy: 'calm' | 'active', // filter category
  hue: '#HEX',              // accent color for the game
  kind: 'std' | 'reveal' | 'choice',  // determines default card layout
  how: 'Instructions...',   // shown in rules sheet
  cards: [...],             // array of card objects (format depends on kind)

  // Optional:
  plabel: 'FOR THE GROWN-UP', // overrides the helper-line label (e.g. 'FOR YOU TWO' for Date Night)
  pDefault: 'Fallback helper text used when a card has no own `p`',
}
```

A game's `kind` sets the *default* layout for its cards, but an individual card can override it with its own `kind` field (e.g. sprinkling `{ kind:'choice', a:[...], b:[...] }` cards into an otherwise `std` deck — see Date Night, which mixes prompt cards and Would-You-Rather cards in one shuffled deck).

### Card Formats by Kind

**`kind: 'std'`** — Standard prompt cards (most games)
```js
{ e: '🐶', k: 'Big kid prompt text', p: 'Parent helper script' }
```
Optional: `trick: true` (used by Simon Says for trick rounds)

**`kind: 'reveal'`** — Clue-based guessing (Animal Clues)
```js
{ e: '🐘', name: 'an ELEPHANT!', clues: ['Clue 1', 'Clue 2', 'Clue 3'] }
```

**`kind: 'choice'`** — Two-option cards (Would You Rather)
```js
{ a: ['🐒', 'option A text'], b: ['🪶', 'option B text'] }
```
If a card has no own `p`, the game's `pDefault` (if set) is shown as the helper line.

Home screen card counts update automatically from the data.

### Service Worker Strategy

**Stale-while-revalidate with update toast:**
1. Always serves from cache instantly (works offline)
2. Fetches fresh copies in background when online
3. If content changed, sends `content-updated` message to the page
4. Page shows a toast: "✨ New version available!" with Refresh/Dismiss
5. Cache version string in `sw.js` (`CACHE = 'wait-vN'`) should be bumped when changing the asset list

The `ASSETS` array in `sw.js` must list every file the app needs offline.

### PWA

- Installable on iOS/Android home screens
- `manifest.webmanifest` controls the installed app name/icon/theme
- `apple-touch-icon` link in HTML handles iOS specifically
- `short_name` in manifest = home screen label

## Making Changes

### Adding/editing games
Edit `games.js` only. Follow the format above. The engine picks up changes on reload.

### Changing app UI/behavior
Edit `index.html`. The engine code starts at the `/* ENGINE */` comment.

### After any change
If you added a new file that needs to work offline, add it to the `ASSETS` array in `sw.js` and bump the `CACHE` version.
