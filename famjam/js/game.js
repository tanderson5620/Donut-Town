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
  function top(p) { if (!p.topK) { var s = p.def.base || p.def.stats, m = 0; STATK.forEach(function (k) { m = Math.max(m, s[k] || 0); }); p.topK = STATK.filter(function (k) { return (s[k] || 0) >= m; }); } return p.topK; }
  function isGuy(p) { return !!(p && ((HW.FAMILY || {})[p.id] || {}).sex === 'm'); }
  function sig(p, k) { return !!(p && p.onFire && top(p).indexOf(k) >= 0); }
  G.sig = sig;
  // the bruisers: the Max Strength players and The Legend, the Battering Ram (their shoves, kicks, knees and arm bars)
  function brute(p) { return p.def.type === 'strength' || p.def.type === 'ram'; }
  G.brute = brute;
  function fireBurst(x, y, z, n) { X.flame(x, y, z, n, 0.6); }
  // every knockdown is a hard hit: a freeze-frame, a white impact ring and sparks, his head snaps back, the screen shakes and he's
  // launched backwards; when he slams into the floor: a cracked crater, dust, a second shake and blood where his head lands (more
  // when a stronger player did it). o: { hard (0.5 light .. 2 huge), fallT, blood, y (height of the hit) }
  G.knockDown = function (q, src, o) {
    o = o || {}; var hard = o.hard || 1;
    var dx = src ? q.x - src.x : -q.face, dz = src ? q.z - src.z : 0, d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (Math.abs(dx) < 0.35) dx = (dx < 0 ? -1 : 1) * 0.35;   // always some fling along the court so the fall reads
    q.state = 'fall'; q.st = 0; q.fallT = o.fallT || 1.3; q.dk = null; q.dunkFace = false; q.pending = null; q.dm = null;
    q.face = dx > 0 ? -1 : 1;                                   // he faces the hit and goes over backwards
    q.vx = dx * (3 + 2 * hard); q.vz = dz * (1.2 + hard); q.vy = Math.max(q.vy || 0, 1.2 + 2.2 * hard); if (q.y < 0.001) q.y = 0.001;
    q.hitT = 0.45; q.flash = 0.12; q.impact = { blood: o.blood || 0.7, hard: hard };
    var hx = src ? (o.onQ ? q.x + dx * 0.2 : (src.x + q.x) / 2) : q.x, hz = (src ? Math.min(src.z, q.z) : q.z) - 0.15, hy = o.y || q.y + 1.3;   // (onQ: the star on him, not between them - the flying knee stays in sight)
    X.ring(hx, hy, hz, 0.7 + 0.35 * hard); X.burst(hx, hy, hz, Math.round(10 + 8 * hard), ['#ffffff', '#ffe14d', '#ffb000'], 3 + 2 * hard, 0.35, 3);
    G.hitstop = Math.max(G.hitstop || 0, 0.05 + 0.035 * hard); X.shake = Math.max(X.shake, 0.5 + 0.3 * hard); Au.punch && Au.punch();
    if (hard >= 1.8 && isGuy(q)) Au.scream && Au.scream();   // sent flying 3+ m: he screams on the way
    if (isGuy(src) && !o.block) Au.trash && Au.trash();   // and the guy who did it talks trash now and then (not on a block)
    if (q && !isGuy(q)) Au.painF && Au.painF();   // a woman takes the hit with a pained grunt
  };
  // what the crowd yells when p flattens q: family trash talk when it fits (aunt/uncle on a niece/nephew and back, cousin on cousin,
  // brother or sister on a sibling, in-laws, anyone on someone who married in, a woman dropping a guy), mixed in with the plain
  // knockdown calls; never the same line twice in a row
  var lastLine = '', catchBag = {};
  // a grudge match (HW.RIVALS): the two of them call each other out by name - his line now (or d s from now), the comeback from the
  // floor a beat after it
  function rivalLine(p, q, d) {
    var R = HW.RIVALS || {}, e = R[p.id + '|' + q.id] || R[q.id + '|' + p.id]; if (!e) return null;
    var nm = function (o) { return (o.def.first || o.def.name).toUpperCase(); }, fill = function (l, me, them) { return l.replace(/\{them\}/g, nm(them)).replace(/\{me\}/g, nm(me)); };
    var fresh = e.hit.filter(function (l) { return fill(l, p, q) !== lastLine; }), line = fill(pick(fresh.length ? fresh : e.hit), p, q);
    if (e.back && e.back.length) (G.later = G.later || []).push({ at: G.t + (d || 0) + 1.1, text: fill(pick(e.back), q, p), color: q.def.color || '#ff8a5a' });
    return line;
  }
  // every other hit between them (a shove he stays up through, the arm bar's snap, a low blow) gets the same name-calling
  function grudge(p, q, d) {
    var rv = rivalLine(p, q, d); if (!rv) return; lastLine = rv;
    if (d) (G.later = G.later || []).push({ at: G.t + d, text: rv, color: '#ff8a5a' }); else G.say(rv, '#ff8a5a', 1.4);
  }
  function knockLine(p, q) {
    var rv = rivalLine(p, q); if (rv) return (lastLine = rv);
    var P = HW.PHRASES, F = HW.FAMILY || {}, a = F[p.id], b = F[q.id], fam = [];
    if (a && b && a.fam !== b.fam && !a.outside && !b.outside) {
      var rel = a.gen === 1 && b.gen === 2 ? (a.sex === 'f' ? P.aunt : P.uncle) : a.gen === 2 && b.gen === 1 ? (b.sex === 'f' ? P.toAunt : P.toUncle)
        : a.gen === 2 ? P.cousin : a.blood && b.blood ? P.sibling : P.inlaw;
      fam = fam.concat(rel, rel);   // listed twice: the family lines come up most
      if (!b.blood) fam = fam.concat(P.marriedIn);
    }
    if (a && b && a.sex === 'f' && b.sex === 'm') fam = fam.concat(P.girlBeatsGuy);
    var pool = fam.length && Math.random() < 0.75 ? fam : P.shove.concat(fam), line;
    for (var i = 0; i < 4; i++) { line = pick(pool); if (line !== lastLine) break; }
    var tk = HW.TAUNTS && HW.TAUNTS[line]; if (tk) p.taunt = { k: tk, t: 0 };   // and he lets them know it
    // a catchphrase (Kenny's HOOCHIE MAMA!, Lisa's WOOOO WEEEEEE!) replaces one taunt in every N, at a random spot in each run of N
    // (never two in a row across runs); the gesture the replaced line came with stays
    var cp = HW.CATCHPHRASE && HW.CATCHPHRASE[p.id];
    if (cp) {
      var N = cp.every, c = catchBag[p.id] || (catchBag[p.id] = { n: 0, at: Math.floor(Math.random() * N) });
      if (c.n++ === c.at) line = cp.line;
      if (c.n === N) { c.at = c.at === N - 1 ? 1 + Math.floor(Math.random() * (N - 1)) : Math.floor(Math.random() * N); c.n = 0; }
    }
    return (lastLine = line);
  }
  G.knockLine = knockLine;
  function slam(p) {   // he hits the floor
    var im = p.impact, hx = X.fallHeadX(p), cx = (p.x + hx) / 2; p.impact = null; p.st = Math.min(p.st, 0.36);   // his time on the floor starts now
    p.vx *= 0.15; p.vz *= 0.15;   // the slam kills his momentum: he stays on his crater
    X.crater(cx, p.z + 0.1, 0.5 + 0.2 * im.hard); X.burst(cx, 0.05, p.z - 0.1, 16, ['#c8a27a', '#a8845e', '#e6d2b0'], 2.5, 0.5, 6);
    X.blood(hx, p.z, im.blood); X.shake = Math.max(X.shake, 0.3 + 0.15 * im.hard); Au.land ? Au.land() : Au.thud();
    if (isGuy(p) && im.hard >= 1.3 && Math.random() < 0.4) Au.help && Au.help();   // flattened hard, he calls for help
  }

  /* ---------- players ---------- */
  function Player(id, team, slot, human) {
    var d = HW.PLAYERS[id], t = HW.TYPES[d.type], s = d.stats;
    this.id = id;
    // on fire his best 3 ratings jump to 10 (def.stats reads the boosted set while he's on fire, the real one otherwise)
    var self = this, base = d.stats, hot = {}, best = Object.keys(base).sort(function (a, b) { return base[b] - base[a]; }).slice(0, 3);
    Object.keys(base).forEach(function (k) { hot[k] = best.indexOf(k) >= 0 ? 10 : base[k]; });
    this.def = Object.create(d); this.def.base = base; this.def.hot = hot;
    Object.defineProperty(this.def, 'stats', { get: function () { return self.onFire ? hot : base; } }); this.team = team; this.slot = slot; this.human = !!human;
    Object.defineProperty(this, 'run', { get: function () { return 4.4 + 0.32 * self.def.stats.speed; } }); this.turboMult = t.turboMult + 0.05; this.drain = 30 * t.turboDrain;
    Object.defineProperty(this, 'jumpH', { get: function () { return 0.85 + 0.05 * self.def.stats.dunk + t.jumpBonus; } }); this.reach = d.height + 0.45;
    this.x = 0; this.z = 7; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.face = 1; this.dir = 'R';
    this.anim = 'idle'; this.frame = 0; this.state = 'idle'; this.st = 0; this.turbo = 100; this.turboOn = false;
    this.onFire = false; this.streak = 0; this.cd = { steal: 0, shove: 0, jump: 0, catch: 0, block: 0 }; this.flash = 0;
    this.stats = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ast: 0, dunks: 0, steals: 0, blocks: 0, shoves: 0 };
    this.ai = { t: 0, spot: null, spotT: 0, hold: 0 };
  }
  Player.prototype.grounded = function () { return this.y <= 0.001 && this.vy === 0; };
  Player.prototype.busy = function () { return this.state === 'cartwheel' || this.state === 'dougie' || this.state === 'armbar' || this.state === 'slam' || this.state === 'punched' || this.state === 'punching' || this.state === 'stepback' || this.state === 'shimmy' || this.state === 'hammer' || this.state === 'chase' || this.state === 'powerup' || this.state === 'fall' || this.state === 'dunk' || this.state === 'shoot' || this.state === 'shove' || this.state === 'pass'; };

  G.start = function (setup) {
    X.clearBlood(); if (X.clearFx) X.clearFx(); if (HW.Replay) HW.Replay.reset(); G.vic = false;
    if (HW.TOUCH && !G.tipShown) { G.tipShown = true; G.tipT = 1.2; }   // first game on a phone: show where turbo went
    G.setup = setup; G.players = []; G.diff = HW.DIFFICULTY[setup.diff || 'normal'];
    if (HW.Count) HW.Count.game(HW.Net && HW.Net.mode === 'guest');   // the anonymous play counter (count.js)
    QUARTER = setup.qlen || 60; OT = clamp(Math.round(QUARTER / 2), 30, 60);
    // online: everyone's game has the same players in the same order; `me` is the one this phone controls (the host's game also
    // runs the other people's players - js/net.js hands them over as each phone is ready)
    var me = setup.me || setup.human;
    setup.teams.forEach(function (ids, team) { ids.forEach(function (id, i) { var p = new Player(id, team, i, id === me); p.me = id === me; p.lbl = setup.humans ? setup.humans[id] || null : null; G.players.push(p); if (p.me) G.human = p; }); });
    G.pu = null; G.puQueue = null; G.cine = null; G.babaDone = false; G.inb = null;
    if (X.teamColors) X.teamColors([G.team(0).color, G.team(1).color]);   // the paint under each hoop in the two families' colors
    G.humanTeam = G.human.team; G.score = [0, 0]; G.q = 1; G.callouts = []; G.later = []; G.ball = { x: 0, y: 1, z: 7, vx: 0, vy: 0, vz: 0, state: 'loose', holder: null, visible: true, fire: false };
    G.beginQuarter();
  };
  // a team's name and colors: the family's, unless an online game teamed people up across the families (setup.names)
  // (setup.fams: which family plays on each side - three families, two in a game; older setups had side = family)
  G.fam = function (ti) { var f = G.setup && G.setup.fams; return f ? f[ti] : ti; };
  G.team = function (ti) { var o = G.setup && G.setup.names && G.setup.names[ti], t = HW.TEAMS[G.fam(ti)]; return o ? Object.assign({}, t, o) : t; };
  G.mates = function (p) { return G.players.filter(function (q) { return q.team === p.team && q !== p; }); };
  G.opps = function (p) { return G.players.filter(function (q) { return q.team !== p.team; }); };
  // sprites a game needs: its four players, plus anyone who walks on in one of their power-ups (Lisa, for Gator's)
  G.loadIds = function (teams) { var ids = teams[0].concat(teams[1]); ids.slice().forEach(function (id) { var c = HW.PLAYERS[id].cameo; if (c && HW.PLAYERS[c] && ids.indexOf(c) < 0) ids.push(c); }); return ids; };   // (a walk-on who isn't in the game yet - Ramsey's Austin - is left out)
  // Lisa in Gator's power-up (drawn by gfx in place of the real her, if she's playing): she comes in behind him, winds up slowly and
  // smacks it (her hand lands on the back of the booty: both sprites say where), smacks it 3 more times, then walks off
  function lisaFrame(t) {
    if (t < 0.75) return 0; if (t < 1.3) return 1; if (t < 1.85) return 2; if (t < 2.2) return 3; if (t < TW.hits[0]) return 4;   // the slow wind-up and swing
    for (var i = 0; i < TW.hits.length; i++) {
      var h = TW.hits[i], n = TW.hits[i + 1]; if (t >= h && t < h + 0.12) return 5; if (t >= h + 0.12 && t < h + 0.22) return 6;
      if (n && t >= n - 0.33 && t < n) return t < n - 0.22 ? 2 : t < n - 0.11 ? 3 : 4;   // the quick ones
    }
    return 7;
  }
  G.showCameo = function () {
    var sh = G.show; if (!sh || sh.kind !== 'pu' || sh.t >= sh.len) return null;
    var p = sh.p, id = p.def.cameo, f = p.face, t = sh.t; if (!id || !HW.PLAYERS[id] || !X.hasAnim({ id: id }, 'spank')) return null;   // (no walk-on yet: he twerks solo)
    var c = sh.cam;
    if (!c) {
      var b = X.animPoint(p.id, 'twerk_hit_hard', 0, 'butt') || X.animPoint(p.id, 'twerk_hit', 0, 'butt'), h = X.animPoint(id, 'spank', 5, 'hand'), gap = b && h ? h.x - b.x : 0.75;
      c = sh.cam = { id: id, def: HW.PLAYERS[id], y: 0, vy: 0, z: p.z - 0.06, dir: 'R', state: 'cameo', cameo: true, spot: p.x - f * gap, far: p.x - f * (gap + 2.8) };
    }
    if (t < TW.walk) { var u = t / TW.walk; c.x = c.far + (c.spot - c.far) * u * (2 - u); c.face = f; c.anim = 'run'; c.frame = (t * 14) % 8; }
    else if (t < TW.leave) { c.x = c.spot; c.face = f; c.anim = 'spank'; c.frame = lisaFrame(t); }
    else { var u2 = (t - TW.leave) / (TW.len - TW.leave); c.x = c.spot + (c.far - c.spot) * u2 * u2; c.face = -f; c.anim = 'run'; c.frame = (t * 14) % 8; }
    return c;
  };

  var WHISTLE_AT = 0.03;   // sfx/whistle_2k.mp3: the ref's blast (cut from the owner's 2K shot-clock clip) starts 0.03 s in
  // after a basket (or a shot-clock violation) nobody gets reset: the other team takes it out under the basket it was just scored on
  // and passes it in (phase 'inbound', G.inb), while the team that scored has to get back on D. The one nearest the baseline takes
  // it out (a computer player when he can, so you bring it up), walks out with it, and once he's there throws it in to his partner
  // (you: PASS calls for it, or it comes on its own). The clocks wait for the pass; he can't be stripped or shoved out there
  // after: the moment for the ball to drop and the call before it; hold: his moment at the spot; auto: a person taking it out has
  // this long to throw it in
  var INB = { after: 0.9, hold: 0.45, auto: 2.5, walk: 6.5 };
  // whose shot is up for this team right now (a jumper in the air or on its way, a layup or a dunk), if anyone's: his partner gets back
  G.shooterUp = function (team) {
    var b = G.ball, s = b.shotInfo;
    if (b.state === 'shot' && s && s.team === team) return s.by;
    if (b.holder && b.holder.team === team && (b.holder.state === 'dunk' || b.holder.state === 'shoot' || b.holder.state === 'stepback' || b.holder.state === 'cartwheel')) return b.holder;
    return null;
  };
  // the team's safety: the slower of the two (his real speed, not on fire), who has the farthest to make up getting back
  G.safetyOf = function (team) {
    var t = G.players.filter(function (q) { return q.team === team; }); if (t.length < 2) return null;
    var a = t[0].def.base.speed, c = t[1].def.base.speed; return a < c || a === c && t[0].slot < t[1].slot ? t[0] : t[1];
  };
  // who gets back right now: when a shot of this team's is up (or has just come off the rim), its safety - or, if he's the one who
  // shot, his partner
  G.backMan = function (team) {
    var b = G.ball, s = b.shotInfo, up = G.shooterUp(team) || (b.state === 'loose' && s && s.team === team ? s.by : null);
    if (!up) return null; var sf = G.safetyOf(team);
    return sf && sf !== up ? sf : G.mates(up)[0] || null;
  };
  G.startInbound = function (team) {
    var s = side(team), up = function (q) { return !(q.hurtT > 0) && !q.abBy; };
    var mine = G.players.filter(function (q) { return q.team === team && up(q); });
    if (mine.length < 2) { G.lineup(team, false); G.phase = 'play'; return; }   // (his partner's down from an arm bar: the old way)
    var bx = -s * (K.HL + 0.35);
    var inb = mine.slice().sort(function (a, c) { return (a.human - c.human) || Math.abs(a.x - bx) - Math.abs(c.x - bx); })[0], to = mine[0] === inb ? mine[1] : mine[0];
    G.players.forEach(function (p) { if (p.state === 'cheer') { p.state = 'idle'; p.st = 0; } });
    if (inb.state !== 'fall' && inb.state !== 'dunk') { inb.state = 'idle'; inb.st = 0; }
    G.give(inb); G.poss = team; G.shot = 24;
    G.inb = { p: inb, to: to, team: team, x: bx, z: K.HZ + (inb.z > K.HZ ? 2.4 : -2.4), t: 0, at: false, ht: 0 };
    G.phase = 'inbound';
  };
  function updateInbound(dt) {
    var ib = G.inb, p = ib.p;
    if (G.ball.holder !== p) { G.inb = null; G.phase = 'play'; return; }   // it's in (or it was taken off him somehow): play on
    ib.t += dt;
    if (p.state === 'fall' || p.state === 'dunk') return;   // (still getting up, or coming down off the rim)
    var dx = ib.x - p.x, dz = ib.z - p.z, d = Math.hypot(dx, dz);
    if (!ib.at && (d < 0.15 || ib.t > 3)) { ib.at = true; p.x = ib.x; p.z = ib.z; }
    if (!ib.at) { var v = Math.min(INB.walk, d * 6) / d; p.vx = dx * v; p.vz = dz * v; if (Math.abs(dx) > 0.2) p.face = dx > 0 ? 1 : -1; return; }
    p.vx = p.vz = 0; p.face = side(ib.team); ib.ht += dt;
    if (ib.ht >= (ib.ask ? 0.12 : p.human ? INB.auto : INB.hold)) G.inbPass();   // (asked for on the way out: in it goes as soon as he's squared up)
  }
  // in it goes: a plain chest pass to his partner (or he walks it in himself if his partner's on the floor)
  G.inbPass = function () {
    var ib = G.inb; if (!ib || G.ball.holder !== ib.p) return;
    if (!ib.at) { ib.ask = true; return; }   // not out on the baseline yet: PASS (his, or his partner calling for it) waits until he is
    var to = ib.to; if (!to || to.state === 'fall' || to.hurtT > 0) { G.inb = null; G.phase = 'play'; return; }
    ib.p.face = to.x >= ib.p.x ? 1 : -1; launchPass(ib.p, to, null); G.ball.pass.inb = true; G.inb = null; G.phase = 'play';   // (an inbound pass reaches him: see the catch)
  };
  G.beginQuarter = function () {
    G.clock = G.q > 4 ? OT : QUARTER; G.lineup(G.q % 2 === 1 ? G.humanTeam : 1 - G.humanTeam, true);
    G.phase = 'tip'; G.phaseT = 2.4; G.whistled = false; G.show = null; G.inb = null;
    var tws = twerkers(), tp = tws.length ? tws[(G.q - 1) % tws.length] : null; if (tp) { startShow(tp, 'solo', TW.quarter); G.phaseT += TW.extra; }   // a twerker twerks before every tip-off (two of them in a game: they take turns)
    if (G.q >= 4) Au.sfx && Au.sfx(G.q > 4 ? 'overtime' : 'final_round'); G.say(G.q > 4 ? 'OVERTIME!' : ['1ST QUARTER', '2ND QUARTER', '3RD QUARTER', '4TH QUARTER'][G.q - 1], '#fff', 2);
  };
  // set everyone up with `team` bringing the ball up from its own end
  G.lineup = function (team, center) {
    // a man down from an arm bar stays down where he lies (a hold still going finishes now); everyone else lines up
    G.players.forEach(function (p) { if (p.state === 'armbar' && p.ab) { if (!p.ab.snap) snapArm(p); if (p.ab.q.abBy === p) p.ab.q.abBy = null; p.ab = null; } });
    if (G.cine && (G.cine.kind === 'armbar' || G.cine.kind === 'kick' || G.cine.kind === 'chase')) G.cine = null;
    var down = function (p) { return p.hurtT > 0; };
    var s = side(team), off = G.players.filter(function (p) { return p.team === team && !down(p); }), def = G.players.filter(function (p) { return p.team !== team && !down(p); });
    if (!off.length) { off = G.players.filter(function (p) { return p.team === team; }); off.forEach(function (p) { p.hurtT = 0; p.abBy = null; }); }   // nobody left to bring it up: he shakes it off
    G.players.forEach(function (p) { if (down(p)) return; p.vx = p.vz = p.vy = 0; p.y = 0; p.state = 'idle'; p.st = 0; p.flash = 0; p.pending = null; p.dm = null; p.trail = null; p.slam = null; p.slammed = false; p.impact = null; p.hitT = 0; p.tongue = false; p.dunkFace = false; p.jamArm = null; p.kick = null; p.nut = false; p.nutAt = null; if (!p.onFire) p.ssj = 0; });
    var hand = off.slice().sort(function (a, b) { return (b.human - a.human) || (b.def.type === 'handler') - (a.def.type === 'handler'); })[0];
    var bx = center ? -s * 1.5 : -s * 8.5;
    hand.x = bx; hand.z = 7; off.forEach(function (p) { if (p !== hand) { p.x = bx + s * 3.5; p.z = 3; } });
    def.forEach(function (p, i) { p.x = bx + s * (center ? 3.2 : 4.5); p.z = i ? 10 : 5; });
    G.players.forEach(function (p) { if (!down(p)) p.face = p.team === team ? s : -s; });
    G.give(hand); G.poss = team; G.shot = 24; X.camX = X.camClamp(bx);
  };

  /* ---------- ball ---------- */
  G.give = function (p) {
    var b = G.ball, prev = G.poss;
    if (b.holder && b.holder !== p) b.holder.hasBall = false;
    b.holder = p; p.hasBall = true; b.state = 'held'; b.shotInfo = null; b.pass = null; b.vx = b.vy = b.vz = 0; p.assist = null;
    if (prev !== p.team) {
      G.poss = p.team; G.shot = 24;
      // the visitors bring it up: now and then the home crowd chants DE-FENSE! (about 1 possession in 4, at most every 25 s)
      if (p.team !== G.humanTeam && (G.phase === 'play' || G.phase === 'inbound') && G.t - (G.defT || -99) > 25 && Math.random() < 0.25) { G.defT = G.t; Au.defense && Au.defense(); }
    }
    p.ai.hold = 0; p.dribT = 0;
  };
  G.drop = function (p, vx, vy, vz) {
    var b = G.ball; if (b.holder !== p) return; p.hasBall = false; b.holder = null; b.state = 'loose'; b.vx = vx; b.vy = vy; b.vz = vz; b.noCatch = 0.3; b.last = p;
  };
  function ballAtHolder(p, dt) {
    var b = G.ball;
    if (p.state === 'dunk' && p.dk && p.dk.style) {
      var k = p.dk, u = p.st / k.T, rx = rimX(p.team), sd = side(p.team), hand = null, lerp = function (a, c, f) { f = Math.max(0, Math.min(1, f)); f = f * f * (3 - 2 * f); return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f }; };
      var swap = k.style === 'legs' || k.style === 'btb', left = swap && u > 0.42;   // passed to the other hand under the leg / behind the back
      if (k.style === 'jam' && p.jamArm) { b.x = p.jamArm.x; b.y = p.jamArm.y; b.z = p.jamArm.z; return; }
      // the reverses and the far-hand layups carry the ball in their frames (rendered with him): ours stays hidden but right where it is
      // drawn, so it leaves his hand from exactly there
      if (k.lay || k.style === 'both') { var rw = X.ballWorld(p); if (rw) { b.x = rw.x; b.y = Math.max(0.2, rw.y); b.z = p.z - 0.2; b.baked = rw.baked && u < DUNK_SLAM; b.inFront = !b.baked; return; } }   // (over his face or up over his head we draw it, on top)
      if (k.style === 'board' && u > 0.14 && u < 0.5) {   // tossed off the glass and back to himself (slow motion, the camera on the ball)
        if (!k.toss) k.toss = { x: b.x, y: b.y };   // it leaves from right where his hand had it
        var bd = { x: rx + sd * 0.45, y: 3.5 }, f1 = Math.min(1, (u - 0.14) / 0.16), f2 = Math.min(1, Math.max(0, (u - 0.3) / 0.2)); hand = X.handWorld(p) || { x: p.x, y: p.y + 2 };
        // up into the glass at speed (a little arc), off it and back down into his hand; spinning, the spin flipping on the bounce
        if (u < 0.3) { b.x = k.toss.x + (bd.x - k.toss.x) * f1; b.y = k.toss.y + (bd.y - k.toss.y) * f1 + 0.3 * 4 * f1 * (1 - f1); }
        else { if (!k.boardHit) { k.boardHit = true; Au.board(); } var f3 = f2 * (2 - f2); b.x = bd.x + (hand.x - bd.x) * f3; b.y = bd.y + (hand.y - bd.y) * f3; }
        b.z = k.z1; b.vx = 0; b.spin = ((b.spin || 0) + dt * (u < 0.3 ? 16 : -16) + 6.283) % 6.283; return;
      }
      if (k.style === 'bounce' && u < 0.46) {   // slammed into the floor ahead and caught on the way up
        var fl = { x: k.x0 + (k.x1 - k.x0) * 0.45, y: 0.12 }, h0 = { x: k.x0 + sd * 0.4, y: 1.1 }; hand = X.handWorld(p) || { x: p.x, y: p.y + 2 };
        var pb = u < 0.14 ? lerp(h0, fl, u / 0.14) : lerp(fl, hand, (u - 0.14) / 0.32); b.x = pb.x; b.y = pb.y; b.z = p.z - 0.2; return;
      }
      if (swap) {
        // his near hand (the sprite's right, the side facing you) hands it to his far one, under the leg or round his back
        var rh = X.handWorld(p, false), lh = X.handWorld(p, true), f = Math.max(0, Math.min(1, (u - 0.36) / 0.08)); f = f * f * (3 - 2 * f);
        if (rh && lh) {
          b.x = rh.x + (lh.x - rh.x) * f; b.y = Math.max(0.2, rh.y + (lh.y - rh.y) * f); b.z = p.z - 0.2;
          // under the legs: the dunk's own frames carry the ball, rendered in 3D with him so his legs hide it right - ours stays out of
          // sight until the slam. Behind the back: round his back, then in his far hand on the far side of him
          if (k.style === 'legs' && X.hasAnim(p, 'dk_legs')) b.baked = u < DUNK_SLAM; else b.behind = u > 0.22;
          return;
        }
      }
      hand = X.handWorld(p, left); if (hand) { b.x = hand.x; b.y = Math.max(0.2, hand.y + (k.lay === 'roll' && u > 0.3 ? 0.13 : 0)); b.z = p.z - 0.2; return; }
    }
    if (p.state === 'chase') { var ch = X.handWorld(p); if (ch) { b.x = ch.x + p.face * 0.1; b.y = ch.y + 0.05; b.z = p.z - 0.25; b.inFront = true; return; } }   // pinned to the glass in his hand
    if (G.show && G.show.p === p && G.show.t < G.show.len) { b.x = p.x + p.face * 0.6; b.y = 0.15; b.z = p.z - 0.3; return; }   // set down for the twerk
    if (p.state === 'cartwheel' || (p.state === 'shoot' && p.cart)) { var cw = X.ballWorld(p); if (cw) { b.x = cw.x; b.y = Math.max(0.2, cw.y); b.z = p.z - 0.2; b.baked = cw.baked; b.inFront = !cw.baked; return; } }
    if (p.state === 'stepback') { var hs = X.handWorld(p); b.x = hs ? hs.x : p.x + p.face * 0.3; b.y = hs ? Math.max(0.2, hs.y) : p.y + 1.1; b.z = p.z - 0.25; return; }
    if (p.state === 'shoot' && p.anim === 'shoot_steph') {   // (the one-motion lift: in his hands from the hip up to the set point)
      var sa = X.handWorld(p, false), sc = X.handWorld(p, true); if (sa && sc) { b.x = (sa.x + sc.x) / 2; b.y = Math.max(0.3, (sa.y + sc.y) / 2 + 0.06); b.z = p.z - 0.2; return; }
    }
    if (p.state === 'shoot' || p.state === 'dunk') { b.x = p.x + p.face * 0.12; b.y = p.y + p.def.height + 0.2; b.z = p.z - 0.15; return; }
    if (p.state === 'pass' && p.pending) { var hw = X.handWorld(p); if (hw) { b.x = hw.x; b.y = Math.max(0.15, hw.y); b.z = p.z - 0.25; } return; }   // in his hand through a fancy pass
    if (p.state === 'pass' || p.state === 'fall') return;
    // game over: he stops dribbling and just holds it in his hand (up in the air if he's celebrating), no more bounces
    if (G.phase === 'over') { var hh = X.handWorld(p); b.x = hh ? hh.x : p.x + p.face * 0.35; b.y = hh ? Math.max(0.2, hh.y) : p.y + 1.0; b.z = p.z - 0.25; p.dm = null; return; }
    var dm = p.dm;
    if (dm) {
      // crossover (low across the front) or behind-the-back (behind him): one bounce from the old side to the new one
      var u = Math.min(1, dm.t / dm.dur), e = u * u * (3 - 2 * u), sd = dm.from + (p.face - dm.from) * e;
      b.x = p.x + sd * 0.42 + p.vx * 0.05; b.y = 0.15 + 0.78 * Math.abs(Math.cos(Math.PI * u)); b.z = dm.type === 'btb' ? p.z + 0.28 : p.z - 0.42 + p.vz / G.ZS * 0.075;
      if (u >= 0.5 && !dm.hit) { dm.hit = true; (Au.dribble || Au.bounce)(4); }
      return;
    }
    p.dribT = (p.dribT || 0) + dt * (2.3 + Math.hypot(p.vx, p.vz) * 0.12);
    // the bounce follows his dribbling hand: ball at the top when the hand is up, on the floor (and the thump) when it's pushed down.
    // dribble: one bounce per loop, hand highest at a quarter; drun: two bounces per stride loop, hand highest at 1/8 and 5/8
    var an = (p.anim || '').replace('_buff', ''), ph = an === 'dribble' ? (p.frame / 6 + 0.325) % 1 : an === 'drun' ? (p.frame / 8 * 2 + 0.25) % 1 : p.dribT % 1;
    var h = 0.95 * Math.abs(Math.sin(Math.PI * ph));
    if (ph < (p.prevPh || 0) && (p.prevPh || 0) - ph > 0.5) (Au.dribble || Au.bounce)(3 + Math.hypot(p.vx, p.vz) * 0.2);
    p.prevPh = ph;
    b.x = p.x + p.face * 0.42 + p.vx * 0.05; b.z = p.z - 0.3 + p.vz / G.ZS * 0.075; b.y = 0.14 + h;
  }

  /* ---------- actions ---------- */
  function threeFrom(p, at) { at = at || p; var d = Math.hypot(at.x - rimX(p.team), at.z - K.HZ); return d > K.R3 - 0.1 && Math.abs(at.z - K.HZ) < 6.2 || d > K.R3 + 0.3; }
  // a three is a three by where he left the floor (where he started a cartwheel), not where he let go - he can drift in the air, so
  // rising from behind the line and letting go inside it still counts 3, and a fadeaway from inside it that drifts out is still a 2
  function takeoff(p) { return p.state !== 'shoot' ? p : p.cart && p.cartFrom || p.shotFrom || p; }
  // how long after the press the top of his jump shot comes: the green window is timed from the press, whatever he does first
  G.shotApex = function (p) { return Math.sqrt(2 * GRAV * p.jumpH * 0.9) / GRAV; };
  // the 3-point shooters' quick release (Steph Curry's one-motion shot): their sweet spot comes on the way up, QUICK of the way to the
  // top of the jump (everyone else's is the top), so their green window starts right by the start of the shot meter - and the
  // computer's shooters let it go there, before a man closing out can get a hand up
  var QUICK = 0.45, QR_NEAR = 0.8, QR_U = 0.2;   // (and see the blocks: a quick release is gone before a man can close out on it)
  G.relFrac = function (p) { return p.def.type === 'shooter' ? QUICK : 1; };
  // the green window, as a share of that time either side of the top: wider for better shooters, and half again more (x1.6) for a
  // 3-point shooter's three (by where he took off); ok out to 2.5 times it, bad beyond. The game judges the release and the shot meter
  // draws its zones from this, so what you see is what counts
  G.shotWin = function (p) {
    return 0.16 * (1 + (p.def.stats.tp - 5) * 0.06) * (threeFrom(p, takeoff(p)) && p.def.type === 'shooter' ? 1.6 : 1);
  };
  G.startShot = function (p) {
    if (!p.hasBall || !p.grounded() || p.busy()) return;
    // the shot clock starts on the press (a step-back or cartwheel first doesn't move the window): p.sht runs until he lets go
    if (!p.sbGo && !p.cartGo) { p.sht = 0; p.relPress = null; p.tApex = G.shotApex(p); }
    var rx0 = rimX(p.team), dx0 = rx0 - p.x, dz0 = K.HZ - p.z, dd0 = Math.hypot(dx0, dz0) || 1, ux = dx0 / dd0, uz = dz0 / dd0;
    var along = p.vx * ux + p.vz * uz, across = Math.abs(p.vz * ux - p.vx * uz);
    // a 3-point shooter pulling up from deep while moving side to side (across the line to the rim): the Harden step-back first -
    // gather the dribble, hop back off his man, land square, then rise into the shot
    if (!p.sbGo && p.def.type === 'shooter' && threeFrom(p) && across > 1.5 && across > Math.abs(along)) {
      p.state = 'stepback'; p.st = 0; p.sb = { ux: ux, uz: uz }; p.sbRel = false; p.face = side(p.team); p.dm = null; (Au.dribble || Au.bounce)(5); return;
    }
    // now and then (CART_P, 1 in 20 of their other threes) a 3-point shooter cartwheels off away from the rim first, one-handed, then
    // chucks it one-handed - and it's money: nobody can steal it, shove him, contest it or block it, and it always goes in
    if (!p.sbGo && !p.cartGo && p.def.type === 'shooter' && threeFrom(p) && -along <= 1.0 && X.hasAnim(p, 'cartwheel') && Math.random() < CART_P) {
      p.state = 'cartwheel'; p.st = 0; p.cartFrom = { x: p.x, z: p.z }; p.sbRel = false; p.face = -side(p.team); p.vx = p.vz = 0; p.dm = null; Au.whoosh(5); return;
    }
    p.cart = !!p.cartGo;
    p.state = 'shoot'; p.st = 0; p.vy = Math.sqrt(2 * GRAV * p.jumpH * 0.9); p.y = 0.001; p.released = false; p.tApex = p.vy / GRAV; p.stepT = !!p.sbGo; p.kick = null; p.kickRoll = false;
    // a 3-point shooter pulling up while moving away from the basket shoots a fadeaway: leaning back, knee kicked out, drifting away;
    // running at it, the one-foot three (LaMelo style): off one foot, the other knee driving up, carried a little forward by his run -
    // a three like any other (the odds from where he took off)
    p.fade = p.def.type === 'shooter' && !p.sbGo && -along > 1.0;
    p.onefoot = p.def.type === 'shooter' && !p.sbGo && !p.cartGo && along > 1.0 && threeFrom(p) && X.hasAnim(p, 'shoot_onefoot');
    p.shotFrom = { x: p.x, z: p.z };
    p.face = side(p.team); Au.jump();
  };
  // the cartwheel: 0.8 s round the wheel and about 1.7 m away from the rim (the frames turn him back toward it at the end), then the
  // one-handed chuck. Let go of SHOOT during it and the shot goes up on its own, like after the step-back (judged on when he let go)
  var CART_P = 0.05, CW_T = 0.8;
  function cartwheel(p, dt) {
    p.face = -side(p.team); p.vx = p.st < 0.72 * CW_T ? p.face * 2.6 : 0; p.vz = 0; p.vy = 0; p.y = 0;
    p.x = clamp(p.x + p.vx * dt, -K.HL - 0.6, K.HL + 0.6);
    if (p.st >= CW_T) {
      p.state = 'idle'; p.vx = 0; p.cartGo = true; G.startShot(p); p.cartGo = false;
      if (p.state === 'shoot' && p.sbRel) p.sbAuto = true;
      p.sbRel = false;
    }
  }
  // the step-back: gather (0-0.08 s), the hop back (0.08-0.28, ~0.7 m and a little air), land square, then the jump shot at 0.34 s.
  // Let go of SHOOT during it and the shot goes up on its own at the top of the jump, judged on when he let go (timed from the press,
  // the same as any jump shot: the green window doesn't wait for the move)
  var SB_T = 0.34;
  function stepback(p, dt) {
    var t = p.st, hop = t > 0.08 && t < 0.28, sb = p.sb;
    p.vx = hop ? -sb.ux * 3.6 : 0; p.vz = hop ? -sb.uz * 3.6 : 0; p.vy = 0;
    p.x = clamp(p.x + p.vx * dt, -K.HL - 0.6, K.HL + 0.6); p.z = clamp(p.z + p.vz * dt, 0.3, K.CD - 0.3);
    p.y = hop ? 0.16 * Math.sin(Math.PI * (t - 0.08) / 0.2) : 0;
    if (t >= SB_T) {
      p.state = 'idle'; p.y = 0; p.vx = p.vz = 0; p.sbGo = true; G.startShot(p); p.sbGo = false;
      if (p.state === 'shoot' && p.sbRel) p.sbAuto = true;
      p.sbRel = false;
    }
  }
  G.releaseShot = function (p) {
    if (p.state !== 'shoot' || p.released || !p.hasBall) return;
    p.released = true; p.st2 = 0;
    // (after a cartwheel the odds are the ones from where he started it; 3 or 2 goes by where he took off)
    var b = G.ball, rx = rimX(p.team), sp = p.cart && p.cartFrom || p.onefoot && p.shotFrom || p, d = Math.hypot(sp.x - rx, sp.z - K.HZ), tk = takeoff(p), three = threeFrom(p, tk);
    var s = p.def.stats, pm;
    if (three) pm = 0.11 + 0.05 * s.tp; else if (d > 4.5) pm = 0.34 + 0.035 * s.tp; else if (d > 2.2) pm = 0.48 + 0.025 * Math.max(s.tp, s.dunk); else pm = 0.68 + 0.02 * s.dunk;
    // release timing, from the press of SHOOT: the top of a jump shot is the sweet spot (wider for shooters from deep), and a step-back
    // or cartwheel first doesn't move it. Online, a guest's release is timed on his own phone, press to let-go (p.relPress)
    var rst = p.relPress != null ? p.relPress : p.sht != null ? p.sht : p.st; p.relPress = null; p.sht = null; p.sbAuto = false;
    var off = Math.abs(rst - p.tApex * G.relFrac(p)) / p.tApex, win = G.shotWin(p), quality = off < win ? 'green' : off < win * 2.5 ? 'ok' : 'bad';
    if (!p.human) quality = Math.random() < (G.diff.green != null ? G.diff.green : 0.35) ? 'green' : 'ok';   // the computer's timing: 40 / 60 / 80% green by difficulty
    if (sig(p, 'tp')) quality = 'green';   // a shooter on fire can't miss the window
    if (quality === 'green') pm += 0.28; else if (quality === 'bad') pm *= 0.55;
    var c = contest(p); pm -= c;
    if (!p.human) pm *= G.diff.shoot;
    // range: a three from just behind the arc is fine, from way out it falls off fast - about 1 in 5 for a great shooter's green from
    // half court, next to nothing from his own end (it used to be the same odds from anywhere, so a shooter could backpedal and fire
    // full-court threes nobody could contest). On fire buys a little more range, not all of it
    var deep = Math.max(0, d - (K.R3 + 1.0)), deepF = Math.exp(-0.42 * deep); pm *= deepF;
    if (p.onFire) pm = Math.max(pm, (sig(p, 'tp') ? 0.99 : 0.94) * Math.exp(-0.3 * Math.max(0, d - (K.R3 + 2.5))));
    pm = clamp(pm, deep > 3 ? 0.005 : 0.04, 0.97);
    var make = p.cart || !!p.kick || Math.random() < pm;   // (the cartwheel three and the low blow always go in)
    if (p.def.type === 'ram') make = false;   // The Legend, the Battering Ram, never makes one
    // a 3-point shooter who knows it's good does a shoulder shimmy once he lands, about 2 in 10 of his made threes
    p.shimmy = make && three && p.def.type === 'shooter' && Math.random() < 0.2;
    p.hasBall = false; b.holder = null; b.state = 'shot'; b.last = p;
    b.shotInfo = { by: p, team: p.team, three: three, sb: !!p.stepT, cw: !!p.cart, of: !!p.onefoot, sure: !!(p.cart || p.stepT || p.kick), make: make, quality: quality, dist: Math.hypot(tk.x - rx, tk.z - K.HZ), t: 0, T: 0.7 + d * 0.055, x0: b.x, y0: b.y, z0: b.z, rx: rx, arc: 1.4 + d * 0.13, missX: rand(-0.35, 0.35), missZ: rand(-0.3, 0.3) };
    p.stats.fga++; if (three) p.stats.tpa++;
    // the quick release gets it off before anyone can close the space: only a man right in his face (within QR_NEAR, chest to chest)
    // as it leaves his hands gets a try at blocking it, and only right then (the first QR_U of its flight) - nobody else gets there in
    // time to try (it used to be anyone in the air near the ball for the first half of its flight)
    if (G.relFrac(p) < 1 && !b.shotInfo.sure) b.shotInfo.near = G.opps(p).filter(function (q) { return q.state !== 'fall' && dist(p, q) < QR_NEAR; });
    if (p.human && quality === 'green') G.say('GREEN!', '#5cff7a', 0.7, 0.6);
    Au.whoosh(6);
  };
  // a shooter in his move: the step-back (it makes space: no steal on the way, no contest, no block) and the cartwheel (all that, and
  // it always goes in) - from the press of SHOOT until the ball's gone
  function guarded(h) { return !!h && (h.state === 'cartwheel' || h.state === 'stepback' || h.state === 'shoot' && !h.released && (h.cart || h.stepT || h.kick) || !!G.inb && G.inb.p === h); }
  G.guarded = guarded;
  function contest(p) {
    if (p.cart) return 0;
    var c = 0; G.opps(p).forEach(function (q) { var d = dist(p, q); if (d < 1.6 && q.state !== 'fall') c = Math.max(c, (1.6 - d) / 1.6 * (q.y > 0.25 ? 0.32 : 0.16) * (0.7 + q.def.stats.block / 20)); });
    return p.stepT ? c * 0.5 : c;   // (the step-back: still unblockable, but a hand in his face counts half)
  }
  // the low blow: a 3-point shooter going up with a man on him (in front, close enough to contest it) kicks his near leg out straight
  // into the man's crotch, 1 in 50 of those jump shots (KICK_P). Just off the floor, so the foot lands at crotch height; the shot always
  // goes in and can't be touched; his man is down for 5 s (KICK_HURT: on his knees, then on his back clutching it, a countdown over
  // him) - and the game doesn't stop: 1 s of slow motion (KICK_SLOW: 0.4 s of play) from the kick, the camera in close on the two of
  // them, then on at full speed
  var KICK_P = 1 / 50, KICK_HURT = 5, KICK_HIT = 0.04, KICK_REACH = 0.85, KICK_SLOW = 0.4, KICK_RT = 1.0;
  function kickSpot(p) { return p.x + p.face * (KICK_REACH * p.def.height / 1.89 + 0.1); }   // where his man's middle goes for the foot to land
  function tryKick(p) {
    if (p.def.type !== 'shooter' || p.cart || p.stepT || !p.hasBall || G.phase !== 'play' || G.cine || G.pu || G.show || !X.hasAnim(p, 'shoot_kick')) return;
    var q = null, bd = 1.6;
    G.opps(p).forEach(function (o) { var d = dist(p, o); if (d < bd && o.state !== 'fall' && o.state !== 'dunk' && !(o.hurtT > 0) && (o.x - p.x) * p.face > 0.15 && Math.abs(o.z - p.z) < 1.3 && X.hasAnim(o, 'nutted')) { bd = d; q = o; } });
    if (!q || Math.random() >= (G.kickP != null ? G.kickP : KICK_P)) return;
    p.kick = { q: q, t: 0, hit: false, x0: q.x, z0: q.z };
    q.state = 'fall'; q.st = 0; q.fallT = 99; q.hurtT = KICK_HURT; q.nut = true; q.nutAt = null; q.abBy = null; q.vx = q.vz = 0;
    q.dk = null; q.pending = null; q.dm = null; q.dunkFace = false; q.tongue = false; q.face = -p.face;
    G.cine = { p: p, q: q, t: 0, dur: KICK_RT, kind: 'kick', slow: KICK_SLOW };
    hl('knock', p, 'LOW BLOW');
  }
  function updateKick(p, dt) {
    var k = p.kick, q = k.q;
    if (p.state !== 'shoot') { if (!k.hit) landKick(p); p.kick = null; return; }   // down (or out of the shot with a pass): his man stays down
    k.t += dt;
    if (!k.hit) {   // his man is drawn in to the foot as it comes out (just behind him, so the foot shows on top)
      var e = Math.min(1, k.t / KICK_HIT); q.x = clamp(k.x0 + (kickSpot(p) - k.x0) * e, -K.HL - 0.6, K.HL + 0.6); q.z = clamp(k.z0 + (p.z + 0.06 - k.z0) * e, 0.3, K.CD - 0.3);
      if (k.t >= KICK_HIT) landKick(p);
    }
  }
  function landKick(p) {
    var k = p.kick, q = k.q; k.hit = true; q.nutAt = q.st;
    var ex = q.x - q.face * 0.12; X.burst(ex, 0.85, q.z - 0.2, 22, ['#ffffff', '#ffe14d', '#ff5a4a'], 4, 0.5, 3); X.shake = Math.max(X.shake, 0.9);
    Au.punch && Au.punch(); if (isGuy(q)) Au.help && Au.help(); else Au.painF && Au.painF();
    if (G.cine && G.cine.kind === 'kick') G.cine.say = true; else G.say('LOW BLOW!', '#ff5a4a', 1.4, 1.3);   // (the call comes as the camera pulls back out: nothing over the close-up)
    grudge(p, q, (G.cine && G.cine.kind === 'kick' ? G.cine.dur - G.cine.t : 0) + 0.5);
  }

  // coming in from the baseline: off to the side of the rim, even with it or behind it, or at most a little out in front (60 degrees or
  // more off the line down the middle of the court)
  function baseSpot(p) { var bdx = (rimX(p.team) - p.x) * side(p.team), bdz = Math.abs(p.z - K.HZ); return bdz > 0.6 && Math.atan2(bdz, bdx) >= Math.PI / 3; }
  var BASE_REACH = 4.5, DUNK_BUF = 0.45;
  G.dunkReach = function (p) {
    var t = HW.TYPES[p.def.type], reach = 2.1 + 0.22 * p.def.stats.dunk + t.dunkRange; if (sig(p, 'dunk')) reach = Math.max(reach + 2.5, K.R3 + 1.6);   // a dunker on fire takes off from way out, past the 3-point line
    // a point guard running the baseline can go up for the reverse from about the block (4.5 m): running up or down the court is
    // quick, and at the usual 2.6-2.9 m he was through the window in a third of a second
    if (p.def.type === 'handler' && baseSpot(p) && X.hasAnim(p, 'dk_rev')) reach = Math.max(reach, BASE_REACH);
    return reach;
  };
  G.canDunk = function (p) {
    var d = Math.hypot(p.x - rimX(p.team), p.z - K.HZ);
    return p.hasBall && p.grounded() && !p.busy() && d < G.dunkReach(p) && d > 0.25 && p.def.type !== 'ram';   // (The Legend never dunks)
  };
  G.startDunk = function (p) {
    var rx = rimX(p.team), s = side(p.team), dk = p.def.stats.dunk;
    // big arcade hang time: the slam comes two thirds of the way through, so a defender who meets him in the air can reject it
    p.state = 'dunk'; p.st = 0; var fd = sig(p, 'dunk');
    p.dk = { T: 1.05 + (dk >= 9 ? 0.25 : 0) + (p.onFire ? 0.15 : 0) + (fd ? 0.25 : 0), x0: p.x, z0: p.z, x1: rx - s * 0.5, z1: K.HZ + 0.05, peak: 1.0 + dk * 0.08 + (p.onFire ? 0.3 : 0) + (fd ? 0.2 : 0), slam: false, spin: fd || (dk >= 8 && Math.random() < 0.5) };
    // DUNK 9+ (on fire counts): a signature dunk, same timing and block window as any dunk. From way out: the free-throw-line dunk
    // (tongue out) or the stretched arm; closer: off the backboard, the double-biceps flex or a bounce to himself; from anywhere:
    // under the legs (in slow motion, the camera in close on the whole move so you see the ball go under), behind the back, a flip
    // the dunkers go off the glass a bit more often: 1 in 4 of their close signature dunks instead of 1 in 6
    // the Ball Handlers (speed) mix layups in with their dunks (half their drives): the same glide, hang time and block window as a
    // dunk, the ball leaving his hand right where a dunk would slam. Always the outside hand: on the near half of the court (z below the
    // rim's, nearer you) his near hand, on the far half his far hand (the *2 frames, mirrored). About 3 in 10 a slow-motion finger roll
    // (the ball rolls off his fingertips up to twice the rim's height, the camera riding up with it), 3 in 10 a slow-motion reverse: up
    // on his side with the ball in that hand, under the rim to the other side, the ball switching hands right as his body crosses the
    // middle of the basket (z = HZ), laid in with the other hand just under the rim
    // Coming in from the baseline (off to the side of the rim, even with it or behind it, or at most a little out in front: 60 degrees
    // or more off the line down the middle of the court) it's the reverse every time - under the rim and up the other side
    var baseline = baseSpot(p);
    if (p.def.type === 'handler' && X.hasAnim(p, 'dk_lay') && (baseline || Math.random() < 0.5)) {
      var lr = Math.random(), lb0 = baseline ? 'rev' : lr < 0.3 ? 'roll' : lr < 0.6 ? 'rev' : 'lay', farS = p.z > K.HZ, ls = lb0 + (farS ? '2' : '');
      if (!X.hasAnim(p, 'dk_' + ls)) { lb0 = 'lay'; ls = 'lay'; }
      p.dk.style = ls; p.dk.lay = lb0; p.dk.spin = false; p.dk.peak = lb0 === 'roll' ? 0.95 : 0.8;
      // (he ends just under the rim on the other side, and the ball goes up off that side of the glass and in: up in front of his face
      // when that's the near side, behind his head on the far side)
      if (lb0 === 'rev') { var sg = farS ? -1 : 1; p.dk.x1 = rx - s * 0.15; p.dk.zA = K.HZ - sg * 0.55; p.dk.z1 = K.HZ + sg * 0.55; }
      else { p.dk.x1 = rx - s * (lb0 === 'roll' ? 0.75 : 0.85); p.dk.z1 = K.HZ + (farS ? 0.3 : -0.3); }   // stays on his side of the rim
      if (lb0 === 'rev') G.cine = { p: p, t: 0, dur: p.dk.T, kind: 'rev', slow: 1 };   // regular speed: about 1 s from takeoff to the ball through the net
      if (lb0 === 'roll') G.cine = { p: p, t: 0, dur: p.dk.T, kind: 'roll', slow: 1 };   // full speed: the camera rides up with the ball, 1 s up and in
    } else if (dk >= 9) { var far = Math.abs(p.x - rx) > 4.2; p.dk.style = !far && p.def.type === 'dunker' && Math.random() < 0.1 ? 'board' : pick(far ? ['mj', 'jam', 'legs', 'both', 'btb', 'flip'] : ['legs', 'both', 'btb', 'board', 'flip', 'flex', 'bounce']); p.dk.spin = false;
      if (p.dk.style === 'both' && !X.hasAnim(p, 'dk_both')) p.dk.style = 'legs';
      if (p.dk.style === 'mj') p.tongue = true;
      var slo = p.dk.style === 'legs' || p.dk.style === 'both';   // under the legs, under both legs
      if (slo) G.cine = { p: p, t: 0, dur: p.dk.T, kind: p.dk.style, slow: DUNK_SLAM * p.dk.T / 2.5 };   // 2.5 s of slow motion up to the slam
      if ((slo || p.dk.style === 'board') && HW.DUNK_FACE && HW.DUNK_FACE[p.id]) p.dunkFace = true;   // his slow-motion dunk face, until he lands
      if (p.dk.style === 'board') G.cine = { p: p, t: 0, dur: p.dk.T, kind: 'board', slow: 0.36 * p.dk.T / 2.5 }; }   // the toss off the glass and back (u 0.14-0.5) takes 2.5 s
    // from way out (a dunker on fire every time, otherwise now and then) a guy on defense yells "incoming!"
    if (Math.hypot(p.x - rx, p.z - K.HZ) > 4.5 && (fd || Math.random() < 0.3) && G.opps(p).some(isGuy)) Au.incoming && Au.incoming();
    // taking off from behind the 3-point line (same line as a jump shot; only a dunker on fire gets out there) makes it a 3-point dunk
    var d0 = Math.hypot(p.x - rx, p.z - K.HZ); p.dk.three = d0 > K.R3 - 0.1 && Math.abs(p.z - K.HZ) < 6.2 || d0 > K.R3 + 0.3;
    p.face = s; p.stats.fga++; if (p.dk.three) p.stats.tpa++; if (isGuy(p)) Au.hup(); else Au.jump(); Au.whoosh(9);   // a dunk is a field goal attempt (made ones already count in fgm)
  };
  var DUNK_SLAM = 0.66, DK_FRAMES = { legs: 30, both: 30, roll: 16, rev: 30, roll2: 16, rev2: 30 };   // frames per signature dunk in the extras sheet (the slow-motion one gets more)
  function updateDunk(p, dt) {
    // he glides to the rim (eased in and out over the first 60%), so a defender in his path has time to get up and meet him
    var k = p.dk, u = p.st / k.T, e0 = Math.min(1, u / 0.6), e = e0 * e0 * (3 - 2 * e0);   // p.st is advanced once in physics() (it used to be counted twice, so dunks ran at double speed)
    p.x = k.x0 + (k.x1 - k.x0) * e; p.z = k.z0 + (k.z1 - k.z0) * e;
    // the reverse: under the rim on his own side by u = 0.4, then across to the other side, crossing the middle (z = HZ) at u = 0.425,
    // right as the ball changes hands in his frames; he's under the rim by then
    if (k.zA !== undefined) { var smooth = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, ex = Math.min(1, u / 0.45); p.x = k.x0 + (k.x1 - k.x0) * ex * ex * (3 - 2 * ex); p.z = k.z0 + (k.zA - k.z0) * smooth(u / 0.4) + (k.z1 - k.zA) * smooth((u - 0.25) / 0.35); }
    p.y = Math.max(0, k.peak * Math.sin(Math.PI * Math.min(1, u)) * (u > 0.62 && u < 0.82 ? 1.02 : 1));
    if (k.spin && u > 0.18 && u < 0.5) p.face = Math.floor(u * 22) % 2 ? side(p.team) : -side(p.team); else p.face = side(p.team);
    if (sig(p, 'dunk')) {   // wrapped in flames all the way up; in the slow-motion dunk only a trail off his sneakers, so the move stays in plain view
      if (G.cine && G.cine.p === p) { if (Math.random() < 0.3) fireBurst(p.x - side(p.team) * 0.35, p.y + 0.1, p.z - 0.1, 1); }
      else fireBurst(p.x, p.y + 1.0, p.z - 0.1, 2);
    }
    if (k.style) { var nf = DK_FRAMES[k.style] || 12; p.anim = 'dk_' + k.style; p.dir = k.style === 'flex' ? 'C' : 'R'; p.frame = Math.min(nf - 1, Math.round(Math.min(u, 0.9) / 0.9 * (nf - 1))); p.jamArm = k.style === 'jam' && u > 0.25 && u < DUNK_SLAM ? { x: k.x1, y: K.RIM_H + 0.25, z: k.z1 - 0.1 } : null; }
    else { p.anim = 'dunk'; p.dir = 'R'; p.frame = u < 0.12 ? 0 : u < 0.3 ? 1 : u < 0.5 ? 2 : u < 0.64 ? 3 : u < 0.82 ? 4 : 5; }
    if (u >= DUNK_SLAM && !k.slam && k.lay) {   // a layup: the ball leaves his hand (it can't be blocked from here on, just like a dunk)
      k.slam = true; var lb = G.ball, lrx = rimX(p.team), lfl = k.lay === 'roll' ? { T: 1.0 } : k.lay === 'rev' ? { T: 0.42, arc: 0.15 } : { T: 0.55, arc: 0.45 };
      if (k.lay === 'roll') lfl.arc = 2 * K.RIM_H - (lb.y + K.RIM_H + 0.12) / 2;   // up to twice the rim's height
      p.hasBall = false; lb.holder = null; lb.state = 'shot'; lb.last = p; lb.baked = lb.behind = false;
      lb.shotInfo = { by: p, team: p.team, three: !!k.three, make: true, quality: 'green', lay: k.lay, t: 0, T: lfl.T, x0: lb.x, y0: lb.y, z0: lb.z, rx: lrx, arc: lfl.arc, missX: 0, missZ: 0 };
      // the reverse goes up off the glass on the side he finished on (kisses the board just in front of it, then drops in)
      if (k.lay === 'rev') lb.shotInfo.bank = { x: side(p.team) * (K.BOARDX - 0.12), y: K.RIM_H + 0.42, z: K.HZ + (k.z1 - K.HZ) * 0.55, f: 0.55 };
      Au.whoosh(k.lay === 'roll' ? 8 : 5);
      if (k.lay === 'roll') lb.rollSpin = lrx > 0 ? -1 : 1;   // off his fingertips with heavy backspin: spinning hard the whole way up and in
    }
    if (u >= DUNK_SLAM && !k.slam) {
      k.slam = true; if (G.cine && G.cine.p === p) G.cine = null; p.tongue = false;   // the slow-motion close-up ends on the slam
      var b = G.ball; p.hasBall = false; b.holder = null; b.state = 'through'; b.x = rimX(p.team); b.z = K.HZ; b.y = K.RIM_H - 0.05; b.vy = -5; b.vx = b.vz = 0;
      p.stats.dunks++; G.scored(p, k.three ? 3 : 2, true);
      var poster = false;
      G.opps(p).forEach(function (q) { if (q.y > 0.3 && q.state !== 'fall' && q.state !== 'dunk' && dist(p, q) < 1.6 && p.def.stats.str > q.def.stats.str) { q.vy = Math.min(q.vy, 0); G.knockDown(q, p, { hard: 1.3, fallT: 1.6, blood: 0.7 + (p.def.stats.str - q.def.stats.str) * 0.1, y: q.y + 1.4 }); poster = true; } });
      if (poster) G.say('POSTERIZED!', '#ff8a5a', 1.6, 1.1);
      var shatter = p.def.stats.dunk >= 9 && Math.random() < (sig(p, 'dunk') ? 0.85 : 0.3);   // a posterizer or a shattered board gets a "wow!" instead of the woo-hoo
      X.shake = 1.4; X.hype = 3; Au.dunk(!(poster || shatter) && (isGuy(p) || G.mates(p).some(isGuy))); if (poster || shatter) Au.wow && Au.wow(); X.burst(b.x, K.RIM_H, K.HZ, 30, ['#ffd23f', '#ff7a1a', '#fff'], 5, 0.9);
      if (shatter) { G.say('SHATTERED!', '#9ad0ff', 1.6, 1.2); Au.shatter(); Au.sfx && Au.sfx('glass'); X.burst(b.x + side(p.team) * 0.5, 3.4, K.HZ, 70, ['#cfe9ff', '#ffffff', '#9ad0ff'], 6, 1.6); }
    }
    if (u >= 1) {
      var dg = k.lay === 'roll' && k.slam && (k.style === 'roll2' ? 'dougie2' : 'dougie');
      p.state = 'idle'; p.y = 0; p.vy = 0; p.dk = null; p.tongue = false; p.dunkFace = false; p.jamArm = null;
      // after a finger roll he lands with that hand still straight up and Dougies his way back up the court (dougie: after a near-hand
      // roll, the frames flipped as he turns back, so the raised arm stays on the side it went up on; dougie2 after a far-hand one)
      if (dg && X.hasAnim(p, dg)) { p.state = 'dougie'; p.st = 0; p.dougie = dg; p.face = -side(p.team); Au.dougie && Au.dougie(); }
    }
  }
  var DOUGIE_T = 2.6;   // seconds of the Dougie walk back

  // PASS rating: faster, truer passes that are harder to pick off. Good passers show off: the ball stays in his hand through the move
  // (behind the back, a 360 spin, a flip, a football snap through his legs, over the head, a no-look flick) and leaves from his hand
  // on the release frame. n: frames of the move, dur: seconds, rel: release frame, away: he faces away from the target
  // w: how long each frame is held (the behind-the-back hangs on the moment the ball is behind him)
  var FANCY = { back: { n: 6, dur: 0.62, rel: 5, away: true, w: [0.8, 1, 1.2, 1.7, 1.2, 1.1] }, spin: { n: 8, dur: 0.56, rel: 6 }, flip: { n: 8, dur: 0.8, rel: 4 },
    hike: { n: 4, dur: 0.42, rel: 2, away: true, stop: true }, head: { n: 3, dur: 0.33, rel: 2, away: true }, nolook: { n: 3, dur: 0.3, rel: 1, away: true },
    moon: { n: 8, dur: 1.0, rel: 7, away: true } };   // moonwalk: glides backward toward his man, then flicks it back to him
  G.FANCY = FANCY;
  function frameStart(F, i) { if (!F.w) return F.dur * i / F.n; var a = 0, t = 0; F.w.forEach(function (w, k) { t += w; if (k < i) a += w; }); return F.dur * a / t; }
  function frameAt(F, st) { for (var i = F.n - 1; i > 0; i--) if (st >= frameStart(F, i)) return i; return 0; }
  G.passTo = function (p, to) {
    if (G.inb && G.inb.p === p) { G.inbPass(); return; }   // the inbounder only throws it in from the baseline
    if (!p.hasBall || !to || p.state === 'dunk' || p.pending || to.hurtT > 0) return;
    var air = p.state === 'shoot';
    if (air) { if (p.released) return; p.state = 'idle'; }
    var d = dist(p, to), pr = p.def.stats.pass || 5, style = null, dirTo = to.x >= p.x ? 1 : -1;
    if (!air && p.grounded() && Math.random() < (sig(p, 'pass') ? 1 : clamp((pr - 5) * 0.2, 0, 1))) {   // every pass at PASS 10, 1 in 5 at 6   // a passer on fire shows off every time
      // teammate behind him: snap it back through his legs (or over the head / no-look); otherwise behind the back, a spin or a flip
      var behind = (to.x - p.x) * p.face < -0.5;
      style = pick(behind ? ['hike', 'hike', 'head', 'nolook', 'moon', 'moon'] : d > 2.5 ? ['back', 'spin', 'flip', 'flip', 'moon'] : ['back', 'spin', 'flip', 'moon']);
    }
    if (style === 'moon' && pr < 9) style = behind ? 'nolook' : 'spin';   // the moonwalk is for the real passers (PASS 9+, on fire counts)
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
    var miss = Math.max(0, 7 - pr) * 0.12, lead = 0.2 + 0.01 * pr, mx = (Math.random() - 0.5) * 2 * miss, mz = (Math.random() - 0.5) * miss;
    // home: how much of the receiver's drift the ball follows on the way (PASS 9+ or on fire: all of it; 5 half, 3 a quarter)
    b.pass = { from: p, to: to, t: 0, T: Math.max(0.16, d / (15 + 0.8 * pr)), x0: hw ? hw.x : p.x + f * 0.3, y0: hw ? hw.y : 1.3 + p.y, z0: p.z - 0.2,
      x1: to.x + to.vx * lead + mx, z1: to.z + to.vz * lead + mz, y1: 1.3, mx: mx, mz: mz, home: sig(p, 'pass') ? 1 : clamp((pr - 1) / 8, 0, 1),
      arc: style === 'head' ? 1.1 : style === 'hike' || style === 'flip' ? 0.25 : 0.5, safe: sig(p, 'pass') ? 0 : clamp(1.45 - 0.11 * pr, 0.35, 1.2) };   // nobody picks off a passer on fire
    b.pass.ax = b.pass.x1; b.pass.az = b.pass.z1;   // where it was thrown (the receiver meets it there; the homing does the rest)
    if (style && Au.passWhoosh) Au.passWhoosh(); else Au.whoosh(style ? 6 : 4);   // a trick pass gets the big recorded whoosh
  }
  function updatePending(p) {
    var pd = p.pending; if (!pd) return;
    if (p.state !== 'pass' || !p.hasBall || G.ball.holder !== p) { p.pending = null; return; }   // stripped, shoved or knocked down mid-move
    if (p.st >= pd.at) launchPass(p, pd.to, p.passStyle);
  }
  G.trySteal = function (p) {
    if (p.cd.steal > 0 || p.busy()) return; p.cd.steal = 0.55; p.state = 'steal'; p.st = 0; Au.swipe ? Au.swipe() : Au.whoosh(3);   // every swipe whooshes
    var h = G.ball.holder; if (!h || h.team === p.team || dist(p, h) > 1.8 || guarded(h)) return;   // (not off a shooter in his step-back or cartwheel)
    p.face = h.x >= p.x ? 1 : -1;
    var c = 0.03 + 0.03 * p.def.stats.steal - 0.01 * h.def.stats.speed + (Math.hypot(h.vx, h.vz) < 0.5 ? 0.2 : 0) + (p.human ? 0.1 : 0) - (h.state === 'shoot' ? 0.1 : 0) - 0.015 * Math.max(0, h.def.stats.str - p.def.stats.str) + (sig(p, 'steal') ? 0.3 : 0);
    if (!p.human) c *= G.diff.steal * 0.75 * 0.75;   // the computer gets less of the boost, and lands a quarter fewer than it used to (its ball handlers averaged 5.5 steals a game)
    if (h.dm) c *= 0.3;   // a crossover / behind-the-back dribble protects the ball
    if (h.state === 'dunk') c = 0;
    if (Math.random() < c) { if (sig(p, 'steal')) fireBurst(h.x, 1.0, h.z, 12); p.stats.steals++; G.give(p); G.say(pick(HW.PHRASES.steal), '#7ee0ff', 1); hl('steal', p, 'STEAL'); Au.steal(); Au.laugh && Au.laugh(); }
  };
  G.tryShove = function (p) {
    if (p.cd.shove > 0 || p.busy()) return; p.cd.shove = p.def.type === 'ram' ? RAM_CD : 0.9; p.state = 'shove'; p.st = 0;   // (The Legend winds up longer between them)
    // bruisers (STR 9+, on fire counts) don't just push: a roundhouse kick, a Superman punch or a kick to the shins - and the Max
    // Strength players a flying knee, a jumping front kick and a spinning back elbow too
    p.shoveStyle = p.def.stats.str >= 9 ? pick(['kick', 'punch', 'shin'].concat(brute(p) ? ['knee', 'front', 'elbow'].filter(function (k) { return X.hasAnim(p, 'shove_' + k); }) : [])) : null;
    var tgt = null, bd = 1.6; G.opps(p).forEach(function (q) { var d = dist(p, q); if (d < bd && q.state !== 'fall' && !guarded(q)) { bd = d; tgt = q; } });
    Au.shove(); Au.shoveYell && Au.shoveYell(((HW.FAMILY || {})[p.id] || {}).sex === 'f'); if (!tgt) return;
    p.face = tgt.x >= p.x ? 1 : -1; p.stats.shoves++;
    var dx = (tgt.x - p.x) / (bd || 1), dz = (tgt.z - p.z) / (bd || 1), str = p.def.stats.str, fs = sig(p, 'str'), wall = sig(tgt, 'str') && !fs;
    var kd = 0.18 + 0.065 * str - 0.03 * tgt.def.stats.str + (p.turboOn ? 0.12 : 0) + (p.def.type === 'strength' ? 0.12 : 0) - (tgt.y > 0.2 ? 0.15 : 0);
    if (fs) kd = 1; if (wall) kd = 0;   // power on fire: every shove flattens him, and nobody moves him
    if (!wall) { var push = (4 + str * 0.5) * (fs ? 1.7 : 1); tgt.vx += dx * push; tgt.vz += dz * push; }
    if (fs) fireBurst((p.x + tgt.x) / 2, 1.2, (p.z + tgt.z) / 2, 14);
    // The Legend: 1 in 40 of his shoves that reach a man become a flying body slam, and 1 in 15 an arm bar (everyone else's: 1 in 20)
    if (p.def.type === 'ram' && Math.random() < SLAM_P && canSlam(p, tgt)) { G.startSlam(p, tgt); return; }
    if (brute(p) && Math.random() < (p.def.type === 'ram' ? ARMBAR_RAM : ARMBAR_P) && canArmbar(p, tgt)) { G.startArmbar(p, tgt); return; }
    if (Math.random() < kd) {
      if (tgt.hasBall) G.drop(tgt, dx * 3, 3, dz * 3);
      var gap = str - tgt.def.stats.str + (fs ? 5 : 0);
      var sty = p.shoveStyle, hk = sty === 'kick' ? 0.4 : sty === 'punch' || sty === 'knee' || sty === 'front' || sty === 'elbow' ? 0.5 : sty === 'shin' ? -0.3 : 0;
      G.knockDown(tgt, p, { hard: (fs ? 2 : clamp(0.9 + gap * 0.08, 0.7, 1.6)) + hk, blood: 0.7 + Math.max(0, gap) * 0.1 + (sty === 'knee' ? 0.3 : 0), y: sty === 'kick' || sty === 'front' || sty === 'elbow' ? 1.6 : sty === 'knee' ? 1.45 : sty === 'shin' ? 0.35 : 1.2, onQ: sty === 'knee' || sty === 'front' || sty === 'elbow' });   // (the knee lands on his chin, the front kick in his chest and face, the elbow on his jaw)
      G.say(knockLine(p, tgt), '#ff8a5a', 1.2); hl('knock', p, 'KNOCKDOWN');
    } else { if (!wall) { Au.punch && Au.punch(); if (!isGuy(tgt) && Math.random() < 0.5) Au.painF && Au.painF(); } if (tgt.hasBall && Math.random() < 0.25) G.drop(tgt, dx * 2.5, 2.5, dz * 2.5); grudge(p, tgt); }   // it lands but he stays up
  };
  // the arm bar (Max Strength players, rare: 1 in 20 of the shoves that reach a man, so about 1 in 30 of all their shoves counting the
  // ones that hit nobody): in 2.5 s of slow motion he grabs the arm,
  // takes him down, both legs across him, pulls the wrist into his chest and bridges - SNAP. His man is down for 10 s, and stays down
  // through every stoppage (baskets, quarter breaks: G.lineup leaves him where he lies); then he gets up and plays on
  var ARMBAR_P = 0.05, ARMBAR_RAM = 1 / 15, AB_T = 1.4, AB_SNAP = 0.62, AB_UP = 0.6, HURT = 10;
  // The Legend, toned down (a person mashing shove with him won 20 of 20 simulated games, 66-24): 1.5 s between his shoves (everyone
  // else 0.9), no Max Strength knockdown bonus, and his arm bars and slams keep a man down 5 s, not 10
  var RAM_CD = 1.5, RAM_HURT = 5;
  function canArmbar(p, q) { return p.grounded() && q.grounded() && !q.hurtT && !guarded(q) && !G.cine && !G.pu && !G.show && G.phase === 'play' && X.hasAnim(p, 'armbar') && X.hasAnim(q, 'armbarred'); }
  function abGap(p, q) {   // how far ahead of him his man lies, so the arm reaches his chest (from the sprites' hand points)
    var a = X.animPoint(p.id, 'armbar', 5, 'hand'), b = X.animPoint(q.id, 'armbarred', 5, 'hand');
    return a && b ? clamp(a.x - b.x, 0.5, 1.3) : 0.85;
  }
  G.startArmbar = function (p, q) {
    p.state = 'armbar'; p.st = 0; p.vx = p.vz = p.vy = 0; p.dm = null; p.pending = null; p.ab = { q: q, gap: abGap(p, q), snap: false };
    if (q.hasBall) G.drop(q, p.face * 1.2, 2.6, 0);
    q.state = 'fall'; q.st = 0; q.fallT = 99; q.abBy = p; q.hurtT = 0; q.vx = q.vz = q.vy = 0; q.y = 0; q.dk = null; q.pending = null; q.dm = null; q.dunkFace = false; q.tongue = false;
    q.face = p.face; q.x = clamp(p.x + p.face * p.ab.gap, -K.HL - 0.6, K.HL + 0.6); q.z = clamp(p.z - 0.04, 0.3, K.CD - 0.3);   // (just in front of him, so his face shows)
    G.cine = { p: p, q: q, t: 0, dur: AB_T + AB_UP, kind: 'armbar' };   // a close-up of the two of them while the rest of the game waits
    G.say('ARM BAR!', '#ff5a4a', 1.6, 1.3); Au.shove(); Au.hup && isGuy(p) && Au.hup(); hl('armbar', p, 'ARM BAR');
  };
  function snapArm(p) {
    var ab = p.ab, q = ab.q; ab.snap = true; q.hurtT = p.def.type === 'ram' ? RAM_HURT : HURT;
    var ex = q.x - q.face * 0.25, ey = 0.35; X.ring(ex, ey, q.z - 0.2, 0.9); X.burst(ex, ey, q.z - 0.2, 26, ['#ffffff', '#ffe14d', '#ff5a4a'], 4, 0.5, 3);
    G.hitstop = Math.max(G.hitstop || 0, 0.12); X.shake = Math.max(X.shake, 1.2); Au.snap && Au.snap();
    if (isGuy(q)) Au.scream && Au.scream(); else Au.painF && Au.painF();
    G.say('SNAP!', '#ffffff', 1.4, 1.6); grudge(p, q, 0.4);
  }
  // the arm bar's close-up: 2.5 s from the grab through the snap to him getting back up (AB_RATE), and only the two of them move -
  // nobody else, not the ball, not the game clock or the shot clock - so it can't cost either team anything. Then play goes on
  var AB_RATE = (AB_T + AB_UP) / (2.5 - 0.12);   // (the 0.12 s freeze-frame on the snap is part of the 2.5)
  function updateArmbarCine(dt) {
    var c = G.cine, p = c.p, q = c.q, d = dt * AB_RATE;
    if (p.state !== 'armbar') { G.cine = null; return; }
    p.st += d; updateArmbar(p, d); if (q) q.st += d;
    animate(p, d); if (q) animate(q, d);
    c.t = p.st; X.camX += (X.camClamp(p.x) - X.camX) * (1 - Math.exp(-6 * dt));   // (the camera slides over to them as it zooms in)
    if (p.state !== 'armbar') G.cine = null;   // he's up: play on
  }
  function updateArmbar(p, dt) {
    var ab = p.ab, q = ab && ab.q, u = p.st / AB_T; p.vx = p.vz = p.vy = 0; p.y = 0;
    if (!ab) { p.state = 'idle'; return; }
    if (q.abBy === p && q.state === 'fall') { q.x = clamp(p.x + p.face * ab.gap, -K.HL - 0.6, K.HL + 0.6); q.face = p.face; }
    if (u >= AB_SNAP && !ab.snap) snapArm(p);
    if (p.st >= AB_T + AB_UP) { p.state = 'idle'; p.ab = null; p.flash = 0.3; if (q.abBy === p) q.abBy = null; }
  }
  // The Legend's flying body slam (WWE, a splash off the top rope): 1 in 40 of his shoves that reach a man. He dips, launches and flies
  // at him laid out flat, homing in on him wherever he runs (heat-seeking, like the passes), and comes down on top of him: his man is
  // flattened on his back, down for 10 s like the arm bar's. 1 s from the dip to the flex, at full speed and with no close-up, so
  // everyone else plays on around them
  var SLAM_P = 1 / 40, SLAM_T = 1.0, SLAM_OFF = 0.1, SLAM_HIT = 0.52, SLAM_LAND = 0.66, SLAM_H = 1.4, SLAM_TOP = 0.22, SLAM_UP = 0.8;
  var SLAM_FR = [0.1, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.87, 0.93];   // where each of the 10 frames ends
  function slamFrame(t) { for (var i = 0; i < SLAM_FR.length; i++) if (t < SLAM_FR[i]) return i; return 9; }
  function canSlam(p, q) { return p.grounded() && q.state !== 'fall' && q.state !== 'dunk' && !(q.hurtT > 0) && !guarded(q) && !G.cine && !G.pu && !G.show && G.phase === 'play' && X.hasAnim(p, 'slam'); }
  // the frames are centred like the arm bar's, so where his body is in each one comes from the sheet (X.frameCenter); a man flat on
  // his back lies behind his feet, so he lands that far past him
  function slamC(p, t) { return X.frameCenter ? X.frameCenter(p.id, 'slam', slamFrame(t)) : 0; }
  function slamAt(p, q) { var lie = X.frameCenter ? -X.frameCenter(q.id, 'fall', 3) : 1.4; return { x: clamp(q.x + p.face * lie, -K.HL - 0.6, K.HL + 0.6), z: clamp(q.z - 0.06, 0.3, K.CD - 0.3) }; }
  G.startSlam = function (p, q) {
    p.state = 'slam'; p.st = 0; p.vx = p.vz = p.vy = 0; p.y = 0; p.dm = null; p.pending = null; p.face = q.x >= p.x ? 1 : -1;
    p.slam = { q: q, hit: false, vx: p.x + p.face * slamC(p, 0), vz: p.z };
    Au.hup && Au.hup(); Au.whoosh(9); hl('slam', p, 'BODY SLAM');
  };
  function updateSlam(p, dt) {
    var s = p.slam, q = s && s.q, t = p.st;
    if (!s) { p.state = 'idle'; p.y = 0; return; }
    if (t >= SLAM_OFF && t < SLAM_LAND) {   // in the air: steering onto him, so he comes down right on top
      var tg = s.fix || slamAt(p, q), left = SLAM_LAND - t, k = Math.min(1, dt / Math.max(left, dt));
      if (!s.fix && t < 0.25 && (tg.x - s.vx) * p.face < -0.4) { p.face = -p.face; tg = slamAt(p, q); }   // (he cut back behind him: turn round)
      s.vx += (tg.x - s.vx) * k; s.vz += (tg.z - s.vz) * k;
      var u = (t - SLAM_OFF) / (SLAM_LAND - SLAM_OFF); p.y = SLAM_TOP * u + SLAM_H * 4 * u * (1 - u);
    } else p.y = t < SLAM_OFF ? 0 : t < SLAM_UP ? SLAM_TOP : Math.max(0, SLAM_TOP * (1 - (t - SLAM_UP) / 0.07));   // (then on top of him, pinning, and up)
    if (!s.hit && t >= SLAM_HIT) slamHit(p);
    p.x = s.vx - p.face * slamC(p, t); p.z = s.vz; p.vx = p.vz = p.vy = 0;
    if (t >= SLAM_T) { p.state = 'idle'; p.st = 0; p.y = 0; p.slam = null; p.flash = 0.3; }
  }
  function slamHit(p) {
    var s = p.slam, q = s.q; s.hit = true;
    if (q.state === 'dunk' || q.state === 'fall' || q.hurtT > 0 || guarded(q)) {   // he got away (up for a dunk, already down): a belly flop on the hardwood
      s.fix = { x: s.vx, z: s.vz }; X.burst(s.vx, 0.2, s.vz - 0.1, 14, ['#d8c8a8', '#bfae8a', '#ffffff'], 2.5, 0.4, 2); X.shake = Math.max(X.shake, 0.6); Au.land && Au.land(); return;
    }
    if (q.hasBall) G.drop(q, p.face * 1.4, 2.6, 0);
    q.state = 'fall'; q.st = 0; q.fallT = 99; q.hurtT = RAM_HURT; q.slammed = true; q.abBy = null; q.nut = false; q.vx = q.vz = 0; q.vy = Math.min(q.vy || 0, 0);
    q.dk = null; q.pending = null; q.dm = null; q.dunkFace = false; q.tongue = false; q.face = -p.face; q.hitT = 0.45; q.flash = 0.12;
    s.fix = slamAt(p, q); var cx = s.fix.x;
    X.ring(cx, 0.5, q.z - 0.15, 1.1); X.burst(cx, 0.4, q.z - 0.15, 30, ['#ffffff', '#ffe14d', '#ff5a4a'], 4.5, 0.5, 3); X.crater(cx, q.z, 1.1); X.blood(cx, q.z, 1.0);
    G.hitstop = Math.max(G.hitstop || 0, 0.08); X.shake = Math.max(X.shake, 1.4); Au.punch && Au.punch(); Au.land && Au.land();
    if (isGuy(q)) Au.scream && Au.scream(); else Au.painF && Au.painF();
    G.say('BODY SLAM!', '#ff5a4a', 1.6, 1.3); grudge(p, q, 0.5);
  }
  G.jump = function (p) {
    if (!p.grounded() || p.busy() || p.cd.jump > 0) return; p.state = 'jump'; p.st = 0; p.vy = Math.sqrt(2 * GRAV * p.jumpH); p.y = 0.001; p.cd.jump = 0.35; if (isGuy(p)) Au.hup(); else Au.jump();
  };

  // a highlight for the reel behind the final scoreboard (replay.js), labeled with who did it
  function hl(kind, p, what) { if (HW.Replay && HW.Replay.mark) HW.Replay.mark(kind, (p ? p.def.first.toUpperCase() + ' ' : '') + what); }

  /* ---------- scoring ---------- */
  var MOVE_CALL = 0.25, BANG_D = 35 * 0.3048;   // (35 ft, in meters)
  G.scored = function (p, pts, dunk) {
    var team = p.team, info = G.ball.shotInfo;
    // Mike Breen: a three in the last 5 s of the 4th (or overtime) that puts them ahead or ties it - the big BANG!!!; a three from 35 ft
    // and out (where he took off) or any jump shot that drops after the buzzer - BANG!!! BANG!!!
    var jump = !dunk && info && !info.lay && info.by === p, mine = G.score[team], theirs = G.score[1 - team];
    var bigBang = jump && pts === 3 && G.q >= 4 && G.clock < 5 && mine <= theirs && mine + 3 >= theirs, tie = bigBang && mine + 3 === theirs;
    var bang = !bigBang && jump && (pts === 3 && info.dist >= BANG_D || G.clock <= 0);
    var hk = dunk ? (pts === 3 ? ['dunk3', '3-POINT DUNK'] : ['dunk', 'DUNK']) : info && info.lay ? (info.lay === 'lay' ? ['lay', 'LAYUP'] : ['fancyLay', info.lay === 'rev' ? 'REVERSE LAYUP' : 'FINGER ROLL'])
      : pts === 3 ? (info && info.cw ? ['cart3', 'CARTWHEEL THREE'] : info && (info.sb || info.of) ? ['fancy3', info.sb ? 'STEP-BACK THREE' : 'ONE-FOOT THREE'] : ['three', 'THREE']) : ['two', 'BUCKET'];
    hl(hk[0], p, hk[1]);
    G.score[team] += pts; p.stats.pts += pts; p.stats.fgm++; if (pts === 3) p.stats.tpm++;
    if (p.assist && p.assist.by.team === team && G.t - p.assist.t < 5) p.assist.by.stats.ast++;   // a basket within 5 s of catching a teammate's pass
    G.players.forEach(function (q) { q.assist = null; });
    if (pts === 3 && sig(p, 'tp')) for (var fi = 0; fi < 6; fi++) X.flame(rimX(team) + (Math.random() - 0.5) * 0.5, K.RIM_H - 0.3, K.HZ, 4, 0.5);
    p.streak++; if (!p.onFire && p.streak >= 3) { p.onFire = true; G.puQueue = p; Au.fire(); }   // he powers up as soon as he's back on his feet
    G.players.forEach(function (q) { if (q.team !== team) { if (q.onFire) { G.say(q.def.first.toUpperCase() + ' COOLS OFF', '#9ad0ff', 1.2, 0.7); if (q.ssj) X.powerDown(q); } q.onFire = false; q.ssj = 0; q.streak = 0; if (G.puQueue === q) G.puQueue = null; } });
    // a fancy shot's own call (STEP-BACK THREE!, REVERSE!...) only about 1 time in 4: the rest of the time the usual trash talk - hearing
    // the move's name on every one got old. A reverse that doesn't get its call gets a plain two's line (not NOTHING BUT NET: it's off the
    // glass). A cartwheel three always gets the cartwheel's own trash talk (PHRASES.cart)
    var cw = !dunk && pts === 3 && info && info.cw;
    var rev = !dunk && info && info.lay === 'rev' && info.by === p, fancy = !dunk && pts === 3 && info && !info.cw && (info.sb || info.of);
    var call = (rev || fancy) && Math.random() < MOVE_CALL;
    var txt = cw ? pick(HW.PHRASES.cart) : rev ? (call ? pick(HW.PHRASES.rev) : pick(HW.PHRASES.two.filter(function (l) { return l !== 'NOTHING BUT NET!'; })))
      : !dunk && info && info.lay && info.by === p && HW.PHRASES[info.lay] ? pick(HW.PHRASES[info.lay]) : dunk ? (pts === 3 ? '3-POINT DUNK!' : pick(HW.PHRASES.dunk))
      : pts === 3 ? (call ? (info.sb ? 'STEP-BACK THREE!' : 'ONE-FOOT THREE!') : pick(HW.PHRASES.three)) : info && info.quality === 'green' ? pick(HW.PHRASES.swish) : pick(HW.PHRASES.two);
    if (bigBang || bang) txt = tie ? 'BANG!!! TIE GAME!' : bigBang ? 'BANG!!!' : 'BANG!!! BANG!!!';
    G.say(txt, dunk ? '#ff7a1a' : pts === 3 ? '#ffb347' : '#ffe14d', bigBang || bang ? 2.4 : 1.5, dunk || bigBang || bang ? 1.3 : 1);
    if (bigBang || bang) Au.bang && Au.bang(bigBang);
    Au.cheer(pts === 3 || dunk); X.hype = Math.max(X.hype, dunk || pts === 3 ? 3 : 1.5);
    // a fan in the stands yells "baba booey!" after a three: always the first one of the game, then about 1 in 3
    if (pts === 3 && !dunk && (!G.babaDone || Math.random() < 0.35) && Au.baba && Au.baba()) G.babaDone = true;
    G.hoopFx[team === 0 ? 1 : 0] = 1;
    // (not a man lying on the floor: knocked down, or hurt from an arm bar - he stays down, his injury still counting)
    G.players.forEach(function (q) { if (q.team === team && q.state !== 'dunk' && q.state !== 'shimmy' && q.state !== 'dougie' && q.state !== 'fall' && !(q.hurtT > 0)) { q.state = 'cheer'; q.st = 0; } });
    G.phase = 'scored'; G.phaseT = INB.after; G.nextPoss = 1 - team;
  };
  G.missed = function (info) { info.by.streak = 0; };
  // your odds on a block try: 75-95% right on him (by block rating), dropping off toward the edge of your reach
  G.humanBlock = function (q, d) { if (sig(q, 'block')) return 0.98; return clamp(0.66 + 0.035 * q.def.stats.block - 0.25 * Math.max(0, d - 0.7), 0.35, 0.95); };
  // a rejected dunk: the dunker crashes to the floor and the blocker comes down with the ball
  // a stronger blocker puts him on the floor for 2 s and he leaves a little blood on the court
  G.rejectDunk = function (q, dk) {
    if (dk.dk && dk.dk.style === 'both' && dk.anim === 'dk_both' && X.hasAnim(q, 'shove_punch')) { facePunch(q, dk); return; }   // under both legs: in the close-up, a fist to the face
    if (q.def.type === 'dunker' && dk.def.type === 'handler' && X.hasAnim(q, 'block_chase')) { chaseDown(q, dk); return; }   // a dunker on a point guard
    var power = q.def.stats.str - dk.def.stats.str + (sig(q, 'str') ? 5 : 0);
    dk.dk = null; dk.vy = 0; dk.tongue = false; dk.dunkFace = false; dk.jamArm = null;
    G.blocked(q, dk, null, 'GET THAT SHIT OUT OF HERE!');
    G.knockDown(dk, q, { hard: power > 0 ? clamp(1.2 + power * 0.06, 1.2, 2) : 1, fallT: power > 0 ? 2.0 : 1.3, blood: 0.7 + Math.max(0, power) * 0.12, y: dk.y + 1.6, block: true });
    if (q.def.stats.str >= 9) {
      // a bruiser hammers it: airborne, bent back into a C with both fists clasped behind his head, then down through the dunker,
      // who gets launched all the way out to midcourt
      q.state = 'hammer'; q.st = 0; q.face = dk.x >= q.x ? 1 : -1; q.vy = Math.max(q.vy, 3.5); if (q.y < 0.01) q.y = 0.01; if (isGuy(q)) Au.hup(); hl('hammer', q, 'HAMMER');
      var vy = 6.5, hy = dk.y, T = (vy + Math.sqrt(vy * vy + 2 * GRAV * hy)) / GRAV, ex = 1 - Math.exp(-1.2 * T);
      dk.vy = vy; dk.vx = (0 - dk.x) * 1.2 / ex; dk.vz *= 0.3; dk.face = dk.vx > 0 ? -1 : 1; X.shake = Math.max(X.shake, 1.4);
      if (isGuy(dk)) Au.scream && Au.scream();
    }
    X.hype = Math.max(X.hype, 2.6);
  };
  // the chase-down block (after LeBron's): a dunker gets to a point guard's layup or dunk and pins it flat on the glass - 1 s of slow
  // motion in close on the two of them (G.cine kind 'chase', play at CHASE.slow), BLOCKED BY JAMES! He comes down with the ball; the
  // point guard just drops back to the floor empty-handed
  var CHASE = { dur: 1.0, slow: 0.35 };
  function chaseDown(q, dk) {
    var sd = rimX(dk.team) > 0 ? 1 : -1;
    dk.dk = null; dk.state = 'jump'; dk.st = 0; dk.vy = Math.min(dk.vy, 0); dk.vx *= 0.3; dk.vz *= 0.3; dk.tongue = false; dk.dunkFace = false; dk.jamArm = null;
    // he flies in from behind him and gets his hand on it right at the glass, in front of the net
    q.state = 'chase'; q.st = 0; q.face = q.chaseFace = sd; q.x = sd * (K.BOARDX - 0.8); q.z = Math.min(q.z, K.HZ - 0.5); q.y = Math.max(q.y, 0.95); q.vy = 1.6; q.vx = q.vz = 0; q.dm = null; q.pending = null;
    G.blocked(q, dk, null, 'BLOCKED BY JAMES!');
    var c = G.callouts[G.callouts.length - 1]; if (c) { c.low = true; c.life = 1.9; }   // (down at the bottom, clear of the close-up)
    G.cine = { p: q, q: dk, t: 0, dur: CHASE.dur, kind: 'chase', slow: CHASE.slow };
    Au.wow && Au.wow(); if (isGuy(q)) Au.hup(); X.hype = Math.max(X.hype, 3);
  }
  // blocked under both legs (`dk_both`): the close-up stays on him, tucked up in the air where he was stopped, and his man comes flying
  // into it and punches him across the face - a white flash, an impact star and a crater stove into his face (gfx.js drawBothCut) -
  // while the rest of the game waits; then back to the court, where he's flattened with the crater still on his face (faceCrater s)
  var PUNCH = G.PUNCH = { dur: 1.4, hit: 0.42, crater: 4 };
  function facePunch(q, dk) {
    dk.dk = null; dk.state = 'punched'; dk.st = 0; dk.vx = dk.vz = dk.vy = 0; dk.tongue = false; dk.jamArm = null;   // (his anim and frame stay: the close-up holds that moment)
    G.blocked(q, dk, null, null); G.callouts.pop();   // (the ball's his; the call comes with the punch)
    q.state = 'punching'; q.st = 0; q.face = dk.x >= q.x ? 1 : -1; q.vx = q.vz = 0;
    G.cine = { p: dk, q: q, t: 0, dur: PUNCH.dur, kind: 'bothpunch' };
    Au.whoosh(9); if (isGuy(q)) Au.hup(); hl('reject', q, 'FACE PUNCH');
  }
  function updatePunchCine(dt) {
    var c = G.cine, dk = c.p, q = c.q; c.t += dt;
    if (!c.hit && c.t >= PUNCH.hit) {
      c.hit = true; dk.faceCrater = PUNCH.crater; X.shake = Math.max(X.shake, 1.6); X.hype = Math.max(X.hype, 3);
      Au.punch && Au.punch(); Au.snap && Au.snap(); if (isGuy(dk)) Au.scream && Au.scream(); else Au.painF && Au.painF(); Au.wow && Au.wow();
      G.say('GET THAT SHIT OUT OF HERE!', '#ff5a4a', 1.8, 1.2); var cl = G.callouts[G.callouts.length - 1]; if (cl) cl.low = true;   // (along the bottom, off his face)
    }
    if (c.t >= c.dur) {   // back to the court: he's down hard, the crater still in his face; his man lands with the ball
      G.cine = null; if (q.state === 'punching') { q.state = 'idle'; q.st = 0; }
      dk.state = 'jump'; G.knockDown(dk, q, { hard: 1.9, fallT: 2.2, blood: 1.6, y: dk.y + 1.5, onQ: true, block: true });
    }
  }
  // a block: the shot is dead and the blocker comes down with the ball
  G.blocked = function (q, shooter, info, text) {
    var b = G.ball; q.stats.blocks++; hl(info ? 'block' : 'reject', q, 'BLOCK');
    if (info) G.missed(info); else { shooter.streak = 0; shooter.released = true; }
    X.burst(b.x, b.y, b.z, 14, ['#ffffff', '#ffd23f', '#ff6b6b'], 3, 0.5); if (sig(q, 'block')) fireBurst(b.x, b.y, b.z, 18);
    G.give(q); q.cd.catch = 0;
    G.say(text || pick(HW.PHRASES.block), '#ff6b6b', 1.3, text ? 1.2 : 1); Au.board(); X.shake = 0.6; X.hype = Math.max(X.hype, 1.6);
  };

  /* ---------- the on-fire power-up ---------- */
  // 0-0.25 s the camera zooms in, he squares up to the camera; 0.25-0.85 arms crossed over his chest, charging; 0.85 he throws
  // both arms down by his legs: flash, shockwave, the hair goes gold and stands up, the aura ignites, the muscles pump; he holds
  // the pose in the aura, then the camera eases back out at 1.7-2.0 s and play goes on with him powered up (p.ssj) until he cools off
  var PU = { dur: 2.0, boom: 0.85 };
  G.PU = PU;
  // Gator's twerk show (2.5 s, side-on): Lisa walks in behind him and smacks his rear in slow motion (0.45-1.95 s: the wind-up, the
  // swing, the smack at 1.35 with a whip crack, the ripple), then walks off. It opens every quarter (while everyone waits for the
  // inbound) and the final buzzer: there he just twerks, up front where everyone can see. His power-up is all twerk (5 s, side-on,
  // zoomed in on him and Lisa, to his song): she walks in behind him and in slow motion winds up and smacks it at 2.5 s - that's the
  // flash: gold hair, the aura, the pumped muscles - then he goes at it harder and faster, lips pursed, while she smacks it 3 more
  // times (whip cracks) and walks off
  var TW = { len: 5.0, walk: 0.45, slow0: 0.45, slow1: 2.5, hits: [2.5, 3.15, 3.8, 4.45], leave: 4.6, quarter: 3.0, extra: 1.6, end: 4.0 };
  G.TW = TW;
  // when Gator's team wins: at the buzzer he steps up front and twerks to his song ("spot" by Cushy, from its drop, 140 bpm: twice
  // a beat) while the camera slowly zooms in on him (from zoom0, over zoomT seconds), then it fades out to the final scoreboard -
  // the song going on under it. hud: when the scoreboard and names leave the screen (the WIN! callout stays)
  var WIN = { len: 7.6, zoom0: 0.6, zoomT: 4.8, hud: 1.0, fade: 1.0, beat: 60 / 140 };
  G.WIN = WIN;
  // the twerkers (Gator, Ramsey): anyone with the twerk power-up who's up and has the sprites; pu: his power-up twerk too (the hard
  // twerk) - with his walk-on to smack it when she's there (Gator's Lisa), solo when not (Ramsey's Austin isn't in the game yet)
  function canTwerk(q, pu) { return q.def.powerup === 'twerk' && !(q.hurtT > 0) && !q.abBy && X.hasAnim(q, 'twerk') && (!pu || X.hasAnim(q, 'twerk_hard')); }
  function twerkers() { return G.players.filter(function (q) { return canTwerk(q); }); }
  function startShow(p, kind, len) {
    G.show = { p: p, t: 0, len: len, kind: kind, zoom: kind === 'pu', hit: 0 }; p.face = p.x > 0 ? 1 : -1; p.vx = p.vz = 0; p.dm = null;   // rear toward midcourt, where Lisa comes from
    // with everyone on screen (a quarter's start, the buzzer) he steps up to the near sideline, in front of them all, so nobody's in
    // the way; after a quarter's twerk he jogs back to his spot before the whistle
    if (kind !== 'pu') { G.show.home = { x: p.x, z: p.z }; p.z = Math.min(p.z, 2.6); G.glide = null; }
  }
  function updateShow(dt) {
    var sh = G.show, p = sh.p; sh.t += dt;
    // his victory twerk: anyone right by him steps aside before the camera comes in, so it's him on screen (he's drawn in front too)
    if (sh.kind === 'win' && sh.t < WIN.zoom0 + 0.8) G.players.forEach(function (q) {
      var dx = q.x - p.x, need = 2.3 - Math.abs(dx); if (q === p || need <= 0 || Math.abs(q.z - p.z) > 2.4) return;
      q.x = clamp(q.x + (dx ? Math.sign(dx) : p.x > 0 ? -1 : 1) * Math.min(need, 3.2 * dt), -K.HL - 0.5, K.HL + 0.5);
    });
    if (sh.kind === 'pu') {
      var smacker = !!G.showCameo();   // (solo: no hand, so no smacks - just the hard pops, and the flash at the first)
      if (smacker && !sh.swung && sh.t >= TW.hits[0] - 0.4) { sh.swung = true; Au.whoosh(9); }
      while (sh.hit < TW.hits.length && sh.t >= TW.hits[sh.hit]) {   // SMACK: a whip crack where her hand lands
        var bw = X.buttWorld(p) || { x: p.x - p.face * 0.3, y: 0.9 }, big = !sh.hit;
        if (smacker) { X.ring(bw.x, bw.y, p.z - 0.1, big ? 0.5 : 0.38); X.burst(bw.x, bw.y, p.z - 0.1, big ? 12 : 8, ['#ffffff', '#ffe14d', '#ffb000'], 2.5, 0.4, 3); X.shake = Math.max(X.shake, big ? 0.7 : 0.45); Au.slap && Au.slap(); }
        sh.hit++;
      }
      if (!sh.wowed && sh.t >= TW.hits[0] + 0.45) { sh.wowed = true; Au.wow && Au.wow(); }
    }
    if (sh.t >= sh.len) { G.show = null; if (sh.home && G.phase === 'tip') G.glide = { p: p, x: sh.home.x, z: sh.home.z }; }
  }
  function startPowerup(p) {
    var tw = canTwerk(p, true) ? TW.len : 0;
    G.pu = { p: p, t: 0, boom: false, tw: tw, dur: tw || PU.dur }; G.callouts = []; hl(tw ? 'twerk' : 'powerup', p, 'ON FIRE'); p.state = 'powerup'; p.st = 0; p.vx = p.vz = 0; p.dm = null; p.pending = null; p.trail = null;
    if (tw) { startShow(p, 'pu', tw); Au.sfx && Au.sfx('gator_cushy', 1.5); }   // 5 s of "spot" by Cushy over the whole thing, from the top of the song - loud from the first frame (up front: the crowd ducks under it)
    else { Au.charge && Au.charge(); Au.fireball && Au.fireball(); Au.yell && Au.yell(!isGuy(p)); }
  }
  function updatePowerup(dt) {
    var pu = G.pu, p = pu.p; pu.t += dt; p.st = pu.t;
    if (pu.tw && G.show && G.show.p === p) updateShow(dt);
    animate(p, dt);
    X.camX += (X.camClamp(p.x) - X.camX) * (1 - Math.exp(-9 * dt));   // the camera slides over to him while it zooms in
    if (!pu.boom && pu.t >= (pu.tw ? TW.hits[0] : PU.boom)) {   // Gator's flash is Lisa's first smack
      if (pu.tw) { Au.fireball && Au.fireball(); Au.yell && Au.yell(false); }
      pu.boom = true; p.ssj = 1; X.powerFlash(p); X.shake = Math.max(X.shake, 1.3); Au.powerup ? Au.powerup() : Au.fire();
      G.players.forEach(function (q) { if (q !== p && q.grounded() && dist(p, q) < 2.6 && q.team !== p.team) { q.vx += (q.x > p.x ? 1 : -1) * 2; } });   // the blast nudges anyone close
    }
    if (pu.t >= pu.dur) {
      G.pu = null; p.state = 'idle'; p.st = 0; p.dir = 'R';
      G.say(p.def.first.toUpperCase() + ' IS ON FIRE!', '#ffd23a', 2.2, 1.25); X.hype = Math.max(X.hype, 3); Au.happy && Au.happy();
    }
  }

  /* ---------- per frame ---------- */
  G.update = function (dt, In) {
    G.t += dt; G.hoopFx = G.hoopFx.map(function (v) { return Math.max(0, v - dt * 2); });
    G.callouts.forEach(function (c) { c.t += dt; }); G.callouts = G.callouts.filter(function (c) { return c.t < c.life; });
    G.later = (G.later || []).filter(function (c) { if (G.t < c.at) return true; G.say(c.text, c.color, 1.6); return false; });   // (a grudge's comeback)
    if (G.phase === 'menu' || G.phase === 'paused') return;
    if (G.hitstop > 0) { G.hitstop -= dt; return; }   // freeze-frame on a hard hit
    // going on fire: a 2 s golden power-up with the camera zoomed in on him while everything else waits
    if (G.pu) { updatePowerup(dt); return; }
    if (G.cine && G.cine.kind === 'armbar') { updateArmbarCine(dt); return; }   // the arm bar: everything else waits
    if (G.cine && G.cine.kind === 'bothpunch') { updatePunchCine(dt); G.players.forEach(function (p) { if (p.faceCrater > 0) p.faceCrater -= dt; }); return; }   // the face punch: everything else waits too
    if (G.cine && (G.cine.kind === 'kick' || G.cine.kind === 'chase')) { if ((G.cine.t += dt) >= G.cine.dur) { if (G.cine.say) G.say('LOW BLOW!', '#ff5a4a', 1.4, 1.3); G.cine = null; } else dt *= G.cine.slow; }   // the low blow and the chase-down: 1 s of slow motion, everyone
    else if (G.cine) {   // the slow-motion dunks (everything slows equally, so nobody gets a better chance at it): under the legs all the way up
      // to the slam; off the backboard only from the toss until it's back in his hand
      var cp = G.cine.p, cu = cp.dk ? cp.st / cp.dk.T : 1, ck = G.cine.kind, bsi = G.ball.shotInfo;
      if (ck === 'roll' || ck === 'rev') {   // the layups: slow until the ball drops through (the finger roll from the top of his rise)
        var lfly = G.ball.state === 'shot' && bsi && bsi.by === cp && bsi.lay === ck;
        if (!lfly && !(cp.dk && cp.dk.lay === ck)) G.cine = null;
        else { dt *= ck === 'roll' && !lfly && cu < 0.45 ? 1 : lfly && G.cine.flySlow || G.cine.slow; G.cine.t = cp.st; }
      } else if (!cp.dk || cp.dk.style !== G.cine.kind || (G.cine.kind === 'board' && cu >= 0.5)) G.cine = null;
      else { dt *= G.cine.kind === 'board' && cu < 0.14 ? 1 : G.cine.slow || 0.4; G.cine.t = cp.st; }
    }
    if (G.show) updateShow(dt);   // the quarter-start / game-end twerk (everyone else stands still: they're waiting anyway)
    // (not while a slow-motion move or its ball is still playing out: the finger roll is still up in the air when he lands)
    if (G.puQueue) { var pq = G.puQueue; if ((G.phase === 'scored' || G.phase === 'play' || G.phase === 'inbound') && pq.grounded() && pq.state !== 'dunk' && pq.state !== 'fall' && pq.state !== 'dougie' && !G.cine) { G.puQueue = null; startPowerup(pq); return; } }
    if (G.tipT > 0 && (G.tipT -= dt) <= 0) G.say('STICK PAST THE RING = TURBO!', '#5cff7a', 3.5, 0.55);
    var live = G.phase === 'play', moving = live || G.phase === 'inbound';   // (during the inbound everyone moves; the clocks wait)
    // the ref's whistle (2K's, recorded): its blast lands right on GO
    if (G.phase === 'tip') { G.phaseT -= dt; if (!G.whistled && G.phaseT <= WHISTLE_AT) { G.whistled = true; Au.sfx && Au.sfx('whistle_2k', 0.9); } if (G.phaseT <= 0) { G.phase = 'play'; G.say('GO!', '#5cff7a', 0.8, 1.3); Au.sfx && Au.sfx('go'); } }
    else if (G.phase === 'scored') { G.phaseT -= dt; if (G.phaseT <= 0 && !(G.puQueue && G.phaseT > -2) && !(G.players.some(function (q) { return q.state === 'dougie'; }) && G.phaseT > -1.5)) G.startInbound(G.nextPoss); }   // a power-up still to come holds the restart, and a Dougie gets a moment to finish
    else if (G.phase === 'inbound' && G.inb) updateInbound(dt);
    else if (G.phase === 'break') { G.phaseT -= dt; if (G.phaseT <= 0) { G.q++; G.beginQuarter(); } }
    else if (G.phase === 'over') { G.phaseT -= dt; }
    if (live) {
      G.clock -= dt; if (G.ball.state === 'held') G.shot -= dt;
      if (G.shot <= 0 && G.ball.state === 'held') { Au.buzzer(); G.say('SHOT CLOCK!', '#ff5a4a', 1.2); G.phase = 'scored'; G.phaseT = 1.0; G.nextPoss = 1 - G.poss; }
      if (G.clock <= 0 && G.ball.state !== 'shot') G.endQuarter();
    }
    // the two teams take turns moving first, frame by frame: whoever moves second sees where the others just went (a defender stays
    // glued to his man, a rebounder gets there first), and always going first cost a team about 4 wins in 100 (10,000 simulated games)
    G.flip = !G.flip;
    (G.flip ? G.players : G.players.slice().reverse()).forEach(function (p) {
      for (var k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
      p.flash = Math.max(0, p.flash - dt);
      if (G.inb && G.inb.p === p) { if (p.human && ((p.inp || In).passDown)) G.inbPass(); }   // (the game walks the inbounder out; a person throws it in with PASS)
      else if (p.human) humanControl(p, dt, p.inp || In, moving); else HW.JamAI.update(p, dt, moving);   // p.inp: a guest's buttons, online
      physics(p, dt);
    });
    separate();
    var gl = G.glide;   // Gator jogging back to his spot after the quarter's twerk
    if (gl) { var gx = gl.x - gl.p.x, gz = gl.z - gl.p.z, gd = Math.hypot(gx, gz); if (gd < 0.05 || G.phase !== 'tip') G.glide = gl = null; else { var gv = Math.min(5, gd * 5) / gd; gl.p.vx = gx * gv; gl.p.vz = gz * gv; gl.p.x += gl.p.vx * dt; gl.p.z += gl.p.vz * dt; if (Math.abs(gx) > 0.3) gl.p.face = gx > 0 ? 1 : -1; } }
    G.players.forEach(function (p) { animate(p, dt); });
    if (gl) gl.p.vx = gl.p.vz = 0;
    updateBall(dt);   // after the anims, so the dribble follows this frame's hand
    // the camera rides with the ball, leading toward the basket its team is attacking
    var b = G.ball, bx = b.holder ? b.holder.x : b.x + b.vx * 0.3, lead = b.holder ? side(b.holder.team) * 1.6 : 0;
    if (G.show && G.show.kind === 'win') { bx = G.show.p.x; lead = 0; }   // (Gator's victory twerk: on him, as it zooms in)
    X.follow(bx + lead, dt);
  };

  // up/down the screen is squeezed by the camera, so moving in depth runs faster than along the court to feel as quick
  var ZS = G.ZS = 2.2;
  function move(p, mx, mz, turbo, dt) {
    var can = !(p.state === 'fall' || p.state === 'dunk' || p.state === 'shove' || p.state === 'shimmy' || p.state === 'dougie' || p.state === 'stepback' || p.state === 'cartwheel' || (p.state === 'shoot' && p.grounded()) || (p.state === 'pass' && p.passStyle === 'hike'));
    var m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; m = 1; }
    p.turboOn = false;
    if (turbo && m > 0.1 && can && (p.turbo > 2 || p.onFire)) { p.turboOn = true; if (!p.onFire) p.turbo = Math.max(0, p.turbo - p.drain * dt); }
    else p.turbo = Math.min(100, p.turbo + (p.hasBall ? 9 : 14) * dt);
    var sp = p.run * (p.turboOn ? p.turboMult : 1) * (p.hasBall ? 0.93 : 1) * (p.onFire ? (sig(p, 'speed') ? 1.3 : 1.1) : 1) * (p.human ? 1 : G.diff.speed) * (can ? 1 : 0) * (p.y > 0.05 ? 0.7 : 1);
    var k = 1 - Math.exp(-(m > 0.1 ? 10 : 12) * dt);
    if (p.state === 'fall') return;   // knocked flying: physics carries him, nobody steers
    var kz = 1 - Math.exp(-15 * dt);   // up and down the screen answers the stick quicker, so it feels as quick as running along the court
    p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp * G.ZS - p.vz) * kz;
  }
  G.move = move;
  function physics(p, dt) {
    p.st += dt;
    if (p.sht != null) { if (p.state === 'shoot' || p.state === 'stepback' || p.state === 'cartwheel') p.sht += dt; else { p.sht = null; p.relPress = null; } }   // the shot clock (from the press)
    // held too long (counted from the press, the same as any jump shot): judged as let go right then; still on the step-back or
    // cartwheel, or still rising, it goes up at the top of the jump (online, a guest's own let-go can still come in before that)
    if (p.human && p.sht != null && p.relPress == null && p.hasBall && !p.released && p.sht > p.tApex * (p.remote ? 1.95 : 1.7)) {
      p.relPress = p.sht;
      if (p.state === 'stepback' || p.state === 'cartwheel') p.sbRel = true; else if (p.st < p.tApex * G.relFrac(p)) p.sbAuto = true; else G.releaseShot(p);
    }
    if (p.hitT > 0) p.hitT -= dt;
    if (p.taunt && (p.taunt.t += dt) > 2) p.taunt = null;
    if (p.pending && p.state !== 'pass') p.pending = null;   // knocked out of a fancy pass (shoved, fell, new possession): the move is off
    // ball handlers change direction with a crossover or a behind-the-back dribble
    if (p.dm) { p.dm.t += dt; if (p.dm.t >= p.dm.dur || !p.hasBall || p.state !== 'idle') { p.dm = null; p.dribT = Math.floor(p.dribT || 0) + 0.5; } }
    else if (p.hasBall && p.def.type === 'handler' && p.state === 'idle' && p.grounded() && p.prevFace && p.face !== p.prevFace && Math.abs(p.vx) > 0.9) {
      p.dm = { type: Math.random() < 0.6 ? 'cross' : 'btb', t: 0, dur: 0.34, from: p.prevFace };
      // on fire, the crossover can put his man on the floor
      if (p.onFire) G.opps(p).forEach(function (q) { if (q.state !== 'fall' && q.grounded() && dist(p, q) < 1.8 && Math.random() < 0.65) { G.knockDown(q, p, { hard: 0.5, fallT: 1.0, blood: 0.5, y: 0.5 }); fireBurst(q.x, 0.4, q.z, 8); G.say(knockLine(p, q), '#ff8a5a', 1.2); hl('knock', p, 'CROSSOVER'); } });
    }
    p.prevFace = p.face;
    if (p.faceCrater > 0) p.faceCrater -= dt;   // (the face punch's crater fades after a few seconds)
    // speed on fire leaves afterimages
    if (sig(p, 'speed') && Math.hypot(p.vx, p.vz) > 4) { p.trailT = (p.trailT || 0) - dt; if (p.trailT <= 0) { p.trailT = 0.045; (p.trail = p.trail || []).unshift({ x: p.x, y: p.y, z: p.z, anim: p.anim, dir: p.dir, frame: p.frame, face: p.face }); if (p.trail.length > 3) p.trail.pop(); } }
    else if (p.trail && p.trail.length) p.trail.pop();
    if (p.state === 'dunk') { updateDunk(p, dt); return; }
    if (p.state === 'stepback') { stepback(p, dt); return; }
    if (p.state === 'cartwheel') { cartwheel(p, dt); return; }
    if (p.state === 'armbar') { updateArmbar(p, dt); return; }
    if (p.state === 'slam') { updateSlam(p, dt); return; }
    // arm-barred: glued to the man who has the arm until the snap; then down for HURT seconds whatever the clock is doing
    if (p.state === 'fall' && (p.abBy || p.hurtT > 0)) {
      p.vx = p.vz = 0; if (p.abBy && p.abBy.state !== 'armbar' && !p.hurtT) { p.abBy = null; p.fallT = p.st + 0.6; }   // the hold was broken before the snap
      if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; } }   // (kicked up in the air contesting)
      if (p.hurtT > 0 && (p.hurtT -= dt) <= 0) { p.hurtT = 0; p.abBy = null; p.nut = false; p.nutAt = null; p.slammed = false; p.state = 'idle'; p.flash = 0.8; }
      return;
    }
    // (on his feet with time still on the injury - something stood him up early: it runs out all the same, so the badge never sticks)
    if (p.hurtT > 0 && (p.hurtT -= dt) <= 0) { p.hurtT = 0; p.abBy = null; }
    if (p.state === 'fall') { var fr = p.y > 0 ? 1.2 : 6; p.vx *= Math.max(0, 1 - fr * dt); p.vz *= Math.max(0, 1 - fr * dt); if (p.st > (p.fallT || 1.3)) { p.state = 'idle'; p.flash = 0.6; p.fallT = 0; } }
    if (p.state === 'pass' && p.passStyle === 'moon' && p.st < 0.75) { p.vx = -p.face * 1.8; p.vz *= 0.85; }   // moonwalking backward toward his man
    if (p.state === 'chase') { p.vx = p.vz = 0; p.face = p.chaseFace || p.face; }   // the chase-down: up at the glass with it, facing the board
    if (p.state === 'dougie') { p.face = -side(p.team); p.vx = p.face * 1.3; p.vz = 0; if (p.st > DOUGIE_T) { p.state = 'idle'; p.vx = 0; } }   // side-stepping back up the court
    if (p.state === 'shoot' && p.fade && p.y > 0) { p.vx = (p.x > rimX(p.team) ? 1 : -1) * 2.0; p.vz *= 0.9; }   // the fadeaway drifts away from the rim
    if (p.state === 'shoot' && p.onefoot && p.y > 0) { p.vx = (p.x > rimX(p.team) ? -1 : 1) * 0.9; p.vz *= 0.85; }   // the one-footer carries on a little toward it
    p.x = clamp(p.x + p.vx * dt, -K.HL - 0.6, K.HL + 0.6); p.z = clamp(p.z + p.vz * dt, 0.3, K.CD - 0.3);
    if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.impact) slam(p); if (p.state === 'jump' || p.state === 'hammer' || p.state === 'chase') p.state = 'idle'; if (p.state === 'shoot') { if (!p.released && p.hasBall) G.releaseShot(p); p.state = p.shimmy ? 'shimmy' : 'idle'; p.st = 0; p.shimmy = false; if (p.fade || p.onefoot) p.vx *= 0.15; p.fade = false; p.onefoot = false; if (p.state === 'shimmy') { p.vx = p.vz = 0; } } } }
    if (p.state === 'shoot' && !p.kickRoll && p.vy > 0 && p.y > 0.08) { p.kickRoll = true; tryKick(p); }
    if (p.kick) updateKick(p, dt);
    if (p.state === 'shoot' && p.hasBall && !p.released && p.sbAuto && p.st >= p.tApex * G.relFrac(p)) G.releaseShot(p);   // let go during the step-back or cartwheel: up it goes (a shooter's on the way up)
    if (p.state === 'shoot' && p.hasBall && !p.released && p.st > p.tApex * (p.remote ? 1.95 : 1.7)) G.releaseShot(p);   // a guest's release is on its way: wait longer for it
    if (p.state === 'pass') updatePending(p);
    if ((p.state === 'pass' && p.st > (p.passStyle ? FANCY[p.passStyle].dur : 0.3) && p.grounded()) || (p.state === 'steal' && p.st > 0.3) || (p.state === 'shove' && p.st > 0.35) || (p.state === 'cheer' && p.st > 1.5) || (p.state === 'shimmy' && p.st > 1.4)) p.state = 'idle';
  }
  function separate() {
    var P = G.players;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j]; if (a.state === 'dunk' || b.state === 'dunk' || a.state === 'fall' || b.state === 'fall' || a.state === 'slam' || b.state === 'slam') continue;
      // bodies bump: the stronger player holds his ground and moves the weaker one (boxing out)
      var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.65 && d > 1e-4) { var gap = 0.65 - d, sa = a.def.stats.str, sb = b.def.stats.str, wa = sb / (sa + sb), wb = 1 - wa; a.x -= dx / d * gap * wa; a.z -= dz / d * gap * wa; b.x += dx / d * gap * wb; b.z += dz / d * gap * wb; }
    }
  }

  function humanControl(p, dt, In, live) {
    if (!live) { move(p, 0, 0, false, dt); return; }
    move(p, In.mx, In.mz, In.turbo, dt);
    if (Math.abs(p.vx) > 1.0 && Math.abs(p.vx) > 0.5 * Math.abs(p.vz) / G.ZS && p.state !== 'shoot' && p.state !== 'pass') p.face = p.vx > 0 ? 1 : -1;   // running up or down the screen, a little sideways drift doesn't flip him   // a little sideways drift while running up or down doesn't flip him
    var holder = G.ball.holder, mate = G.mates(p)[0];
    // shove: the touch SHOVE button, or TURBO + PASS on a keyboard (stick turbo never turns a pass or steal into a shove)
    var shove = In.actDown || (In.passDown && In.comboTurbo);
    if (!p.hasBall) p.dunkBuf = 0;
    if (p.hasBall) {
      // DUNK pressed a moment before he's in range (up to DUNK_BUF s) still counts: he goes up the moment he gets there. TURBO + SHOOT
      // on a keyboard the same, when he's charging the rim and nearly there; if he never gets in range that one turns into a jump shot
      var near = Math.hypot(p.x - rimX(p.team), p.z - K.HZ) < G.dunkReach(p) + 1.5;
      if (In.shootDown) { if (In.turbo && towardRim(p, In) && G.canDunk(p)) G.startDunk(p); else if (In.turbo && towardRim(p, In) && near && p.grounded() && !p.busy()) { p.dunkBuf = DUNK_BUF; p.bufShot = true; } else G.startShot(p); }
      if (In.actDown) { if (G.canDunk(p)) G.startDunk(p); else { p.dunkBuf = DUNK_BUF; p.bufShot = false; } }   // the touch DUNK button
      if (p.dunkBuf > 0 && p.state !== 'dunk') { if (G.canDunk(p)) { p.dunkBuf = 0; G.startDunk(p); } else if ((p.dunkBuf -= dt) <= 0) { p.dunkBuf = 0; if (p.bufShot) G.startShot(p); } }
      // let go: judged on how long after the press (a guest's comes with his own timing); during the step-back or cartwheel the shot
      // goes up on its own at the top of the jump
      if (In.shootUp) {
        if (p.sht != null && p.relPress == null) p.relPress = p.sht;
        if (p.state === 'stepback' || p.state === 'cartwheel') p.sbRel = true;
        else if (p.state === 'shoot' && (p.stepT || p.cart) && !p.released && p.st < p.tApex * G.relFrac(p)) p.sbAuto = true;   // (just off the move: at the top, not off the floor)
        else G.releaseShot(p);
      }
      if (In.passDown) G.passTo(p, mate);
    } else if (holder && holder.team === p.team) {
      // arcade teamwork: PASS calls for the ball, SHOOT tells your teammate to shoot; you can shove a defender off him
      if (shove) G.tryShove(p); else if (In.passDown) G.passTo(holder, p);
      if (In.shootDown && !(G.inb && G.inb.p === holder)) { if (G.canDunk(holder)) G.startDunk(holder); else G.startShot(holder); holder.ai.autoRelease = true; }
    } else {
      if (In.shootDown) G.jump(p);
      if (shove) G.tryShove(p); else if (In.passDown) G.trySteal(p);
    }
  }
  function towardRim(p, In) { var rx = rimX(p.team), dx = rx - p.x, dz = K.HZ - p.z, d = Math.hypot(dx, dz) || 1, m = Math.hypot(In.mx, In.mz); return m < 0.2 || (In.mx * dx + In.mz * dz) / (d * m) > 0.3; }

  function updateBall(dt) {
    if (!(dt > 0)) return;   // velocities below divide by dt
    var b = G.ball; if (b.swoosh > 0) b.swoosh -= dt; b.noCatch = Math.max(0, (b.noCatch || 0) - dt); b.inFront = false; b.behind = false; b.baked = false; if (b.state !== 'shot' && b.state !== 'through') b.rollSpin = 0;
    b.fire = !!((b.holder && b.holder.onFire && !(G.cine && G.cine.p === b.holder)) || (b.shotInfo && b.shotInfo.by.onFire && b.state === 'shot') || (b.state === 'pass' && b.pass && b.pass.from.onFire));   // not in the slow-motion dunk: the ball stays in plain view
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
      if (sh.state === 'shoot' && !sh.released && sh.y > 0.1 && !guarded(sh)) G.opps(sh).forEach(function (q) {
        if (!q.human || b.holder !== sh || q.y < 0.15 || q.cd.block) return;
        var d = Math.hypot(q.x - sh.x, q.z - sh.z);
        if (d < (G.relFrac(sh) < 1 ? QR_NEAR : 1.5) && b.y < q.y + q.reach + 0.7) { q.cd.block = 1; if (Math.random() < G.humanBlock(q, d)) G.blocked(q, sh, null); }   // (a shooter's quick release: only from right in his face)
      });
      return;
    }
    if (b.state === 'shot') {
      var s = b.shotInfo, u = Math.min(1, (s.t += dt) / s.T);
      var ex = s.rx + (s.make ? 0 : s.missX), ez = K.HZ + (s.make ? 0 : s.missZ), ey = K.RIM_H + 0.12;
      var nx = s.x0 + (ex - s.x0) * u, nz = s.z0 + (ez - s.z0) * u, ny = s.y0 + (ey - s.y0) * u + s.arc * 4 * u * (1 - u);
      if (s.bank) {   // off the glass: up into the board, then down into the rim
        var bk = s.bank, ba = Math.min(1, u / bk.f), bc = Math.max(0, (u - bk.f) / (1 - bk.f));
        if (u < bk.f) { nx = s.x0 + (bk.x - s.x0) * ba; nz = s.z0 + (bk.z - s.z0) * ba; ny = s.y0 + (bk.y - s.y0) * ba + s.arc * 4 * ba * (1 - ba); }
        else { if (!s.banked) { s.banked = true; Au.board && Au.board(); } nx = bk.x + (ex - bk.x) * bc; nz = bk.z + (ez - bk.z) * bc; ny = bk.y + (ey - bk.y) * bc + 0.15 * 4 * bc * (1 - bc); }
      }
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt; b.vz = (nz - b.z) / dt; b.x = nx; b.y = ny; b.z = nz;
      // blocks: anyone off the floor near the ball in its flight (goaltending is legal here); one try per jump. You get a wide reach
      // and good odds when you're right on him (G.humanBlock); computer blockers need to be closer and get worse odds
      G.opps(s.by).forEach(function (q) {
        if (b.state !== 'shot' || s.lay || s.sure || q.y < 0.15 || q.cd.block) return;   // (not a step-back or cartwheel three)
        if (s.near && (s.near.indexOf(q) < 0 || u >= QR_U)) return;   // a shooter's quick release: too late to get to it
        var hum = q.human, d = Math.hypot(q.x - b.x, q.z - b.z);
        if (u < (hum ? 0.6 : 0.45) && d < (hum ? 1.6 : 1.0) + (sig(q, 'block') ? 0.5 : 0) && b.y < q.y + q.reach + (hum ? 0.7 : 0.35)) {
          q.cd.block = 1; s.tries = (s.tries || 0) + 1;
          if (Math.random() < (hum ? G.humanBlock(q, d) : Math.min(0.85, (0.16 + 0.035 * q.def.stats.block) * G.diff.block * (sig(q, 'block') ? 2.5 : 1)))) G.blocked(q, s.by, s);
        }
      });
      if (b.state === 'shot' && u >= 1) {
        if (s.make) { b.state = 'through'; b.vy = -3; b.vx = b.vz = 0; Au.net && Au.net(); G.scored(s.by, s.three ? 3 : 2, false); }
        else { b.state = 'loose'; Au.rim(6); G.missed(s); if (s.quality === 'bad') Au.ew && Au.ew(); var sd = s.rx > 0 ? -1 : 1; b.vx = sd * rand(1.5, 4.5); b.vy = rand(2.5, 5); b.vz = rand(-2.5, 2.5); b.noCatch = 0.15; G.shot = 24; }
      }
      return;
    }
    if (b.state === 'through') { b.y += b.vy * dt; b.vy -= GRAV * 0.5 * dt; b.inFront = true; if (b.y < 0.15) { b.y = 0.15; b.vy = 0; } return; }
    if (b.state === 'pass') {
      var ps = b.pass, v = Math.min(1, (ps.t += dt) / ps.T);
      // heat-seeking, by the passer's PASS: the ball bends toward where the receiver will be when it gets there, so however he drifts
      // a great passer's ball finds him (the aim swings at most 30 m/s, so a receiver who cuts back gets a curve, not a jump)
      if (ps.home > 0 && ps.to.state !== 'fall') {
        var rem = Math.max(0, ps.T - ps.t), wx = ps.ax + (ps.to.x + ps.to.vx * rem + ps.mx - ps.ax) * ps.home, wz = ps.az + (ps.to.z + ps.to.vz * rem + ps.mz - ps.az) * ps.home;
        var sw = Math.hypot(wx - ps.x1, wz - ps.z1), cap = 30 * dt; if (sw > cap) { wx = ps.x1 + (wx - ps.x1) * cap / sw; wz = ps.z1 + (wz - ps.z1) * cap / sw; }
        ps.x1 = wx; ps.z1 = wz;
      }
      var px = ps.x0 + (ps.x1 - ps.x0) * v, pz = ps.z0 + (ps.z1 - ps.z0) * v, py = ps.y0 + (ps.y1 - ps.y0) * v + ps.arc * 4 * v * (1 - v);
      b.vx = (px - b.x) / dt; b.vz = (pz - b.z) / dt; b.vy = (py - b.y) / dt; b.x = px; b.z = pz; b.y = py;
      // interceptions
      // one try per defender per pass (it used to roll every frame the ball was in reach, so a defender in the lane almost always got it)
      var thief = null; ps.tried = ps.tried || [];
      G.opps(ps.from).forEach(function (q) { if (!thief && v > 0.2 && v < 0.9 && q.state !== 'fall' && ps.tried.indexOf(q) < 0 && Math.hypot(q.x - b.x, q.z - b.z) < (sig(q, 'steal') ? 0.95 : 0.55) && b.y < q.y + q.reach) thief = q; });
      if (thief) ps.tried.push(thief);
      if (thief && Math.random() < (thief.human ? 0.75 : 0.5 * G.diff.steal) * ps.safe * (sig(thief, 'steal') ? 1.6 : 1)) { thief.stats.steals++; G.give(thief); hl('steal', thief, 'INTERCEPTION'); G.say('INTERCEPTED!', '#7ee0ff', 1.1); Au.steal(); Au.laugh && Au.laugh(); Au.catch(); return; }
      // the receiver catches it as soon as it reaches him near the end of the flight
      if (v > 0.7 && ps.to.state !== 'fall' && dist(ps.to, b) < 0.8 && b.y < ps.to.y + ps.to.reach) v = 1;
      if (v >= 1) { if (ps.to.state !== 'fall' && (dist(ps.to, b) < (ps.inb ? 2.8 : 1.6) || ps.home >= 1 && dist(ps.to, b) < 3)) { G.give(ps.to); ps.to.assist = { by: ps.from, t: G.t }; Au.catch(); } else { b.state = 'loose'; b.vy = 0; } }   // (a full homer always gets there)
      return;
    }
    // loose ball physics + pickups
    b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < 0.15) { b.y = 0.15; if (b.vy < -1.2) { if (G.phase !== 'over') (Au.dribble || Au.bounce)(Math.abs(b.vy)); b.vy = -b.vy * 0.6; } else b.vy = 0; b.vx *= 0.97; b.vz *= 0.97; }
    if (Math.abs(b.x) > K.HL + 0.8) { b.x = Math.sign(b.x) * (K.HL + 0.8); b.vx *= -0.5; }
    if (b.z < 0.1 || b.z > K.CD + 0.5) { b.z = clamp(b.z, 0.1, K.CD + 0.5); b.vz *= -0.5; }
    if (b.noCatch > 0 || G.phase !== 'play') return;
    var best = null, bd = 0.85;
    G.players.forEach(function (p) { if (p.state === 'fall' || p.state === 'dunk' || p.state === 'slam' || p.cd.catch > 0) return; var d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd && b.y < p.y + p.reach && b.y > p.y - 0.2) { bd = d; best = p; } });
    if (best) { G.give(best); Au.catch(); }
  }

  function animate(p, dt) {
    var sh = G.show; if (sh && sh.p === p && sh.t < sh.len) { twerkFrame(p, sh); return; }
    var sp = Math.hypot(p.vx, p.vz), b = G.ball;
    if (p.state !== 'dunk') {
      // which way the body turns: toward / away from the camera when running mostly up or down the screen. Hysteresis and a short
      // hold keep diagonal runs from flickering between the side and front views.
      p.dirT = Math.max(0, (p.dirT || 0) - dt);
      var ang = Math.atan2(Math.abs(p.vz) / G.ZS, Math.abs(p.vx)), want = p.dir;
      // he turns to run straight at / away from you only when he's really going up or down the screen; on a diagonal he stays side-on,
      // so a thumb that's a bit off vertical doesn't make him pop between views
      if (sp > 0.6) { if (ang > 1.12) want = p.vz < 0 ? 'F' : 'B'; else if (ang < 0.85) want = 'R'; else if (want === 'F' || want === 'B') want = p.vz < 0 ? 'F' : 'B'; }
      else if (p.state !== 'idle') want = 'R';
      if (want !== p.dir && p.dirT <= 0) { p.dir = want; p.dirT = 0.18; }
      if (sp < 0.6 && p.state === 'idle' && !p.hasBall) { var tgt = b.holder || b; p.face = tgt.x >= p.x ? 1 : -1; }
      if (p.hasBall && sp < 0.6 && p.state === 'idle') p.face = side(p.team);
    }
    switch (p.state) {
      case 'dunk': return;
      case 'powerup': {   // stance, arms crossed (charging), the down-thrust, then the held power stance trembling in the aura
        var t = p.st - (G.pu && G.pu.p === p ? G.pu.tw : 0);   // after Gator's twerk
        p.anim = 'powerup'; p.dir = 'C';
        p.frame = t < 0.2 ? 0 : t < 0.35 ? 1 : t < PU.boom ? 2 : t < PU.boom + 0.12 ? 3 : 4 + Math.floor((t - PU.boom - 0.12) / 0.08) % 4; return;
      }
      case 'slam': p.anim = 'slam'; p.dir = 'R'; p.frame = slamFrame(p.st); return;
      case 'armbar': p.anim = 'armbar'; p.dir = 'R'; p.frame = p.st < AB_T ? Math.min(7, Math.floor(p.st / AB_T * 8)) : 8 + Math.min(3, Math.floor((p.st - AB_T) / (AB_UP / 4))); return;
      case 'fall':
        if (p.nut && X.hasAnim(p, 'nutted')) {   // the low blow: up contesting until the foot lands, then down - and rocking on his back
          var tn = p.nutAt == null ? -1 : p.st - p.nutAt; p.anim = 'nutted'; p.dir = 'R';
          p.frame = tn < 0 ? 0 : tn < 0.1 ? 1 : tn < 0.3 ? 2 : tn < 0.5 ? 3 : tn < 0.9 ? 4 : tn < 1.1 ? 5 : 6 + Math.floor((G.t || 0) * 3) % 4; return;
        }
        if (p.slammed) { p.anim = 'fall'; p.dir = 'R'; p.frame = Math.min(3, p.st / 0.06); return; }   // body-slammed: driven flat onto his back
        if ((p.abBy || p.hurtT > 0) && X.hasAnim(p, 'armbarred')) {   // under the arm bar (in step with him), then lying there clutching the elbow
          var by = p.abBy; p.anim = 'armbarred'; p.dir = 'R';
          p.frame = by && by.state === 'armbar' && by.st < AB_T ? Math.min(7, Math.floor(by.st / AB_T * 8)) : 8 + Math.floor((G.t || 0) * 3) % 4; return;
        }
        p.anim = 'fall'; p.dir = 'R'; p.frame = Math.min(3, p.st / 0.12); return;
      case 'cartwheel': p.anim = 'cartwheel'; p.dir = 'C'; p.frame = Math.min(13, Math.floor(p.st / CW_T * 14)); return;
      case 'stepback': if (X.hasAnim(p, 'stepback')) { p.anim = 'stepback'; p.frame = p.st < 0.08 ? 0 : p.st < 0.26 ? 1 : 2; } else { p.anim = 'shoot'; p.frame = 0; } p.dir = 'R'; return;
      case 'shimmy': p.anim = 'shimmy'; p.dir = 'F'; p.frame = (p.st * 11) % 6; return;   // the shoulder shimmy after a made three
      case 'dougie': p.anim = p.dougie || 'dougie'; p.dir = 'R'; p.frame = Math.floor(p.st * 16 / 1.4) % 16; return;   // a 1.4 s beat-cycle
      case 'shoot': if (p.kick && X.hasAnim(p, 'shoot_kick')) { p.anim = 'shoot_kick'; p.dir = 'R'; p.frame = p.released ? (p.st2 = (p.st2 || 0) + dt, p.st2 < 0.12 ? 3 : 4) : p.kick.t < KICK_HIT ? 1 : 2; return; }
        if (p.def.type === 'shooter' && !p.cart && !p.fade && !p.onefoot && X.hasAnim(p, 'shoot_steph')) {   // the Steph Curry form: one motion, let go on the way up
          p.anim = 'shoot_steph'; if (p.dir === 'B') p.dir = 'R';
          p.frame = p.released ? (p.st2 = (p.st2 || 0) + dt, p.st2 < 0.1 ? 3 : 4) : p.grounded() ? 0 : p.st < p.tApex * QUICK * 0.55 ? 1 : 2; return;
        }
        p.anim = p.cart && X.hasAnim(p, 'shoot_chuck') ? 'shoot_chuck' : p.fade && X.hasAnim(p, 'shoot_fade') ? 'shoot_fade' : p.onefoot && X.hasAnim(p, 'shoot_onefoot') ? 'shoot_onefoot' : 'shoot'; if (p.dir === 'B' || p.anim === 'shoot_onefoot') p.dir = 'R'; p.frame = p.released ? (p.st2 = (p.st2 || 0) + dt, p.st2 < 0.12 ? 3 : 4) : (p.grounded() ? 0 : p.vy > 1 ? 1 : 2); return;
      case 'jump': p.anim = 'jump'; if (p.dir === 'B') p.dir = 'R'; p.frame = p.vy > 2 ? 1 : 2; return;
      case 'pass': if (p.passStyle) { var F = FANCY[p.passStyle]; p.anim = 'pass_' + p.passStyle; p.dir = p.passStyle === 'back' ? 'W' : 'R'; p.frame = frameAt(F, p.st); }
        else { p.anim = 'pass'; p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); } return;
      case 'steal': p.anim = 'steal'; if (p.dir === 'B') p.dir = 'R'; p.frame = Math.min(2, p.st / 0.1); return;
      case 'shove': if (p.shoveStyle) { p.anim = 'shove_' + p.shoveStyle; p.frame = Math.min(3, p.st / 0.09); } else { p.anim = 'shove'; p.frame = Math.min(2, p.st / 0.1); } p.dir = 'R'; return;
      case 'chase': p.anim = 'block_chase'; p.dir = 'R'; p.frame = p.st < 0.05 ? 0 : p.st < 0.18 ? 1 : p.st < 0.32 ? 2 : p.vy > -1.5 ? 3 : 4; return;
      case 'hammer': p.anim = 'block_hammer'; p.dir = 'R'; p.frame = p.st < 0.12 ? 0 : p.st < 0.24 ? 1 : p.st < 0.36 ? 2 : 3; return;
      case 'cheer': p.anim = 'cheer'; p.dir = 'F'; p.frame = (G.t * 8) % 4; return;   // st is parked at -99 for the end-of-game cheer
    }
    if (p.dm) { p.anim = 'dr_' + p.dm.type; p.dir = 'R'; p.frame = Math.min(3, Math.floor(p.dm.t / p.dm.dur * 4)); return; }
    var defending = b.holder && b.holder.team !== p.team && dist(p, b.holder) < 3;
    // stride rate follows the ground speed (depth speed counted at its true length), in real time so 120 Hz phones don't double it
    var stride = Math.hypot(p.vx, p.vz / G.ZS);
    var drib = p.hasBall && G.phase !== 'over';   // after the final buzzer whoever has it just holds it
    if (sp > 0.6) { p.anim = drib ? 'drun' : (defending && sp < 4 ? 'defend' : 'run'); p.frame = (p.frame + Math.min(stride, 9) * dt * 1.7) % 8; }
    else { p.anim = drib ? 'dribble' : defending ? 'defend' : 'idle'; p.frame = (p.frame + dt * (drib ? 9 : 4)) % 6; }
    // a taunt rides on top of normal play for 2 s: same legs, taunting arms (with the ball, shooting, blocking... he plays it straight).
    // The chop slams down twice: up, down, up, down and hold
    if (p.taunt && !p.hasBall) {
      var tk = p.taunt.k, tt = p.taunt.t;
      if (tk === 'chop') tk = tt < 0.3 || (tt > 0.75 && tt < 1.05) ? 'chopU' : 'chopD';
      p.anim = (sp > 0.6 ? 'run_' : 'idle_') + tk; if (p.dir === 'B') p.dir = 'R';   // taunts are drawn side-on or facing the camera
    }
  }

  // the twerk: hips popping 3 times a second; in the power-up a third as fast in the slow motion, then after the flash harder and
  // nearly twice as fast (pumped up), the cheeks rippling for a moment after each smack
  function twerkFrame(p, sh) {
    var t = sh.t; p.dir = 'R';
    if (sh.kind === 'win') { p.anim = p.ssj && X.hasAnim(p, 'twerk_hard') ? 'twerk_hard' : 'twerk'; p.frame = Math.floor(t / (WIN.beat / 12)) % 6; return; }
    if (sh.kind !== 'pu') { p.anim = 'twerk'; p.frame = Math.floor(t / 0.05) % 6; return; }
    if (t < TW.slow1) { var w = t < TW.slow0 ? t : TW.slow0 + (t - TW.slow0) / 3; p.anim = 'twerk'; p.frame = Math.floor(w / 0.05) % 6; return; }
    var h = null; for (var i = TW.hits.length - 1; i >= 0; i--) if (t >= TW.hits[i]) { h = TW.hits[i]; break; }
    if (h !== null && t - h < 0.3) { p.anim = 'twerk_hit_hard'; p.frame = Math.min(7, Math.floor((t - h) / 0.0375)); return; }
    p.anim = 'twerk_hard'; p.frame = Math.floor(t / 0.03) % 6;
  }
  G.endQuarter = function () {   // (Gator twerks once more at the final buzzer)
    Au.buzzer();
    // the final buzzer: the announcer, and a guy on the winning team whoops "yeah!" over it
    if (G.q >= 4 && G.score[0] !== G.score[1]) {
      var w = G.score[0] > G.score[1] ? 0 : 1, tws = twerkers(), tg = tws.filter(function (q) { return q.team === w; })[0] || tws[0] || null, gw = tg && tg.team === w;   // gw: a twerker's team won - his victory twerk
      G.phase = 'over'; G.phaseT = gw ? WIN.len : 4; G.vic = !!gw; if (tg) startShow(tg, gw ? 'win' : 'solo', gw ? WIN.len : TW.end); Au.sfx && Au.sfx(w === G.humanTeam ? 'you_win' : 'you_lose'); if (G.players.some(function (p) { return p.team === w && isGuy(p); })) Au.sfx && Au.sfx('shout1', 0.9, 0.7); G.say(G.team(w).name.toUpperCase() + ' WIN!', G.team(w).color, gw ? WIN.len - 0.8 : 4, 1.2); G.players.forEach(function (p) { if (p.team === w) { p.state = 'cheer'; p.st = -99; } }); Au.cheer(true); return;
    }
    G.phase = 'break'; G.phaseT = 3.2; G.say(G.q >= 4 ? 'TIED! OVERTIME' : 'END OF ' + ['1ST', '2ND', '3RD', '4TH'][G.q - 1], '#fff', 3);
  };

  G.say = function (text, color, life, size) { G.callouts.push({ text: text, color: color || '#ffe14d', life: life || 1.4, t: 0, size: size || 1 }); if (G.callouts.length > 3) G.callouts.shift(); };
})(window.HW);
