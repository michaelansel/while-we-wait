# While We Wait

Pocket games for people stuck waiting somewhere — originally built for little kids in line, now also includes a couples' conversation-starter game (Date Night) for date nights waiting on food, etc. Offline-capable PWA, no dependencies, no build step.

**Live:** https://whale-cobra.exe.xyz/while-we-wait/

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | App shell: HTML, CSS, and game engine JS |
| `games.js` | **All public game data** — the only file you need to edit to add/change games |
| `charades-art.js` | **Generated** OpenMoji SVGs for cards with an `art:` field. Rebuild with `node tools/build-charades-art.mjs` — never edit by hand |
| `tools/contact-sheet.html` | Dev-time page showing every card's picture next to its words, for the card art rule below |
| `tools/build-charades-art.mjs` | Dev-time script: fetches the OpenMoji SVGs referenced in `games.js`, minifies them, writes `charades-art.js` |
| `family.js` | Private/family content tier — fetches and merges non-public games. See "Private/Family Content Tier" below |
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
  energy: 'calm' | 'active', // ENERGY LEVEL (not movement) — filter facet
  who: 'kids' | 'grownups',  // audience — filter facet
  tags: ['seated-friendly'], // [] = known not seated; omitted = unknown — filter facet
  hue: '#HEX',              // accent color for the game
  kind: 'std' | 'reveal' | 'choice',  // determines default card layout
  how: 'Instructions...',   // shown in rules sheet
  cards: [...],             // array of card objects (format depends on kind)

  // Optional:
  plabel: 'FOR THE GROWN-UP', // overrides the helper-line label (e.g. 'FOR YOU TWO' for Date Night)
  pDefault: 'Fallback helper text used when a card has no own `p`',
  artSize: 'small',           // render `art` smaller so the words lead (Word Charades). Cards without a matching icon just omit `art` and `e`
}
```

A game's `kind` sets the *default* layout for its cards, but an individual card can override it with its own `kind` field (e.g. sprinkling `{ kind:'choice', a:[...], b:[...] }` cards into an otherwise `std` deck — see Date Night, which mixes prompt cards and Would-You-Rather cards in one shuffled deck).

### Card Formats by Kind

**`kind: 'std'`** — Standard prompt cards (most games)
```js
{ e: '🐶', k: 'Big kid prompt text', p: 'Parent helper script' }
```
Optional: `trick: true` (used by Simon Says for trick rounds)

Optional: `art: '1F418'` — an OpenMoji hexcode (Unicode or OpenMoji extras like `E006` narwhal; browse at openmoji.org). The card shows that OpenMoji illustration instead of the system emoji; `e` stays as the fallback. After adding or changing `art` values, run `node tools/build-charades-art.mjs` and commit the regenerated `charades-art.js` (the script fails loudly on unknown hexcodes). OpenMoji is CC BY-SA 4.0 — any game using `art` should credit it in its `how` text (see the charades games).

**`kind: 'reveal'`** — Clue-based guessing (Animal Clues)
```js
{ e: '🐘', name: 'an ELEPHANT!', clues: ['Clue 1', 'Clue 2', 'Clue 3'] }
```

**`kind: 'choice'`** — Two-option cards (Would You Rather)
```js
{ a: ['🐒', 'option A text'], b: ['🪶', 'option B text'] }
```
If a card has no own `p`, the game's `pDefault` (if set) is shown as the helper line. This holds for every kind, `std` included.

### Tags and filters

The home screen filters on three facets, in two chip rows: **who** (All / Kids / Grown-ups), **🪑 Seated** (a toggle) and **energy** (Calm / Active; tap again to clear). The choice is saved per device in `localStorage` (`wwFilter`).

- `who`, `tags` and `energy` on a **deck** are defaults for its cards. A **card** may carry its own `who`, `tags` or `energy`, which **replaces** the deck's value for that card (it is not merged). So a standing-only card in a seated deck carries `tags:[]`, and a seated card in a standing deck carries `tags:['seated-friendly']`. See `simon`, `freeze`, `copycat` and `wonder`.
- **`seated-friendly`** = playable sitting down without getting up: a car seat, a restaurant table, a waiting-room chair. No standing, walking or crouching. (Whether you can reach or touch the other player is a separate question, not yet tagged; Hand Games is seated but needs a partner within reach.)
- **`energy`** is how revved-up the game gets, not whether bodies move. Simon Says is active even though most of it works seated.
- Missing `tags` means *unknown*, and the seated filter hides unknowns. Tag every new deck.
- A deck tile shows when **any** of its cards match; its count reads `n of m` when the filter trims it. Opening the deck deals only the matching cards (`state.idx`). A 🪑 badge means every card works seated.
- Facet values in use today: `who` = `kids`, `grownups`; `tags` = `seated-friendly`. New facets need a chip row in `renderHome()` and a test in `cardMatches()`.

Home screen card counts update automatically from the data.

### Service Worker Strategy

**Stale-while-revalidate with update toast:**
1. Always serves from cache instantly (works offline)
2. Fetches fresh copies in background when online
3. If content changed, sends `content-updated` message to the page
4. Page shows a toast: "✨ New version available!" with Refresh/Dismiss
5. Cache version string in `sw.js` (`CACHE = 'wait-vN'`) should be bumped when changing the SW itself or the asset list

The `ASSETS` array in `sw.js` must list every file the app needs offline.

**Content-only changes (e.g. new cards in `games.js`) do NOT require a cache bump.** The SW's fetch handler detects changed headers via `hasChanged()` and fires the update toast automatically. Bump `CACHE` only when you change `sw.js` itself or need to force a clean cache.

### PWA

- Installable on iOS/Android home screens
- `manifest.webmanifest` controls the installed app name/icon/theme
- `apple-touch-icon` link in HTML handles iOS specifically
- `short_name` in manifest = home screen label

## Making Changes

### Adding/editing games
Edit `games.js` only. Follow the format above. The engine picks up changes on reload.

### Card art rule: the picture must depict the card's words
Every card's emoji (`e`, `a[0]`/`b[0]`) or OpenMoji `art` must show what the card actually says. Kids who can't read act from the picture alone.
- **No category badges.** A paw print on "Ostrich" or a medal on "Synchronized swimming" is wrong. If no icon fits, rename the card so one does (e.g. "Stomp like a GIANT" 🦣 became "Stomp like a MAMMOTH"). On text-led decks like Word Charades, you can instead omit the picture: a card with neither `art` nor `e` renders words only.
- For open prompts ("Find something SPIKY"), a clear example is fine (🌵).
- **Look at it, don't trust the name.** Some icons don't read as what they're called. OpenMoji's roller coaster `1F3A2` looks like a stock chart, its elevator `E204` is unreadable and its full moon `1F315` is a plain yellow disc. Apple's 🪙 coin is silver.
- **Check by eye before committing.** Serve the repo root (`python3 -m http.server 8777`) and open `http://localhost:8777/tools/contact-sheet.html?game=<id>` to see each picture next to its words. Look at every card you added or changed.
- Testing gotcha: a reused browser profile serves the *previous* build from the service worker (you'll see the "New version available" toast). Use a fresh profile or private window.

### Incremental update from Kirstie's requests
Kirstie asks for games in the brain (brain-mcp), in the project folder `projects/wait-games-requests/`. Her working note is `requests.md`. Work in small steps; pushing early is fine, because the set gets revised as she reviews it.
1. **Read** the folder's notes and pick out the open items: ticked games she hasn't seen built yet, changed tags, and anything she added in her own words.
2. **Dedup against the pool first.** The pool is the public `games.js` *and* the private repo's `games.js` (`michaelansel/while-we-wait-private`). Search both for the game's idea, not only its name. Fortunately/Unfortunately, for example, is a card in the private `road-trip` deck *and* in public Story Builders. When something already exists, extend that deck or point to it instead of adding a copy. Family-specific content (names, our own games) goes private.
3. **Build** it in the right repo, with tags per "Tags and filters" and art per the card art rule.
4. **Check off** each item in her note with the commit hash (e.g. `@side-done 2026-11-17: built in f139622`) and add a dated line under its **Changes** heading. Edit only what you built; she owns the rest of the note.
5. Deploy only with Michael's go (see Deploying).

Whenever the private pool changes, refresh `projects/wait-games-requests/family-pool.md` in the brain: one line per private deck, giving its id, name, emoji, who/seated/energy and card count. Family originals also get a one-line description and 2 sample prompts. Purchased Playful Heart decks get name and count only, with no card text. Kirstie's Claude can't read the private repo, so this note is its only view of it.

### Changing app UI/behavior
Edit `index.html`. The engine code starts at the `/* ENGINE */` comment.

### After any change
If you added a new file that needs to work offline, add it to the `ASSETS` array in `sw.js` and bump the `CACHE` version.

## Deploying

### Automated deploy (no AI needed)

```bash
deploy-while-we-wait.sh              # pull & deploy
deploy-while-we-wait.sh --dry-run    # preview what's incoming, change nothing
deploy-while-we-wait.sh --rollback   # undo the last deploy
```

The script lives at `/home/exedev/bin/deploy-while-we-wait.sh` (outside the web root). It's **read-only** with respect to the remote — it never commits or pushes, only fast-forwards. It acquires a lock (no concurrent deploys), checks for a clean working tree, fetches, shows incoming commits, fast-forwards, and smoke-tests the live site (index + games.js + .git-not-served).

No fileserver restart is needed — busybox httpd reads from disk per request.

### What the deploy script does NOT do
- **No cache bumping.** Content-only changes (new cards in `games.js`) are picked up by the SW's stale-while-revalidate handler automatically. Bumping `CACHE` is a developer concern, done in `sw.js` when the SW itself changes.
- **No commit or push.** The deploy host is read-only with respect to the git remote. This avoids push races, credential requirements, and history churn.

## Private/Family Content Tier

Non-public content (paid/licensed material that shouldn't be redistributed,
or personal/family stuff) lives **outside this repo entirely** — it never
touches this repo's git history, even behind a password. Design writeup:
`PLANS/WHILE_WE_WAIT_PRIVATE_CONTENT.md` in the workspace this was built from.

### How it works

- The private content is a separate repo, **michaelansel/while-we-wait-private**
  (private, on GitHub), with the exact same `games.js` card-object format as
  this repo but exporting `const PRIVATE_GAMES = [...]` instead of `GAMES`.
- It deploys to `/home/exedev/www/while-we-wait-family` on whale-cobra — a sibling
  directory to this app's work tree, **not** nested inside it — via its own
  copy of the deploy script: `deploy-while-we-wait-private.sh`. Same
  lock/fast-forward-only/smoke-test pattern as `deploy-while-we-wait.sh`.
- `/while-we-wait-family/` is gated by BusyBox httpd's built-in per-path Basic Auth
  (`/home/exedev/httpd.conf`, wired into `fileserver.service` via `-c`). No
  new server process, no OAuth, no session store. One shared passphrase for
  the whole family (not per-person).
- Client-side, `family.js` (loaded after `games.js`, before the engine):
  - **Keeps an offline copy.** The last good `PRIVATE_GAMES` source text is
    saved in `localStorage` (`wwFamilyGames` = `{text, savedAt}`, next to the
    passphrase in `wwFamilyPass`; `wwFamilyChecked` = last time the server
    confirmed it). At load it merges the saved copy *synchronously*, so
    family decks are on the first paint with or without signal.
  - **Rule: only the user deletes the saved copy** (the lock button,
    `familyLock()`). No server response, network error or bad deploy can
    remove it. Worst case on the road is a slightly old copy.
  - **Refreshes in the background** (`familyRefresh()`) on every load, when
    the app comes back to the foreground after 30+ min (iOS home-screen apps
    resume rather than reload), and from the "Check for updates" button.
    15 s timeout. Results: `none | same | changed | merged | stale-pass | error`.
    - New content is validated before it's saved: must eval to a non-empty
      array of games, each with a string `id` that doesn't collide with a
      public game and a non-empty `cards`. HTML responses (captive portals)
      are rejected. A bad deploy never replaces a good copy.
    - Changed content is saved and the normal update toast shows; it's used
      on the next reload (never hot-swapped mid-game).
    - **401** → passphrase was changed on the server. The copy is kept and the
      button reads "re-enter passphrase". 403/5xx/offline → silent, copy kept.
  - Home-screen button shows "🔓 Family games · saved for offline <date>",
    the date the server last confirmed this device's copy — the at-a-glance
    "is this device ready for a trip" signal.
  - The manual "🔒 Unlock family games" prompt saves passphrase + content only
    on a successful fetch, and alerts if the offline copy couldn't be saved.
  - The engine guards every call (`typeof familyRefresh`, `familyState?.`)
    because the SW can serve a newer `index.html` with an older cached
    `family.js` or vice versa; old function contracts (`familyAutoUnlock` →
    boolean, `familyUnlockPrompt` → boolean) are kept for the same reason.
  - **`sw.js` must not touch `/while-we-wait-family/`.** A controlled page's
    fetch events fire for *every* URL it requests, not just ones under the SW
    scope. Before 2026-11-13 the SW cached the authenticated private file
    (Cache Storage matching ignores `Authorization`) and kept serving it,
    even after a lock. The fetch handler now returns early for any URL
    outside `self.registration.scope`; keep it that way.
  - Storage notes: `localStorage` is ~5 MB per *origin*, shared with every
    other app on `whale-cobra.exe.xyz` (they can also read these keys).
    Private `games.js` was ~176 KB in Nov 2026; move the copy to IndexedDB if
    it nears ~1 MB. Cache Storage is not an option: `sw.js` `activate` deletes
    every cache but the current one.
  - **iOS:** a home-screen app has its own storage, separate from Safari —
    unlock *inside the installed app*. Safari tabs (not installed apps) lose
    script storage after 7 days without a visit. The device asks for
    persistent storage (`navigator.storage.persist()`) when installed.
  - Readiness check for a device before a trip: open the installed app online
    twice (the second load picks up a new `family.js`), unlock, airplane mode,
    force-quit, reopen, see the decks and "saved for offline".

### Adding real private content

1. Clone `michaelansel/while-we-wait-private`, edit `games.js` there (same
   card format as this repo — see "Game Data Format" above), commit, push
   to `main`.
2. On whale-cobra: `deploy-while-we-wait-private.sh` (or `--dry-run` first).
3. No changes needed here unless the merge contract itself changes.

### Server config is now tracked in git

`/etc/systemd/system/fileserver.service` and `/home/exedev/httpd.conf`
(the Basic Auth config) live in a separate repo on the box,
`/home/exedev/whale-cobra-config`, not this one — it's host infrastructure,
not app content. See its `VM_LAYOUT.md` for the full picture. Load-bearing
detail: **BusyBox httpd's per-path Basic Auth is not default-deny** — a
protected path with no matching (or a dropped/malformed) `httpd.conf` line
is served with zero auth and no error. Confirmed empirically 2026-08-11.
`whale-cobra-config` includes `enforce-server-config.sh`, run every 3
minutes via a systemd timer, which restores the live config from git if
it's drifted and independently probes the protected path unauthenticated —
if auth still isn't enforced after restoring config, it stops the
fileserver rather than leave anything silently public. Don't hand-edit
`httpd.conf` or the unit file directly on the box; edit the tracked copy
and re-run the enforcement script, or the next timer tick reverts it.

### Constraints worth knowing

- The private repo has no `exe.dev` git integration set up automatically —
  it was provisioned once via the exe.dev dashboard (by the human operator)
  the same way this repo's is. If a *second* private tier is ever needed,
  that dashboard step has to happen again; it's not scriptable from here.
- The shared family passphrase is distributed manually (verbally / a note)
  — there's no invite-link system. Changing it means updating
  `/home/exedev/httpd.conf` on the box (`busybox httpd -m <newpass>` for the
  hash) and telling family the new one; existing `localStorage` entries on
  their devices keep their saved copy and show "re-enter passphrase" until
  they do (they stop receiving updates meanwhile).
