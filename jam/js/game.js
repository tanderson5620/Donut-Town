/* game.js - 2-on-2 arcade rules: movement, turbo, timed jump shots, dunks, passes, steals, shoves, blocks, rebounds, on fire, clock, AI */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, K = X.K, Au = HW.Audio;
  var G = HW.Jam = { players: [], phase: 'menu', score: [0, 0], q: 1, clock: 0, shot: 24, t: 0, poss: 0, callouts: [], hoopFx: [0, 0] };
  var GRAV = 13, QUARTER = 60, OT = 30;   // quarter length is picked on the team card (1:00, 1:30, 2:00 or 3:00); overtime is half a quarter, 30-60 s
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function rimX(team) { return team === 0 ? K.RIMX : -K.RIMX; }
  function side(team) { return team === 0 ? 1 : -1; }
  // on fire, a player's best rating (his specialty; ties count) gets turned up even more
  var STATK = ['speed', 'tp', 'dunk', 'steal', 'block', 'str', 'pass'];
  function top(p) { if (!p.topK) { var s = p.def.stats, m = 0; STATK.forEach(function (k) { m = Math.max(m, s[k] || 0); }); p.topK = STATK.filter(function (k) { return (s[k] || 0) >= m; }); } return p.topK; }
  function sig(p, k) { return !!(p && p.onFire && top(p).indexOf(k) >= 0); }
  G.sig = sig;
  function fireBurst(x, y, z, n) { X.flame(x, y, z, n, 0.6); }
  // knocked down by a stronger player: he bleeds a little where his head hits the floor
  function bleed(p, amt) { p.bleed = Math.max(p.bleed || 0, amt); p.bleedT = 0.35; }

  /* ---------- players ---------- */
  function Player(id, team, slot, human) {
    var d = HW.PLAYERS[id], t = HW.TYPES[d.type], s = d.stats;
    this.id = id; this.def = d; this.team = team; this.slot = slot; this.human = !!human;
    this.run = 4.4 + 0.32 * s.speed; this.turboMult = t.turboMult + 0.05; this.drain = 30 * t.turboDrain;
    this.jumpH = 0.85 + 0.05 * s.dunk + t.jumpBonus; this.reach = d.height + 0.45;
    this.x = 0; this.z = 7; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.face = 1; this.dir = 'R';
    this.anim = 'idle'; this.frame = 0; this.state = 'idle'; this.st = 0; this.turbo = 100; this.turboOn = false;
    this.onFire = false; this.streak = 0; this.cd = { steal: 0, shove: 0, jump: 0, catch: 0, block: 0 }; this.flash = 0;
    this.stats = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ast: 0, dunks: 0, steals: 0, blocks: 0, shoves: 0 };
    this.ai = { t: 0, spot: null, spotT: 0, hold: 0 };
  }
  Player.prototype.grounded = function () { return this.y <= 0.001 && this.vy === 0; };
  Player.prototype.busy = function () { return this.state === 'fall' || this.state === 'dunk' || this.state === 'shoot' || this.state === 'shove' || this.state === 'pass'; };

  G.start = function (setup) {
    X.clearBlood();
    if (HW.TOUCH && !G.tipShown) { G.tipShown = true; G.tipT = 1.2; }   // first game on a phone: show where turbo went
    G.setup = setup; G.players = []; G.diff = HW.DIFFICULTY[setup.diff || 'normal'];
    QUARTER = setup.qlen || 60; OT = clamp(Math.round(QUARTER / 2), 30, 60);
    setup.teams.forEach(function (ids, team) { ids.forEach(function (id, i) { var p = new Player(id, team, i, id === setup.human); G.players.push(p); if (p.human) G.human = p; }); });
    G.humanTeam = G.human.team; G.score = [0, 0]; G.q = 1; G.callouts = []; G.ball = { x: 0, y: 1, z: 7, vx: 0, vy: 0, vz: 0, state: 'loose', holder: null, visible: true, fire: false };
    G.beginQuarter();
  };
  G.mates = function (p) { return G.players.filter(function (q) { return q.team === p.team && q !== p; }); };
  G.opps = function (p) { return G.players.filter(function (q) { return q.team !== p.team; }); };

  G.beginQuarter = function () {
    G.clock = G.q > 4 ? OT : QUARTER; G.lineup(G.q % 2 === 1 ? G.humanTeam : 1 - G.humanTeam, true);
    G.phase = 'tip'; G.phaseT = 2.4; G.say(G.q > 4 ? 'OVERTIME!' : ['1ST QUARTER', '2ND QUARTER', '3RD QUARTER', '4TH QUARTER'][G.q - 1], '#fff', 2);
  };
  // set everyone up with `team` bringing the ball up from its own end
  G.lineup = function (team, center) {
    var s = side(team), off = G.players.filter(function (p) { return p.team === team; }), def = G.players.filter(function (p) { return p.team !== team; });
    G.players.forEach(function (p) { p.vx = p.vz = p.vy = 0; p.y = 0; p.state = 'idle'; p.st = 0; p.flash = 0; p.pending = null; p.dm = null; p.trail = null; p.bleed = 0; });
    var hand = off.slice().sort(function (a, b) { return (b.human - a.human) || (b.def.type === 'handler') - (a.def.type === 'handler'); })[0];
    var bx = center ? -s * 1.5 : -s * 8.5;
    hand.x = bx; hand.z = 7; off.forEach(function (p) { if (p !== hand) { p.x = bx + s * 3.5; p.z = 3; } });
    def.forEach(function (p, i) { p.x = bx + s * (center ? 3.2 : 4.5); p.z = i ? 10 : 5; });
    G.players.forEach(function (p) { p.face = p.team === team ? s : -s; });
    G.give(hand); G.poss = team; G.shot = 24; X.camX = X.camClamp(bx);
  };

  /* ---------- ball ---------- */
  G.give = function (p) {
    var b = G.ball, prev = G.poss;
    if (b.holder && b.holder !== p) b.holder.hasBall = false;
    b.holder = p; p.hasBall = true; b.state = 'held'; b.shotInfo = null; b.pass = null; b.vx = b.vy = b.vz = 0; p.assist = null;
    if (prev !== p.team) { G.poss = p.team; G.shot = 24; }
    p.ai.hold = 0; p.dribT = 0;
  };
  G.drop = function (p, vx, vy, vz) {
    var b = G.ball; if (b.holder !== p) return; p.hasBall = false; b.holder = null; b.state = 'loose'; b.vx = vx; b.vy = vy; b.vz = vz; b.noCatch = 0.3; b.last = p;
  };
  function ballAtHolder(p, dt) {
    var b = G.ball;
    if (p.state === 'shoot' || p.state === 'dunk') { b.x = p.x + p.face * 0.12; b.y = p.y + p.def.height + 0.2; b.z = p.z - 0.15; return; }
    if (p.state === 'pass' && p.pending) { var hw = X.handWorld(p); if (hw) { b.x = hw.x; b.y = Math.max(0.15, hw.y); b.z = p.z - 0.25; } return; }   // in his hand through a fancy pass
    if (p.state === 'pass' || p.state === 'fall') return;
    var dm = p.dm;
    if (dm) {
      // crossover (low across the front) or behind-the-back (behind him): one bounce from the old side to the new one
      var u = Math.min(1, dm.t / dm.dur), e = u * u * (3 - 2 * u), sd = dm.from + (p.face - dm.from) * e;
      b.x = p.x + sd * 0.42 + p.vx * 0.05; b.y = 0.15 + 0.78 * Math.abs(Math.cos(Math.PI * u)); b.z = dm.type === 'btb' ? p.z + 0.28 : p.z - 0.42 + p.vz * 0.05;
      if (u >= 0.5 && !dm.hit) { dm.hit = true; Au.bounce(4); }
      return;
    }
    p.dribT = (p.dribT || 0) + dt * (2.3 + Math.hypot(p.vx, p.vz) * 0.12);
    var ph = p.dribT % 1, h = 0.95 * Math.abs(Math.sin(Math.PI * ph));
    if (ph < (p.prevPh || 0)) Au.bounce(3);
    p.prevPh = ph;
    b.x = p.x + p.face * 0.42 + p.vx * 0.05; b.z = p.z - 0.3 + p.vz * 0.05; b.y = 0.14 + h;
  }

  /* ---------- actions ---------- */
  G.startShot = function (p) {
    if (!p.hasBall || !p.grounded() || p.busy()) return;
    p.state = 'shoot'; p.st = 0; p.vy = Math.sqrt(2 * GRAV * p.jumpH * 0.9); p.y = 0.001; p.released = false; p.tApex = p.vy / GRAV;
    p.face = side(p.team); Au.jump();
  };
  G.releaseShot = function (p) {
    if (p.state !== 'shoot' || p.released || !p.hasBall) return;
    p.released = true; p.st2 = 0;
    var b = G.ball, rx = rimX(p.team), d = Math.hypot(p.x - rx, p.z - K.HZ), three = d > K.R3 - 0.1 && Math.abs(p.z - K.HZ) < 6.2 || d > K.R3 + 0.3;
    var s = p.def.stats, pm;
    if (three) pm = 0.16 + 0.05 * s.tp; else if (d > 4.5) pm = 0.34 + 0.035 * s.tp; else if (d > 2.2) pm = 0.48 + 0.025 * Math.max(s.tp, s.dunk); else pm = 0.68 + 0.02 * s.dunk;
    // release timing: the top of the jump is the sweet spot (wider for shooters from deep)
    var off = Math.abs(p.st - p.tApex) / p.tApex, win = 0.16 * (1 + (s.tp - 5) * 0.06) * (three && p.def.type === 'shooter' ? 1.6 : 1), quality = off < win ? 'green' : off < win * 2.5 ? 'ok' : 'bad';
    if (!p.human) quality = Math.random() < 0.35 * G.diff.shoot ? 'green' : 'ok';
    if (sig(p, 'tp')) quality = 'green';   // a shooter on fire can't miss the window
    if (quality === 'green') pm += 0.28; else if (quality === 'bad') pm *= 0.55;
    var c = contest(p); pm -= c;
    if (!p.human) pm *= G.diff.shoot;
    if (p.onFire) pm = Math.max(pm, sig(p, 'tp') ? 0.99 : 0.94);
    pm = clamp(pm, 0.04, 0.97);
    var make = Math.random() < pm;
    p.hasBall = false; b.holder = null; b.state = 'shot'; b.last = p;
    b.shotInfo = { by: p, team: p.team, three: three, make: make, quality: quality, t: 0, T: 0.7 + d * 0.055, x0: b.x, y0: b.y, z0: b.z, rx: rx, arc: 1.4 + d * 0.13, missX: rand(-0.35, 0.35), missZ: rand(-0.3, 0.3) };
    p.stats.fga++; if (three) p.stats.tpa++;
    if (p.human && quality === 'green') G.say('GREEN!', '#5cff7a', 0.7, 0.6);
    Au.whoosh(6);
  };
  function contest(p) {
    var c = 0; G.opps(p).forEach(function (q) { var d = dist(p, q); if (d < 1.6) c = Math.max(c, (1.6 - d) / 1.6 * (q.y > 0.25 ? 0.32 : 0.16) * (0.7 + q.def.stats.block / 20)); }); return c;
  }

  G.canDunk = function (p) {
    var rx = rimX(p.team), d = Math.hypot(p.x - rx, p.z - K.HZ), t = HW.TYPES[p.def.type];
    return p.hasBall && p.grounded() && !p.busy() && d < 2.1 + 0.22 * p.def.stats.dunk + t.dunkRange + (sig(p, 'dunk') ? 2.5 : 0) && d > 0.25;   // a dunker on fire takes off from way out
  };
  G.startDunk = function (p) {
    var rx = rimX(p.team), s = side(p.team), dk = p.def.stats.dunk;
    // big arcade hang time: the slam comes two thirds of the way through, so a defender who meets him in the air can reject it
    p.state = 'dunk'; p.st = 0; var fd = sig(p, 'dunk');
    p.dk = { T: 1.05 + (dk >= 9 ? 0.25 : 0) + (p.onFire ? 0.15 : 0) + (fd ? 0.25 : 0), x0: p.x, z0: p.z, x1: rx - s * 0.5, z1: K.HZ + 0.05, peak: 1.0 + dk * 0.08 + (p.onFire ? 0.3 : 0) + (fd ? 0.2 : 0), slam: false, spin: fd || (dk >= 8 && Math.random() < 0.5) };
    p.face = s; p.stats.fga++; Au.jump(); Au.whoosh(9);   // a dunk is a field goal attempt (made ones already count in fgm)
  };
  var DUNK_SLAM = 0.66;
  function updateDunk(p, dt) {
    // he glides to the rim (eased in and out over the first 60%), so a defender in his path has time to get up and meet him
    var k = p.dk, u = p.st / k.T, e0 = Math.min(1, u / 0.6), e = e0 * e0 * (3 - 2 * e0);   // p.st is advanced once in physics() (it used to be counted twice, so dunks ran at double speed)
    p.x = k.x0 + (k.x1 - k.x0) * e; p.z = k.z0 + (k.z1 - k.z0) * e; p.y = Math.max(0, k.peak * Math.sin(Math.PI * Math.min(1, u)) * (u > 0.62 && u < 0.82 ? 1.02 : 1));
    if (k.spin && u > 0.18 && u < 0.5) p.face = Math.floor(u * 22) % 2 ? side(p.team) : -side(p.team); else p.face = side(p.team);
    if (sig(p, 'dunk')) fireBurst(p.x, p.y + 1.0, p.z - 0.1, 2);   // wrapped in flames all the way up
    p.anim = 'dunk'; p.dir = 'R'; p.frame = u < 0.12 ? 0 : u < 0.3 ? 1 : u < 0.5 ? 2 : u < 0.64 ? 3 : u < 0.82 ? 4 : 5;
    if (u >= DUNK_SLAM && !k.slam) {
      k.slam = true; var b = G.ball; p.hasBall = false; b.holder = null; b.state = 'through'; b.x = rimX(p.team); b.z = K.HZ; b.y = K.RIM_H - 0.05; b.vy = -5; b.vx = b.vz = 0;
      p.stats.dunks++; G.scored(p, 2, true);
      var poster = false;
      G.opps(p).forEach(function (q) { if (q.y > 0.3 && q.state !== 'fall' && q.state !== 'dunk' && dist(p, q) < 1.6 && p.def.stats.str > q.def.stats.str) { q.state = 'fall'; q.st = 0; q.fallT = 1.6; q.vy = Math.min(q.vy, 0); q.face = p.x >= q.x ? 1 : -1; q.vx = -q.face * 2; poster = true; bleed(q, 0.8 + (p.def.stats.str - q.def.stats.str) * 0.1); } });
      if (poster) G.say('POSTERIZED!', '#ff8a5a', 1.6, 1.1);
      X.shake = 1.4; X.hype = 3; Au.dunk(); X.burst(b.x, K.RIM_H, K.HZ, 30, ['#ffd23f', '#ff7a1a', '#fff'], 5, 0.9);
      if (p.def.stats.dunk >= 9 && Math.random() < (sig(p, 'dunk') ? 0.85 : 0.3)) { G.say('SHATTERED!', '#9ad0ff', 1.6, 1.2); Au.shatter(); X.burst(b.x + side(p.team) * 0.5, 3.4, K.HZ, 70, ['#cfe9ff', '#ffffff', '#9ad0ff'], 6, 1.6); }
    }
    if (u >= 1) { p.state = 'idle'; p.y = 0; p.vy = 0; p.dk = null; }
  }

  // PASS rating: faster, truer passes that are harder to pick off. Good passers show off: the ball stays in his hand through the move
  // (behind the back, a 360 spin, a flip, a football snap through his legs, over the head, a no-look flick) and leaves from his hand
  // on the release frame. n: frames of the move, dur: seconds, rel: release frame, away: he faces away from the target
  // w: how long each frame is held (the behind-the-back hangs on the moment the ball is behind him)
  var FANCY = { back: { n: 6, dur: 0.62, rel: 5, away: true, w: [0.8, 1, 1.2, 1.7, 1.2, 1.1] }, spin: { n: 8, dur: 0.56, rel: 6 }, flip: { n: 8, dur: 0.8, rel: 4 },
    hike: { n: 4, dur: 0.42, rel: 2, away: true, stop: true }, head: { n: 3, dur: 0.33, rel: 2, away: true }, nolook: { n: 3, dur: 0.3, rel: 1, away: true } };
  G.FANCY = FANCY;
  function frameStart(F, i) { if (!F.w) return F.dur * i / F.n; var a = 0, t = 0; F.w.forEach(function (w, k) { t += w; if (k < i) a += w; }); return F.dur * a / t; }
  function frameAt(F, st) { for (var i = F.n - 1; i > 0; i--) if (st >= frameStart(F, i)) return i; return 0; }
  G.passTo = function (p, to) {
    if (!p.hasBall || !to || p.state === 'dunk' || p.pending) return;
    var air = p.state === 'shoot';
    if (air) { if (p.released) return; p.state = 'idle'; }
    var d = dist(p, to), pr = p.def.stats.pass || 5, style = null, dirTo = to.x >= p.x ? 1 : -1;
    if (!air && p.grounded() && Math.random() < (sig(p, 'pass') ? 1 : clamp((pr - 5) * 0.2, 0, 1))) {   // every pass at PASS 10, 1 in 5 at 6   // a passer on fire shows off every time
      // teammate behind him: snap it back through his legs (or over the head / no-look); otherwise behind the back, a spin or a flip
      var behind = (to.x - p.x) * p.face < -0.5;
      style = pick(behind ? ['hike', 'hike', 'head', 'nolook'] : d > 4 ? ['back', 'back', 'spin', 'spin', 'flip'] : ['back', 'back', 'spin']);
    }
    if (!style) { p.face = dirTo; launchPass(p, to, null); return; }
    var F = FANCY[style];
    p.face = F.away ? -dirTo : dirTo; p.state = 'pass'; p.st = 0; p.passStyle = style; p.pending = { to: to, at: frameStart(F, F.rel) }; G.ball.swoosh = F.dur + 0.3;   // motion streak on the ball through the move
    p.anim = 'pass_' + style; p.frame = 0; p.dir = style === 'back' ? 'W' : 'R';
    if (F.stop) { p.vx = p.vz = 0; }
    if (style === 'flip') { p.vy = GRAV * F.dur / 2; p.y = 0.001; Au.jump(); }
  };
  // the ball leaves his hand: from the hand on the current frame for the fancy ones, from the chest for a plain pass
  function launchPass(p, to, style) {
    var b = G.ball, d = dist(p, to), pr = p.def.stats.pass || 5, f = p.face, hw = style && X.handWorld(p);
    if (!style) { p.state = 'pass'; p.st = 0; p.passStyle = null; }
    p.pending = null; p.hasBall = false; b.holder = null; b.state = 'pass'; b.last = p;
    var miss = Math.max(0, 7 - pr) * 0.12, lead = 0.2 + 0.01 * pr;
    b.pass = { from: p, to: to, t: 0, T: Math.max(0.16, d / (15 + 0.8 * pr)), x0: hw ? hw.x : p.x + f * 0.3, y0: hw ? hw.y : 1.3 + p.y, z0: p.z - 0.2,
      x1: to.x + to.vx * lead + (Math.random() - 0.5) * 2 * miss, z1: to.z + to.vz * lead + (Math.random() - 0.5) * miss, y1: 1.3,
      arc: style === 'head' ? 1.1 : style === 'hike' || style === 'flip' ? 0.25 : 0.5, safe: sig(p, 'pass') ? 0 : clamp(1.3 - 0.08 * pr, 0.45, 1.2) };   // nobody picks off a passer on fire
    Au.whoosh(style ? 6 : 4);
  }
  function updatePending(p) {
    var pd = p.pending; if (!pd) return;
    if (p.state !== 'pass' || !p.hasBall || G.ball.holder !== p) { p.pending = null; return; }   // stripped, shoved or knocked down mid-move
    if (p.st >= pd.at) launchPass(p, pd.to, p.passStyle);
  }
  G.trySteal = function (p) {
    if (p.cd.steal > 0 || p.busy()) return; p.cd.steal = 0.55; p.state = 'steal'; p.st = 0;
    var h = G.ball.holder; if (!h || h.team === p.team || dist(p, h) > 1.55) { Au.steal(); return; }
    p.face = h.x >= p.x ? 1 : -1;
    var c = 0.03 + 0.022 * p.def.stats.steal - 0.01 * h.def.stats.speed + (Math.hypot(h.vx, h.vz) < 0.5 ? 0.06 : 0) + (p.human ? 0.1 : 0) - (h.state === 'shoot' ? 0.1 : 0) - 0.015 * Math.max(0, h.def.stats.str - p.def.stats.str) + (sig(p, 'steal') ? 0.3 : 0);
    if (!p.human) c *= G.diff.steal;
    if (h.dm) c *= 0.3;   // a crossover / behind-the-back dribble protects the ball
    if (h.state === 'dunk') c = 0;
    if (Math.random() < c) { if (sig(p, 'steal')) fireBurst(h.x, 1.0, h.z, 12); p.stats.steals++; G.give(p); G.say(pick(HW.PHRASES.steal), '#7ee0ff', 1); Au.steal(); }
    else Au.whoosh(3);
  };
  G.tryShove = function (p) {
    if (p.cd.shove > 0 || p.busy()) return; p.cd.shove = 0.9; p.state = 'shove'; p.st = 0;
    var tgt = null, bd = 1.6; G.opps(p).forEach(function (q) { var d = dist(p, q); if (d < bd && q.state !== 'fall') { bd = d; tgt = q; } });
    Au.shove(); if (!tgt) return;
    p.face = tgt.x >= p.x ? 1 : -1; p.stats.shoves++;
    var dx = (tgt.x - p.x) / (bd || 1), dz = (tgt.z - p.z) / (bd || 1), str = p.def.stats.str, fs = sig(p, 'str'), wall = sig(tgt, 'str') && !fs;
    var kd = 0.18 + 0.065 * str - 0.03 * tgt.def.stats.str + (p.turboOn ? 0.12 : 0) + (p.def.type === 'strength' ? 0.12 : 0) - (tgt.y > 0.2 ? 0.15 : 0);
    if (fs) kd = 1; if (wall) kd = 0;   // power on fire: every shove flattens him, and nobody moves him
    if (!wall) { var push = (4 + str * 0.5) * (fs ? 1.7 : 1); tgt.vx += dx * push; tgt.vz += dz * push; }
    if (fs) fireBurst((p.x + tgt.x) / 2, 1.2, (p.z + tgt.z) / 2, 14);
    if (Math.random() < kd) {
      if (tgt.hasBall) G.drop(tgt, dx * 3, 3, dz * 3);
      tgt.state = 'fall'; tgt.st = 0; tgt.face = dx > 0 ? -1 : 1; tgt.vy = 0; tgt.y = 0; Au.thud(); X.shake = Math.max(X.shake, 0.5);
      var gap = str - tgt.def.stats.str + (fs ? 5 : 0); if (gap > 0) bleed(tgt, 0.8 + gap * 0.1);
      G.say(pick(HW.PHRASES.shove), '#ff8a5a', 1);
    } else if (tgt.hasBall && Math.random() < 0.25) G.drop(tgt, dx * 2.5, 2.5, dz * 2.5);
  };
  G.jump = function (p) {
    if (!p.grounded() || p.busy() || p.cd.jump > 0) return; p.state = 'jump'; p.st = 0; p.vy = Math.sqrt(2 * GRAV * p.jumpH); p.y = 0.001; p.cd.jump = 0.35; Au.jump();
  };

  /* ---------- scoring ---------- */
  G.scored = function (p, pts, dunk) {
    var team = p.team, info = G.ball.shotInfo;
    G.score[team] += pts; p.stats.pts += pts; p.stats.fgm++; if (pts === 3) p.stats.tpm++;
    if (p.assist && p.assist.by.team === team && G.t - p.assist.t < 5) p.assist.by.stats.ast++;   // a basket within 5 s of catching a teammate's pass
    G.players.forEach(function (q) { q.assist = null; });
    if (pts === 3 && sig(p, 'tp')) for (var fi = 0; fi < 6; fi++) X.flame(rimX(team) + (Math.random() - 0.5) * 0.5, K.RIM_H - 0.3, K.HZ, 4, 0.5);
    p.streak++; if (!p.onFire && p.streak >= 3) { p.onFire = true; G.say(p.def.first.toUpperCase() + " IS ON FIRE!", '#ff6a1a', 2.2, 1.25); Au.fire(); }
    G.players.forEach(function (q) { if (q.team !== team) { if (q.onFire) G.say(q.def.first.toUpperCase() + ' COOLS OFF', '#9ad0ff', 1.2, 0.7); q.onFire = false; q.streak = 0; } });
    var txt = dunk ? pick(HW.PHRASES.dunk) : pts === 3 ? pick(HW.PHRASES.three) : info && info.quality === 'green' ? pick(HW.PHRASES.swish) : pick(HW.PHRASES.two);
    G.say(txt, dunk ? '#ff7a1a' : pts === 3 ? '#ffb347' : '#ffe14d', 1.5, dunk ? 1.3 : 1);
    Au.swish(); Au.cheer(pts === 3 || dunk); X.hype = Math.max(X.hype, dunk || pts === 3 ? 3 : 1.5);
    G.hoopFx[team === 0 ? 1 : 0] = 1;
    G.players.forEach(function (q) { if (q.team === team && q.state !== 'dunk') { q.state = 'cheer'; q.st = 0; } });
    G.phase = 'scored'; G.phaseT = 1.6; G.nextPoss = 1 - team;
  };
  G.missed = function (info) { info.by.streak = 0; };
  // your odds on a block try: 75-95% right on him (by block rating), dropping off toward the edge of your reach
  G.humanBlock = function (q, d) { if (sig(q, 'block')) return 0.98; return clamp(0.66 + 0.035 * q.def.stats.block - 0.25 * Math.max(0, d - 0.7), 0.35, 0.95); };
  // a rejected dunk: the dunker crashes to the floor and the blocker comes down with the ball
  // a stronger blocker puts him on the floor for 2 s and he leaves a little blood on the court
  G.rejectDunk = function (q, dk) {
    var power = q.def.stats.str - dk.def.stats.str + (sig(q, 'str') ? 5 : 0);
    dk.dk = null; dk.state = 'fall'; dk.st = 0; dk.vy = 0; dk.vx *= 0.3; dk.vz *= 0.3; dk.face = -side(dk.team);
    dk.fallT = power > 0 ? 2.0 : 1.3;
    if (power > 0) bleed(dk, 1 + power * 0.12);
    G.blocked(q, dk, null, 'GET THAT SHIT OUT OF HERE!'); X.shake = power > 0 ? 1.4 : 1; X.hype = Math.max(X.hype, 2.6); Au.thud();
  };
  // a block: the shot is dead and the blocker comes down with the ball
  G.blocked = function (q, shooter, info, text) {
    var b = G.ball; q.stats.blocks++;
    if (info) G.missed(info); else { shooter.streak = 0; shooter.released = true; }
    X.burst(b.x, b.y, b.z, 14, ['#ffffff', '#ffd23f', '#ff6b6b'], 3, 0.5); if (sig(q, 'block')) fireBurst(b.x, b.y, b.z, 18);
    G.give(q); q.cd.catch = 0;
    G.say(text || pick(HW.PHRASES.block), '#ff6b6b', 1.3, text ? 1.2 : 1); Au.board(); X.shake = 0.6; X.hype = Math.max(X.hype, 1.6);
  };

  /* ---------- per frame ---------- */
  G.update = function (dt, In) {
    G.t += dt; G.hoopFx = G.hoopFx.map(function (v) { return Math.max(0, v - dt * 2); });
    G.callouts.forEach(function (c) { c.t += dt; }); G.callouts = G.callouts.filter(function (c) { return c.t < c.life; });
    if (G.phase === 'menu' || G.phase === 'paused') return;
    if (G.tipT > 0 && (G.tipT -= dt) <= 0) G.say('STICK PAST THE RING = TURBO!', '#5cff7a', 3.5, 0.55);
    var live = G.phase === 'play';
    if (G.phase === 'tip') { G.phaseT -= dt; if (G.phaseT <= 0) { G.phase = 'play'; G.say('GO!', '#5cff7a', 0.8, 1.3); Au.whistle(); } }
    else if (G.phase === 'scored') { G.phaseT -= dt; if (G.phaseT <= 0) { G.lineup(G.nextPoss, false); G.phase = 'play'; } }
    else if (G.phase === 'break') { G.phaseT -= dt; if (G.phaseT <= 0) { G.q++; G.beginQuarter(); } }
    else if (G.phase === 'over') { G.phaseT -= dt; }
    if (live) {
      G.clock -= dt; if (G.ball.state === 'held') G.shot -= dt;
      if (G.shot <= 0 && G.ball.state === 'held') { Au.buzzer(); G.say('SHOT CLOCK!', '#ff5a4a', 1.2); G.phase = 'scored'; G.phaseT = 1.0; G.nextPoss = 1 - G.poss; }
      if (G.clock <= 0 && G.ball.state !== 'shot') G.endQuarter();
    }
    G.players.forEach(function (p) {
      for (var k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
      p.flash = Math.max(0, p.flash - dt);
      if (p.human) humanControl(p, dt, In, live); else HW.JamAI.update(p, dt, live);
      physics(p, dt);
    });
    separate();
    updateBall(dt);
    G.players.forEach(function (p) { animate(p, dt); });
    // the camera rides with the ball, leading toward the basket its team is attacking
    var b = G.ball, bx = b.holder ? b.holder.x : b.x + b.vx * 0.3, lead = b.holder ? side(b.holder.team) * 1.6 : 0;
    X.follow(bx + lead, dt);
  };

  // up/down the screen is squeezed by the camera, so moving in depth runs faster than along the court to feel as quick
  var ZS = G.ZS = 1.5;
  function move(p, mx, mz, turbo, dt) {
    var can = !(p.state === 'fall' || p.state === 'dunk' || p.state === 'shove' || (p.state === 'shoot' && p.grounded()) || (p.state === 'pass' && p.passStyle === 'hike'));
    var m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; m = 1; }
    p.turboOn = false;
    if (turbo && m > 0.1 && can && (p.turbo > 2 || p.onFire)) { p.turboOn = true; if (!p.onFire) p.turbo = Math.max(0, p.turbo - p.drain * dt); }
    else p.turbo = Math.min(100, p.turbo + (p.hasBall ? 9 : 14) * dt);
    var sp = p.run * (p.turboOn ? p.turboMult : 1) * (p.hasBall ? 0.93 : 1) * (p.onFire ? (sig(p, 'speed') ? 1.3 : 1.1) : 1) * (p.human ? 1 : G.diff.speed) * (can ? 1 : 0) * (p.y > 0.05 ? 0.7 : 1);
    var k = 1 - Math.exp(-(m > 0.1 ? 10 : 12) * dt);
    p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp * G.ZS - p.vz) * k;
  }
  G.move = move;
  function physics(p, dt) {
    p.st += dt;
    if (p.bleed && p.y <= 0.001 && (p.bleedT -= dt) <= 0) { X.blood(X.fallHeadX(p), p.z, p.bleed); p.bleed = 0; }
    if (p.pending && p.state !== 'pass') p.pending = null;   // knocked out of a fancy pass (shoved, fell, new possession): the move is off
    // ball handlers change direction with a crossover or a behind-the-back dribble
    if (p.dm) { p.dm.t += dt; if (p.dm.t >= p.dm.dur || !p.hasBall || p.state !== 'idle') { p.dm = null; p.dribT = Math.floor(p.dribT || 0) + 0.5; } }
    else if (p.hasBall && p.def.type === 'handler' && p.state === 'idle' && p.grounded() && p.prevFace && p.face !== p.prevFace && Math.abs(p.vx) > 0.9) {
      p.dm = { type: Math.random() < 0.6 ? 'cross' : 'btb', t: 0, dur: 0.34, from: p.prevFace };
      // on fire, the crossover can put his man on the floor
      if (p.onFire) G.opps(p).forEach(function (q) { if (q.state !== 'fall' && q.grounded() && dist(p, q) < 1.8 && Math.random() < 0.65) { q.state = 'fall'; q.st = 0; q.fallT = 1.0; q.face = p.x >= q.x ? -1 : 1; q.vx = p.face * 1.5; Au.thud(); fireBurst(q.x, 0.4, q.z, 8); } });
    }
    p.prevFace = p.face;
    // speed on fire leaves afterimages
    if (sig(p, 'speed') && Math.hypot(p.vx, p.vz) > 4) { p.trailT = (p.trailT || 0) - dt; if (p.trailT <= 0) { p.trailT = 0.045; (p.trail = p.trail || []).unshift({ x: p.x, y: p.y, z: p.z, anim: p.anim, dir: p.dir, frame: p.frame, face: p.face }); if (p.trail.length > 3) p.trail.pop(); } }
    else if (p.trail && p.trail.length) p.trail.pop();
    if (p.state === 'dunk') { updateDunk(p, dt); return; }
    if (p.state === 'fall') { p.vx *= 1 - 4 * dt; p.vz *= 1 - 4 * dt; if (p.st > (p.fallT || 1.3)) { p.state = 'idle'; p.flash = 0.6; p.fallT = 0; } }
    p.x = clamp(p.x + p.vx * dt, -K.HL - 0.6, K.HL + 0.6); p.z = clamp(p.z + p.vz * dt, 0.3, K.CD - 0.3);
    if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.state === 'jump') p.state = 'idle'; if (p.state === 'shoot') { if (!p.released && p.hasBall) G.releaseShot(p); p.state = 'idle'; } } }
    if (p.state === 'shoot' && p.hasBall && !p.released && p.st > p.tApex * 1.7) G.releaseShot(p);
    if (p.state === 'pass') updatePending(p);
    if ((p.state === 'pass' && p.st > (p.passStyle ? FANCY[p.passStyle].dur : 0.3) && p.grounded()) || (p.state === 'steal' && p.st > 0.3) || (p.state === 'shove' && p.st > 0.35) || (p.state === 'cheer' && p.st > 1.5)) p.state = 'idle';
  }
  function separate() {
    var P = G.players;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j]; if (a.state === 'dunk' || b.state === 'dunk' || a.state === 'fall' || b.state === 'fall') continue;
      // bodies bump: the stronger player holds his ground and moves the weaker one (boxing out)
      var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.65 && d > 1e-4) { var gap = 0.65 - d, sa = a.def.stats.str, sb = b.def.stats.str, wa = sb / (sa + sb), wb = 1 - wa; a.x -= dx / d * gap * wa; a.z -= dz / d * gap * wa; b.x += dx / d * gap * wb; b.z += dz / d * gap * wb; }
    }
  }

  function humanControl(p, dt, In, live) {
    if (!live) { move(p, 0, 0, false, dt); return; }
    move(p, In.mx, In.mz, In.turbo, dt);
    if (Math.abs(p.vx) > 1.0 && p.state !== 'shoot' && p.state !== 'pass') p.face = p.vx > 0 ? 1 : -1;   // a little sideways drift while running up or down doesn't flip him
    var holder = G.ball.holder, mate = G.mates(p)[0];
    // shove: the touch SHOVE button, or TURBO + PASS on a keyboard (stick turbo never turns a pass or steal into a shove)
    var shove = In.actDown || (In.passDown && In.comboTurbo);
    if (p.hasBall) {
      if (In.shootDown) { if (In.turbo && G.canDunk(p) && towardRim(p, In)) G.startDunk(p); else G.startShot(p); }
      if (In.actDown && G.canDunk(p)) G.startDunk(p);   // the touch DUNK button
      if (In.shootUp) G.releaseShot(p);
      if (In.passDown) G.passTo(p, mate);
    } else if (holder && holder.team === p.team) {
      // arcade teamwork: PASS calls for the ball, SHOOT tells your teammate to shoot; you can shove a defender off him
      if (shove) G.tryShove(p); else if (In.passDown) G.passTo(holder, p);
      if (In.shootDown) { if (G.canDunk(holder)) G.startDunk(holder); else G.startShot(holder); holder.ai.autoRelease = true; }
    } else {
      if (In.shootDown) G.jump(p);
      if (shove) G.tryShove(p); else if (In.passDown) G.trySteal(p);
    }
  }
  function towardRim(p, In) { var rx = rimX(p.team), dx = rx - p.x, dz = K.HZ - p.z, d = Math.hypot(dx, dz) || 1, m = Math.hypot(In.mx, In.mz); return m < 0.2 || (In.mx * dx + In.mz * dz) / (d * m) > 0.3; }

  function updateBall(dt) {
    if (!(dt > 0)) return;   // velocities below divide by dt
    var b = G.ball; if (b.swoosh > 0) b.swoosh -= dt; b.noCatch = Math.max(0, (b.noCatch || 0) - dt); b.inFront = false;
    b.fire = !!((b.holder && b.holder.onFire) || (b.shotInfo && b.shotInfo.by.onFire && b.state === 'shot') || (b.state === 'pass' && b.pass && b.pass.from.onFire));
    if (b.state === 'held') {
      ballAtHolder(b.holder, dt);
      // reject a dunk: anyone in the air who gets to the ball after take-off and before the slam (one try per jump)
      var dk = b.holder;
      if (dk.state === 'dunk' && dk.dk && !dk.dk.slam && dk.st / dk.dk.T > 0.1) G.opps(dk).forEach(function (q) {
        if (b.holder !== dk || dk.state !== 'dunk' || q.y < 0.2 || q.cd.block) return;
        var hum = q.human, d = Math.hypot(q.x - b.x, q.z - b.z), fb = sig(q, 'block');
        if (sig(dk, 'dunk') && !q.onFire) return;   // only a defender on fire can stop a dunker on fire
        if (d < (hum ? 1.4 : 1.1) + (fb ? 0.5 : 0) && b.y < q.y + q.reach + (hum ? 1.4 : 1.3)) {
          q.cd.block = 1;
          var bully = Math.max(0, dk.def.stats.str - q.def.stats.str);   // a stronger dunker is harder to stop
          var c = hum ? clamp(0.55 + 0.035 * q.def.stats.block - 0.025 * (dk.def.stats.dunk - 5) - 0.03 * bully - 0.25 * Math.max(0, d - 0.7), 0.15, 0.9) : (0.08 + 0.025 * q.def.stats.block) * (1 - 0.06 * bully) * G.diff.block;
          if (fb) c = hum ? 0.95 : Math.min(0.8, c * 3);
          if (Math.random() < c) G.rejectDunk(q, dk);
        }
      });
      // swat it out of a shooter's hands on the way up: you, in the air, close enough to reach the ball
      var sh = b.holder;
      if (sh.state === 'shoot' && !sh.released && sh.y > 0.1) G.opps(sh).forEach(function (q) {
        if (!q.human || b.holder !== sh || q.y < 0.15 || q.cd.block) return;
        var d = Math.hypot(q.x - sh.x, q.z - sh.z);
        if (d < 1.5 && b.y < q.y + q.reach + 0.7) { q.cd.block = 1; if (Math.random() < G.humanBlock(q, d)) G.blocked(q, sh, null); }
      });
      return;
    }
    if (b.state === 'shot') {
      var s = b.shotInfo, u = Math.min(1, (s.t += dt) / s.T);
      var ex = s.rx + (s.make ? 0 : s.missX), ez = K.HZ + (s.make ? 0 : s.missZ), ey = K.RIM_H + 0.12;
      var nx = s.x0 + (ex - s.x0) * u, nz = s.z0 + (ez - s.z0) * u, ny = s.y0 + (ey - s.y0) * u + s.arc * 4 * u * (1 - u);
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt; b.vz = (nz - b.z) / dt; b.x = nx; b.y = ny; b.z = nz;
      // blocks: anyone off the floor near the ball in its flight (goaltending is legal here); one try per jump. You get a wide reach
      // and good odds when you're right on him (G.humanBlock); computer blockers need to be closer and get worse odds
      G.opps(s.by).forEach(function (q) {
        if (b.state !== 'shot' || q.y < 0.15 || q.cd.block) return;
        var hum = q.human, d = Math.hypot(q.x - b.x, q.z - b.z);
        if (u < (hum ? 0.6 : 0.45) && d < (hum ? 1.6 : 1.0) + (sig(q, 'block') ? 0.5 : 0) && b.y < q.y + q.reach + (hum ? 0.7 : 0.35)) {
          q.cd.block = 1;
          if (Math.random() < (hum ? G.humanBlock(q, d) : Math.min(0.85, (0.16 + 0.035 * q.def.stats.block) * G.diff.block * (sig(q, 'block') ? 2.5 : 1)))) G.blocked(q, s.by, s);
        }
      });
      if (b.state === 'shot' && u >= 1) {
        if (s.make) { b.state = 'through'; b.vy = -3; b.vx = b.vz = 0; G.scored(s.by, s.three ? 3 : 2, false); }
        else { b.state = 'loose'; Au.rim(6); G.missed(s); var sd = s.rx > 0 ? -1 : 1; b.vx = sd * rand(1.5, 4.5); b.vy = rand(2.5, 5); b.vz = rand(-2.5, 2.5); b.noCatch = 0.15; G.shot = 24; }
      }
      return;
    }
    if (b.state === 'through') { b.y += b.vy * dt; b.vy -= GRAV * 0.5 * dt; b.inFront = true; if (b.y < 0.15) { b.y = 0.15; b.vy = 0; } return; }
    if (b.state === 'pass') {
      var ps = b.pass, v = Math.min(1, (ps.t += dt) / ps.T);
      var px = ps.x0 + (ps.x1 - ps.x0) * v, pz = ps.z0 + (ps.z1 - ps.z0) * v, py = ps.y0 + (ps.y1 - ps.y0) * v + ps.arc * 4 * v * (1 - v);
      b.vx = (px - b.x) / dt; b.vz = (pz - b.z) / dt; b.vy = (py - b.y) / dt; b.x = px; b.z = pz; b.y = py;
      // interceptions
      // one try per defender per pass (it used to roll every frame the ball was in reach, so a defender in the lane almost always got it)
      var thief = null; ps.tried = ps.tried || [];
      G.opps(ps.from).forEach(function (q) { if (!thief && v > 0.2 && v < 0.9 && q.state !== 'fall' && ps.tried.indexOf(q) < 0 && Math.hypot(q.x - b.x, q.z - b.z) < (sig(q, 'steal') ? 0.95 : 0.55) && b.y < q.y + q.reach) thief = q; });
      if (thief) ps.tried.push(thief);
      if (thief && Math.random() < (thief.human ? 0.75 : 0.5 * G.diff.steal) * ps.safe * (sig(thief, 'steal') ? 1.6 : 1)) { thief.stats.steals++; G.give(thief); G.say('INTERCEPTED!', '#7ee0ff', 1.1); Au.steal(); return; }
      // the receiver catches it as soon as it reaches him near the end of the flight
      if (v > 0.7 && ps.to.state !== 'fall' && dist(ps.to, b) < 0.8 && b.y < ps.to.y + ps.to.reach) v = 1;
      if (v >= 1) { if (ps.to.state !== 'fall' && dist(ps.to, b) < 1.6) { G.give(ps.to); ps.to.assist = { by: ps.from, t: G.t }; Au.click(); } else { b.state = 'loose'; b.vy = 0; } }
      return;
    }
    // loose ball physics + pickups
    b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < 0.15) { b.y = 0.15; if (b.vy < -1.2) { Au.bounce(Math.abs(b.vy)); b.vy = -b.vy * 0.6; } else b.vy = 0; b.vx *= 0.97; b.vz *= 0.97; }
    if (Math.abs(b.x) > K.HL + 0.8) { b.x = Math.sign(b.x) * (K.HL + 0.8); b.vx *= -0.5; }
    if (b.z < 0.1 || b.z > K.CD + 0.5) { b.z = clamp(b.z, 0.1, K.CD + 0.5); b.vz *= -0.5; }
    if (b.noCatch > 0 || G.phase !== 'play') return;
    var best = null, bd = 0.85;
    G.players.forEach(function (p) { if (p.state === 'fall' || p.state === 'dunk' || p.cd.catch > 0) return; var d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd && b.y < p.y + p.reach && b.y > p.y - 0.2) { bd = d; best = p; } });
    if (best) G.give(best);
  }

  function animate(p, dt) {
    var sp = Math.hypot(p.vx, p.vz), b = G.ball;
    if (p.state !== 'dunk') {
      // which way the body turns: toward / away from the camera when running mostly up or down the screen. Hysteresis and a short
      // hold keep diagonal runs from flickering between the side and front views.
      p.dirT = Math.max(0, (p.dirT || 0) - dt);
      var ang = Math.atan2(Math.abs(p.vz) / G.ZS, Math.abs(p.vx)), want = p.dir;
      if (sp > 0.6) { if (ang > 0.98) want = p.vz < 0 ? 'F' : 'B'; else if (ang < 0.7) want = 'R'; else if (want === 'F' || want === 'B') want = p.vz < 0 ? 'F' : 'B'; }
      else if (p.state !== 'idle') want = 'R';
      if (want !== p.dir && p.dirT <= 0) { p.dir = want; p.dirT = 0.18; }
      if (sp < 0.6 && p.state === 'idle' && !p.hasBall) { var tgt = b.holder || b; p.face = tgt.x >= p.x ? 1 : -1; }
      if (p.hasBall && sp < 0.6 && p.state === 'idle') p.face = side(p.team);
    }
    switch (p.state) {
      case 'dunk': return;
      case 'fall': p.anim = 'fall'; p.dir = 'R'; p.frame = Math.min(3, p.st / 0.12); return;
      case 'shoot': p.anim = 'shoot'; if (p.dir === 'B') p.dir = 'R'; p.frame = p.released ? (p.st2 = (p.st2 || 0) + dt, p.st2 < 0.12 ? 3 : 4) : (p.grounded() ? 0 : p.vy > 1 ? 1 : 2); return;
      case 'jump': p.anim = 'jump'; if (p.dir === 'B') p.dir = 'R'; p.frame = p.vy > 2 ? 1 : 2; return;
      case 'pass': if (p.passStyle) { var F = FANCY[p.passStyle]; p.anim = 'pass_' + p.passStyle; p.dir = p.passStyle === 'back' ? 'W' : 'R'; p.frame = frameAt(F, p.st); }
        else { p.anim = 'pass'; p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); } return;
      case 'steal': p.anim = 'steal'; if (p.dir === 'B') p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'shove': p.anim = 'shove'; p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'cheer': p.anim = 'cheer'; p.dir = 'F'; p.frame = (G.t * 8) % 4; return;   // st is parked at -99 for the end-of-game cheer
    }
    if (p.dm) { p.anim = 'dr_' + p.dm.type; p.dir = 'R'; p.frame = Math.min(3, Math.floor(p.dm.t / p.dm.dur * 4)); return; }
    var defending = b.holder && b.holder.team !== p.team && dist(p, b.holder) < 3;
    // stride rate follows the ground speed (depth speed counted at its true length), in real time so 120 Hz phones don't double it
    var stride = Math.hypot(p.vx, p.vz / G.ZS);
    if (sp > 0.6) { p.anim = p.hasBall ? 'drun' : (defending && sp < 4 ? 'defend' : 'run'); p.frame = (p.frame + Math.min(stride, 9) * dt * 1.7) % 8; }
    else { p.anim = p.hasBall ? 'dribble' : defending ? 'defend' : 'idle'; p.frame = (p.frame + dt * (p.hasBall ? 9 : 4)) % 6; }
  }

  G.endQuarter = function () {
    Au.buzzer();
    if (G.q >= 4 && G.score[0] !== G.score[1]) { G.phase = 'over'; G.phaseT = 4; var w = G.score[0] > G.score[1] ? 0 : 1; G.say(HW.TEAMS[w].name.toUpperCase() + ' WIN!', HW.TEAMS[w].color, 4, 1.2); G.players.forEach(function (p) { if (p.team === w) { p.state = 'cheer'; p.st = -99; } }); Au.cheer(true); return; }
    G.phase = 'break'; G.phaseT = 3.2; G.say(G.q >= 4 ? 'TIED! OVERTIME' : 'END OF ' + ['1ST', '2ND', '3RD', '4TH'][G.q - 1], '#fff', 3);
  };

  G.say = function (text, color, life, size) { G.callouts.push({ text: text, color: color || '#ffe14d', life: life || 1.4, t: 0, size: size || 1 }); if (G.callouts.length > 3) G.callouts.shift(); };
})(window.HW);
