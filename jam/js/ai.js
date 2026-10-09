/* ai.js - computer players: drive, shoot by type, pass, cut to spots, defend, steal, shove, block, rebound */
window.HW = window.HW || {};
(function (HW) {
  var K = HW.GFX.K, G;
  var AI = HW.JamAI = {};
  var RANGE = { shooter: 8.4, handler: 6.9, dunker: 4.8, strength: 4.6 };
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function rimX(team) { return team === 0 ? K.RIMX : -K.RIMX; }
  function nearest(p, list) { var best = null, bd = 99; list.forEach(function (q) { var d = dist(p, q); if (d < bd) { bd = d; best = q; } }); return { who: best, d: bd }; }
  function goTo(p, x, z, turbo, dt) {
    var dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), k = d < 0.15 ? 0 : Math.min(1, d / 0.8);
    G.move(p, d > 1e-3 ? dx / d * k : 0, d > 1e-3 ? dz / d * k : 0, turbo && d > 2.5 && p.turbo > 25, dt);
    if (Math.abs(p.vx) > 1.0 && p.state !== 'pass') p.face = p.vx > 0 ? 1 : -1;
  }

  AI.update = function (p, dt, live) {
    G = HW.Jam;
    var b = G.ball, a = p.ai;
    if (!live || p.state === 'fall' || p.state === 'dunk') { G.move(p, 0, 0, false, dt); return; }
    if (p.state === 'shoot') {
      G.move(p, 0, 0, false, dt);
      if (p.hasBall && !p.released && p.st >= p.tApex * (a.relAt || 1)) G.releaseShot(p);
      return;
    }
    a.t -= dt;
    // a pass is on its way to him: go meet it instead of drifting off to his spot
    if (b.state === 'pass' && b.pass && b.pass.to === p) { goTo(p, b.pass.x1, b.pass.z1, false, dt); return; }
    if (b.holder === p) withBall(p, a, dt);
    else if (b.holder && b.holder.team === p.team) offBall(p, a, dt, b.holder);
    else if (b.holder) defend(p, a, dt, b.holder);
    else loose(p, a, dt);
  };

  function withBall(p, a, dt) {
    var rx = rimX(p.team), s = rx > 0 ? 1 : -1, d = Math.hypot(p.x - rx, p.z - K.HZ), opp = nearest(p, G.opps(p)), mate = G.mates(p)[0], type = p.def.type;
    a.hold += dt;
    if (a.t <= 0) {
      a.t = 0.25 + Math.random() * 0.15;
      a.side = opp.who && opp.who.z > p.z ? -1 : 1;
      var open = opp.d > 1.5, late = G.shot < 3.5;
      if (G.canDunk(p) && a.hold > 0.5 && (open ? Math.random() < 0.4 + p.def.stats.dunk * 0.02 : Math.random() < 0.06 + p.def.stats.dunk * 0.01) * G.diff.shoot) { G.startDunk(p); return; }
      if (mate && a.hold > 0.7 && !late && !mate.human) {
        var mo = nearest(mate, G.opps(mate)).d, md = Math.hypot(mate.x - rx, mate.z - K.HZ);
        var pk = 0.6 + 0.08 * (p.def.stats.pass || 5);   // good passers look for the open man more
        if ((opp.d < 1.3 && mo > 1.8 && Math.random() < 0.5 * pk) || (mo > 2.5 && md < d - 1.5 && Math.random() < 0.2 * pk)) { G.passTo(p, mate); return; }
      }
      if (mate && mate.human && a.hold > 2.8 && nearest(mate, G.opps(mate)).d > 2 && Math.random() < 0.25) { G.passTo(p, mate); return; }
      var rng = RANGE[type] + (p.def.stats.tp - 5) * 0.12;
      if (d < rng && (a.hold > 1.1 || d < 3 || late)) {
        var base = open ? 0.45 : 0.12; if (type === 'shooter' && d > K.R3 - 0.4) base += 0.3; if (d < 3) base += 0.2; if (p.onFire) base = 0.85; if (late) base = 1;
        if (Math.random() < base) { a.relAt = 0.82 + Math.random() * 0.3; G.startShot(p); return; }
      }
    }
    var tx, tz;
    if (type === 'shooter' && d < 6.2 && a.hold < 3) { tx = rx - s * 6.4; tz = K.HZ + (a.side || 1) * 4.2; }
    else if (d > 5) { tx = rx - s * 4.5; tz = K.HZ + (a.side || 1) * 2.8; }
    else { tx = rx - s * 0.9; tz = K.HZ + (a.side || 1) * 0.8; }
    goTo(p, tx, tz, d > 3.5, dt);
  }

  function offBall(p, a, dt, holder) {
    var rx = rimX(p.team), s = rx > 0 ? 1 : -1;
    a.spotT -= dt;
    if (!a.spot || a.spotT <= 0) {
      var z = holder.z > K.HZ ? -1 : 1, type = p.def.type;
      if (type === 'shooter') a.spot = Math.random() < 0.5 ? { x: rx - s * 6.6, z: K.HZ + z * 3.5 } : { x: rx - s * 1.3, z: z > 0 ? K.CD - 1.1 : 1.1 };
      else if (type === 'dunker') a.spot = { x: rx - s * (1.5 + Math.random()), z: K.HZ + z * 1.6 };
      else a.spot = { x: rx - s * 5, z: K.HZ + z * 3 };
      a.spotT = 1.8 + Math.random() * 1.5;
    }
    // still bringing it up: stay ahead of the ball
    if ((holder.x - rx) * s < -8) { a.spot.x = holder.x + s * 4; }
    goTo(p, a.spot.x, a.spot.z, dist(p, a.spot) > 4, dt);
  }

  function defend(p, a, dt, holder) {
    var rx = rimX(holder.team), mate = G.mates(p)[0], dh = dist(p, holder), ballD = true;
    if (mate) { var dm = dist(mate, holder); ballD = mate.human ? dh < dm - 1 : dh <= dm; }
    if (ballD) {
      var dx = rx - holder.x, dz = K.HZ - holder.z, dd = Math.hypot(dx, dz) || 1, gap = holder.state === 'shoot' ? 0.7 : 1.0;
      goTo(p, holder.x + dx / dd * gap, holder.z + dz / dd * gap, dh > 3, dt);
      p.face = holder.x >= p.x ? 1 : -1;
      if (dh < 1.5 && a.t <= 0) {
        a.t = (1.3 + Math.random() * 1.2) / G.diff.react;
        if (p.def.type === 'strength' && Math.random() < 0.3 * G.diff.shove) G.tryShove(p); else G.trySteal(p);
      }
      if (holder.state === 'shoot' && dh < 2.2 && p.grounded() && !a.jumped && Math.random() < (0.35 + 0.05 * p.def.stats.block) * G.diff.block) { a.jumped = true; G.jump(p); }
      // meet a dunker in the air: go up as he takes off if he's coming past
      if (holder.state === 'dunk' && dh < 3.2 && p.grounded() && !a.jumped) { a.jumped = true; if (Math.random() < (0.3 + 0.05 * p.def.stats.block) * G.diff.block) G.jump(p); }
      if (holder.state !== 'shoot' && holder.state !== 'dunk') a.jumped = false;
    } else {
      var man = G.opps(p).filter(function (o) { return o !== holder; })[0] || holder;
      var ox = rx - man.x, oz = K.HZ - man.z, od = Math.hypot(ox, oz) || 1;
      goTo(p, man.x + ox / od * 1.4, man.z + oz / od * 1.4, dist(p, man) > 4, dt);
    }
  }

  function loose(p, a, dt) {
    var b = G.ball, tx = b.x + b.vx * 0.35, tz = b.z + b.vz * 0.35;
    if (b.state === 'shot') { var s = b.shotInfo; tx = s.rx - (s.rx > 0 ? 1 : -1) * (1.2 + p.slot * 0.8); tz = K.HZ + (p.slot ? 1.2 : -1.2); }
    var mine = true; G.mates(p).forEach(function (q) { if (Math.hypot(q.x - tx, q.z - tz) < Math.hypot(p.x - tx, p.z - tz) - 0.3) mine = false; });
    if (mine || b.state === 'shot') goTo(p, tx, tz, true, dt); else goTo(p, tx * 0.7, (tz + 7) / 2, false, dt);
    if (b.y > 2 && b.vy < 0 && Math.hypot(p.x - b.x, p.z - b.z) < 1.3 && Math.random() < 0.1) G.jump(p);
  }
})(window.HW);
