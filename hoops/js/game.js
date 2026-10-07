/* game.js - STAGE 1: practice mode (one ball, one hoop, physical throwing). Replaced by the full game in later stages. */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U, I = HW.Input, S = HW.Shoot, UI = HW.UI;
  var THROW_SCALE = 1.6;
  var G = HW.Game = {};
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  G.init = function (ctx) {
    G.ctx = ctx; G.ball = ctx.ball; G.world = ctx.world; G.rig = ctx.rig; G.camera = ctx.camera;
    G.me = { pos: new THREE.Vector3(0, 0, 3.5 - 9.38 + 2), vel: new THREE.Vector3(), yaw: 0, y: 0, def: { height: 1.85, stats: { tp: 6 } }, team: 0 };
    G.makes = 0; G.att = 0; G.streak = 0; G.best = 0; G.held = -1; G.respawnT = 0; G.charge = 0; G.lastShot = null;
    G.ball.onScore = G.onScore;
    G.ball.onEvent = function (type, v, h) {
      if (type === 'bounce') HW.Audio.bounce(v); else if (type === 'rim') { HW.Audio.rim(v); if (G.lastShot) G.lastShot.rim = true; } else if (type === 'board') { HW.Audio.board(); if (G.lastShot) G.lastShot.board = true; }
    };
    G.reset();
  };

  G.reset = function () {
    G.ball.state = 'float'; G.held = -1; G.respawnT = 0; G.lastShot = null;
    G.floatBall();
  };

  G.floatBall = function () {
    var v = G.ctx.view, yaw = v.yaw;
    G.ball.pos.set(v.pos.x - Math.sin(yaw) * 0.55, 1.15, v.pos.z - Math.cos(yaw) * 0.55);
    G.ball.vel.set(0, 0, 0); G.ball.state = 'float'; G.ball.shot = null; G.ball.setFire(false);
  };

  G.onScore = function (hoopIdx, ball) {
    if (hoopIdx !== 0) return;
    var s = G.lastShot; if (s) s.scored = true; G.makes++; G.streak++; G.best = Math.max(G.best, G.streak);
    var clean = s && !s.rim && !s.board, green = s && s.quality === 'green';
    HW.Audio.swish(); HW.Audio.cheer(false);
    UI.callout(green && clean ? 'SWISH!' : (s && s.three ? 'THREE!' : 'BUCKET!'), green ? '#5cffa0' : '#ffd23f', { life: 1.4 });
    G.respawnT = 2.2;
  };

  G.update = function (dt, now) {
    var b = G.ball, view = G.ctx.view, hoop = G.world.hoops[0];
    if (!I.vr) view.pos.set(G.me.pos.x, 1.7, G.me.pos.z);
    G.moveHuman(dt);
    if (!I.vr) view.pos.set(G.me.pos.x, 1.7, G.me.pos.z);
    if (I.pass) { G.floatBall(); G.held = -1; }
    if (I.vr) G.updateVR(dt); else G.updateDesktop(dt);
    if (b.state === 'free') {
      if (G.respawnT > 0) { G.respawnT -= dt; if (G.respawnT <= 0) G.floatBall(); }
      else if (b.restT > 1.2 || b.airT > 8) { if (G.lastShot && !G.lastShot.counted) { G.lastShot.counted = true; G.streak = 0; } G.floatBall(); }
      else if (G.lastShot && !G.lastShot.counted && b.pos.y < 1.0 && b.airT > 0.4 && b.vel.y < 0) { G.lastShot.counted = true; if (!G.lastShot.scored) G.streak = 0; }
    }
    b.step(dt); b.sync();
    var dist = Math.hypot(G.me.pos.x - hoop.x, G.me.pos.z - hoop.z);
    UI.scoreboard.set({ score: [G.makes, 0], names: ['MAKES', ''], msg: G.att ? Math.round(100 * G.makes / G.att) + '%  BEST STREAK ' + G.best : 'PRACTICE: GRIP + THROW', quarter: 1, clock: 0, shot: 0 });
    UI.hud.update({ score: [G.makes, G.att], names: ['MAKES', 'SHOTS'], clock: dist, turbo: 100 * (1 - 0), charge: !I.vr && G.held === 99 ? G.charge : -1, green: [1, 0], msg: 'DIST ' + dist.toFixed(1) + ' m' + (S.isThree(G.me.pos, hoop) ? '  (3PT)' : '') }, I.vr);
  };

  G.moveHuman = function (dt) {
    var me = G.me, spd = 3.6 * (I.turbo ? 1.5 : 1), yaw = G.ctx.view.yaw;
    var mx = I.move.x, my = I.move.y;
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    me.vel.set((fx * my + rx * mx) * spd, 0, (fz * my + rz * mx) * spd);
    if (I.vr) { _a.copy(G.ctx.view.pos); _a.addScaledVector(me.vel, dt); G.ctx.moveRigTo(_a); }
    else { me.pos.addScaledVector(me.vel, dt); me.pos.x = U.clamp(me.pos.x, -C.BOUND_X, C.BOUND_X); me.pos.z = U.clamp(me.pos.z, -C.BOUND_Z, C.BOUND_Z); }
    if (I.vr) { me.pos.copy(G.ctx.view.pos); me.pos.y = 0; }
  };

  // ---- VR: ball follows a gripping hand; releasing the grip throws with the hand's velocity ----
  G.updateVR = function (dt) {
    var b = G.ball, hoop = G.world.hoops[0], i, h;
    if (G.held < 0 && (b.state === 'float' || (b.state === 'free' && b.noCatch <= 0 && b.airT > 0.3))) {
      for (i = 1; i >= 0; i--) { h = I.hands[i]; if (h.valid && h.grip && h.pos.distanceTo(b.pos) < 0.38) { G.held = i; b.state = 'held'; b.shot = null; HW.Audio.click(); break; } }
    }
    if (G.held >= 0) {
      h = I.hands[G.held]; b.pos.copy(h.pos); b.vel.set(0, 0, 0);
      if (!h.grip) {
        _a.copy(h.vel).multiplyScalar(THROW_SCALE); G.release(_a, h.pos);
      }
    }
  };

  // ---- Desktop: hold the mouse to charge, release near the green zone to shoot ----
  G.updateDesktop = function (dt) {
    var b = G.ball, v = G.ctx.view;
    if (b.state === 'float' && (I.mouseEdge || I.shootEdge)) { b.state = 'held'; G.held = 99; G.charge = 0; return; }
    if (b.state === 'float') { b.state = 'held'; G.held = 99; G.charge = 0; }
    if (G.held === 99) {
      var yaw = v.yaw;
      b.pos.set(v.pos.x - Math.sin(yaw) * 0.45 + Math.cos(yaw) * 0.22, 1.25 - (I.mouse.down ? 0 : 0.12) , v.pos.z - Math.cos(yaw) * 0.45 - Math.sin(yaw) * 0.22);
      if (I.shootHeld) G.charge = Math.min(1, G.charge + dt / 0.9); else if (!I.shootRelease) G.charge = 0;
      if (I.shootRelease && G.charge > 0.05) {
        var hoop = G.world.hoops[0], from = _b.set(v.pos.x, 1.9, v.pos.z), ideal = S.ideal(from, hoop, _c);
        var pitch = Math.atan2(ideal.y, Math.hypot(ideal.x, ideal.z)), sp = ideal.length() * (0.5 + 0.77 * G.charge);
        _a.set(-Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, -Math.cos(yaw) * Math.cos(pitch) * sp);
        G.release(_a, from); G.charge = 0;
      }
    }
  };

  G.release = function (raw, from) {
    var b = G.ball, me = G.me, hoop = G.world.hoops[0];
    var res = S.resolve(raw, { from: from, hoop: hoop, mates: [], assist: 0.55, greenWin: 1.2, contest: 0 });
    var shot = null;
    if (res.kind === 'shot') { shot = { by: me, quality: res.quality, three: S.isThree(me.pos, hoop), rim: false, board: false }; G.att++; G.lastShot = shot; if (res.quality === 'green') UI.callout('GREEN!', '#5cffa0', { life: 0.8, size: 110, silent: true }); }
    b.throwWith(res.vel, shot); b.pos.copy(from); G.held = -1; HW.Audio.whoosh(res.vel.length());
    if (!shot) G.respawnT = 3;
  };
})(window.HW);
