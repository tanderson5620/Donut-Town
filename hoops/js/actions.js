/* actions.js - ball handling and player actions: carry/dribble, pickup, shoot, pass, jump (more added per stage) */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U, S = HW.Shoot, UI = HW.UI, Au = HW.Audio;
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
    b.holder = p; b.lastTouch = p; p.hasBall = true; b.state = 'dribble'; b.vel.set(0, 0, 0); b.shot = null; b.pass = null; b.noCatch = 0;
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
    } else if (b.state === 'held') {
      if (p.isHuman && G.vrHeld) return;          // VR hand drives the ball itself
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
    if (o.forceVel) { res.vel.copy(o.forceVel); res.kind = o.kind || 'shot'; res.quality = o.quality || 'good'; }
    var shot = null;
    A.drop(p); b.lastTouch = p; p.cd.catchBlock = 0.3;
    if (res.kind === 'shot') {
      shot = { by: p, team: p.team, quality: res.quality, three: three, rim: false, board: false, contest: contest, t0: G.t, hoop: p.team, scored: false };
      p.stats.fga++; if (three) p.stats.tpa++; G.lastShot = shot; G.shotInAir = true;
      if (res.quality === 'green') { UI.callout(three ? 'GREEN FROM DEEP!' : 'GREEN!', '#5cffa0', { life: 0.9, size: 100, silent: true, up: 0.2 }); }
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
})(window.HW);
