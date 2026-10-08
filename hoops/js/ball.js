/* ball.js - the basketball: mesh, physics (floor, walls, backboard, rim ring, net), scoring detection */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U;

  function ballTexture() {
    return U.canvasTex(256, 128, function (g, w, h) {
      g.fillStyle = '#e8701a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 400; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(U.hash(i) * w, U.hash(i * 5.3) * h, 2, 2); }
      g.strokeStyle = '#1a0d05'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      [0, w / 2, w].forEach(function (x) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
      [w / 4, 3 * w / 4].forEach(function (x) { g.beginPath(); g.ellipse(x, h / 2, 34, h * 0.5, 0, 0, 6.283); g.stroke(); });
    }, { aniso: 2 });
  }

  function Ball(scene, world) {
    this.world = world; this.r = C.BALL_R;
    this.mat = U.mat({ map: ballTexture(), roughness: 0.6 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.r, HW.HIGH ? 28 : 16, HW.HIGH ? 20 : 12), this.mat); scene.add(this.mesh); this.mesh.castShadow = true;
    this.blob = world.makeBlob(0.2);
    this.pos = this.mesh.position; this.vel = new THREE.Vector3();
    this.state = 'free';          // free | held | dribble | dunk
    this.holder = null; this.lastTouch = null; this.shot = null;
    this.fire = false; this.airT = 0; this.scoredCd = 0; this.noCatch = 0; this.restT = 0;
    this.onScore = null; this.onEvent = null;      // callbacks set by the game
    this._q = new THREE.Quaternion(); this._ax = new THREE.Vector3();
    this.prevY = 0;
  }

  Ball.prototype.reset = function (x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.state = 'free'; this.holder = null; this.shot = null; this.noCatch = 0; this.restT = 0;
  };

  Ball.prototype.setFire = function (on) { this.fire = on; this.mat.emissive.setHex(on ? 0xff4a00 : 0x000000); };

  Ball.prototype.throwWith = function (vel, shot) {
    this.state = 'free'; this.holder = null; this.vel.copy(vel); this.shot = shot || null; this.airT = 0; this.restT = 0;
    if (shot) { this.noCatch = 0.25; }
  };

  // Free flight physics, sub-stepped for rim accuracy.
  Ball.prototype.step = function (dt) {
    this.scoredCd = Math.max(0, this.scoredCd - dt); this.noCatch = Math.max(0, this.noCatch - dt);
    if (this.state !== 'free') { this.restT = 0; return; }
    this.airT += dt;
    var n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (var i = 0; i < n; i++) this.sub(h);
    // visual spin follows the velocity (rolling on the floor, gentle tumble in the air)
    var sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.05) {
      this._ax.set(this.vel.z, 0, -this.vel.x).normalize();
      this._q.setFromAxisAngle(this._ax, sp * dt / this.r * (this.pos.y > this.r + 0.05 ? 0.35 : 1)); this.mesh.quaternion.premultiply(this._q);
    }
    if (this.pos.y <= this.r + 0.01 && sp < 0.4) this.restT += dt; else this.restT = 0;
  };

  Ball.prototype.sub = function (dt) {
    var p = this.pos, v = this.vel, r = this.r, ev = this.onEvent, i, h;
    this.prevY = p.y;
    p.addScaledVector(v, dt); p.y -= 0.5 * C.G * dt * dt; v.y -= C.G * dt;   // exact parabola (matches Shoot.ideal)
    // floor
    if (p.y < r) {
      p.y = r;
      if (v.y < -1.1) { if (ev) ev('bounce', Math.abs(v.y)); v.y = -v.y * 0.76; v.x *= 0.985; v.z *= 0.985; }
      else { v.y = 0; var f = Math.max(0, 1 - 0.9 * dt); v.x *= f; v.z *= f; }
    }
    // arena walls (soft, keeps the ball in play like an arcade cabinet)
    if (p.x > C.BOUND_X + 1.2) { p.x = C.BOUND_X + 1.2; v.x = -Math.abs(v.x) * 0.6; }
    if (p.x < -C.BOUND_X - 1.2) { p.x = -C.BOUND_X - 1.2; v.x = Math.abs(v.x) * 0.6; }
    if (p.z > C.BOUND_Z + 1.4) { p.z = C.BOUND_Z + 1.4; v.z = -Math.abs(v.z) * 0.6; }
    if (p.z < -C.BOUND_Z - 1.4) { p.z = -C.BOUND_Z - 1.4; v.z = Math.abs(v.z) * 0.6; }
    if (p.y > 12.5) { p.y = 12.5; v.y = -Math.abs(v.y) * 0.5; }

    var hoops = this.world.hoops;
    for (i = 0; i < 2; i++) {
      h = hoops[i];
      // backboard: front face plane, a rectangle
      var zf = h.z - h.dir * (C.BOARD_Z - C.RIM_Z) + h.dir * 0.03, rel = (p.z - zf) * h.dir;
      var by = C.RIM_H + 0.45;
      if (rel < r && rel > -0.3 && v.z * h.dir < 0 && Math.abs(p.x) < C.BOARD_W / 2 + 0.04 && Math.abs(p.y - by) < C.BOARD_H / 2 + 0.04) {
        if (h.board.visible) {
          p.z = zf + h.dir * r; v.z = -v.z * 0.62; v.x *= 0.92; v.y *= 0.94;
          if (ev) ev('board', Math.abs(v.z), h);
        }
      }
      // rim: nearest point on the ring circle vs the ball sphere
      var dx = p.x - h.x, dz = p.z - h.z, dy = p.y - C.RIM_H, rh = Math.hypot(dx, dz);
      if (Math.abs(dy) < 0.4 && rh > 1e-4) {
        var qx = h.x + dx / rh * C.RIM_R, qz = h.z + dz / rh * C.RIM_R;
        var nx = p.x - qx, ny = dy, nz = p.z - qz, d = Math.hypot(nx, ny, nz), min = r + C.RIM_TUBE;
        if (d < min && d > 1e-5) {
          nx /= d; ny /= d; nz /= d;
          p.x = qx + nx * min; p.y = C.RIM_H + ny * min; p.z = qz + nz * min;
          var vn = v.x * nx + v.y * ny + v.z * nz;
          if (vn < 0) { var k = -(1 + 0.58) * vn; v.x += k * nx; v.y += k * ny; v.z += k * nz; v.x *= 0.96; v.z *= 0.96; if (ev) ev('rim', -vn, h); h.shake = Math.min(1, h.shake + Math.min(1, -vn / 6)); }
        }
      }
      // through the cylinder under the rim: the net slows the ball
      if (rh < C.RIM_R - 0.02 && dy < 0 && dy > -0.55) {
        var f2 = Math.max(0, 1 - 5 * dt); v.x *= f2; v.z *= f2; if (v.y < 0) v.y *= Math.max(0, 1 - 1.4 * dt);
      }
      // scoring: center crosses the rim plane downward inside the ring
      if (this.prevY > C.RIM_H && p.y <= C.RIM_H && v.y < 0 && rh < C.RIM_R - 0.03 && this.scoredCd <= 0) {
        this.scoredCd = 1.0; h.swish = 1;
        if (this.onScore) this.onScore(h.idx, this);
      }
    }
  };

  // Where will the free ball come down? (for AI rebounds) returns [x, z, t]
  Ball.prototype.predictLanding = function (out) {
    var y = this.pos.y - this.r, vy = this.vel.y, g = C.G, disc = vy * vy + 2 * g * y, t = (vy + Math.sqrt(Math.max(0, disc))) / g;
    out.set(this.pos.x + this.vel.x * t, 0, this.pos.z + this.vel.z * t); out.t = t; return out;
  };

  Ball.prototype.sync = function () { HW.world && HW.world.blobAt(this.blob, this.pos.x, this.pos.z, this.pos.y); };

  HW.Ball = Ball;
})(window.HW);
