/* actions.js - ball handling and player actions: carry/dribble, pickup, shoot, pass, jump (more added per stage) */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U, S = HW.Shoot, UI = HW.UI, Au = HW.Audio, I = HW.Input;
  var A = HW.Act = {};
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), G;

  A.init = function (game) { G = game; };

  /* ---------- movement ---------- */
  // wx, wz: desired direction (length <= 1). Applies acceleration, turbo, bounds.
  A.move = function (p, wx, wz, turbo, dt, speedMul) {
    var st = p.st, can = p.state === 'idle' || p.state === 'shoot' || p.state === 'steal' || p.state === 'shove';
    var mag = Math.hypot(wx, wz); if (mag > 1) { wx /= mag; wz /= mag; mag = 1; }
    var moving = mag > 0.05 && can;
    p.turboOn = false;
    if (turbo && moving && (p.turbo > 4 || p.onFire) && !p.turboLock) {
      p.turboOn = true; if (!p.onFire) p.turbo = Math.max(0, p.turbo - st.turboDrain * dt);
      if (p.turbo <= 0.5) p.turboLock = true;
    } else {
      p.turbo = Math.min(100, p.turbo + (p.hasBall ? 7 : 11) * dt); if (p.turboLock && p.turbo > 22) p.turboLock = false;
    }
    var s = st.run * (p.turboOn ? st.turboMult : 1) * (p.hasBall ? 0.94 : 1) * (speedMul || 1) * (p.slow > 0 ? 0.55 : 1) * (p.onFire ? 1.1 : 1);
    if (!can) s = 0;
    if (p.y > 0.02) s *= 0.9;
    var tx = wx * s, tz = wz * s, k = 1 - Math.exp(-(moving ? 11 : 15) * dt);
    p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
    p.pos.x = U.clamp(p.pos.x + p.vel.x * dt, -C.BOUND_X, C.BOUND_X); p.pos.z = U.clamp(p.pos.z + p.vel.z * dt, -C.BOUND_Z, C.BOUND_Z);
    if (p.pos.x === C.BOUND_X || p.pos.x === -C.BOUND_X) p.vel.x = 0; if (Math.abs(p.pos.z) === C.BOUND_Z) p.vel.z = 0;
  };

  // vertical motion for jumps and dunks (dunk path overrides y)
  A.vertical = function (p, dt) {
    if (p.state === 'dunk') return;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= C.G * 1.15 * dt; p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; if (p.vy < -3) Au.bounce(2); p.vy = 0; p.landed = true; }
    }
    p.cd.jump = Math.max(0, p.cd.jump - dt);
  };
  A.jump = function (p) {
    if (p.y > 0.02 || p.cd.jump > 0 || p.state === 'down' || p.state === 'dunk') return false;
    p.vy = Math.sqrt(2 * C.G * 1.15 * p.st.jump); p.y = 0.001; p.cd.jump = 0.25; p.jumpT = 0.5; Au.jump(); return true;
  };

  /* ---------- ball carry ---------- */
  var DRIB_T = 0.52;
  A.grab = function (p, fromLoose) {
    var b = G.ball;
    if (b.holder && b.holder !== p) b.holder.hasBall = false;
    var prevTeam = G.possTeam;
    b.holder = p; b.lastTouch = p; p.hasBall = true; b.state = 'dribble'; b.vel.set(0, 0, 0); b.shot = null; b.pass = null; b.noCatch = 0; G.shotInAir = false;
    p.dribPhase = Math.random() * 0.5;
    if (prevTeam !== p.team) { G.possTeam = p.team; G.shotClock = C.SHOT_CLOCK; G.streakReset(prevTeam); } else if (fromLoose) G.shotClock = Math.max(G.shotClock, 14);
    G.onPossession(p);
  };
  A.drop = function (p) { var b = G.ball; if (b.holder === p) { b.holder = null; p.hasBall = false; if (b.state !== 'free') { b.state = 'free'; } } };

  // position the ball while it's carried (dribble bounce at the side, or in both hands)
  A.carry = function (dt) {
    var b = G.ball, p = b.holder; if (!p || b.state === 'free') return;
    var H = p.def.height;
    if (b.state === 'dribble') {
      var sp = Math.hypot(p.vel.x, p.vel.z);
      p.dribPhase += dt / (DRIB_T * (sp > 4 ? 0.85 : 1)); if (p.dribPhase >= 1) { p.dribPhase -= 1; if (!p.isHuman || true) Au.bounce(3.5 + sp * 0.3); }
      var yaw = p.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      var lead = 0.38 + Math.min(0.35, sp * 0.06);
      var wob = p.state === 'idle' ? 1 : 0;
      b.pos.x = p.pos.x + fx * lead + rx * 0.3 + p.vel.x * 0.04; b.pos.z = p.pos.z + fz * lead + rz * 0.3 + p.vel.z * 0.04;
      var top = H * 0.52 + p.y;
      b.pos.y = C.BALL_R + (top - C.BALL_R) * Math.abs(Math.sin(Math.PI * p.dribPhase)) * (p.y > 0.05 ? 0.4 : 1);
    } else if (b.state === 'dunk') {
      p.handWorld('r', _a); p.handWorld('l', _b); if (p.dunk && (p.dunk.style === 'twohand' || p.dunk.style === 'spin360')) b.pos.copy(_a).lerp(_b, 0.5); else b.pos.copy(_a); b.pos.y += 0.1;
    } else if (b.state === 'held') {
      if (p.isHuman && G.vrHeld >= 0) return;          // VR hand drives the ball itself
      p.handWorld('r', _a); p.handWorld('l', _b); b.pos.copy(_a).lerp(_b, 0.5); b.pos.y += 0.02;
    }
    b.vel.set(0, 0, 0);
  };

  /* ---------- picking up loose balls ---------- */
  A.pickup = function () {
    var b = G.ball; if (b.state !== 'free' || b.noCatch > 0 || G.phase !== 'play') return;
    var best = null, bd = 9, i, p, d;
    var spd = b.vel.length();
    for (i = 0; i < G.players.length; i++) {
      p = G.players[i]; if (p.state === 'down' || p.state === 'dunk' || p.cd.catchBlock > 0) continue;
      d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
      var reach = (b.pass && b.pass.to === p) ? 1.0 : (p.isHuman ? 0.85 : 0.7);
      if (d > reach) continue;
      var by = b.pos.y - p.y; if (by < 0.08 || by > p.def.reach + 0.25) continue;
      if (spd > 17 && !(b.pass && b.pass.to === p)) continue;
      if (b.shot && b.shot.by === p && b.airT < 0.5) continue;
      if (b.shot && !b.shot.rim && !b.shot.board && b.pos.y > 1.7) continue;   // a clean shot in the air can only be blocked, not caught
      // don't snatch a ball that's about to drop through the net
      if (Math.hypot(b.pos.x - G.world.hoops[0].x, b.pos.z - G.world.hoops[0].z) < 0.6 && b.pos.y > 2.6 || Math.hypot(b.pos.x - G.world.hoops[1].x, b.pos.z - G.world.hoops[1].z) < 0.6 && b.pos.y > 2.6) continue;
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      var wasShot = b.shot, wasPass = b.pass;
      if (wasPass && wasPass.to === best) { HW.Audio.click(); }
      A.grab(best, !wasPass);
      if (wasShot && wasShot.by !== best && (wasShot.rim || wasShot.board) && wasShot.by.team === best.team) { /* own rebound */ }
      if (wasShot && (wasShot.rim || wasShot.board)) best.stats.rebounds++;
    }
  };

  /* ---------- shooting / passing release (shared by humans and AI) ---------- */
  A.contest = function (p) {
    var c = 0;
    for (var i = 0; i < G.players.length; i++) {
      var q = G.players[i]; if (q.team === p.team) continue;
      var d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
      if (d < 2.4) c = Math.max(c, (1 - d / 2.4) * (0.55 + q.def.stats.block / 22) + (q.y > 0.3 ? 0.2 : 0));
    }
    return U.clamp(c, 0, 1);
  };

  // raw: world velocity of the throw, from: release point. Returns the resolution kind.
  A.release = function (p, raw, from, o) {
    o = o || {}; var b = G.ball, hoop = G.world.hoops[p.team];
    var mates = G.players.filter(function (q) { return q.team === p.team && q !== p; });
    var three = S.isThree(p.pos, hoop), type = HW.TYPES[p.def.type];
    var contest = A.contest(p);
    var assist = (o.assist !== undefined ? o.assist : p.st.shootAssist) * (p.isHuman ? 1 : 1);
    var res = S.resolve(raw, { from: from, hoop: hoop, mates: mates, me: p, assist: assist, greenWin: p.st.greenWin * (three ? type.greenFromDeep : 1) * (o.greenMul || 1),
      contest: contest, fire: p.onFire, passAssist: 0.5 + 0.05 * (p.def.type === 'handler' ? 3 : 0), noGreen: o.noGreen });
    if (o.forceVel) { res.vel.copy(o.forceVel); res.kind = o.kind || 'shot'; res.quality = o.quality || 'good'; res.target = o.target || null; }
    var shot = null;
    A.drop(p); b.lastTouch = p; p.cd.catchBlock = 0.3;
    if (res.kind === 'shot') {
      shot = { checked: {}, by: p, team: p.team, quality: res.quality, three: three, rim: false, board: false, contest: contest, t0: G.t, hoop: p.team, scored: false };
      p.stats.fga++; if (three) p.stats.tpa++; G.lastShot = shot; G.shotInAir = true;
      if (res.quality === 'green' && p.isHuman) { UI.callout(three ? 'GREEN FROM DEEP!' : 'GREEN!', '#5cffa0', { life: 0.9, size: 100, silent: true, up: 0.2 }); }
      b.throwWith(res.vel, shot); b.pos.copy(from); b.pass = null;
    } else if (res.kind === 'pass') {
      b.throwWith(res.vel, null); b.pos.copy(from); b.pass = { to: res.target, from: p, t: G.t }; b.noCatch = 0.12; Au.whoosh(res.vel.length());
      p.stats.passes = (p.stats.passes || 0) + 1;
    } else { b.throwWith(res.vel, null); b.pos.copy(from); b.pass = null; b.noCatch = 0.35; }
    if (res.kind === 'shot') Au.whoosh(res.vel.length());
    return res;
  };

  // The ball leaves a shooter's hands from the AI/desktop pipeline at the right moment of the windup.
  A.releaseFromHands = function (p, raw, o) {
    p.handWorld('r', _a); p.handWorld('l', _b); _c.copy(_a).lerp(_b, 0.5); if (_c.y < p.y + p.def.height) _c.y = p.y + p.def.height + 0.1;
    return A.release(p, raw, _c.clone(), o);
  };

  /* ---------- passing ---------- */
  A.passTarget = function (p) {
    var mates = G.matesOf(p); if (!mates.length) return null;
    var best = null, bs = -1e9;
    for (var i = 0; i < mates.length; i++) {
      var m = mates[i], d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (d < 1.2 || m.state === 'down') continue;
      var s = -d * 0.2 + (m.callT > 0 ? 2 : 0); if (s > bs) { bs = s; best = m; }
    }
    return best;
  };
  A.pass = function (p, target, fromPos) {
    var b = G.ball; if (!p.hasBall || !target) return false;
    if (fromPos) _c.copy(fromPos); else { p.handWorld('r', _a); p.handWorld('l', _b); _c.copy(_a).lerp(_b, 0.5); if (_c.y < p.y + 1.0) _c.y = p.y + 1.1; _c.y = Math.max(_c.y, p.y + p.def.height * 0.55); }
    var tgt = _b.set(target.pos.x + target.vel.x * 0.35, target.y + target.def.height * 0.72, target.pos.z + target.vel.z * 0.35);
    var d = Math.hypot(tgt.x - _c.x, tgt.z - _c.z), ps = U.clamp(10 + d * 0.9, 11, 18);
    var v = S.passVel(_c, tgt, ps, new THREE.Vector3());
    p.state = 'pass'; p.stateT = 0; p.yaw = U.yawOf(tgt.x - p.pos.x, tgt.z - p.pos.z);
    A.release(p, v.clone(), _c.clone(), { forceVel: v, kind: 'pass', target: target });
    return true;
  };

  /* ---------- steal / shove / knock down ---------- */
  A.facing = function (p, q, cone) {
    var dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z; return Math.abs(U.angDiff(U.yawOf(dx, dz), p.yaw)) < (cone || 1.0);
  };
  A.dist = function (p, q) { return Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z); };

  A.steal = function (p, holder, bonus) {
    p.state = 'steal'; p.stateT = 0; p.cd.steal = 0.9;
    var chance = 0.04 + 0.02 * p.def.stats.steal - 0.012 * (holder.def.type === 'handler' ? holder.def.stats.speed : 3) + (bonus || 0);
    if (p.def.type === 'handler') chance += 0.04;
    if (holder.turboOn) chance *= 0.6;
    chance *= 1 - Math.min(0.45, Math.hypot(holder.vel.x, holder.vel.z) / 11);   // a moving dribbler is harder to rob
    chance = Math.max(0.03, chance);
    chance *= (p.isHuman ? 1 : G.diff.steal);
    if (holder.state === 'down' || holder.state === 'dunk') return false;
    if (Math.random() < chance) {
      Au.steal(); p.stats.steals++; holder.slow = 0.5;
      A.grab(p); UI.callout(U.pick(['PICKPOCKET!', 'STOLEN GLAZE!', 'SWIPED!', 'SNEAKY SPRINKLES!']), '#7ee0ff', { life: 1.2 });
      G.shotClock = C.SHOT_CLOCK; return true;
    }
    return false;
  };

  A.knockdown = function (t, dirx, dirz, dur) {
    if (t.state === 'down' || t.state === 'dunk') return;
    var b = G.ball; if (t.hasBall) { A.drop(t); b.state = 'free'; b.vel.set(dirx * 3, 2.5, dirz * 3); b.noCatch = 0.35; b.shot = null; }
    t.state = 'down'; t.stateT = 0; t.downDur = dur; t.vel.set(dirx * 3.5, 0, dirz * 3.5); t.stats.fallen = (t.stats.fallen || 0) + 1; t.vy = 0; t.y = 0;
    if (t.isHuman && HW.XR.presenting) G.ctx.fade(0.35);
    Au.thud();
  };

  A.shove = function (p, t) {
    p.state = 'shove'; p.stateT = 0; p.cd.shove = 1.1; p.cd.steal = Math.max(p.cd.steal, 0.4);
    var dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.max(0.01, Math.hypot(dx, dz)); dx /= d; dz /= d;
    var as = p.def.stats.str, ds = t.def.stats.str;
    t.vel.x += dx * (3 + as * 0.55); t.vel.z += dz * (3 + as * 0.55);
    var pK = U.clamp(0.08 + 0.075 * as - 0.04 * ds + (t.hasBall ? 0.06 : 0) + (p.turboOn ? 0.1 : 0) + (p.def.type === 'strength' ? 0.12 : 0) - (t.y > 0.2 ? 0.2 : 0), 0.04, 0.92);
    Au.shove(); p.stats.shoves++;
    if (Math.random() < pK) {
      A.knockdown(t, dx, dz, 0.9 + 0.07 * as); p.stats.knockdowns++;
      UI.callout(U.pick(['TIMBER!', 'WHAM-A-LAM!', 'FLATTENED!', 'OUT OF THE WAY!']), '#ff8a5a', { life: 1.2 });
    } else { t.slow = 0.6; if (t.hasBall && Math.random() < 0.18 + 0.02 * as) { A.drop(t); G.ball.state = 'free'; G.ball.vel.set(dx * 3, 2, dz * 3); G.ball.noCatch = 0.3; } }
  };

  // Human B / E: swipe at the ball handler if close, else shove whoever is in front
  A.stealOrShove = function (p) {
    if (p.state === 'down' || p.state === 'dunk' || p.cd.steal > 0) return;
    var holder = G.ball.holder, i, q, best = null, bd = 99;
    var reach = 1.55 + 0.05 * p.def.stats.str;
    if (holder && holder.team !== p.team && A.dist(p, holder) < reach + 0.2 && A.facing(p, holder, 1.1)) { if (A.steal(p, holder, 0.1)) return; if (p.def.type === 'strength' && A.dist(p, holder) < reach) A.shove(p, holder); return; }
    for (i = 0; i < G.players.length; i++) { q = G.players[i]; if (q.team === p.team) continue; var d = A.dist(p, q); if (d < reach && d < bd && A.facing(p, q, 1.2)) { bd = d; best = q; } }
    if (best) A.shove(p, best); else { p.state = 'steal'; p.stateT = 0; p.cd.steal = 0.5; }
  };

  /* ---------- blocks: an airborne defender's hands swat a shot out of the air (no goaltending) ---------- */
  A.checkBlocks = function () {
    var b = G.ball; if (b.state !== 'free' || !b.shot || b.airT > 0.9) return;
    for (var i = 0; i < G.players.length; i++) {
      var p = G.players[i]; if (p.team === b.shot.team || p.state === 'down') continue;
      var hx = p.pos.x, hy = p.y + p.def.height + 0.28, hz = p.pos.z;
      var d = Math.hypot(b.pos.x - hx, (b.pos.y - hy) * 0.8, b.pos.z - hz);
      if (p.y > 0.2 && d < 0.55 + 0.025 * p.def.stats.block && !b.shot.checked[p.slot + 'x' + p.team]) { b.shot.checked[p.slot + 'x' + p.team] = true; if (Math.random() < (p.isHuman ? 1 : (0.32 + 0.04 * p.def.stats.block) * G.diff.block)) { A.swat(p, b, 1); return; } }
    }
  };
  A.swat = function (p, b, power) {
    var dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.max(0.05, Math.hypot(dx, dz));
    var shooter = b.shot ? b.shot.by : null;
    b.vel.set(dx / d * 6 * power + (shooter ? (shooter.pos.x - p.pos.x) * 0.5 : 0), 3 + 2 * power, dz / d * 6 * power + (shooter ? (shooter.pos.z - p.pos.z) * 0.5 : 0));
    b.shot = null; b.pass = null; G.shotInAir = false; b.noCatch = 0.2; b.lastTouch = p; p.stats.blocks++;
    Au.board(); Au.steal(); HW.FX.sparks(b.pos, 16);
    UI.callout(U.pick(['DENIED!', 'GET OUTTA HERE!', 'NOT IN MY HOUSE!', 'REJECTED!']), '#ff6b6b', { life: 1.3 });
  };

  /* ---------- dunks: turbo + drive at the rim; slow-mo cinematic, style by Dunk rating ---------- */
  var DUNK_NAMES = { onehand: 'JELLY-FILLED JAM!', twohand: 'TWO-HAND THUNDER!', tomahawk: 'TOMAHAWK CHOP!', windmill: 'WINDMILL WALLOP!', spin360: 'SPINNING SPRINKLE SLAM!', backflip: 'BACKFLIP BOOM!' };
  A.dunkRange = function (p) { var t = HW.TYPES[p.def.type]; return 2.3 + 0.2 * p.def.stats.dunk + t.dunkRange; };
  A.canDunk = function (p, d) {
    if (!p.hasBall || p.state !== 'idle' || p.y > 0.05 || G.ball.state === 'free' || G.phase !== 'play') return false;
    if (d === undefined) { var h = G.world.hoops[p.team]; d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z); }
    return d < A.dunkRange(p) && d > 1.2 && p.turbo > 12;
  };
  A.startDunk = function (p) {
    var hoop = G.world.hoops[p.team], b = G.ball, st = p.def.stats.dunk, style;
    if (st >= 9) style = U.pick(['windmill', 'spin360', 'backflip', 'tomahawk', 'windmill']);
    else if (st >= 6) style = U.pick(['tomahawk', 'twohand', 'twohand']); else style = U.pick(['onehand', 'twohand', 'onehand']);
    var H = C.RIM_H + 0.42 - (p.def.height + 0.3) + (st >= 9 ? 0.35 : 0);
    p.state = 'dunk'; p.stateT = 0; p.turboOn = false;
    p.dunk = { t: 0, dur: 0.95 + (st >= 9 ? 0.15 : 0), from: p.pos.clone(), to: new THREE.Vector3(hoop.x, 0, hoop.z + hoop.dir * 0.45), style: style, H: H, hangT: 0.6, scored: false, hoop: hoop };
    p.yaw = U.yawOf(hoop.x - p.pos.x, hoop.z - p.pos.z); p.vel.set(0, 0, 0);
    b.state = 'dunk'; b.holder = p; p.hasBall = true; G.slowTarget = 0.4;
    if (p.isHuman) G.ctx.comfortBoost = 0.7;
    Au.jump(); Au.whoosh(8);
  };
  A.updateDunk = function (p, dt) {
    var d = p.dunk; if (!d) { p.state = 'idle'; return; }
    d.t += dt / d.dur; var t = Math.min(1, d.t), u = U.easeInOut(Math.min(1, t / 0.6));
    p.pos.x = U.lerp(d.from.x, d.to.x, u); p.pos.z = U.lerp(d.from.z, d.to.z, u);
    var k = (t - 0.5) / 0.5; p.y = d.H * Math.max(0, 1 - k * k);
    p.vel.set((d.to.x - d.from.x) / d.dur * 0.3, 0, (d.to.z - d.from.z) / d.dur * 0.3);
    if (t >= 0.52 && !d.scored) A.dunkScore(p, d);
    if (t >= 1) {
      p.state = 'idle'; p.dunk = null; p.y = 0; p.vy = 0; p.vel.set(0, 0, 0); G.slowTarget = 1; G.ctx.comfortBoost = 0; Au.bounce(5);
      if (p.isHuman && I.vr) I.resetHistory();
    }
  };
  A.dunkScore = function (p, d) {
    d.scored = true; var b = G.ball, h = d.hoop;
    A.drop(p); b.state = 'free'; b.pos.set(h.x, C.RIM_H + 0.3, h.z); b.vel.set(0, -6.5, 0); b.shot = null; b.pass = null; b.dunkBy = p; b.scoredCd = 0; b.noCatch = 1;
    h.shake = 1; Au.dunk(); Au.rim(9);
    UI.callout(DUNK_NAMES[d.style], '#ff7a1a', { life: 2.0, big: 1.25, dist: 3.6 });
    HW.FX.sparks(b.pos, 30, ['#ffd166', '#ff7a1a', '#ffffff']); HW.FX.confetti(new THREE.Vector3(h.x, C.RIM_H + 0.8, h.z), 70);
    if (d.style === 'windmill' || d.style === 'backflip' || d.style === 'spin360' ? Math.random() < 0.55 : Math.random() < 0.12) G.world.shatter(h);
  };

  /* ---------- ball-handler crossover: burst sideways, defender loses his feet ---------- */
  A.juke = function (p, side) {
    if (p.cd.juke > 0) return; p.cd.juke = 2.2;
    var yaw = p.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    p.vel.x += rx * side * 4.6; p.vel.z += rz * side * 4.6; p.turbo = Math.min(100, p.turbo + 6); p.jukeT = 0.35;
    var opp = null, bd = 2.0; G.opponentsOf(p).forEach(function (q) { var d = A.dist(p, q); if (d < bd && q.state === 'idle') { bd = d; opp = q; } });
    Au.whoosh(6);
    if (opp && Math.random() < 0.55 + 0.04 * p.def.stats.speed - 0.04 * opp.def.stats.speed) {
      opp.slow = 0.9; if (Math.random() < 0.3) { A.knockdown(opp, rx * side * -1, rz * side * -1, 0.9); UI.callout('ANKLE BREAKER!', '#ffe14d', { life: 1.2 }); }
      else UI.callout(U.pick(['CROSSOVER!', 'SHAKE AND BAKE!']), '#ffe14d', { life: 1.0 });
    }
  };
})(window.HW);
