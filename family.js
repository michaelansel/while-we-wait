'use strict';
/* Family/private content tier.
   Public GAMES/app behavior is unchanged if this never runs — every path
   here fails silently (401, offline, malformed content) and leaves GAMES
   exactly as games.js defined it. See AGENTS.md for the merge contract. */
(function () {
  const STORAGE_KEY = 'wwFamilyPass';
  const ENDPOINT = '/while-we-wait-family/games.js';
  const USER = 'familyuser';
  let merged = false;

  function getSavedPass() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setSavedPass(pass) {
    try { localStorage.setItem(STORAGE_KEY, pass); } catch (e) {}
  }
  function clearSavedPass() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  async function fetchAndMerge(pass) {
    if (merged) return true;
    let text;
    try {
      const res = await fetch(ENDPOINT, {
        headers: { Authorization: 'Basic ' + btoa(USER + ':' + pass) },
        cache: 'no-store',
      });
      if (!res.ok) return false; // wrong passphrase, or offline-ish network error
      text = await res.text();
    } catch (e) {
      return false; // offline / unreachable
    }
    try {
      // games.js there defines `const PRIVATE_GAMES = [...]` in the same
      // card-object shape as the public games.js. Evaluate in an isolated
      // function scope rather than touching the page's globals directly.
      const extract = new Function(text + '\n;return (typeof PRIVATE_GAMES!=="undefined")?PRIVATE_GAMES:[];');
      const extra = extract();
      if (Array.isArray(extra) && extra.length) GAMES.push(...extra);
      merged = true;
      return true;
    } catch (e) {
      return false; // malformed content on the server
    }
  }

  // Silent — called on every load if a passphrase is already saved.
  window.familyAutoUnlock = function () {
    const pass = getSavedPass();
    if (!pass) return Promise.resolve(false);
    return fetchAndMerge(pass);
  };

  // User-initiated — prompts, and only persists the passphrase on success.
  window.familyUnlockPrompt = async function () {
    const pass = prompt('Family passphrase:');
    if (!pass) return false;
    const ok = await fetchAndMerge(pass);
    if (ok) setSavedPass(pass);
    else alert('That didn’t work — check the passphrase and try again.');
    return ok;
  };

  window.familyLock = function () {
    clearSavedPass();
    location.reload();
  };
})();
