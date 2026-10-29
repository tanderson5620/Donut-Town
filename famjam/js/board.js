/* board.js - the LEADERBOARD: everyone in the family who's said who they are (WHO ARE YOU?), with games played, wins and losses,
   and their averages per game - points, threes, dunks, steals, blocks. Every game a family member finishes counts for them (online
   too); quitting a game you're losing is a loss. The totals live on Abacus, the free counter the play count uses, so everyone's
   board is the same: wins and losses (fb-w-<id>, fb-l-<id>), the games with stats (fb-g-<id>), and each stat's total in two
   counters, its tens and its ones (fb-<stat>t-<id>, fb-<stat>u-<id>: Abacus only counts up by one, so 23 points is 2 hits on the
   tens and 3 on the ones). When a win takes you past someone on wins, their phone gets a push (if they set up GET BUZZED).
   Abacus takes only 30 requests every 10 s from one connection (abacus.js paces them), so:
   - a finished game's counts wait on the phone (famjam.boardq) until Abacus has taken each one - the board shows them straight
     away, and if the app's closed first they go the next time it's opened;
   - the phone keeps the last number it got for every counter (famjam.board3) and shows those at once; a refresh reads only each
     player's games counter, and the rest of a player's counters only when that's moved (every game counts it). The first time on
     a phone it reads everyone's wins and losses instead, to find who's played. A read that fails keeps the number it had. */
window.HW = window.HW || {};
(function (HW) {
  var B = HW.Board = { rows: null, t: 0, loading: false, last: null, pending: null };
  var CACHE = 'famjam.board3', QKEY = 'famjam.boardq', FRESH = 180000;
  // the stats kept per game: key, the player's stat, the board's tab
  var STATS = B.STATS = [['pt', 'pts', 'POINTS'], ['tp', 'tpm', '3PT'], ['dk', 'dunks', 'DUNKS'], ['st', 'steals', 'STEALS'], ['bk', 'blocks', 'BLOCKS']];
  function A() { return HW.Abacus; }
  // pages served from this machine don't count without a local stand-in (?count=127.0.0.1:port), nor with ?nostats
  B.off = function () { return !window.fetch || !A() || !A().stub && (/[?&]nostats/.test(location.search) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)); };
  var vals = {}, full = {}, swept = false, queue = [], waiters = [];
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  try { var c = JSON.parse(get(CACHE) || 'null'); if (c && c.v) { vals = c.v; full = c.f || {}; swept = !!c.s; B.t = c.t || 0; } } catch (e) { }
  try { queue = JSON.parse(get(QKEY) || '[]') || []; } catch (e) { queue = []; }
  try { localStorage.removeItem('famjam.board2'); } catch (e) { }   // (the old cache: numbers read as 0 when Abacus refused them)
  function save() { if (B.off()) return; set(CACHE, JSON.stringify({ v: vals, f: full, s: swept, t: B.t })); set(QKEY, JSON.stringify(queue)); }
  // a counter as the board shows it: the last number Abacus gave, plus this phone's counts it hasn't taken yet
  function val(k) { var n = vals[k] || 0; for (var i = 0; i < queue.length; i++) if (queue[i] === k) n++; return n; }
  function keysOf(id) { var ks = ['fb-w-' + id, 'fb-l-' + id, 'fb-g-' + id]; STATS.forEach(function (s) { ks.push('fb-' + s[0] + 't-' + id, 'fb-' + s[0] + 'u-' + id); }); return ks; }
  function build() {
    B.rows = Object.keys(HW.PLAYERS).map(function (id) {
      var r = { id: id, w: val('fb-w-' + id), l: val('fb-l-' + id), g: val('fb-g-' + id), s: {} };
      STATS.forEach(function (s) { r.s[s[0]] = 10 * val('fb-' + s[0] + 't-' + id) + val('fb-' + s[0] + 'u-' + id); });
      return r;
    }).filter(function (r) { return r.w + r.l > 0; });
  }
  build();
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
  B.queued = function () { return queue.length; };

  // read some counters; counters only go up, so a slower answer never takes one back down. Resolves to the keys that failed
  function read(keys) {
    var bad = {};
    return Promise.all(keys.map(function (k) {
      return A().get(k, 4).then(function (r) { if (r.fail) { bad[k] = true; return; } vals[k] = Math.max(vals[k] || 0, r.miss ? 0 : r.v); build(); });
    })).then(function () { return bad; });
  }
  // the board fresh from Abacus (at most every 3 minutes unless forced): this phone's own player first
  B.load = function (force) {
    if (B.off() || B.loading || !force && Date.now() - B.t < FRESH) return B.wait || Promise.resolve(B.rows);
    B.loading = true;
    var me = HW.JamUI && HW.JamUI.who && HW.JamUI.who(), ids = Object.keys(HW.PLAYERS).sort(function (a, b) { return (b === me) - (a === me); });
    var sweep = !swept, was = {}, failed = false, bad = {};
    ids.forEach(function (id) { was[id] = vals['fb-g-' + id]; });
    function note(b) { for (var k in b) { bad[k] = true; failed = true; } }
    function played(id) { return val('fb-w-' + id) + val('fb-l-' + id) + val('fb-g-' + id) > 0; }
    // who's played: the first time on this phone, everyone's wins and losses (then the games counter of the ones who have);
    // after that, everyone's games counter. A game's games count is the last one sent, so once it's moved the rest are in
    var k1 = []; ids.forEach(function (id) { if (sweep) k1.push('fb-w-' + id, 'fb-l-' + id); else k1.push('fb-g-' + id); });
    return B.wait = read(k1).then(function (b) {
      note(b); if (sweep && !failed) swept = true;
      return sweep ? read(ids.filter(played).map(function (id) { return 'fb-g-' + id; })).then(note) : null;
    }).then(function () {
      // then the rest of the ones whose games moved (or that never got read in full), read after their games counter
      var k2 = [], need = ids.filter(function (id) { return played(id) && (sweep || !full[id] || vals['fb-g-' + id] !== was[id]); });
      need.forEach(function (id) { keysOf(id).forEach(function (k) { if (k !== 'fb-g-' + id) k2.push(k); }); });
      return read(k2).then(function (b) {
        note(b);
        need.forEach(function (id) { full[id] = keysOf(id).every(function (k) { return !bad[k]; }); });
      });
    }).then(function () {
      B.loading = false; B.wait = null; build();
      B.t = failed ? Date.now() - FRESH + 30000 : Date.now();   // (something didn't come back: try again in 30 s)
      save(); return B.rows;
    });
  };

  // send this phone's waiting counts, one at a time; each one Abacus takes comes back with the counter's new total
  var sending = false;
  function flush() {
    if (sending || B.off()) return;
    if (!queue.length) { var w = waiters; waiters = []; w.forEach(function (f) { f(); }); return; }
    sending = true; var k = queue[0];
    A().hit(k, 4).then(function (r) {
      sending = false;
      if (r.fail) { setTimeout(flush, 20000); return; }   // (offline or turned away: keep it, try again in a bit)
      if (queue[0] === k) queue.shift();
      if (r.v != null) vals[k] = Math.max(vals[k] || 0, r.v);
      build(); save(); flush();
    });
  }
  function sent() { return new Promise(function (res) { waiters.push(res); flush(); }); }
  if (queue.length) setTimeout(flush, 2500);   // (counts left over from last time)

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
    var ks = [r.win ? 'fb-w-' + id : 'fb-l-' + id];
    STATS.forEach(function (s) { var v = r.st[s[0]], i; for (i = 0; i < Math.floor(v / 10); i++) ks.push('fb-' + s[0] + 't-' + id); for (i = 0; i < v % 10; i++) ks.push('fb-' + s[0] + 'u-' + id); });
    ks.push('fb-g-' + id);   // (the games count last: when another phone sees it move, the rest of this game is already in)
    if (B.off()) ks.forEach(function (k) { vals[k] = (vals[k] || 0) + 1; }); else queue = queue.concat(ks);
    build(); save(); B.last.rank = B.rank(id);   // (on the board straight away)
    if (B.off()) { B.last.done = true; return Promise.resolve(); }
    return sent().then(function () {
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
