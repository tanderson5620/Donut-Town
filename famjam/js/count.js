/* count.js - an anonymous play counter: how many phones and computers have played FAM JAM, and how many games have been started.
   No names, no cookies, nothing about the player: a device is counted once (a flag kept in its own storage) and every game once
   (on the phone running it - online, the host's), on Abacus, a free public counting service with no sign-up (its requests go
   through abacus.js, paced under its limit). The totals show on the title screen. Counting started when this went in: games
   before that weren't recorded anywhere. */
window.HW = window.HW || {};
(function (HW) {
  // (owner: games started on the owner's own phones and computers - the ones marked with ?me, see notify.js - counted together, so
  // his devices can show how many of the games were his. Counting that started later than the rest)
  // PRE: the games already played when his own count started (16 on the title then) - his and everyone else's, which can't be split
  var C = HW.Count = { players: null, games: null, owner: null, PRE: 16 }, FLAG = 'famjam.counted';
  function mine() { return !!(HW.Notify && HW.Notify.mine()); }
  function A() { return HW.Abacus; }
  function seen() { try { return !!localStorage.getItem(FLAG); } catch (e) { return false; } }
  // the totals for the title screen
  C.load = function () {
    if (!A()) return;
    ['players', 'games'].forEach(function (k) { A().get(k).then(function (r) { if (r.v != null) C[k] = r.v; }); });
    if (mine()) A().get('owner-games').then(function (r) { if (r.v != null) C.owner = r.v; else if (r.miss) C.owner = 0; });   // (not made yet: none of his so far)
  };
  // a game starts on this phone (guest: an online game someone else is hosting - he counts as a player, the game is the host's)
  C.game = function (guest) {
    if (/[?&]nostats/.test(location.search) || !A()) return;
    if (!seen() && !mine()) A().hit('players').then(function (r) { if (r.v == null) return; C.players = r.v; try { localStorage.setItem(FLAG, '1'); } catch (e) { } });
    if (!guest) A().hit('games').then(function (r) { if (r.v != null) C.games = r.v; });
    if (!guest && mine()) A().hit('owner-games').then(function (r) { if (r.v != null) C.owner = r.v; });
  };
})(HW);
