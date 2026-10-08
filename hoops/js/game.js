/* game.js - match flow: players, phases, clocks, scoring, human control, camera */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U, I = HW.Input, S = HW.Shoot, UI = HW.UI, Au = HW.Audio, Act = HW.Act;
  var THROW_SCALE = 1.6;
  var G = HW.Game = { players: [], human: null, score: [0, 0], q: 1, clock: 0, shotClock: 24, phase: 'idle', phaseT: 0, timeScale: 1, t: 0, possTeam: -1, charge: 0, vrHeld: -1, camMode: 'chase' };
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  var PH = {
    two: ['BUCKET!', 'NOTHING BUT NET!', 'CASH IT IN!', 'MONEY!', 'COUNT IT!', 'PUT IT IN THE BOOK!'],
    three: ['SPLASH FROM DOWNTOWN!', 'RAIN MAKER!', 'THREE IN THE HOLE!', 'FROM THE PARKING LOT!', 'FROM WAY OUT THERE!'],
    swish: ['SWISHEROONI!', 'NOT A TOUCH!', 'PURE BUTTER!'],
    dunk: ['KABLAMMO!', 'SLAM-A-LICIOUS!', 'RIM ROCKER!', 'SHAZAMMA-JAMMA!', 'ROOF-RATTLER!']
  };
  HW.PHRASES = PH;

  G.init = function (ctx) {
    G.ctx = ctx; G.ball = ctx.ball; G.world = ctx.world; G.scene = ctx.scene; G.camera = ctx.camera; G.rig = ctx.rig;
    Act.init(G); HW.AI.init(G);
    ctx.vrStart = function () { G.pendingPlace = 3; };
    ctx.vrEnd = function () { if (G.human) I.lookYaw = G.human.yaw; G.vrHeld = -1; };
    G.ball.onScore = function (hoopIdx) { G.onScore(hoopIdx); };
    G.ball.onEvent = G.onBallEvent;
    HW.Menu.init(G.scene); G.phase = 'menu'; document.body.classList.add('inmenu');
    var q = /[?&]quick(=(\w+))?/.exec(location.search);
    if (q) {
      var hid = (q[2] && HW.PLAYERS[q[2]]) ? q[2] : 'carl', hteam = HW.PLAYERS[hid].team, teams = [null, null];
      teams[hteam] = [hid, HW.TEAMS[hteam].roster.filter(function (id) { return id !== hid; })[hteam === 0 ? 0 : 1]];
      teams[1 - hteam] = HW.TEAMS[1 - hteam].roster.slice(0, 2);
      G.start({ teams: teams, human: hid, difficulty: HW.settings.difficulty });
    } else HW.Menu.show('title');
  };

  G.onBallEvent = function (type, v, h) {
    var shot = G.ball.shot || G.lastShot;
    if (type === 'bounce') { Au.bounce(v); var s0 = G.ball.shot; if (s0 && !s0.scored && G.ball.airT > 0.35) G.shotMissed(s0); }
    else if (type === 'rim') { Au.rim(v); if (G.ball.shot) G.ball.shot.rim = true; }
    else if (type === 'board') { Au.board(); if (G.ball.shot) G.ball.shot.board = true; }
  };

  /* ---------- setup ---------- */
  G.start = function (setup) {
    G.setup = setup; G.paused = false; document.body.classList.remove('inmenu'); HW.Menu.hide(); G.ctx.comfortBoost = 0;
    G.players.forEach(function (p) { G.scene.remove(p.root); G.world.removeBlob(p.blob); });
    G.players = []; G.human = null;
    var hdef = HW.PLAYERS[setup.human], hteam = hdef.team;
    var slotCount = [0, 0];
    setup.teams.forEach(function (ids, team) {
      ids.forEach(function (id) {
        if (setup.only && id !== setup.human) return;
        var p = new HW.Player(HW.PLAYERS[id], team, slotCount[team]++, G.world, G.scene, id === setup.human);
        G.players.push(p); if (id === setup.human) G.human = p;
      });
    });
    G.diff = HW.DIFFICULTY[setup.difficulty || 'normal']; G.humanTeam = hteam;
    G.score = [0, 0]; G.q = 1; G.possTeam = -1; G.lastShot = null; G.shotInAir = false;
    G.human.arrowOn = true;
    HW.XR.tint && HW.XR.tint(hdef.skin, hdef.color);
    HW.ctx.eyeY = G.human.eyeHeight(); HW.ctx.recenter && HW.ctx.recenter();
    G.timeScale = 1; G.slowTarget = 1; G.ctx.comfortBoost = 0; G.runCalled = [false, false]; G.runPts = 0; G.runTeam = -1; G.ball.setFire(false);
    G.beginQuarter(true);
  };

  G.opponentsOf = function (p) { return G.players.filter(function (q) { return q.team !== p.team; }); };
  G.matesOf = function (p) { return G.players.filter(function (q) { return q.team === p.team && q !== p; }); };

  /* ---------- phases & clocks ---------- */
  G.beginQuarter = function (first) {
    G.clock = G.q > 4 ? C.OT_S : C.QUARTER_S; G.shotClock = C.SHOT_CLOCK;
    G.formation(first ? G.humanTeam : G.possTeam < 0 ? G.humanTeam : (G.q % 2 ? G.humanTeam : 1 - G.humanTeam), 'tip');
    G.phase = 'countdown'; G.phaseT = 3.2; G.cdLast = 4;
    UI.callout((G.q > 4 ? 'OVERTIME' : 'QUARTER ' + G.q), '#ffffff', { life: 1.6, size: 110, silent: true });
  };

  G.formation = function (team, mode) {
    var own = team === 0 ? 1 : -1;               // +1: team 0's own half is +z
    var off = G.players.filter(function (p) { return p.team === team; }), def = G.players.filter(function (p) { return p.team !== team; });
    var yawOff = team === 0 ? 0 : Math.PI, yawDef = team === 0 ? Math.PI : 0;
    G.players.forEach(function (p) { p.vel.set(0, 0, 0); p.y = 0; p.vy = 0; p.state = 'idle'; p.stateT = 0; p.dunk = null; p.slow = 0; p.cd.catchBlock = 0; p.turboLock = false; if (!p.onFire) p.hasBall = false; });
    var spots;
    if (mode === 'tip') spots = { off: [[0, own * 1.5], [3.0, own * 4.2]], def: [[-2.2, -own * 1.8], [2.2, -own * 3.5]] };
    else spots = { off: [[0, own * 10.4], [3.0, own * 5.0]], def: [[-2.4, -own * 4.2], [2.4, -own * 4.2]] };
    if (G.setup && G.setup.only) spots.off[0] = [0, own * 2.0];
    off.forEach(function (p, i) { var s = spots.off[i] || spots.off[0]; p.pos.set(s[0], 0, s[1]); p.yaw = yawOff; });
    def.forEach(function (p, i) { var s = spots.def[i] || spots.def[0]; p.pos.set(s[0], 0, s[1]); p.yaw = yawDef; });
    var ball = G.ball, holder = off[0];
    if (team === G.humanTeam && G.human) holder = G.human; else if (off.length > 1) holder = off.slice().sort(function (a, b) { return (b.def.type === 'handler') - (a.def.type === 'handler') || b.def.stats.speed - a.def.stats.speed; })[0];
    if (off.indexOf(holder) > 0) { off.splice(off.indexOf(holder), 1); off.unshift(holder); }
    G.players.forEach(function (p) { p.hasBall = false; });
    ball.holder = null; G.possTeam = -1; G.lastShot = null; G.shotInAir = false; ball.shot = null; ball.pass = null; ball.setFire(false);
    if (holder) { Act.grab(holder); G.shotClock = C.SHOT_CLOCK; }
    G.possTeam = team; G.shotClock = C.SHOT_CLOCK;
    if (G.human) G.placeHuman(G.human);
    if (G.human && G.human.onFire) ball.setFire(G.human.hasBall);
  };

  // Teleport the human's view onto their player (fades in VR)
  G.placeHuman = function (p) {
    var ctx = G.ctx;
    if (HW.XR.presenting) {
      ctx.fade(0.5); I.resetHistory();
      ctx.camera.getWorldPosition(_a); ctx.rotateRig(U.angDiff(p.yaw, ctx.view.yaw));
      ctx.moveRigTo(p.pos); ctx.view.yaw = p.yaw;
    } else { I.lookYaw = p.yaw; I.lookPitch = -0.2; }
    G.vrHeld = -1;
  };

  G.streakReset = function (prevTeam) { /* stage 4: on-fire ends when the other team scores */ };
  G.onPossession = function (p) { };

  /* ---------- scoring ---------- */
  G.onScore = function (hoopIdx) {
    if (G.phase !== 'play') return;
    var team = hoopIdx, ball = G.ball, shot = ball.shot || null;
    var scorer = shot ? shot.by : (ball.dunkBy || ball.lastTouch);
    var three = !!(shot && shot.three), pts = ball.dunkBy ? 2 : (three ? 3 : 2);
    G.score[team] += pts; G.shotInAir = false;
    if (scorer && scorer.team === team) { scorer.stats.pts += pts; scorer.stats.fgm++; if (three) scorer.stats.tpm++; if (ball.dunkBy) scorer.stats.dunks++; }
    if (shot) shot.scored = true;
    var clean = shot && !shot.rim && !shot.board;
    var txt = ball.dunkBy ? null : three ? U.pick(PH.three) : (clean && shot.quality === 'green') ? U.pick(PH.swish) : U.pick(PH.two);
    if (txt) UI.callout(txt, three ? '#ff9f43' : '#ffd23f', { life: 1.6 });
    if (scorer) G.afterScore(scorer, pts, shot);
    Au.swish(); Au.cheer(three || pts > 2);
    G.phase = 'dead'; G.phaseT = 2.0; G.deadFor = team;
    G.scoredTeam = team; ball.dunkBy = null;
  };
  G.afterScore = function (scorer, pts, shot) {
    var team = scorer.team;
    scorer.streak++;
    if (!scorer.onFire && scorer.streak >= 3) G.ignite(scorer);
    G.players.forEach(function (q) { if (q.team !== team && q.onFire) { q.setFire(false); q.streak = 0; UI.callout(q.def.first.toUpperCase() + ' COOLS OFF', '#9ad0ff', { life: 1.2, size: 80, silent: true }); } else if (q.team !== team) q.streak = 0; });
    G.runPts = G.runTeam === team ? G.runPts + pts : pts; G.runTeam = team;
    if (G.runPts >= 8 && G.score[1 - team] < G.score[team] - 5 && !G.runCalled[team]) { G.runCalled[team] = true; setTimeout(function () { UI.callout(HW.TEAMS[team].name.toUpperCase() + ' ON A RUN!', HW.TEAMS[team].color, { life: 1.6, size: 90 }); }, 1700); }
    if (G.runTeam !== team) G.runCalled = [false, false];
  };
  G.runCalled = [false, false]; G.runPts = 0; G.runTeam = -1;
  G.ignite = function (p) {
    p.setFire(true); Au.fire();
    UI.callout(p.def.first.toUpperCase() + ' IS ON FIRE!', '#ff5a1f', { life: 2.2, big: 1.15, dist: 3.8 });
    HW.FX.sparks(new THREE.Vector3(p.pos.x, 1.2, p.pos.z), 40, ['#ff7a1a', '#ffd23f']);
  };
  G.shotMissed = function (shot) {
    if (!shot || shot.resolved || shot.scored) return; shot.resolved = true; shot.by.streak = 0;
  };

  function updateViewNow() { var v = G.ctx.view; G.ctx.camera.updateMatrixWorld(true); G.ctx.camera.getWorldPosition(v.pos); }

  /* ---------- per-frame ---------- */
  G.update = function (rdt, now) {
    var ctx = G.ctx, view = ctx.view;
    // slow-mo target (dunks) eases in and out
    G.timeScale = U.damp(G.timeScale, G.slowTarget || 1, 6, rdt); var dt = rdt * G.timeScale; G.t += dt;
    var vr = I.vr, h = G.human;
    if (vr && G.pendingPlace && --G.pendingPlace === 0) {
      ctx.recenter();
      if (h && G.phase !== 'menu') G.placeHuman(h); else { ctx.rotateRig(U.angDiff(0, view.yaw)); ctx.moveRigTo({ x: 0, z: 6 }); }
      updateViewNow(); view.yaw = 0; if (HW.Menu.open) HW.Menu.place();
    }

    // headset position is the authority for the VR player's body
    if (vr && h && h.state !== 'dunk' && !G.pendingPlace) { h.pos.x = view.pos.x; h.pos.z = view.pos.z; }

    if (I.camToggle) G.camMode = G.camMode === 'chase' ? 'first' : 'chase';

    HW.Menu.update(rdt);
    if (I.pause) { I.pause = false; G.onPause(); }
    if (G.phase === 'menu' || G.paused) { G.menuFrame(rdt); return; }

    var live = G.phase === 'play';
    if (G.phase === 'countdown') G.tickCountdown(rdt);
    else if (G.phase === 'dead') { G.phaseT -= dt; if (G.phaseT <= 0) G.afterDead(); }
    else if (G.phase === 'break') { G.phaseT -= rdt; if (G.phaseT <= 0) { G.q++; G.beginQuarter(false); } }
    else if (G.phase === 'over') { G.phaseT -= rdt; if (G.phaseT <= 0 && !HW.Menu.open) HW.Menu.show('results'); }

    if (live) {
      G.clock -= dt;
      if (!G.shotInAir && G.possTeam >= 0 && G.ball.state !== 'free') G.shotClock -= dt;
      if (G.shotClock <= 0 && !G.shotInAir) G.shotViolation();
      if (G.clock <= 0) G.endQuarter();
    }

    // players
    G.humanControl(dt, rdt);
    G.players.forEach(function (p) {
      if (p === h) return;
      if (G.ai) G.ai(p, dt, live);
    });
    G.players.forEach(function (p) {
      G.tickState(p, dt); Act.vertical(p, dt);
      p.cd.catchBlock = Math.max(0, (p.cd.catchBlock || 0) - dt);
    });
    G.players.forEach(function (p) { if (p.state === 'dunk') Act.updateDunk(p, dt); });
    G.separate(dt);

    // ball
    var b = G.ball;
    G.players.forEach(function (p) { p.animate(dt, G.t, G.ctx); p.root.updateMatrixWorld(true); });
    Act.carry(dt);
    if (live || G.phase === 'dead') { if (live) { Act.pickup(); Act.checkBlocks(); } b.step(dt); }
    b.sync();
    var fb = !!((b.holder && b.holder.onFire) || (b.shot && b.shot.by.onFire)); if (fb !== b.fire) b.setFire(fb);
    if (b.fire) HW.FX.fireAt(b.pos, 0.15);
    G.players.forEach(function (p) { if (p.onFire && (G.t * 60 | 0) % 2 === 0) { HW.FX.fireAt(_a.set(p.pos.x, p.y + 0.15 + Math.random() * 1.5, p.pos.z), 0.45); } });

    // VR: keep the head glued to the (collision-adjusted) player; jump lifts the rig
    if (vr && h) { ctx.moveRigTo(h.pos); ctx.rig.position.y = (ctx.seatOffset || 0) + h.y * HW.settings.vrJump; }
    G.updateCamera(rdt);
    G.updateHud();
  };

  G.onPause = function () {
    if (G.phase === 'menu') return;
    if (G.paused) { if (HW.Menu.screen === 'pause') G.resume(); else HW.Menu.show('pause'); return; }
    if (G.phase === 'over' || HW.Menu.open) return;
    G.paused = true; HW.Menu.show('pause');
  };
  G.resume = function () { G.paused = false; HW.Menu.hide(); G.ctx.fade && I.vr && G.ctx.fade(0.3); };
  G.quit = function () {
    G.players.forEach(function (p) { G.scene.remove(p.root); G.world.removeBlob(p.blob); }); G.players = []; G.human = null; G.paused = false;
    G.phase = 'menu'; G.score = [0, 0]; G.q = 1; G.clock = C.QUARTER_S; G.shotClock = C.SHOT_CLOCK; G.possTeam = -1; G.slowTarget = 1; G.timeScale = 1; G.ctx.comfortBoost = 0;
    G.ball.holder = null; G.ball.state = 'free'; G.ball.shot = null; G.ball.setFire(false); G.ball.reset(0, 3, 0);
    G.ctx.rig.position.y = G.ctx.seatOffset || 0; I.lookYaw = 0; I.lookPitch = -0.05;
    if (I.vr) { G.ctx.rotateRig(U.angDiff(0, G.ctx.view.yaw)); G.ctx.moveRigTo({ x: 0, z: 6 }); }
    HW.Menu.show('title');
  };
  G.rematch = function () { HW.Menu.hide(); G.start(G.setup); };

  // menu / paused frame: nothing simulates, but the view and displays stay live
  G.menuFrame = function (rdt) {
    var view = G.ctx.view; document.body.classList.toggle('inmenu', G.phase === 'menu');
    if (G.phase === 'menu') { if (!I.vr) { view.pos.set(0, 1.7, 6.0); view.pitch = -0.05; view.yaw = 0; I.lookYaw = 0; } G.ball.sync(); }
    else G.updateCamera(rdt);
    G.updateHud();
  };

  G.tickCountdown = function (rdt) {
    G.phaseT -= rdt; var n = Math.ceil(G.phaseT);
    if (n !== G.cdLast && n >= 1 && n <= 3) { UI.callout(String(n), '#ffffff', { life: 0.8, size: 200, silent: true, dist: 3.4 }); Au.beep(false); }
    G.cdLast = n;
    if (!G.hinted && I.vr && G.phaseT < 2.6) { G.hinted = true; UI.callout('GRIP + SWING + LET GO TO SHOOT', '#ffffff', { life: 3, size: 70, silent: true, up: 0.2 }); }
    if (G.phaseT <= 0) { G.phase = 'play'; UI.callout('GO!', '#5cffa0', { life: 0.8, size: 200, silent: true, dist: 3.4 }); Au.beep(true); Au.whistle(); }
  };

  G.afterDead = function () {
    var next = 1 - G.deadFor; if (G.setup.only) next = G.humanTeam;
    G.ctx.fade && I.vr && G.ctx.fade(0.5);
    G.formation(next, 'inbound'); G.phase = 'play'; G.slowTarget = 1; Au.whistle();
  };

  G.shotViolation = function () {
    Au.buzzer(); UI.callout('SHOT CLOCK!', '#ff5a4a', { life: 1.2 });
    G.formation(G.setup.only ? G.humanTeam : 1 - G.possTeam, 'inbound'); G.shotClock = C.SHOT_CLOCK;
  };

  G.endQuarter = function () {
    G.clock = 0; Au.buzzer();
    var tied = G.score[0] === G.score[1];
    if (G.q >= 4 && !tied) { G.endGame(); return; }
    G.phase = 'break'; G.phaseT = 4.5; G.slowTarget = 1;
    UI.callout(G.q >= 4 ? 'TIED - OVERTIME!' : 'END OF QUARTER ' + G.q, '#ffffff', { life: 2.5, size: 100 });
    G.players.forEach(function (p) { p.state = 'idle'; });
  };
  G.endGame = function () {
    G.phase = 'over'; G.phaseT = 3.8; G.slowTarget = 1; Au.buzzer(); Au.cheer(true);
    var w = G.score[0] > G.score[1] ? 0 : 1;
    UI.callout(HW.TEAMS[w].name.toUpperCase() + ' WIN!', HW.TEAMS[w].color, { life: 4, size: 110 });
    G.players.forEach(function (p) { p.state = p.team === w ? 'celebrate' : 'idle'; });
    if (G.onGameOver) G.onGameOver(w);
  };

  G.tickState = function (p, dt) {
    p.stateT += dt; var st = p.state;
    if (st === 'shoot' && !p.charging && p.stateT > 0.45) p.state = 'idle';
    else if (st === 'pass' && p.stateT > 0.3) p.state = 'idle';
    else if (st === 'steal' && p.stateT > 0.35) p.state = 'idle';
    else if (st === 'shove' && p.stateT > 0.4) p.state = 'idle';
    else if (st === 'down' && p.stateT > p.downDur) { p.state = 'idle'; p.stateT = 0; }
    for (var k in p.cd) if (k !== 'catchBlock') p.cd[k] = Math.max(0, p.cd[k] - dt);
    if (p.slow > 0) p.slow = Math.max(0, p.slow - dt);
    if (p.defendT > 0) p.defendT -= dt;
  };

  // soft body-to-body separation (the human's own displacement flows back to the rig)
  G.separate = function (dt) {
    var P = G.players;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j]; if (a.state === 'dunk' || b.state === 'dunk' || a.state === 'down' || b.state === 'down') continue;
      var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 0.55 * (a.def.bulk + b.def.bulk) * 0.5 + 0.2;
      if (d < min && d > 1e-4) { var push = (min - d) * 0.5, nx = dx / d, nz = dz / d; a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push; }
    }
  };

  /* ---------- human control (VR and desktop) ---------- */
  G.humanControl = function (dt, rdt) {
    var p = G.human; if (!p) return; var view = G.ctx.view, live = G.phase === 'play' || G.phase === 'dead';
    var yaw = view.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    var mx = live ? I.move.x : 0, my = live ? I.move.y : 0;
    var wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    if (p.state === 'dunk') { return; }
    Act.move(p, wx, wz, I.turbo && live, dt, 1);
    // face where you look; the body model follows
    if (I.vr) p.yaw = yaw; else p.yaw += U.angDiff(yaw, p.yaw) * (1 - Math.exp(-14 * rdt));
    if (!live) return;
    var jump = I.jump; if (I.vr && G.vrJumpGesture()) jump = true;
    if (jump) Act.jump(p);
    if (I.steal) Act.stealOrShove(p);
    var hoop = G.world.hoops[p.team], hd = Math.hypot(hoop.x - p.pos.x, hoop.z - p.pos.z);
    if (p.hasBall && I.turbo && p.turboOn && Math.hypot(wx, wz) > 0.5 && Act.canDunk(p, hd)) {
      var tx = (hoop.x - p.pos.x) / hd, tz = (hoop.z - p.pos.z) / hd, mm = Math.hypot(wx, wz);
      if ((wx * tx + wz * tz) / mm > 0.55) { G.vrHeld = -1; Act.startDunk(p); return; }
    }
    // ball handlers: reversing the stick hard is a crossover
    var mmag = Math.hypot(wx, wz);
    if (p.def.type === 'handler' && p.hasBall && mmag > 0.6 && G.lastMove && G.lastMove.m > 0.6 && (wx * G.lastMove.x + wz * G.lastMove.z) / mmag / G.lastMove.m < -0.2 && p.cd.juke <= 0) Act.juke(p, (wx * Math.cos(p.yaw) - wz * Math.sin(p.yaw)) >= 0 ? 1 : -1);
    G.lastMove = { x: wx, z: wz, m: mmag };
    if (I.vr) G.humanHands(p);
    if (I.pass && p.hasBall) { G.passTo(p); G.vrHeld = -1; }
    if (p.hasBall) { if (I.vr) G.humanVRBall(dt); else G.humanDesktopBall(dt); }
    else { G.vrHeld = -1; p.charging = false; G.charge = 0; }
  };

  G.passTo = function (p) {
    var t = Act.passTarget(p); if (!t) { UI.callout('NO ONE TO PASS TO', '#ffffff', { life: 0.8, size: 80, silent: true }); return; }
    var from = I.vr ? I.hands[G.vrHeld >= 0 ? G.vrHeld : 1].pos.clone() : null;
    Act.pass(p, t, from);
  };

  // VR hands do real defense: swat a shot out of the air, or swipe at a dribble
  G.humanHands = function (p) {
    var b = G.ball, i, h, d;
    for (i = 0; i < 2; i++) {
      h = I.hands[i]; if (!h.valid) continue; d = h.pos.distanceTo(b.pos);
      if (b.state === 'free' && b.shot && b.shot.team !== p.team && b.airT < 1.3 && d < 0.34) {
        Act.swat(p, b, 1); b.vel.addScaledVector(h.vel, 0.6); return;
      }
      var hold = b.holder;
      if (b.state === 'dribble' && hold && hold.team !== p.team && p.cd.steal <= 0 && d < 0.4 && h.vel.length() > 2.4) { if (!Act.steal(p, hold, 0.4)) p.cd.steal = 0.8; return; }
    }
  };

  // quick raise of the free (left) hand above the head = jump
  G.vrJumpGesture = function () {
    var hs = I.hands[0]; if (!hs.valid || G.human.y > 0.02) return false;
    if (hs.vel.y > 2.6 && hs.pos.y > G.ctx.view.pos.y - 0.05 && !(hs.grip)) return true; return false;
  };

  // VR: grip holds the ball in that hand; releasing the grip throws it with the hand's velocity
  G.humanVRBall = function (dt) {
    var p = G.human, b = G.ball, h, i;
    if (G.vrHeld < 0) {
      for (i = 1; i >= 0; i--) { h = I.hands[i]; if (h.valid && h.grip) { G.vrHeld = i; b.state = 'held'; b.holder = p; p.hasBall = true; HW.Audio.click(); break; } }
    }
    if (G.vrHeld >= 0) {
      h = I.hands[G.vrHeld]; b.pos.lerp(h.pos, 0.6); if (b.pos.distanceTo(h.pos) < 0.05) b.pos.copy(h.pos);
      b.vel.set(0, 0, 0); p.charging = false;
      if (!h.grip) {
        var v = _a.copy(h.vel); G.vrHeld = -1;
        if (v.length() > 2.2) { v.multiplyScalar(THROW_SCALE); p.state = 'shoot'; p.stateT = 0.3; Act.release(p, v.clone(), h.pos.clone()); }
        else { b.state = 'dribble'; p.dribPhase = 0.3; }
      }
    }
  };

  // Desktop: hold the mouse to raise the ball and charge, release near the green zone
  G.humanDesktopBall = function (dt) {
    var p = G.human, b = G.ball, view = G.ctx.view;
    if (I.shootHeld && b.state !== 'free') {
      if (!p.charging) { p.charging = true; G.charge = 0; b.state = 'held'; p.state = 'shoot'; }
      G.charge = Math.min(1, G.charge + dt / 0.9); p.stateT = 0.18 + G.charge * 0.1;
    }
    if (I.shootRelease && p.charging) {
      p.charging = false; var ch = G.charge; G.charge = 0;
      if (ch < 0.1) { b.state = 'dribble'; p.state = 'idle'; G.passTo(p); return; }
      var hoop = G.world.hoops[p.team];
      p.handWorld('r', _b); p.handWorld('l', _c); _b.lerp(_c, 0.5); if (_b.y < p.y + p.def.height) _b.y = p.y + p.def.height + 0.1;
      var ideal = S.ideal(_b, hoop, new THREE.Vector3()), pitch = Math.atan2(ideal.y, Math.hypot(ideal.x, ideal.z)), sp = ideal.length() * (0.5 + 0.77 * ch);
      var yaw = view.yaw; _a.set(-Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, -Math.cos(yaw) * Math.cos(pitch) * sp);
      p.state = 'shoot'; p.stateT = 0.32;
      Act.release(p, _a.clone(), _b.clone());
    }
    if (!I.shootHeld && p.charging && !I.shootRelease) { p.charging = false; G.charge = 0; b.state = 'dribble'; p.state = 'idle'; }
  };

  /* ---------- camera ---------- */
  G.updateCamera = function (rdt) {
    if (I.vr) { var h = G.human; if (h) h.setHidden(true); return; }
    var view = G.ctx.view, p = G.human; if (!p) return;
    I.wantLock = G.phase !== 'menu' && !G.paused && !HW.Menu.open;
    p.setHidden(G.camMode === 'first');
    if (G.camMode === 'first') {
      view.pos.set(p.pos.x, p.y + p.eyeHeight(), p.pos.z);
    } else {
      var yaw = view.yaw, pitch = U.clamp(view.pitch, -0.8, 0.2), dist = 3.6, h2 = 2.1 - pitch * 2.5;
      var cx = p.pos.x + Math.sin(yaw) * dist, cz = p.pos.z + Math.cos(yaw) * dist;
      view.pos.set(U.clamp(cx, -12, 12), Math.max(0.6, p.y * 0.5 + h2), U.clamp(cz, -14.5, 14.5));
      view.pitch = -0.2 + pitch * 0.5 - 0.08;
    }
  };

  G.teamOnFire = function (t) { return G.players.some(function (p) { return p.team === t && p.onFire; }); };

  G.updateHud = function () {
    var p = G.human, SB = UI.scoreboard, names = [HW.TEAMS[0].short, HW.TEAMS[1].short];
    var msg = G.phase === 'play' || G.phase === 'dead' ? '' : G.phase === 'countdown' ? 'GET READY' : G.phase === 'break' ? 'BREAK' : G.phase === 'menu' ? 'WELCOME TO THE COURT' : 'FINAL';
    SB.set({ score: G.score.slice(), names: names, colors: [HW.TEAMS[0].color, HW.TEAMS[1].color], quarter: G.q, clock: G.clock, shot: G.shotClock, msg: msg, poss: G.possTeam, fire: [G.teamOnFire(0), G.teamOnFire(1)] });
    UI.hud.update({ score: G.score.slice(), names: names, colors: [HW.TEAMS[0].color, HW.TEAMS[1].color], clock: G.clock, quarter: G.q, shot: G.shotClock, turbo: p ? p.turbo : 0, fire: p ? p.onFire : false,
      charge: !I.vr && p && p.charging ? G.charge : -1, green: [p ? p.st.greenWin : 1, 0], msg: '' }, I.vr);
  };
})(window.HW);
