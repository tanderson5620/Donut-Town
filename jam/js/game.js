/* game.js - 2-on-2 arcade rules: movement, turbo, timed jump shots, dunks, passes, steals, shoves, blocks, rebounds, on fire, clock, AI */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, K = X.K, Au = HW.Audio;
  var G = HW.Jam = { players: [], phase: 'menu', score: [0, 0], q: 1, clock: 0, shot: 24, t: 0, poss: 0, callouts: [], hoopFx: [0, 0] };
  var GRAV = 13, QUARTER = 180, OT = 60;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function rimX(team) { return team === 0 ? K.RIMX : -K.RIMX; }
  function side(team) { return team === 0 ? 1 : -1; }

  /* ---------- players ---------- */
  function Player(id, team, slot, human) {
    var d = HW.PLAYERS[id], t = HW.TYPES[d.type], s = d.stats;
    this.id = id; this.def = d; this.team = team; this.slot = slot; this.human = !!human;
    this.run = 4.4 + 0.32 * s.speed; this.turboMult = t.turboMult + 0.05; this.drain = 30 * t.turboDrain;
    this.jumpH = 0.85 + 0.05 * s.dunk + t.jumpBonus; this.reach = d.height + 0.45;
    this.x = 0; this.z = 7; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.face = 1; this.dir = 'R';
    this.anim = 'idle'; this.frame = 0; this.state = 'idle'; this.st = 0; this.turbo = 100; this.turboOn = false;
    this.onFire = false; this.streak = 0; this.cd = { steal: 0, shove: 0, jump: 0, catch: 0, block: 0 }; this.flash = 0;
    this.stats = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, steals: 0, blocks: 0, shoves: 0 };
    this.ai = { t: 0, spot: null, spotT: 0, hold: 0 };
  }
  Player.prototype.grounded = function () { return this.y <= 0.001 && this.vy === 0; };
  Player.prototype.busy = function () { return this.state === 'fall' || this.state === 'dunk' || this.state === 'shoot' || this.state === 'shove' || this.state === 'pass'; };

  G.start = function (setup) {
    G.setup = setup; G.players = []; G.diff = HW.DIFFICULTY[setup.diff || 'normal'];
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
    G.players.forEach(function (p) { p.vx = p.vz = p.vy = 0; p.y = 0; p.state = 'idle'; p.st = 0; p.flash = 0; });
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
    b.holder = p; p.hasBall = true; b.state = 'held'; b.shotInfo = null; b.pass = null; b.vx = b.vy = b.vz = 0;
    if (prev !== p.team) { G.poss = p.team; G.shot = 24; }
    p.ai.hold = 0; p.dribT = 0;
  };
  G.drop = function (p, vx, vy, vz) {
    var b = G.ball; if (b.holder !== p) return; p.hasBall = false; b.holder = null; b.state = 'loose'; b.vx = vx; b.vy = vy; b.vz = vz; b.noCatch = 0.3; b.last = p;
  };
  function ballAtHolder(p, dt) {
    var b = G.ball;
    if (p.state === 'shoot' || p.state === 'dunk') { b.x = p.x + p.face * 0.12; b.y = p.y + p.def.height + 0.2; b.z = p.z - 0.15; return; }
    if (p.state === 'pass' || p.state === 'fall') return;
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
    if (quality === 'green') pm += 0.28; else if (quality === 'bad') pm *= 0.55;
    var c = contest(p); pm -= c;
    if (!p.human) pm *= G.diff.shoot;
    if (p.onFire) pm = Math.max(pm, 0.94);
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
    return p.hasBall && p.grounded() && !p.busy() && d < 2.1 + 0.22 * p.def.stats.dunk + t.dunkRange && d > 0.25;
  };
  G.startDunk = function (p) {
    var rx = rimX(p.team), s = side(p.team), dk = p.def.stats.dunk;
    p.state = 'dunk'; p.st = 0; p.dk = { T: 0.95 + (dk >= 9 ? 0.25 : 0), x0: p.x, z0: p.z, x1: rx - s * 0.5, z1: K.HZ + 0.05, peak: 1.3 + dk * 0.13 + (p.onFire ? 0.4 : 0), slam: false, spin: dk >= 8 && Math.random() < 0.5 };
    p.face = s; Au.jump(); Au.whoosh(9);
  };
  function updateDunk(p, dt) {
    var k = p.dk, u = (p.st += dt) / k.T, e = 1 - Math.pow(1 - Math.min(1, u / 0.62), 3);
    p.x = k.x0 + (k.x1 - k.x0) * e; p.z = k.z0 + (k.z1 - k.z0) * e; p.y = Math.max(0, k.peak * Math.sin(Math.PI * Math.min(1, u)) * (u > 0.62 && u < 0.82 ? 1.02 : 1));
    if (k.spin && u > 0.18 && u < 0.5) p.face = Math.floor(u * 22) % 2 ? side(p.team) : -side(p.team); else p.face = side(p.team);
    p.anim = 'dunk'; p.dir = 'R'; p.frame = u < 0.12 ? 0 : u < 0.3 ? 1 : u < 0.5 ? 2 : u < 0.64 ? 3 : u < 0.82 ? 4 : 5;
    if (u >= 0.6 && !k.slam) {
      k.slam = true; var b = G.ball; p.hasBall = false; b.holder = null; b.state = 'through'; b.x = rimX(p.team); b.z = K.HZ; b.y = K.RIM_H - 0.05; b.vy = -5; b.vx = b.vz = 0;
      p.stats.dunks++; G.scored(p, 2, true);
      X.shake = 1.4; X.hype = 3; Au.dunk(); X.burst(b.x, K.RIM_H, K.HZ, 30, ['#ffd23f', '#ff7a1a', '#fff'], 5, 0.9);
      if (p.def.stats.dunk >= 9 && Math.random() < 0.3) { G.say('SHATTERED!', '#9ad0ff', 1.6, 1.2); Au.shatter(); X.burst(b.x + side(p.team) * 0.5, 3.4, K.HZ, 70, ['#cfe9ff', '#ffffff', '#9ad0ff'], 6, 1.6); }
    }
    if (u >= 1) { p.state = 'idle'; p.y = 0; p.vy = 0; p.dk = null; }
  }

  G.passTo = function (p, to) {
    if (!p.hasBall || !to || p.state === 'dunk') return;
    if (p.state === 'shoot') { if (p.released) return; p.state = 'idle'; }
    var b = G.ball, d = dist(p, to);
    p.state = 'pass'; p.st = 0; p.face = to.x >= p.x ? 1 : -1; p.hasBall = false; b.holder = null; b.state = 'pass'; b.last = p;
    var lead = 0.25; b.pass = { from: p, to: to, t: 0, T: Math.max(0.18, d / 17), x0: p.x + p.face * 0.3, y0: 1.3 + p.y, z0: p.z - 0.2, x1: to.x + to.vx * lead, z1: to.z + to.vz * lead, y1: 1.3 };
    Au.whoosh(4);
  };
  G.trySteal = function (p) {
    if (p.cd.steal > 0 || p.busy()) return; p.cd.steal = 0.55; p.state = 'steal'; p.st = 0;
    var h = G.ball.holder; if (!h || h.team === p.team || dist(p, h) > 1.55) { Au.steal(); return; }
    p.face = h.x >= p.x ? 1 : -1;
    var c = 0.03 + 0.022 * p.def.stats.steal - 0.01 * h.def.stats.speed + (Math.hypot(h.vx, h.vz) < 0.5 ? 0.06 : 0) + (p.human ? 0.1 : 0) - (h.state === 'shoot' ? 0.1 : 0);
    if (!p.human) c *= G.diff.steal;
    if (h.state === 'dunk') c = 0;
    if (Math.random() < c) { p.stats.steals++; G.give(p); G.say(pick(HW.PHRASES.steal), '#7ee0ff', 1); Au.steal(); }
    else Au.whoosh(3);
  };
  G.tryShove = function (p) {
    if (p.cd.shove > 0 || p.busy()) return; p.cd.shove = 0.9; p.state = 'shove'; p.st = 0;
    var tgt = null, bd = 1.6; G.opps(p).forEach(function (q) { var d = dist(p, q); if (d < bd && q.state !== 'fall') { bd = d; tgt = q; } });
    Au.shove(); if (!tgt) return;
    p.face = tgt.x >= p.x ? 1 : -1; p.stats.shoves++;
    var dx = (tgt.x - p.x) / (bd || 1), dz = (tgt.z - p.z) / (bd || 1), str = p.def.stats.str;
    tgt.vx += dx * (4 + str * 0.5); tgt.vz += dz * (4 + str * 0.5);
    var kd = 0.18 + 0.065 * str - 0.03 * tgt.def.stats.str + (p.turboOn ? 0.12 : 0) + (p.def.type === 'strength' ? 0.12 : 0) - (tgt.y > 0.2 ? 0.15 : 0);
    if (Math.random() < kd) {
      if (tgt.hasBall) G.drop(tgt, dx * 3, 3, dz * 3);
      tgt.state = 'fall'; tgt.st = 0; tgt.face = dx > 0 ? -1 : 1; tgt.vy = 0; tgt.y = 0; Au.thud(); X.shake = Math.max(X.shake, 0.5);
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
  G.humanBlock = function (q, d) { return clamp(0.66 + 0.035 * q.def.stats.block - 0.25 * Math.max(0, d - 0.7), 0.35, 0.95); };
  // a block: the shot is dead and the blocker comes down with the ball
  G.blocked = function (q, shooter, info) {
    var b = G.ball; q.stats.blocks++;
    if (info) G.missed(info); else { shooter.streak = 0; shooter.released = true; }
    X.burst(b.x, b.y, b.z, 14, ['#ffffff', '#ffd23f', '#ff6b6b'], 3, 0.5);
    G.give(q); q.cd.catch = 0;
    G.say(pick(HW.PHRASES.block), '#ff6b6b', 1.3); Au.board(); X.shake = 0.6; X.hype = Math.max(X.hype, 1.6);
  };

  /* ---------- per frame ---------- */
  G.update = function (dt, In) {
    G.t += dt; G.hoopFx = G.hoopFx.map(function (v) { return Math.max(0, v - dt * 2); });
    G.callouts.forEach(function (c) { c.t += dt; }); G.callouts = G.callouts.filter(function (c) { return c.t < c.life; });
    if (G.phase === 'menu' || G.phase === 'paused') return;
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
    var can = !(p.state === 'fall' || p.state === 'dunk' || p.state === 'shove' || (p.state === 'shoot' && p.grounded()));
    var m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; m = 1; }
    p.turboOn = false;
    if (turbo && m > 0.1 && can && (p.turbo > 2 || p.onFire)) { p.turboOn = true; if (!p.onFire) p.turbo = Math.max(0, p.turbo - p.drain * dt); }
    else p.turbo = Math.min(100, p.turbo + (p.hasBall ? 9 : 14) * dt);
    var sp = p.run * (p.turboOn ? p.turboMult : 1) * (p.hasBall ? 0.93 : 1) * (p.onFire ? 1.1 : 1) * (p.human ? 1 : G.diff.speed) * (can ? 1 : 0) * (p.y > 0.05 ? 0.7 : 1);
    var k = 1 - Math.exp(-(m > 0.1 ? 10 : 12) * dt);
    p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp * G.ZS - p.vz) * k;
  }
  G.move = move;
  function physics(p, dt) {
    p.st += dt;
    if (p.state === 'dunk') { updateDunk(p, dt); return; }
    if (p.state === 'fall') { p.vx *= 1 - 4 * dt; p.vz *= 1 - 4 * dt; if (p.st > 1.3) { p.state = 'idle'; p.flash = 0.6; } }
    p.x = clamp(p.x + p.vx * dt, -K.HL - 0.6, K.HL + 0.6); p.z = clamp(p.z + p.vz * dt, 0.3, K.CD - 0.3);
    if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.state === 'jump') p.state = 'idle'; if (p.state === 'shoot') { if (!p.released && p.hasBall) G.releaseShot(p); p.state = 'idle'; } } }
    if (p.state === 'shoot' && p.hasBall && !p.released && p.st > p.tApex * 1.7) G.releaseShot(p);
    if ((p.state === 'pass' && p.st > 0.3) || (p.state === 'steal' && p.st > 0.3) || (p.state === 'shove' && p.st > 0.35) || (p.state === 'cheer' && p.st > 1.5)) p.state = 'idle';
  }
  function separate() {
    var P = G.players;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j]; if (a.state === 'dunk' || b.state === 'dunk' || a.state === 'fall' || b.state === 'fall') continue;
      var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d < 0.65 && d > 1e-4) { var push = (0.65 - d) / 2; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
    }
  }

  function humanControl(p, dt, In, live) {
    if (!live) { move(p, 0, 0, false, dt); return; }
    move(p, In.mx, In.mz, In.turbo, dt);
    if (Math.abs(p.vx) > 1.0 && p.state !== 'shoot') p.face = p.vx > 0 ? 1 : -1;   // a little sideways drift while running up or down doesn't flip him
    var holder = G.ball.holder, mate = G.mates(p)[0];
    if (p.hasBall) {
      if (In.shootDown) { if (In.turbo && G.canDunk(p) && towardRim(p, In)) G.startDunk(p); else G.startShot(p); }
      if (In.shootUp) G.releaseShot(p);
      if (In.passDown) G.passTo(p, mate);
    } else if (holder && holder.team === p.team) {
      // arcade teamwork: PASS calls for the ball, SHOOT tells your teammate to shoot
      if (In.passDown) G.passTo(holder, p);
      if (In.shootDown) { if (G.canDunk(holder)) G.startDunk(holder); else G.startShot(holder); holder.ai.autoRelease = true; }
    } else {
      if (In.shootDown) G.jump(p);
      if (In.passDown) { if (In.turbo) G.tryShove(p); else G.trySteal(p); }
    }
  }
  function towardRim(p, In) { var rx = rimX(p.team), dx = rx - p.x, dz = K.HZ - p.z, d = Math.hypot(dx, dz) || 1, m = Math.hypot(In.mx, In.mz); return m < 0.2 || (In.mx * dx + In.mz * dz) / (d * m) > 0.3; }

  function updateBall(dt) {
    var b = G.ball; b.noCatch = Math.max(0, (b.noCatch || 0) - dt); b.inFront = false;
    b.fire = !!((b.holder && b.holder.onFire) || (b.shotInfo && b.shotInfo.by.onFire && b.state === 'shot'));
    if (b.state === 'held') {
      ballAtHolder(b.holder, dt);
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
        if (u < (hum ? 0.6 : 0.45) && d < (hum ? 1.6 : 1.0) && b.y < q.y + q.reach + (hum ? 0.7 : 0.35)) {
          q.cd.block = 1;
          if (Math.random() < (hum ? G.humanBlock(q, d) : (0.16 + 0.035 * q.def.stats.block) * G.diff.block)) G.blocked(q, s.by, s);
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
      var px = ps.x0 + (ps.x1 - ps.x0) * v, pz = ps.z0 + (ps.z1 - ps.z0) * v, py = ps.y0 + (ps.y1 - ps.y0) * v + 0.5 * 4 * v * (1 - v);
      b.vx = (px - b.x) / dt; b.vz = (pz - b.z) / dt; b.vy = (py - b.y) / dt; b.x = px; b.z = pz; b.y = py;
      // interceptions
      var thief = null; G.opps(ps.from).forEach(function (q) { if (!thief && v > 0.2 && v < 0.9 && q.state !== 'fall' && Math.hypot(q.x - b.x, q.z - b.z) < 0.55 && b.y < q.y + q.reach) thief = q; });
      if (thief && Math.random() < (thief.human ? 0.7 : 0.45 * G.diff.steal)) { thief.stats.steals++; G.give(thief); G.say('INTERCEPTED!', '#7ee0ff', 1.1); Au.steal(); return; }
      if (v >= 1) { if (ps.to.state !== 'fall' && dist(ps.to, b) < 1.4) { G.give(ps.to); Au.click(); } else { b.state = 'loose'; b.vy = 0; } }
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
      case 'pass': p.anim = 'pass'; p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'steal': p.anim = 'steal'; if (p.dir === 'B') p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'shove': p.anim = 'shove'; p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'cheer': p.anim = 'cheer'; p.dir = 'F'; p.frame = (p.st * 8) % 4; return;
    }
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
