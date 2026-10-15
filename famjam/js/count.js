/* count.js - an anonymous play counter: how many phones and computers have played FAM JAM, and how many games have been started.
   No names, no cookies, nothing about the player: a device is counted once (a flag kept in its own storage) and every game once
   (on the phone running it - online, the host's), on Abacus, a free public counting service with no sign-up. The totals show on
   the title screen. Counting started when this went in: games before that weren't recorded anywhere. */
window.HW = window.HW || {};
(function (HW) {
  // (owner: games started on the owner's own phones and computers - the ones marked with ?me, see notify.js - counted together, so
  // his devices can show how many of the games were his. Counting that started later than the rest)
  var C = HW.Count = { players: null, games: null, owner: null };
  function mine() { return !!(HW.Notify && HW.Notify.mine()); }
  // ?count=127.0.0.1:port counts on a stand-in on this machine instead (for testing; only local)
  var m = /[?&]count=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search);
  var API = m ? 'http://' + m[1] + ':' + m[2] : 'https://abacus.jasoncameron.dev', NS = 'tanderson5620-famjam', FLAG = 'famjam.counted';
  function call(kind, key) {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(API + '/' + kind + '/' + NS + '/' + key, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d.value === 'number' ? d.value : null; }, function () { return null; });
  }
  // count one; if the counter isn't there yet, make it and count again
  function hit(key) { return call('hit', key).then(function (v) { return v != null ? v : call('create', key).then(function () { return call('hit', key); }); }); }
  function seen() { try { return !!localStorage.getItem(FLAG); } catch (e) { return false; } }
  // the totals for the title screen
  C.load = function () {
    ['players', 'games'].forEach(function (k) { call('get', k).then(function (v) { if (v != null) C[k] = v; }); });
    if (mine()) call('get', 'owner-games').then(function (v) { C.owner = v != null ? v : 0; });   // (not made yet: none of his so far)
  };
  // a game starts on this phone (guest: an online game someone else is hosting - he counts as a player, the game is the host's)
  C.game = function (guest) {
    if (/[?&]nostats/.test(location.search)) return;
    if (!seen() && !mine()) hit('players').then(function (v) { if (v == null) return; C.players = v; try { localStorage.setItem(FLAG, '1'); } catch (e) { } });
    if (!guest) hit('games').then(function (v) { if (v != null) C.games = v; });
    if (!guest && mine()) hit('owner-games').then(function (v) { if (v != null) C.owner = v; });
  };
})(HW);
