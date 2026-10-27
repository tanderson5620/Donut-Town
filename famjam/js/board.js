/* board.js - the LEADERBOARD: everyone in the family who's said who they are (WHO ARE YOU?), with games played, wins and losses,
   and their averages per game - points, threes, dunks, steals, blocks. Every game a family member finishes counts for them (online
   too); quitting a game you're losing is a loss. The totals live on Abacus, the free counter the play count uses, so everyone's
   board is the same: wins and losses (fb-w-<id>, fb-l-<id>), the games with stats (fb-g-<id>), and each stat's total in two
   counters, its tens and its ones (fb-<stat>t-<id>, fb-<stat>u-<id>: Abacus only counts up by one, so 23 points is 2 hits on the
   tens and 3 on the ones). When a win takes you past someone on wins, their phone gets a push (if they set up GET BUZZED). */
window.HW = window.HW || {};
(function (HW) {
  var B = HW.Board = { rows: null, t: 0, loading: false, last: null, pending: null };
  // ?count=127.0.0.1:port uses a stand-in on this machine (for testing); pages served from this machine don't count without it
  var m = /[?&]count=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search);
  var API = m ? 'http://' + m[1] + ':' + m[2] : 'https://abacus.jasoncameron.dev', NS = 'tanderson5620-famjam', CACHE = 'famjam.board2', FRESH = 90000;
  // the stats kept per game: key, the player's stat, the board's tab
  var STATS = B.STATS = [['pt', 'pts', 'POINTS'], ['tp', 'tpm', '3PT'], ['dk', 'dunks', 'DUNKS'], ['st', 'steals', 'STEALS'], ['bk', 'blocks', 'BLOCKS']];
  B.off = function () { return !window.fetch || !m && (/[?&]nostats/.test(location.search) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)); };
  function call(kind, key) {
    return fetch(API + '/' + kind + '/' + NS + '/' + key, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d.value === 'number' ? d.value : null; }, function () { return undefined; });   // (null: no such counter yet; undefined: no answer at all)
  }
  function hit(key) { return call('hit', key).then(function (v) { return v != null ? v : call('create', key).then(function () { return call('hit', key); }); }); }
  function hits(key, n) { var p = Promise.resolve(); for (var i = 0; i < n; i++) p = p.then(function () { return hit(key); }); return p; }
  // a number of counters, six at a time: { key: value (0 when it isn't there) }, and whether anything answered at all
  function getAll(keys) {
    var out = {}, next = 0, heard = 0;
    function worker() { if (next >= keys.length) return Promise.resolve(); var k = keys[next++]; return call('get', k).then(function (v) { if (v !== undefined) heard++; out[k] = v || 0; return worker(); }); }
    var ws = []; for (var i = 0; i < 6; i++) ws.push(worker());
    return Promise.all(ws).then(function () { return heard ? out : null; });
  }
  try { var c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && c.rows) B.rows = c.rows; } catch (e) { }   // (last time's, shown until the fresh one's in)
  function row(id) { return { id: id, w: 0, l: 0, g: 0, s: {} }; }
  B.games = function (r) { return r.w + r.l; };
  B.avg = function (r, k) { return r.g ? (r.s[k] || 0) / r.g : null; };
  // wins first, then the better record, then more games
  function byWins(a, b) { return b.w - a.w || (b.w / Math.max(1, B.games(b))) - (a.w / Math.max(1, B.games(a))) || B.games(b) - B.games(a) || (a.id < b.id ? -1 : 1); }
  B.sorted = function (tab) {
    var rows = (B.rows || []).slice();
    if (!tab || tab === 'w') return rows.sort(byWins);
    return rows.filter(function (r) { return r.g > 0; }).sort(function (a, b) { return B.avg(b, tab) - B.avg(a, tab) || byWins(a, b); });
  };
  B.rank = function (id, rows) { rows = rows || B.sorted('w'); for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i + 1; return null; };
  B.row = function (id) { return (B.rows || []).filter(function (q) { return q.id === id; })[0] || null; };
  // everyone's totals: wins and losses for the whole family first (the board shows them straight away), then the games and stats of
  // the ones who've played; kept here a minute and a half, and on the phone for next time
  B.load = function (force) {
    if (B.off() || B.loading || !force && Date.now() - B.t < FRESH) return B.wait || Promise.resolve(B.rows);
    B.loading = true;
    var ids = Object.keys(HW.PLAYERS), keys = [];
    ids.forEach(function (id) { keys.push('fb-w-' + id, 'fb-l-' + id); });
    return B.wait = getAll(keys).then(function (wl) {
      if (!wl) return null;
      var rows = ids.map(function (id) { var r = row(id); r.w = wl['fb-w-' + id]; r.l = wl['fb-l-' + id]; return r; }).filter(function (r) { return r.w + r.l > 0; });
      var old = {}; (B.rows || []).forEach(function (r) { old[r.id] = r; });
      rows.forEach(function (r) { if (old[r.id]) { r.g = old[r.id].g; r.s = old[r.id].s; } });   // (the stats from last time until the new ones are in)
      B.rows = rows;
      var sk = []; rows.forEach(function (r) { sk.push('fb-g-' + r.id); STATS.forEach(function (s) { sk.push('fb-' + s[0] + 't-' + r.id, 'fb-' + s[0] + 'u-' + r.id); }); });
      return getAll(sk).then(function (sv) {
        if (sv) rows.forEach(function (r) { r.g = sv['fb-g-' + r.id]; r.s = {}; STATS.forEach(function (s) { r.s[s[0]] = 10 * sv['fb-' + s[0] + 't-' + r.id] + sv['fb-' + s[0] + 'u-' + r.id]; }); });
        return rows;
      });
    }).then(function (rows) {
      B.loading = false; B.wait = null;
      if (!rows) { B.t = Date.now() - FRESH + 15000; return B.rows; }   // (offline: keep what we had, try again in 15 s)
      B.t = Date.now();
      try { localStorage.setItem(CACHE, JSON.stringify({ rows: B.rows })); } catch (e) { }
      return B.rows;
    });
  };
  // a finished game (or one quit while behind): count it for whoever this phone is, or hold it until they say who they are
  function result(G, quit) {
    var me = G.human; if (!me || G.boardDone) return null; G.boardDone = true;
    var st = {}; STATS.forEach(function (s) { st[s[0]] = Math.max(0, Math.round((me.stats && me.stats[s[1]]) || 0)); });
    return { win: !quit && G.score[me.team] > G.score[1 - me.team], st: st };
  }
  B.gameOver = function (G) { var r = result(G); if (r) B.add(r); };
  B.quit = function (G) {
    if (!G.players.length || !G.human || G.phase === 'over' || G.phase === 'menu') return;
    if (G.score[G.human.team] < G.score[1 - G.human.team]) { var r = result(G, true); if (r) B.add(r); }
  };
  B.add = function (r) {
    var who = HW.JamUI && HW.JamUI.who && HW.JamUI.who();
    if (!who) { B.pending = r; B.last = null; return; }
    B.pending = null; B.record(who, r);
  };
  B.picked = function (id) { if (B.pending && id) { var r = B.pending; B.pending = null; B.record(id, r); } };   // (WHO ARE YOU? after the game: it counts)
  B.record = function (id, r) {
    var before = B.sorted('w').map(function (q) { return { id: q.id, w: q.w, l: q.l }; }), was = B.rank(id);
    B.last = { id: id, win: r.win, before: was, rank: was, passed: [], done: false };
    // (straight away on this phone, the rest when the board comes back)
    var mine = B.row(id); if (!mine) (B.rows = B.rows || []).push(mine = row(id));
    if (r.win) mine.w++; else mine.l++; mine.g++; STATS.forEach(function (s) { mine.s[s[0]] = (mine.s[s[0]] || 0) + r.st[s[0]]; });
    B.last.rank = B.rank(id);
    if (B.off()) { B.last.done = true; return Promise.resolve(); }
    var jobs = hit(r.win ? 'fb-w-' + id : 'fb-l-' + id).then(function () { return hit('fb-g-' + id); });
    STATS.forEach(function (s) { var v = r.st[s[0]]; if (v) jobs = jobs.then(function () { return hits('fb-' + s[0] + 't-' + id, Math.floor(v / 10)); }).then(function () { return hits('fb-' + s[0] + 'u-' + id, v % 10); }); });
    return jobs.then(function () { return B.load(true); }).then(function () {
      var L = B.last; if (!L || L.id !== id) return;
      L.rank = B.rank(id); L.done = true;
      var now = B.row(id); if (!now || !r.win) return;
      // the ones you just went past on wins: ahead of you (or level) before, behind you now
      var mb = before.filter(function (q) { return q.id === id; })[0] || { w: 0, l: 0 };
      L.passed = before.filter(function (q) { var n = B.row(q.id); return q.id !== id && byWins(q, mb) <= 0 && n && byWins(now, n) < 0; }).map(function (q) { return q.id; });
      L.passed.forEach(function (o) { if (HW.Notify && HW.Notify.passed) HW.Notify.passed(o, id, L.rank); });
    });
  };
})(window.HW);
