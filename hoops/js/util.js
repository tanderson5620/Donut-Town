/* util.js - small helpers shared by everything */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U = {};
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  U.damp = function (cur, target, rate, dt) { return U.lerp(cur, target, 1 - Math.exp(-rate * dt)); };
  U.wrapAngle = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  U.angDiff = function (to, from) { return U.wrapAngle(to - from); };
  U.easeOut = function (t) { return 1 - (1 - t) * (1 - t) * (1 - t); };
  U.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  U.gauss = function () { var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  U.hash = function (n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

  // Draw to a canvas and wrap as a CanvasTexture. draw(ctx, w, h).
  U.canvasTex = function (w, h, draw, opts) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); if (draw) draw(ctx, w, h);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = (opts && opts.aniso) || 4;
    t.encoding = THREE.sRGBEncoding === undefined ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.needsUpdate = true; t.userData = { canvas: c, ctx: ctx };
    return t;
  };
  // Material by quality tier: physically based (shadows, reflections) on phones/desktop, cheap Lambert in a headset.
  U.mat = function (o) {
    o = Object.assign({}, o || {});
    if (HW.HIGH) { if (o.color !== undefined) o.color = new THREE.Color(o.color).convertSRGBToLinear(); return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)); }
    delete o.roughness; delete o.metalness; return new THREE.MeshLambertMaterial(o);
  };
  U.roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  U.storage = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  // Horizontal angle (yaw) for a direction: 0 faces -Z, +yaw turns left (three.js convention).
  U.yawOf = function (dx, dz) { return Math.atan2(-dx, -dz); };
  U.dirOf = function (yaw, out) { out.set(-Math.sin(yaw), 0, -Math.cos(yaw)); return out; };
})(window.HW);
