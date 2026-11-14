'use strict';
/* Family/private content tier.
   Public GAMES/app behavior is unchanged if this never runs — every path
   here fails silently and leaves GAMES exactly as games.js defined it.
   See AGENTS.md ("Private/Family Content Tier") for the full contract.

   Offline: the last good PRIVATE_GAMES source is kept in localStorage and
   merged synchronously at load, so family decks survive with no signal.
   RULE: only the user (familyLock) ever deletes the saved copy. No server
   response, network error or bad deploy can remove it from a device. */
(function () {
  const PASS_KEY = 'wwFamilyPass';
  const GAMES_KEY = 'wwFamilyGames';     // JSON {text, savedAt}; written only on change
  const CHECKED_KEY = 'wwFamilyChecked'; // ms timestamp of last good server check
  const ENDPOINT = '/while-we-wait-family/games.js';
  const USER = 'familyuser';
  const TIMEOUT_MS = 15000;
  const RESUME_REFRESH_MS = 30 * 60 * 1000;
  const PUBLIC_IDS = new Set(GAMES.map(g => g.id)); // GAMES is public-only here

  let merged = false;
  let inflight = null;
  let lastAttempt = 0;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Shared with the engine (index.html). Engine must tolerate it missing.
  const fs = window.familyState = {
    fromCache: false,  // decks on screen came from the saved copy
    savedAt: null,     // when the saved copy was last written
    checkedAt: null,   // when the server last confirmed the copy is current
    stalePass: false,  // server said 401: passphrase changed; copy kept
  };
  fs.checkedAt = Number(ls.get(CHECKED_KEY)) || null;

  // Text → games array, or null if it isn't a sane PRIVATE_GAMES.
  function validate(text) {
    if (typeof text !== 'string' || !text) return null;
    let games;
    try {
      const extract = new Function(text + '\n;return (typeof PRIVATE_GAMES!=="undefined")?PRIVATE_GAMES:null;');
      games = extract();
    } catch (e) { return null; }
    if (!Array.isArray(games) || !games.length) return null;
    const seen = new Set();
    for (const g of games) {
      if (!g || typeof g.id !== 'string' || !g.id) return null;
      if (PUBLIC_IDS.has(g.id) || seen.has(g.id)) return null;
      if (!Array.isArray(g.cards) || !g.cards.length) return null;
      seen.add(g.id);
    }
    return games;
  }

  function loadSaved() {
    const raw = ls.get(GAMES_KEY);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      return o && typeof o.text === 'string' ? o : null;
    } catch (e) { return null; }
  }

  // → {status:'ok', text, games} | {status:'unauth'} | {status:'error'}
  async function fetchPrivate(pass) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(ENDPOINT, {
        headers: { Authorization: 'Basic ' + btoa(USER + ':' + pass) },
        cache: 'no-store',
        signal: ctl ? ctl.signal : undefined,
      });
      if (res.status === 401) return { status: 'unauth' };
      if (!res.ok) return { status: 'error' };
      const ct = res.headers.get('content-type') || '';
      if (/text\/html/i.test(ct)) return { status: 'error' }; // captive portal etc.
      const text = await res.text();
      const games = validate(text);
      return games ? { status: 'ok', text, games } : { status: 'error' };
    } catch (e) {
      return { status: 'error' }; // offline / timeout / unreachable
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function markChecked() {
    fs.checkedAt = Date.now();
    fs.stalePass = false;
    ls.set(CHECKED_KEY, String(fs.checkedAt));
  }

  // Save a new copy, but only if the passphrase used is still the saved one
  // (another tab may have locked meanwhile). → true if written.
  function saveCopy(text, pass) {
    if (ls.get(PASS_KEY) !== pass) return false;
    const savedAt = Date.now();
    if (!ls.set(GAMES_KEY, JSON.stringify({ text, savedAt }))) return false;
    fs.savedAt = savedAt;
    return true;
  }

  function mergeOnce(games) {
    if (merged) return;
    GAMES.push(...games);
    merged = true;
  }

  function requestPersist() {
    try {
      const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      if (standalone && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {}
  }

  /* ── Boot: synchronous, before the engine's first render ── */
  (function boot() {
    const pass = ls.get(PASS_KEY);
    if (!pass) { ls.del(GAMES_KEY); ls.del(CHECKED_KEY); return; } // orphan from a lock
    const saved = loadSaved();
    if (!saved) return;
    const games = validate(saved.text);
    if (!games) { ls.del(GAMES_KEY); return; } // unusable; next refresh re-fetches
    mergeOnce(games);
    fs.fromCache = true;
    fs.savedAt = saved.savedAt || null;
  })();

  // → 'none' | 'same' | 'changed' | 'merged' | 'stale-pass' | 'error'
  // 'merged' = no saved copy at boot; decks fetched and merged just now.
  function familyRefresh() {
    if (inflight) return inflight;
    lastAttempt = Date.now();
    inflight = (async () => {
      const pass = ls.get(PASS_KEY);
      if (!pass) return 'none';
      const r = await fetchPrivate(pass);
      if (r.status === 'unauth') { fs.stalePass = true; return 'stale-pass'; }
      if (r.status !== 'ok') return 'error';
      const saved = loadSaved();
      if (saved && saved.text === r.text && merged) { markChecked(); return 'same'; }
      if (!merged) {
        // No usable saved copy at boot (first run after this update, or it
        // was discarded): merge now so the decks show this session.
        mergeOnce(r.games);
        saveCopy(r.text, pass);
        markChecked();
        return 'merged';
      }
      if (!saveCopy(r.text, pass)) return 'error';
      markChecked();
      return 'changed';
    })().finally(() => { inflight = null; });
    return inflight;
  }
  window.familyRefresh = familyRefresh;
  window.familyCheck = familyRefresh;

  // Legacy boolean contract (older cached index.html calls this):
  // true if family decks are present in GAMES.
  window.familyAutoUnlock = function () {
    return familyRefresh().then(() => merged);
  };

  // User-initiated. Boolean (legacy contract); details in familyState.lastPrompt:
  // 'ok' | 'changed' | 'cancel' | 'fail'
  window.familyUnlockPrompt = async function () {
    const res = await unlockPrompt();
    fs.lastPrompt = res;
    return res === 'ok' || res === 'changed';
  };
  async function unlockPrompt() {
    const pass = prompt('Family passphrase:');
    if (!pass) return 'cancel';
    const r = await fetchPrivate(pass);
    if (r.status !== 'ok') {
      alert(r.status === 'unauth'
        ? 'That didn’t work — check the passphrase and try again.'
        : 'Couldn’t reach the family games right now. Try again when you have signal.');
      return 'fail';
    }
    ls.set(PASS_KEY, pass);
    const saved = loadSaved();
    const changed = merged && !(saved && saved.text === r.text);
    const wrote = (saved && saved.text === r.text) || saveCopy(r.text, pass);
    mergeOnce(r.games);
    markChecked();
    requestPersist();
    if (!wrote) alert('Unlocked, but this device couldn’t save the family games for offline use.');
    return changed ? 'changed' : 'ok';
  }

  // The only path that deletes the saved copy.
  window.familyLock = function () {
    ls.del(PASS_KEY); ls.del(GAMES_KEY); ls.del(CHECKED_KEY);
    location.reload();
  };

  // iOS home-screen apps resume rather than reload: refresh on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastAttempt < RESUME_REFRESH_MS) return;
    familyRefresh().then(s => {
      if (typeof window.onFamilyRefresh === 'function') window.onFamilyRefresh(s);
    });
  });
})();
