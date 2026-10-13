/* net.js - online play. One phone hosts: it runs the whole game. The others join with a 4-digit room code (or the invite link)
   and send their stick and buttons to the host; the host sends back what to draw ~60 times a second - every player, the ball,
   the scoreboard and the callouts - plus each sound and effect as it happens, and a guest draws it a moment in the past so it
   moves smoothly in between. Phones talk straight to each other over WebRTC; PeerJS's free cloud server introduces them (and its
   TURN servers relay when a network won't allow a direct line). PeerJS (js/lib, MIT) only loads when someone goes online. */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, G = HW.Jam, Au = HW.Audio;
  var N = HW.Net = { mode: null, stage: null, err: '', code: '', people: [], me: null, claim: null, diff: 'normal', qlen: 60, rec: false, ev: [], setup: null, played: {}, vs: true };   // vs: people against each other (false: together vs the CPU)
  var LIB = 'js/lib/peerjs.min.js', PRE = 'famjam-', MAXP = 4, BUF = 0.08;
  var peer = null, conns = [], host = null, loadP = null, tries = 0, lastSnap = 0, snaps = [], offs = [], off = 0, lastIn = '', lastInT = 0;
  function r3(v) { return Math.round((v || 0) * 1000) / 1000; }
  function L(a, b, f) { return a + (b - a) * f; }
  function UI() { return HW.JamUI; }
  // ?peer=127.0.0.1:port talks to your own PeerServer on this machine instead of PeerJS's cloud one (for testing; only local, so
  // nobody can send an invite link that routes the family through a server of theirs)
  function peerOpts() { var m = /[?&]peer=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search), o = { debug: 0 }; if (m) { o.host = m[1]; o.port = +m[2]; o.path = '/'; o.secure = false; } return o; }
  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (!loadP) loadP = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = LIB; s.onload = function () { if (window.Peer) res(); else { loadP = null; rej(); } }; s.onerror = function () { loadP = null; rej(); }; document.head.appendChild(s); });
    return loadP;
  }
  function send(c, m) { try { if (c && c.open) c.send(m); } catch (e) { } }
  N.online = function () { return !!N.mode; };
  N.playing = function () { return !!N.mode && N.stage === 'game'; };

  /* ---------- sounds and effects: the host records each one the game makes, the guests play them back ---------- */
  var AU = ['sfx', 'whoosh', 'scream', 'punch', 'painF', 'laugh', 'jump', 'hup', 'dribble', 'catch', 'bounce', 'yell', 'wow', 'trash', 'swipe', 'steal', 'shoveYell', 'powerup', 'passWhoosh', 'net', 'land', 'incoming', 'help', 'happy', 'fireball', 'fire', 'ew', 'cheer', 'charge', 'buzzer', 'board', 'baba', 'thud', 'shove', 'shatter', 'rim', 'dunk', 'slap'];
  var FX = ['burst', 'flame', 'ring', 'crater', 'blood', 'powerFlash', 'powerDown'];
  var orig = { a: {}, x: {} }, depth = 0;
  function enc(args) {
    var out = []; for (var i = 0; i < args.length; i++) { var a = args[i]; out.push(a && a.def && a.id ? { p: G.players.indexOf(a) } : typeof a === 'number' ? r3(a) : a); }
    return out;
  }
  // only what the game itself plays while it runs (not the menus' clicks, not sounds a sound makes inside itself)
  function wrap(obj, name, kind) {
    var f = obj[name]; if (typeof f !== 'function') return; orig[kind][name] = f;
    obj[name] = function () { if (N.rec && depth === 0) N.ev.push([kind, name, enc(arguments)]); depth++; try { return f.apply(this, arguments); } finally { depth--; } };
  }
  AU.forEach(function (n) { wrap(Au, n, 'a'); }); FX.forEach(function (n) { wrap(X, n, 'x'); });
  function play(s) {
    if (s.fired) return; s.fired = true; if (!s.ev) return;
    var me = G.human, win = s.g[6] > s.g[7] ? 0 : 1;
    s.ev.forEach(function (e) {
      var obj = e[0] === 'a' ? Au : X, fn = orig[e[0]][e[1]]; if (!fn) return;
      var args = (e[2] || []).map(function (a) { return a && typeof a === 'object' && !Array.isArray(a) && 'p' in a ? G.players[a.p] : a; });
      if (args.some(function (a) { return a === undefined; }) && e[0] === 'x') return;
      if (e[1] === 'sfx' && (args[0] === 'you_win' || args[0] === 'you_lose') && me) args[0] = win === me.team ? 'you_win' : 'you_lose';   // the announcer calls it for your team
      try { fn.apply(obj, args); N.played[e[1]] = (N.played[e[1]] || 0) + 1; } catch (er) { }
    });
  }

  /* ---------- shared ---------- */
  N.leave = function () {
    var p = peer; peer = null; host = null;
    conns.forEach(function (k) { try { k.c.close(); } catch (e) { } }); conns = [];
    if (p) try { p.destroy(); } catch (e) { }
    var was = N.stage === 'game' || N.stage === 'matchup';
    N.mode = null; N.stage = null; N.people = []; N.claim = null; N.setup = null; snaps = []; offs = [];
    if (was) { G.players = []; G.phase = 'menu'; }
  };
  function fail(msg) {
    var m = N.mode; N.leave(); N.err = msg; N.lastMode = m; if (UI()) UI().show('neterr');
  }
  N.inviteURL = function () {
    var q = location.search.replace(/[?&]room=\d+/, '').replace(/^&/, '?'), sep = q ? '&' : '?';
    return location.origin + location.pathname + q + sep + 'room=' + N.code;
  };
  // the share sheet on a phone (text it to the family), otherwise copy the link
  N.share = function () {
    var url = N.inviteURL(), text = 'Come play FAM JAM with me! Room code ' + N.code;
    if (navigator.share) { navigator.share({ title: 'FAM JAM', text: text, url: url }).catch(function () { }); return; }
    try { navigator.clipboard.writeText(url).then(function () { N.note = 'LINK COPIED'; N.noteUntil = performance.now() + 3000; }); } catch (e) { }
  };
  function people() { return [{ lbl: 'P1', claim: N.claim, host: 1 }].concat(conns.map(function (k) { return { lbl: k.lbl, claim: k.claim }; })); }
  N.claimedBy = function (id) { for (var i = 0; i < N.people.length; i++) if (id && N.people[i].claim === id) return N.people[i].lbl; return null; };
  function showMatchup(su, me, then) {
    var U = UI(); U.mu = { teams: su.teams, human: me, humans: su.humans, names: su.names, diff: su.diff, qlen: su.qlen, online: true }; U.screen = 'matchup'; U.loading = true;
    Promise.all(G.loadIds(su.teams).map(X.loadPlayer)).then(function () { U.loading = false; if (then) then(); });
  }
  function remember(code, claim) { try { sessionStorage.setItem('famjam.room', JSON.stringify({ code: code, claim: claim })); } catch (e) { } }
  function remembered(code) { try { var r = JSON.parse(sessionStorage.getItem('famjam.room') || 'null'); return r && r.code === code ? r.claim : null; } catch (e) { return null; } }

  /* ---------- host ---------- */
  N.host = function () {
    N.leave(); N.mode = 'host'; N.stage = 'connecting'; N.err = ''; N.claim = null; N.me = 'P1'; N.people = people(); tries = 0;
    var U = UI(); if (U) { N.diff = U.st.diff || 'normal'; N.qlen = U.st.qlen || 60; }
    loadLib().then(openRoom, function () { fail('CAN\'T LOAD ONLINE PLAY. CHECK YOUR INTERNET'); });
  };
  function openRoom() {
    if (N.mode !== 'host') return;
    var code = String(1000 + Math.floor(Math.random() * 9000)), p = peer = new window.Peer(PRE + code, peerOpts());
    p.on('open', function () { if (p !== peer) return; N.code = code; if (N.stage === 'connecting') N.stage = 'lobby'; });
    p.on('connection', function (c) { if (p === peer) hostConn(c); });
    // the phone slept or switched apps (to text the code): get back on the server under the same code
    p.on('disconnected', function () { if (p === peer) setTimeout(function () { if (p === peer && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (e) { } }, 1000); });
    p.on('error', function (e) {
      if (p !== peer) return;
      if (e.type === 'unavailable-id' && ++tries < 6) { peer = null; try { p.destroy(); } catch (er) { } openRoom(); return; }   // that code's taken: roll another
      if (N.stage === 'connecting') fail('CAN\'T REACH THE GAME SERVER. CHECK YOUR INTERNET');
    });
  }
  function newInp() { return { mx: 0, mz: 0, turbo: false, comboTurbo: false, shootDown: false, shootUp: false, passDown: false, actDown: false, q: [] }; }
  function hostConn(c) {
    var k = { c: c, lbl: null, claim: null, ready: false, inp: newInp(), pend: [], player: null };
    c.on('data', function (m) { hostMsg(k, m); });
    c.on('close', function () { drop(k); });
    c.on('error', function () { drop(k); });
  }
  function freeLabel() { for (var i = 2; i <= MAXP; i++) { var l = 'P' + i; if (!conns.some(function (k) { return k.lbl === l; })) return l; } return null; }
  function sendLobby() {
    N.people = people();
    conns.forEach(function (k) { send(k.c, { t: 'lobby', st: N.stage, code: N.code, people: N.people, diff: N.diff, qlen: N.qlen, vs: N.vs, you: k.lbl }); });
  }
  // against each other: two people per family at most; together: two people in all (one team), from either family. Nobody can
  // take a player someone else has
  function canClaim(id, who) {
    if (!id) return true; var d = HW.PLAYERS[id]; if (!d) return false;
    var all = [{ who: 'host', id: N.claim }].concat(conns.map(function (k) { return { who: k, id: k.claim }; })), n = 0, tot = 0;
    for (var i = 0; i < all.length; i++) { var a = all[i]; if (a.who === who || !a.id) continue; if (a.id === id) return false; tot++; if (HW.PLAYERS[a.id].team === d.team) n++; }
    return N.vs ? n < 2 : tot < 2;
  }
  function hostMsg(k, m) {
    if (!m || !m.t) return;
    if (m.t === 'hi') {
      if (k.lbl) return;
      if (N.stage === 'lobby') {
        var l = freeLabel(); if (!l) { bye(k, 'THAT GAME IS FULL (4 PLAYERS)'); return; }
        k.lbl = l; conns.push(k); sendLobby(); return;
      }
      // mid-game: someone whose phone dropped comes back as the player they had
      var su = N.setup, cl = m.claim;
      if (su && cl && su.humans[cl] && cl !== N.claim && !conns.some(function (o) { return o.claim === cl; })) {
        k.lbl = su.humans[cl]; k.claim = cl; conns.push(k); N.people = people(); send(k.c, { t: 'mu', setup: su, claim: cl, code: N.code, you: k.lbl }); return;
      }
      bye(k, 'THAT GAME ALREADY STARTED'); return;
    }
    if (!k.lbl) return;
    if (m.t === 'claim') { if (N.stage === 'lobby' && canClaim(m.id, k)) k.claim = m.id || null; sendLobby(); return; }
    if (m.t === 'ready') { k.ready = true; if (N.stage === 'game') { attach(k); send(k.c, { t: 'go' }); } return; }
    if (m.t === 'in') { var I = k.inp; I.mx = +m.mx || 0; I.mz = +m.mz || 0; I.turbo = !!m.tb; I.comboTurbo = !!m.ct; if (m.e) for (var i = 0; i < m.e.length && I.q.length < 30; i++) I.q.push(m.e[i]); }
  }
  function bye(k, why) { send(k.c, { t: 'bye', why: why }); setTimeout(function () { try { k.c.close(); } catch (e) { } }, 500); }
  function drop(k) {
    var i = conns.indexOf(k); if (i < 0) return; conns.splice(i, 1);
    var p = k.player; k.player = null;
    if (p) { p.human = false; p.remote = null; p.inp = null; if (G.players.length) G.say(k.lbl + ' LEFT - CPU TAKES OVER', '#9ad0ff', 2.2, 0.7); }   // the computer plays him from here
    if (N.stage === 'lobby') sendLobby(); else N.people = people();
  }
  N.pick = function (id) {
    if (N.mode === 'host') { if (N.stage !== 'lobby') return; if (id === N.claim) N.claim = null; else if (canClaim(id, 'host')) N.claim = id; sendLobby(); }
    else if (N.mode === 'guest' && host) send(host, { t: 'claim', id: id === N.claim ? null : id });
  };
  N.setDiff = function (d) { N.diff = d; sendLobby(); };
  N.setVs = function (v) { if (N.mode === 'host' && N.stage === 'lobby') { N.vs = v; sendLobby(); } };
  N.setQlen = function (q) { N.qlen = q; sendLobby(); };
  // what's still missing before the host can start ('' = ready)
  N.need = function () {
    if (N.mode !== 'host' || N.stage !== 'lobby') return '-';
    if (!N.claim || !conns.every(function (k) { return k.claim; })) return 'EVERYONE PICK A PLAYER, THEN START';
    var cl = [N.claim].concat(conns.map(function (k) { return k.claim; })), fam = cl.map(function (id) { return HW.PLAYERS[id].team; });
    if (!N.vs && cl.length > 2) return 'TOGETHER IS FOR 2 PEOPLE: ONE TEAM';
    if (N.vs && cl.length > 1 && fam.every(function (f) { return f === fam[0]; })) return 'AGAINST: SOMEONE PICK THE OTHER FAMILY';
    return '';
  };
  N.canStart = function () { return N.need() === ''; };
  // everyone's picked: the people's players, the rest of each team filled in by the computer
  N.start = function () {
    if (!N.canStart()) return;
    var humans = {}; humans[N.claim] = 'P1'; conns.forEach(function (k) { humans[k.claim] = k.lbl; });
    var taken = Object.keys(humans), names = null, teams, mix = function (a) { return a.sort(function () { return Math.random() - 0.5; }); };
    if (N.vs) teams = [0, 1].map(function (ti) {
      var ids = taken.filter(function (id) { return HW.PLAYERS[id].team === ti; });
      var pool = mix(HW.TEAMS[ti].roster.filter(function (id) { return taken.indexOf(id) < 0; }));
      while (ids.length < 2) ids.push(pool.shift());
      return ids;
    });
    else {   // together: the people (from either family) are one team; two CPU players from the other family (if they mixed, either one)
      var fam = taken.map(function (id) { return HW.PLAYERS[id].team; }), cpuF = fam.every(function (f) { return f === 0; }) ? 1 : fam.every(function (f) { return f === 1; }) ? 0 : Math.random() < 0.5 ? 0 : 1;
      var cpu = mix(HW.TEAMS[cpuF].roster.filter(function (id) { return taken.indexOf(id) < 0; })).slice(0, 2), ppl = taken.slice();
      if (ppl.length < 2) ppl.push(mix(HW.TEAMS[fam[0]].roster.filter(function (id) { return taken.indexOf(id) < 0 && cpu.indexOf(id) < 0; }))[0]);
      teams = []; teams[cpuF] = cpu; teams[1 - cpuF] = ppl;
      if (HW.PLAYERS[ppl[0]].team !== HW.PLAYERS[ppl[1]].team) { names = []; names[1 - cpuF] = { name: 'Family', short: 'FAM', color: '#ffd23f', dark: '#6b4e00' }; }   // a mixed team plays as the Family
    }
    N.setup = { teams: teams, humans: humans, names: names, diff: N.diff, qlen: N.qlen, human: N.claim, online: true };
    N.stage = 'matchup';
    conns.forEach(function (k) { k.ready = false; send(k.c, { t: 'mu', setup: N.setup, claim: k.claim }); });
    showMatchup(N.setup, N.claim);
  };
  N.waiting = function () { return conns.filter(function (k) { return !k.ready; }).map(function (k) { return k.lbl; }); };
  // tip-off (and every rematch): the host starts the game; a guest's player is the computer's until that phone is ready
  N.go = function () {
    if (N.mode !== 'host' || !N.setup) return;
    N.stage = 'game'; UI().screen = null;
    var su = {}; for (var k in N.setup) su[k] = N.setup[k]; su.me = N.claim;
    G.start(su); N.ev = []; lastSnap = 0;
    conns.forEach(function (c) { c.pend = []; c.player = null; if (c.ready) { attach(c); send(c.c, { t: 'go' }); } });
  };
  function attach(k) {
    var p = G.players.filter(function (q) { return q.id === k.claim; })[0]; if (!p) return;
    k.inp = newInp(); k.pend = []; k.player = p; p.human = true; p.remote = k; p.inp = k.inp; p.lbl = k.lbl;
  }
  N.toLobby = function () {
    if (N.mode !== 'host') return;
    N.stage = 'lobby'; G.players = []; UI().show('lobby');
    conns.forEach(function (k) { k.ready = false; k.player = null; });
    sendLobby();
  };
  // before the host's game step: each guest's buttons for this frame. A press and its release never land in the same step, and
  // a release carries how far into his jump the guest SAW the shooter when he let go, so the shot is judged on what he saw
  N.pre = function () {
    if (N.mode !== 'host' || N.stage !== 'game') return;
    conns.forEach(function (k) {
      var I = k.inp, f = {}; I.shootDown = I.shootUp = I.passDown = I.actDown = false; if (!k.player) { I.q = []; return; }
      while (I.q.length) {
        var e = I.q[0], n = typeof e === 'string' ? e : e[0]; if (f[n] || (n === 'su' && f.sd)) break; f[n] = 1; I.q.shift();
        if (n === 'sd') I.shootDown = true; else if (n === 'su') { I.shootUp = true; if (typeof e !== 'string' && e[1] !== null) k.player.relSt = +e[1]; } else if (n === 'pd') I.passDown = true; else if (n === 'ad') I.actDown = true;
      }
    });
  };
  // after it: hand this frame's sounds to each guest and send them the picture (up to 60 times a second)
  N.post = function () {
    if (N.mode !== 'host' || N.stage !== 'game') { N.ev = []; return; }
    conns.forEach(function (k) { if (k.player) k.player.relSt = null; });
    var ev = N.ev; N.ev = [];
    conns.forEach(function (k) { if (k.ready) { for (var i = 0; i < ev.length; i++) k.pend.push(ev[i]); if (k.pend.length > 300) k.pend.splice(0, k.pend.length - 300); } });
    var now = performance.now(); if (now - lastSnap < 15) return; lastSnap = now;
    var s = snap(now / 1000);
    conns.forEach(function (k) {
      if (!k.ready) return;
      var dc = k.c.dataChannel; if (dc && dc.bufferedAmount > 64000) return;   // a slow line: skip a frame rather than fall further behind
      s.ev = k.pend; send(k.c, s); k.pend = []; if (N.debug) N.lastLen = JSON.stringify(s).length;
    });
  };
  function stats(p) { var s = p.stats; return [s.pts, s.fgm, s.fga, s.tpm, s.tpa, s.ast, s.dunks, s.steals, s.blocks, s.shoves]; }
  function snap(ht) {
    var b = G.ball, P = G.players, U = UI();
    return {
      t: 's', ht: r3(ht),
      g: [r3(G.t), G.phase, r3(G.phaseT), G.q, r3(G.clock), r3(G.shot), G.score[0], G.score[1], r3(X.camX), r3(X.shake), r3(X.hype), r3(G.hoopFx[0]), r3(G.hoopFx[1])],
      co: G.callouts.map(function (c) { return [c.text, c.color, c.life, r3(c.t), c.size]; }),
      pu: G.pu ? [P.indexOf(G.pu.p), r3(G.pu.t), G.pu.boom ? 1 : 0, G.pu.dur, G.pu.tw || 0] : 0,
      sh: G.show ? [P.indexOf(G.show.p), r3(G.show.t), G.show.kind === 'pu' ? 1 : 0, G.show.len] : 0,
      ci: G.cine ? [P.indexOf(G.cine.p), r3(G.cine.t), r3(G.cine.dur), G.cine.kind] : 0,
      b: [r3(b.x), r3(b.y), r3(b.z), r3(b.vx), b.visible ? 1 : 0, b.baked ? 1 : 0, b.behind ? 1 : 0, b.inFront ? 1 : 0, b.fire ? 1 : 0, r3(b.swoosh), r3(b.spin), b.holder ? P.indexOf(b.holder) : -1, b.state],
      p: P.map(function (p) {
        return [r3(p.x), r3(p.y), r3(p.z), r3(p.vy), p.anim, p.dir, Math.round((p.frame || 0) * 100) / 100, p.face, p.state, r3(p.st), r3(p.ssj), p.onFire ? 1 : 0, r3(p.flash), r3(p.hitT), (p.tongue ? 1 : 0) | (p.dunkFace ? 2 : 0), p.hasBall ? 1 : 0, Math.round(p.turbo),
          p.released ? 1 : 0, r3(p.tApex), p.dk ? [r3(p.dk.T), p.dk.style || 0] : 0, p.jamArm ? [r3(p.jamArm.x), r3(p.jamArm.y), r3(p.jamArm.z)] : 0,
          p.trail && p.trail.length ? p.trail.map(function (t) { return [r3(t.x), r3(t.y), r3(t.z), t.anim, t.dir, Math.round(t.frame * 100) / 100, t.face]; }) : 0, stats(p), p.human ? p.lbl || 'P1' : 0];
      })
    };
  }

  /* ---------- guest ---------- */
  N.join = function (code) {
    N.leave(); N.mode = 'guest'; N.stage = 'connecting'; N.err = ''; N.code = code; N.claim = null;
    loadLib().then(function () {
      if (N.mode !== 'guest' || N.code !== code) return;
      var p = peer = new window.Peer(peerOpts());
      var to = setTimeout(function () { if (p === peer && N.stage === 'connecting') fail('NO ANSWER FROM ROOM ' + code + '. CHECK THE CODE'); }, 20000);
      p.on('open', function () {
        if (p !== peer) return;
        var c = host = p.connect(PRE + code, { reliable: true, serialization: 'json' });
        c.on('open', function () { if (c !== host) return; clearTimeout(to); send(c, { t: 'hi', claim: remembered(code) }); });
        c.on('data', function (m) { if (c === host) guestMsg(m); });
        c.on('close', function () { if (c === host) lost(); });
        c.on('error', function () { if (c === host) lost(); });
      });
      p.on('error', function (e) {
        if (p !== peer) return;
        if (e.type === 'peer-unavailable') { clearTimeout(to); fail('NO GAME WITH CODE ' + code); }
        else if (N.stage === 'connecting') { clearTimeout(to); fail('CAN\'T CONNECT. CHECK YOUR INTERNET'); }
      });
    }, function () { fail('CAN\'T LOAD ONLINE PLAY. CHECK YOUR INTERNET'); });
  };
  function lost() { if (N.mode === 'guest') fail(N.stage === 'game' || N.stage === 'matchup' ? 'LOST THE CONNECTION TO THE HOST' : 'THE HOST CLOSED THE ROOM'); }
  function guestMsg(m) {
    if (!m || !m.t) return;
    if (m.t === 's') { if (N.stage === 'game') arrive(m); return; }
    if (m.t === 'lobby') {
      N.code = m.code; N.people = m.people; N.diff = m.diff; N.qlen = m.qlen; N.me = m.you; N.vs = m.vs !== false;
      var mine = m.people.filter(function (q) { return q.lbl === m.you; })[0]; N.claim = mine ? mine.claim : null;
      if (m.st === 'lobby' && N.stage !== 'lobby') { N.stage = 'lobby'; G.players = []; snaps = []; UI().show('lobby'); }
      return;
    }
    if (m.t === 'mu') {
      if (m.you) N.me = m.you; if (m.code) N.code = m.code;
      N.setup = m.setup; N.claim = m.claim; remember(N.code, m.claim); N.stage = 'matchup'; snaps = [];
      showMatchup(m.setup, m.claim, function () { if (N.mode === 'guest') send(host, { t: 'ready' }); });
      return;
    }
    if (m.t === 'go') {
      if (!N.setup) return;
      var su = {}; for (var k in N.setup) su[k] = N.setup[k]; su.me = N.claim;
      snaps = []; offs = []; N.stage = 'game'; UI().screen = null; G.start(su); return;
    }
    if (m.t === 'bye') fail(m.why || 'THE HOST SAID NO');
  }
  function arrive(s) {
    var now = performance.now() / 1000; snaps.push(s);
    // the host's clock against ours: the quickest delivery lately is the best guess at the real offset
    offs.push(now - s.ht); if (offs.length > 120) offs.shift();
    off = Infinity; for (var i = 0; i < offs.length; i++) off = Math.min(off, offs[i]);
    if (snaps.length > 600) snaps.splice(0, snaps.length - 600);
  }
  // a guest's frame, instead of running the game: send the buttons, then show the host's game BUF seconds ago, smoothed
  N.guestFrame = function () {
    sendInput();
    if (N.stage !== 'game' || !snaps.length || !G.players.length) return;
    var rt = performance.now() / 1000 - off - BUF, last = snaps[snaps.length - 1];
    if (last.ht - rt > 0.5) rt = last.ht - BUF;   // way behind (the phone slept, the line stalled): catch up
    while (snaps.length > 1 && snaps[1].ht <= rt) { if (rt - snaps[0].ht > 0.35) snaps[0].fired = true; play(snaps[0]); snaps.shift(); }   // long-gone sounds are skipped
    var s0 = snaps[0], s1 = snaps[1];
    if (s0.ht <= rt) play(s0);
    apply(s0, s1, s1 && s1.ht > s0.ht ? Math.max(0, Math.min(1, (rt - s0.ht) / (s1.ht - s0.ht))) : 0);
  };
  function apply(s, n, f) {
    var g = s.g, ng = n && n.g, P = G.players, U = UI();
    G.t = ng ? L(g[0], ng[0], f) : g[0]; G.phase = g[1]; G.phaseT = g[2]; G.q = g[3]; G.clock = ng && ng[3] === g[3] ? L(g[4], ng[4], f) : g[4]; G.shot = g[5]; G.score = [g[6], g[7]];
    X.camX = ng && Math.abs(ng[8] - g[8]) < 2.5 ? L(g[8], ng[8], f) : g[8];
    X.shake = Math.max(X.shake, g[9]); X.hype = Math.max(X.hype, g[10]); G.hoopFx = [g[11], g[12]];
    G.callouts = s.co.map(function (c) { return { text: c[0], color: c[1], life: c[2], t: c[3], size: c[4] }; });
    s.p.forEach(function (a, i) {
      var p = P[i], q = n && n.p[i]; if (!p) return;
      var lp = q && Math.abs(q[0] - a[0]) < 3 && Math.abs(q[2] - a[2]) < 3;   // no smoothing across a jump (a new lineup)
      p.x = lp ? L(a[0], q[0], f) : a[0]; p.y = lp ? L(a[1], q[1], f) : a[1]; p.z = lp ? L(a[2], q[2], f) : a[2];
      p.vy = a[3]; p.anim = a[4]; p.dir = a[5]; p.frame = a[6]; p.face = a[7]; p.state = a[8]; p.st = lp && q[8] === a[8] && q[9] >= a[9] ? L(a[9], q[9], f) : a[9];
      p.ssj = a[10]; p.onFire = !!a[11]; p.flash = a[12]; p.hitT = a[13]; p.tongue = !!(a[14] & 1); p.dunkFace = !!(a[14] & 2); p.hasBall = !!a[15]; p.turbo = a[16]; p.released = !!a[17]; p.tApex = a[18];
      p.dk = a[19] ? { T: a[19][0], style: a[19][1] || null } : null;
      p.jamArm = a[20] ? { x: a[20][0], y: a[20][1], z: a[20][2] } : null;
      p.trail = a[21] ? a[21].map(function (t) { return { x: t[0], y: t[1], z: t[2], anim: t[3], dir: t[4], frame: t[5], face: t[6] }; }) : null;
      var st = a[22]; p.stats = { pts: st[0], fgm: st[1], fga: st[2], tpm: st[3], tpa: st[4], ast: st[5], dunks: st[6], steals: st[7], blocks: st[8], shoves: st[9] };
      p.human = !!a[23]; p.lbl = a[23] || null;
    });
    var bb = s.b, nb = n && n.b, b = G.ball;
    if (bb && b) {
      var lb = nb && Math.abs(nb[0] - bb[0]) < 3 && Math.abs(nb[1] - bb[1]) < 3;
      b.x = lb ? L(bb[0], nb[0], f) : bb[0]; b.y = lb ? L(bb[1], nb[1], f) : bb[1]; b.z = lb ? L(bb[2], nb[2], f) : bb[2];
      b.vx = bb[3]; b.visible = !!bb[4]; b.baked = !!bb[5]; b.behind = !!bb[6]; b.inFront = !!bb[7]; b.fire = !!bb[8]; b.swoosh = bb[9]; b.spin = bb[10]; b.holder = bb[11] >= 0 ? P[bb[11]] : null; b.state = bb[12];
    }
    G.pu = s.pu ? { p: P[s.pu[0]], t: n && n.pu ? L(s.pu[1], n.pu[1], f) : s.pu[1], boom: !!s.pu[2], dur: s.pu[3], tw: s.pu[4] } : null;
    var cam = G.show && G.show.cam;   // Gator's twerk show: keep Lisa's walk-on (G.showCameo) from one update to the next
    G.show = s.sh ? { p: P[s.sh[0]], t: n && n.sh ? L(s.sh[1], n.sh[1], f) : s.sh[1], len: s.sh[3], kind: s.sh[2] ? 'pu' : 'solo', zoom: !!s.sh[2], cam: cam } : null;
    G.cine = s.ci ? { p: P[s.ci[0]], t: s.ci[1], dur: s.ci[2], kind: s.ci[3] } : null;
    if (G.phase !== 'over' && U.screen === 'results') U.screen = null;   // the host started a rematch
  }
  // the guest's stick and buttons go to the host when they change (and a few times a second anyway)
  function sendInput() {
    if (N.mode !== 'guest' || N.stage !== 'game' || !host || !G.human) return;
    var In = HW.In, U = UI(), e = [], me = G.human;
    if (U.screen === 'paused') { In.shootDown = In.shootUp = In.passDown = In.actDown = false; }
    if (In.shootDown) e.push('sd');
    if (In.shootUp) e.push(['su', me.state === 'shoot' && me.hasBall && !me.released ? r3(me.st) : me.state === 'stepback' ? -1 : null]);   // -1: let go during the step-back
    if (In.passDown) e.push('pd'); if (In.actDown) e.push('ad');
    var mx = U.screen ? 0 : Math.round(In.mx * 100) / 100, mz = U.screen ? 0 : Math.round(In.mz * 100) / 100, tb = In.turbo ? 1 : 0, ct = In.comboTurbo ? 1 : 0;
    var key = mx + ',' + mz + ',' + tb + ct, now = performance.now();
    if (!e.length && key === lastIn && now - lastInT < 250) return;
    lastIn = key; lastInT = now;
    var m = { t: 'in', mx: mx, mz: mz, tb: tb, ct: ct }; if (e.length) m.e = e; send(host, m);
  }
  N.snapCount = function () { return snaps.length; };
})(window.HW);
