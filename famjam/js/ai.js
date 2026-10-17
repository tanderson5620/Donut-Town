/* ai.js - computer players: drive, shoot by type, pass, cut to spots, defend, steal, shove, block, rebound */
window.HW = window.HW || {};
(function (HW) {
  var K = HW.GFX.K, G;
  var AI = HW.JamAI = {};
  // how far out each type pulls up from (plus a little for a good shooter): a 3-point shooter just behind the arc - 7.6 m with TP 10,
  // where a three starts falling off (he used to fire from 9 m and half his threes came from too deep)
  var RANGE = { shooter: 7.0, handler: 6.9, dunker: 4.8, strength: 4.6 };
  // the shooter's spot: on the wing just behind the arc (6.8 m out), for WING_T seconds of the possession before he takes it inside
  var WING_X = 5.8, WING_Z = 3.5, WING_T = 3;
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
    if (!live || p.state === 'fall' || p.state === 'dunk' || p.state === 'stepback' || p.state === 'cartwheel' || p.pending) { G.move(p, 0, 0, false, dt); return; }
    if (G.phase === 'inbound' && G.inb && p.state !== 'shoot') { inbound(p, a, dt, G.inb); return; }
    if (p.state === 'shoot') {
      G.move(p, 0, 0, false, dt);
      if (p.hasBall && !p.released && p.st >= p.tApex * (a.relAt || 1)) G.releaseShot(p);
      return;
    }
    a.t -= dt;
    // a pass is on its way to him: go meet it instead of drifting off to his spot
    if (b.state === 'pass' && b.pass && b.pass.to === p) { goTo(p, b.pass.ax != null ? b.pass.ax : b.pass.x1, b.pass.az != null ? b.pass.az : b.pass.z1, false, dt); return; }   // meet it where it was thrown
    // floor balance: the moment a shot of his team's goes up (a jumper, a layup or a dunk), the team's safety - the slower one, or his
    // partner if he's the one shooting - gets back on D before the other team has it, until somebody does
    if (G.backMan(p.team) === p) a.safe = true; else if (b.holder) a.safe = false;   // (somebody's got it: normal again)
    if (a.safe) { safety(p, a, dt); return; }
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
      // attack the side away from his man - only switching when the man is clearly on the other side (it used to flip back and forth
      // every quarter second with the man square in front of him, and he stuttered on the spot)
      if (opp.who && Math.abs(opp.who.z - p.z) > 0.5) a.side = opp.who.z > p.z ? -1 : 1; else if (!a.side) a.side = p.z > K.HZ ? 1 : -1;
      var open = opp.d > 1.5, late = G.shot < 3.5;
      // (the difficulty scales the chance itself - it used to multiply the yes/no answer, so it made no difference)
      if (G.canDunk(p) && a.hold > 0.5 && Math.random() < (open ? 0.4 + p.def.stats.dunk * 0.02 : 0.06 + p.def.stats.dunk * 0.01) * G.diff.shoot) { G.startDunk(p); return; }
      if (mate && a.hold > 0.7 && !late && !mate.human) {
        var mo = nearest(mate, G.opps(mate)).d, md = Math.hypot(mate.x - rx, mate.z - K.HZ);
        var pk = 0.6 + 0.08 * (p.def.stats.pass || 5);   // good passers look for the open man more
        if ((opp.d < 1.3 && mo > 1.8 && Math.random() < 0.5 * pk) || (mo > 2.5 && md < d - 1.5 && Math.random() < 0.2 * pk)) { G.passTo(p, mate); return; }
      }
      if (mate && mate.human && a.hold > 2.8 && nearest(mate, G.opps(mate)).d > 2 && Math.random() < 0.25) { G.passTo(p, mate); return; }
      var rng = RANGE[type] + (p.def.stats.tp - 5) * 0.12, spot = type === 'shooter' && a.hold < WING_T && Math.hypot(p.x - (rx - s * WING_X), p.z - (K.HZ + (a.side || 1) * WING_Z)) < 0.8;
      // a shooter lets it go on the catch (everyone else gets set first, unless he's at the rim or the clock's running out); at the rim,
      // or open at his spot, it goes up right away instead of him standing there with it
      if (d < rng && (a.hold > (type === 'shooter' ? 0.3 : 1.1) || d < 3 || late)) {
        var base = open ? 0.45 : 0.12; if (type === 'shooter' && d > K.R3 - 0.4) base += 0.3; if (d < 3) base += 0.2; if (p.onFire) base = 0.85; if (late || d < 1.8 || spot && open) base = 1;
        if (Math.random() < base) { a.relAt = 0.82 + Math.random() * 0.3; G.startShot(p); return; }
      }
    }
    // where he takes it: up the floor to the elbow on his side, then at the rim - the elbow is only on the way (it used to be where he
    // stopped: the spot is 5.3 m out and he only went on inside 5 m, so he stood there, a sitting duck for a steal, until he passed,
    // shot or the shot clock ran out - the bigs, out of range there, for up to 20 s). A shooter spots up on the wing behind the arc for
    // his shot first and drives if it isn't there after a few seconds
    var tx, tz;
    if (type === 'shooter' && a.hold < WING_T) { tx = rx - s * WING_X; tz = K.HZ + (a.side || 1) * WING_Z; }
    else if (d > 6.5) { tx = rx - s * 4.5; tz = K.HZ + (a.side || 1) * 2.8; }
    else { tx = rx - s * 0.9; tz = K.HZ + (a.side || 1) * 0.8; }
    // never standing still with the ball: there with no shot, he keeps going - a covered shooter slides along the arc to the other wing
    // (until it's time to take it inside), anyone else on to the rim
    if (Math.hypot(p.x - tx, p.z - tz) < 0.8 && d > 2.2) {
      if (type === 'shooter' && a.hold < WING_T) { a.side = -(a.side || 1); tz = K.HZ + a.side * WING_Z; }
      else { if (type === 'shooter') a.hold = WING_T; tx = rx - s * 0.9; tz = K.HZ + (a.side || 1) * 0.8; }
    }
    goTo(p, tx, tz, d > 3.5, dt);
  }

  // the inbound after a basket: the man getting it comes to a spot a few meters in from the baseline, on the side away from his man;
  // the team that just scored gets back - each defender runs for his spot in front of the basket they defend (the man who'll
  // bring it up has the length of the court to go)
  function inbound(p, a, dt, ib) {
    var rx = rimX(ib.team), s = rx > 0 ? 1 : -1;
    if (p === ib.p) { G.move(p, 0, 0, false, dt); return; }
    if (p.team === ib.team) {
      var o = nearest(p, G.opps(p)), zs = o.who && o.who.z > K.HZ ? -1 : 1;
      goTo(p, -s * (K.HL - 3.4), K.HZ + zs * 3, true, dt); return;
    }
    var mate = G.mates(p)[0], hi = !mate || mate.human || p.slot < mate.slot;   // (one high, one low)
    goTo(p, rx - s * (hi ? 6.2 : 2.6), K.HZ + (hi ? 0 : (p.z > K.HZ ? 1.6 : -1.6)), true, dt);
  }

  // the safety: back to the top of the key at his own end (only a rebound that comes right to him is his)
  function safety(p, a, dt) {
    var b = G.ball, dr = rimX(1 - p.team), sd = dr > 0 ? -1 : 1;
    if (b.state === 'loose' && Math.hypot(p.x - b.x, p.z - b.z) < 2.2) { loose(p, a, dt); return; }
    goTo(p, dr + sd * 5.6, K.HZ, true, dt);
  }

  function offBall(p, a, dt, holder) {
    var rx = rimX(p.team), s = rx > 0 ? 1 : -1;
    // the team's safety (the slower one) trails the play at the top of the arc instead of going deep: halfway back already when the
    // shot goes up
    if (G.safetyOf(p.team) === p) { goTo(p, rx - s * 7.6, K.HZ + (holder.z > K.HZ ? -1.4 : 1.4), dist(p, { x: rx - s * 7.6, z: K.HZ }) > 5, dt); return; }
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
