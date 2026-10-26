/* board.js - the FAMILY BOARD: who's the best in the family. Every game a family member finishes counts for them (whoever that
   phone picked on WHO ARE YOU?): a win against the computer is 1 point on Easy, 2 on Normal, 3 on Hard, a win against people
   online 3, and wins and losses are counted too. Quitting a game you're losing is a loss. The totals live on Abacus, the free
   counter the play count uses (fb-p-<id>, fb-w-<id>, fb-l-<id>), so everyone's board shows the same standings. When a win takes
   you past someone, their phone gets a push (if they set up GET BUZZED). */
window.HW = window.HW || {};
(function (HW) {
  var B = HW.Board = { rows: null, t: 0, loading: false, last: null, pending: null };
  // ?count=127.0.0.1:port uses a stand-in on this machine (for testing); pages served from this machine don't count without it
  var m = /[?&]count=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search);
  var API = m ? 'http://' + m[1] + ':' + m[2] : 'https://abacus.jasoncameron.dev', NS = 'tanderson5620-famjam', CACHE = 'famjam.board', FRESH = 60000;
  var PTS = { easy: 1, normal: 2, hard: 3 }, PEOPLE = 3;
  B.off = function () { return !window.fetch || !m && (/[?&]nostats/.test(location.search) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)); };
  function call(kind, key) {
    return fetch(API + '/' + kind + '/' + NS + '/' + key, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d.value === 'number' ? d.value : null; }, function () { return undefined; });   // (null: no such counter yet; undefined: no answer at all)
  }
  function hit(key) { return call('hit', key).then(function (v) { return v != null ? v : call('create', key).then(function () { return call('hit', key); }); }); }
  function hits(key, n) { var p = Promise.resolve(); for (var i = 0; i < n; i++) p = p.then(function () { return hit(key); }); return p; }
  try { var c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && c.rows) { B.rows = c.rows; B.t = 0; } } catch (e) { }   // (last time's, shown until the fresh one's in)
  function sort(rows) { return rows.sort(function (a, b) { return b.p - a.p || b.w - a.w || a.l - b.l || (a.id < b.id ? -1 : 1); }); }
  B.rank = function (id, rows) { rows = rows || B.rows || []; for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i + 1; return null; };
  B.row = function (id) { var r = (B.rows || []).filter(function (q) { return q.id === id; })[0]; return r || null; };
  // everyone's totals (six at a time), kept here for a minute and on the phone for next time
  B.load = function (force) {
    if (B.off() || B.loading || !force && Date.now() - B.t < FRESH) return B.wait || Promise.resolve(B.rows);
    B.loading = true;
    var ids = Object.keys(HW.PLAYERS), jobs = [], out = {}, heard = 0;
    ids.forEach(function (id) { ['p', 'w', 'l'].forEach(function (k) { jobs.push([id, k]); }); });
    var next = 0;
    function worker() { if (next >= jobs.length) return Promise.resolve(); var j = jobs[next++]; return call('get', 'fb-' + j[1] + '-' + j[0]).then(function (v) { if (v !== undefined) heard++; (out[j[0]] = out[j[0]] || { id: j[0], p: 0, w: 0, l: 0 })[j[1]] = v || 0; return worker(); }); }
    var ws = []; for (var i = 0; i < 6; i++) ws.push(worker());
    return B.wait = Promise.all(ws).then(function () {
      B.loading = false; B.wait = null;
      if (!heard) { B.t = Date.now() - FRESH + 15000; return B.rows; }   // (offline: keep what we had, try again in 15 s)
      B.rows = sort(Object.keys(out).map(function (k) { return out[k]; }).filter(function (r) { return r.w + r.l > 0; }));
      B.t = Date.now();
      try { localStorage.setItem(CACHE, JSON.stringify({ rows: B.rows })); } catch (e) { }
      return B.rows;
    });
  };
  // a finished game (or one quit while behind): count it for whoever this phone is, or hold it until they say who they are
  function result(G, quit) {
    var me = G.human; if (!me || G.boardDone) return null; G.boardDone = true;
    var su = G.setup || {}, mine = G.score[me.team], theirs = G.score[1 - me.team], win = !quit && mine > theirs;
    var people = G.players.some(function (p) { return p.team !== me.team && (p.lbl || p.remote) && !p.me; });   // (someone else's player on the other team: online, against people)
    return { win: win, pts: win ? people ? PEOPLE : PTS[su.diff] || 2 : 0, people: people };
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
    var before = (B.rows || []).map(function (q) { return { id: q.id, p: q.p }; }), r0 = B.row(id), was = B.rank(id);
    B.last = { id: id, win: r.win, pts: r.pts, before: was, rank: was, passed: [], done: false };
    // (straight away on this phone, the rest when the board comes back)
    var mine = r0 || { id: id, p: 0, w: 0, l: 0 }; if (!r0) (B.rows = B.rows || []).push(mine);
    mine.p += r.pts; if (r.win) mine.w++; else mine.l++; sort(B.rows); B.last.rank = B.rank(id);
    if (B.off()) { B.last.done = true; return Promise.resolve(); }
    var jobs = r.win ? hit('fb-w-' + id).then(function () { return hits('fb-p-' + id, r.pts); }) : hit('fb-l-' + id);
    return jobs.then(function () { return B.load(true); }).then(function (rows) {
      var L = B.last; if (!L || L.id !== id) return;
      L.rank = B.rank(id, rows); L.done = true;
      var now = B.row(id); if (!now || !r.win) return;
      // the ones you just went past: ahead of you (or level) before, behind you now
      var pb = (before.filter(function (q) { return q.id === id; })[0] || { p: 0 }).p;
      L.passed = before.filter(function (q) { var n = B.row(q.id); return q.id !== id && q.p >= pb && n && n.p < now.p; }).map(function (q) { return q.id; });
      L.passed.forEach(function (o) { if (HW.Notify && HW.Notify.passed) HW.Notify.passed(o, id, L.rank); });
    });
  };
})(window.HW);
