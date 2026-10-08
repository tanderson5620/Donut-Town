/* ai.js - computer players: teammate cuts and calls for the ball; opponents defend, steal, shove, block, shoot by type */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U, S = HW.Shoot, Act = HW.Act, UI = HW.UI, G;
  var AI = HW.AI = {};
  var _land = new THREE.Vector3(), _from = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  var RANGE = { shooter: 8.2, handler: 6.7, dunker: 5.6, strength: 5.4 };

  AI.init = function (game) { G = game; game.ai = AI.update; };

  function mem(p) {
    return p.ai || (p.ai = { t: Math.random() * 0.3, spot: { x: p.pos.x, z: p.pos.z }, spotT: 0, pend: false, blockDone: false, stealT: U.rand(0.3, 0.9), side: Math.random() < 0.5 ? -1 : 1, holdT: 0, wasHolder: false, rebT: 0 });
  }
  function turnTo(p, yaw, dt, rate) { p.yaw += U.angDiff(yaw, p.yaw) * (1 - Math.exp(-(rate || 12) * dt)); }
  function steer(p, tx, tz, turbo, dt, face) {
    var dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz), k = d < 0.1 ? 0 : Math.min(1, d / 0.8);
    Act.move(p, d > 1e-3 ? dx / d * k : 0, d > 1e-3 ? dz / d * k : 0, turbo && d > 2.5, dt, G.diff.speed);
    if (face) turnTo(p, U.yawOf(face.x - p.pos.x, face.z - p.pos.z), dt, 12); else if (d > 0.35) turnTo(p, U.yawOf(dx, dz), dt, 10);
  }
  function nearest(p, list) { var b = null, bd = 99; list.forEach(function (q) { var d = Act.dist(p, q); if (d < bd) { bd = d; b = q; } }); return { who: b, d: bd }; }
  function openness(q) { var n = nearest(q, G.opponentsOf(q)); return n.who ? n.d : 9; }

  AI.update = function (p, dt, live) {
    var m = mem(p), b = G.ball;
    if (!live || p.state === 'down' || p.state === 'dunk' || G.phase !== 'play') { Act.move(p, 0, 0, false, dt); return; }
    if (m.pend && (p.state !== 'shoot' || b.holder !== p)) m.pend = false;
    if (m.pend) { aimShot(p, m, dt); return; }
    var holder = b.holder;
    if (holder === p) { if (!m.wasHolder) { m.holdT = 0; m.t = 0.2; } m.wasHolder = true; withBall(p, m, dt); }
    else {
      m.wasHolder = false;
      if (holder && holder.team === p.team) offBall(p, m, dt, holder);
      else if (holder) defend(p, m, dt, holder);
      else loose(p, m, dt);
    }
  };

  /* ---------- on offense with the ball ---------- */
  function withBall(p, m, dt) {
    var hoop = G.world.hoops[p.team], cd = hoop.dir, d = Math.hypot(p.pos.x - hoop.x, p.pos.z - hoop.z);
    var opp = nearest(p, G.opponentsOf(p)), mate = Act.passTarget(p), type = p.def.type;
    m.holdT += dt; m.t -= dt;
    var inbound = Math.abs(p.pos.z) > 9.7;
    if (inbound) {          // throw it in after a short beat
      Act.move(p, 0, 0, false, dt, 1); turnTo(p, p.team === 0 ? 0 : Math.PI, dt, 8);
      if (m.holdT > 1.0 && mate) Act.pass(p, mate); else if (m.holdT > 2.2) { p.pos.z -= Math.sign(p.pos.z) * 0.6; }
      return;
    }
    if (m.t <= 0) {
      m.t = (0.28 + Math.random() * 0.12) / G.diff.react;
      m.side = p.pos.x - (opp.who ? opp.who.pos.x : 0) >= 0 ? 1 : -1; if (Math.abs(p.pos.x) > 4.2) m.side = -Math.sign(p.pos.x);
      var open = opp.d > 1.55, desperate = G.shotClock < 3.2;
      // 1. dunk when close and healthy
      if (Act.canDunk && Act.canDunk(p, d) && m.holdT > 0.4 && (open ? Math.random() < 0.8 : Math.random() < 0.35 + 0.1 * p.def.stats.dunk / 10)) { Act.startDunk(p); return; }
      // 2. pass when smothered and a teammate is open
      if (mate && m.holdT > 0.7 && !desperate) {
        var mo = openness(mate), md = Math.hypot(mate.pos.x - hoop.x, mate.pos.z - hoop.z);
        if (opp.d < 1.35 && mo > 1.8 && md < d + 2.5 && Math.random() < 0.55) { Act.pass(p, mate); return; }
        if (mo > 2.4 && md < d - 1.2 && Math.random() < 0.18) { Act.pass(p, mate); return; }
      }
      // 3. shoot
      var rng = RANGE[type] + (p.def.stats.tp - 5) * 0.12;
      if (d < rng && (m.holdT > 1.1 || d < 3.4 || desperate)) {
        var base = open ? 0.46 : 0.13;
        if (type === 'shooter' && d > C.R3 - 0.5) base += 0.3; if (d < 3.6) base += 0.2; if (p.onFire) base = 0.85; if (desperate) base = 1;
        if (Math.random() < base) { beginShot(p, m, hoop); return; }
      }
      // 4. juke around the defender (ball handlers)
      if (Act.juke && opp.d < 1.7 && type === 'handler' && p.cd.juke <= 0 && Math.random() < 0.4) Act.juke(p, m.side);
    }
    // drive: wing first, then to the rim
    var tx, tz; var wing = d > 4.6;
    if (wing) { tx = hoop.x + m.side * 2.6; tz = hoop.z + cd * 4.2; } else { tx = hoop.x + m.side * 0.7; tz = hoop.z + cd * 1.1; }
    if (type === 'shooter' && d < 6.0 && m.holdT < 3) { tx = hoop.x + m.side * 5.2; tz = hoop.z + cd * 5.0; }   // shooters rarely drive: hunt for a spot
    steer(p, tx, tz, p.turbo > 30 && d > 3.5, dt);
  }

  function beginShot(p, m, hoop) {
    p.state = 'shoot'; p.stateT = 0; p.charging = false; G.ball.state = 'held'; m.pend = true; Act.jump(p);
    turnTo(p, U.yawOf(hoop.x - p.pos.x, hoop.z - p.pos.z), 1, 50);
  }
  function aimShot(p, m, dt) {
    var hoop = G.world.hoops[p.team];
    Act.move(p, 0, 0, false, dt, 1); turnTo(p, U.yawOf(hoop.x - p.pos.x, hoop.z - p.pos.z), dt, 18);
    if (p.stateT >= 0.3) { m.pend = false; fire(p, hoop); }
  }
  function shotProb(p, d, three, contest) {
    var s = p.def.stats, pm;
    if (three) pm = 0.2 + 0.056 * s.tp; else if (d > 4) pm = 0.36 + 0.035 * s.tp; else if (d > 2.3) pm = 0.5 + 0.03 * Math.max(s.tp, s.dunk); else pm = 0.66 + 0.02 * s.dunk;
    pm *= G.diff.shoot; pm -= contest * 0.42; if (p.onFire) pm = Math.max(pm, 0.93);
    return U.clamp(pm, 0.05, 0.97);
  }
  function fire(p, hoop) {
    p.handWorld('r', _a); p.handWorld('l', _b); _from.copy(_a).lerp(_b, 0.5); if (_from.y < p.y + p.def.height) _from.y = p.y + p.def.height + 0.1;
    var d = Math.hypot(p.pos.x - hoop.x, p.pos.z - hoop.z), three = S.isThree(p.pos, hoop), contest = Act.contest(p);
    var made = Math.random() < shotProb(p, d, three, contest);
    var v = S.ideal(_from, hoop, new THREE.Vector3());
    if (made) { var e = (Math.random() - 0.5) * 0.012; rotYaw(v, e); }
    else {
      var sg = Math.random() < 0.5 ? -1 : 1; rotYaw(v, sg * U.rand(0.07, 0.15)); v.multiplyScalar(1 + (Math.random() < 0.5 ? -1 : 1) * U.rand(0.07, 0.17));
    }
    Act.release(p, v.clone(), _from.clone(), { forceVel: v, kind: 'shot', quality: made ? 'green' : 'off' });
  }
  function rotYaw(v, a) { var c = Math.cos(a), s = Math.sin(a), x = v.x * c + v.z * s, z = -v.x * s + v.z * c; v.x = x; v.z = z; }

  /* ---------- on offense without the ball ---------- */
  function pickSpot(p, m, holder) {
    var hoop = G.world.hoops[p.team], cd = hoop.dir, type = p.def.type, side = holder.pos.x > 0.5 ? -1 : holder.pos.x < -0.5 ? 1 : (Math.random() < 0.5 ? -1 : 1), r, ph;
    if (type === 'shooter') { r = C.R3 + 0.4; ph = side * U.rand(0.55, 1.1); }
    else if (type === 'dunker') { if (Math.random() < 0.65) { r = 1.7; ph = side * U.rand(0.1, 0.6); } else { r = 3.6; ph = side * 0.5; } }
    else { r = Math.random() < 0.5 ? 4.8 : 5.6; ph = side * U.rand(0.4, 0.9); }
    var x = U.clamp(hoop.x + r * Math.sin(ph), -5.7, 5.7), z = hoop.z + cd * r * Math.cos(ph);
    m.spot.x = x; m.spot.z = z; m.spotT = U.rand(1.6, 3.2);
  }
  function offBall(p, m, dt, holder) {
    m.spotT -= dt; if (m.spotT <= 0) pickSpot(p, m, holder);
    // behind the play when the ball is still being inbounded: come to the ball
    if (Math.abs(holder.pos.z) > 9.7) { m.spot.x = holder.pos.x + (p.pos.x > 0 ? 3 : -3); m.spot.z = holder.pos.z - Math.sign(holder.pos.z) * 4.5; }
    steer(p, m.spot.x, m.spot.z, Math.hypot(m.spot.x - p.pos.x, m.spot.z - p.pos.z) > 4 && p.turbo > 25, dt, holder.pos);
    var open = openness(p) > 1.9 && Math.hypot(p.pos.x - m.spot.x, p.pos.z - m.spot.z) < 1.2;
    if (open && holder.isHuman) p.callT = 0.25;
    // cutter: jump for the lob? (stage 4)
  }

  /* ---------- on defense ---------- */
  function defend(p, m, dt, holder) {
    var myHoop = G.world.hoops[holder.team], mates = G.matesOf(p), opps = G.opponentsOf(p);
    var dh = Act.dist(p, holder), ballD = true;
    if (mates.length) { var mm = mates[0], dm = Act.dist(mm, holder); ballD = mm.isHuman ? dh <= dm + 1.0 : dh <= dm + 0.01; }
    if (ballD) {
      var dx = myHoop.x - holder.pos.x, dz = myHoop.z - holder.pos.z, dd = Math.hypot(dx, dz) || 1, gap = holder.state === 'shoot' ? 0.7 : 1.0;
      steer(p, holder.pos.x + dx / dd * gap, holder.pos.z + dz / dd * gap, dh > 3.2 && p.turbo > 20, dt, holder.pos);
      if (dh < 3.0) p.defendT = 0.3;
      // steal / shove
      m.stealT -= dt;
      var reach = 1.45 + 0.05 * p.def.stats.str;
      if (dh < reach && Act.facing(p, holder, 1.0) && p.cd.steal <= 0 && holder.state !== 'shoot' && m.stealT <= 0) {
        m.stealT = U.rand(0.9, 1.8) / G.diff.react;
        if (p.def.type === 'strength' && p.cd.shove <= 0 && Math.random() < 0.35 * G.diff.shove) Act.shove(p, holder); else Act.steal(p, holder);
      }
      // contest shots
      if (holder.state === 'shoot') {
        if (!m.blockDone && holder.stateT > 0.04 && dh < 2.6) { m.blockDone = true; if (Math.random() < (0.3 + 0.05 * p.def.stats.block) * G.diff.block) Act.jump(p); }
      } else m.blockDone = false;
    } else {
      var man = opps.filter(function (o) { return o !== holder; })[0] || holder;
      var ox = myHoop.x - man.pos.x, oz = myHoop.z - man.pos.z, od = Math.hypot(ox, oz) || 1;
      steer(p, man.pos.x + ox / od * 1.35, man.pos.z + oz / od * 1.35, Act.dist(p, man) > 5 && p.turbo > 25, dt, holder.pos);
      p.defendT = Act.dist(p, man) < 2.5 ? 0.3 : 0;
      if (p.def.type === 'strength' && p.cd.shove <= 0 && Act.dist(p, man) < 1.5 && Math.random() < 0.15 * G.diff.shove * dt) Act.shove(p, man);
    }
  }

  /* ---------- loose ball and rebounds ---------- */
  function loose(p, m, dt) {
    var b = G.ball, hoopTeam = b.shot ? b.shot.team : -1;
    b.predictLanding(_land);
    var lx = _land.x, lz = _land.z;
    if (b.shot && b.airT < 0.35) {      // shot just left: get into position
      var hoop = G.world.hoops[b.shot.team];
      lx = hoop.x + (p.pos.x > 0 ? 0.9 : -0.9); lz = hoop.z + hoop.dir * 1.5;
    }
    var mine = true, my = Act.dist(p, { pos: _land });
    for (var i = 0; i < G.players.length; i++) { var q = G.players[i]; if (q !== p && q.team === p.team && !q.isHuman && Math.hypot(q.pos.x - lx, q.pos.z - lz) < my - 0.2) mine = false; }
    if (mine || G.matesOf(p).length === 0) {
      steer(p, lx, lz, true, dt);
      if (b.pos.y > 1.8 && b.vel.y < 0 && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 1.4 && Math.random() < 0.08 + 0.01 * p.def.stats.block) Act.jump(p);
    } else steer(p, lx * 0.6, lz * 0.6 + (p.team === 0 ? 1 : -1) * 2, false, dt);
  }
})(window.HW);
