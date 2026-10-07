/* fx.js - pooled point-sprite particles: flame, sparks, debris (glass / confetti) */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U;
  function dotTex(soft) {
    return U.canvasTex(64, 64, function (c) {
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(soft ? 0.35 : 0.8, 'rgba(255,255,255,' + (soft ? 0.7 : 1) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }, { aniso: 1 });
  }

  function System(scene, n, size, additive, gravity, soft) {
    this.n = n; this.i = 0; this.g = gravity; this.additive = additive;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.base = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1);
    for (var k = 0; k < n; k++) this.pos[k * 3 + 1] = -100;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    var mat = new THREE.PointsMaterial({ size: size, map: dotTex(soft), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points); this.geo = geo;
  }
  var tmpC = new THREE.Color();
  System.prototype.emit = function (x, y, z, vx, vy, vz, color, life) {
    var k = this.i; this.i = (k + 1) % this.n; var o = k * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    tmpC.set(color); this.base[o] = tmpC.r; this.base[o + 1] = tmpC.g; this.base[o + 2] = tmpC.b;
    this.col[o] = tmpC.r; this.col[o + 1] = tmpC.g; this.col[o + 2] = tmpC.b;
    this.life[k] = life; this.max[k] = life;
  };
  System.prototype.burst = function (p, count, speed, color, life, up) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * 6.283, e = Math.random() * 2 - 0.5, s = speed * (0.3 + Math.random() * 0.7);
      this.emit(p.x, p.y, p.z, Math.cos(a) * s, e * s + (up || 0), Math.sin(a) * s, Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, life * (0.6 + Math.random() * 0.4));
    }
  };
  System.prototype.update = function (dt) {
    var n = this.n, p = this.pos, v = this.vel, l = this.life, c = this.col, b = this.base, any = false;
    for (var k = 0; k < n; k++) {
      if (l[k] <= 0) continue; any = true; var o = k * 3;
      l[k] -= dt;
      if (l[k] <= 0) { p[o + 1] = -100; continue; }
      v[o + 1] -= this.g * dt; p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
      if (p[o + 1] < 0.02 && this.g > 0) { p[o + 1] = 0.02; v[o + 1] *= -0.3; v[o] *= 0.6; v[o + 2] *= 0.6; }
      if (this.additive) { var f = l[k] / this.max[k]; c[o] = b[o] * f; c[o + 1] = b[o + 1] * f * f; c[o + 2] = b[o + 2] * f * f * f; }
    }
    if (any || this.dirty) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
    this.dirty = any;
  };

  HW.FX = {
    init: function (scene) {
      this.flame = new System(scene, 260, 0.34, true, -1.6, true);   // negative gravity = rises
      this.spark = new System(scene, 220, 0.09, true, 6, false);
      this.debris = new System(scene, 260, 0.08, false, 7, false);
    },
    update: function (dt) { this.flame.update(dt); this.spark.update(dt); this.debris.update(dt); },
    sparks: function (p, n, color) { this.spark.burst(p, n || 14, 3.5, color || ['#ffd166', '#ffffff', '#ff8a1f'], 0.7); },
    glass: function (p, n) { this.debris.burst(p, n || 80, 4.5, ['#cfe9ff', '#ffffff', '#9ad0ff'], 1.8, 1.5); },
    confetti: function (p, n) { this.debris.burst(p, n || 90, 5, ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'], 2.4, 4); },
    fireAt: function (p, spread) {
      var s = spread || 0.1;
      this.flame.emit(p.x + (Math.random() - 0.5) * s, p.y + (Math.random() - 0.3) * s, p.z + (Math.random() - 0.5) * s,
        (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.5, Math.random() < 0.5 ? '#ff7a1a' : '#ffc233', 0.55 + Math.random() * 0.3);
    }
  };
})(window.HW);
