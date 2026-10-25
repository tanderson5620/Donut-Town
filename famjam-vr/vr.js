/* vr.js - FAM JAM VR: the arcade game exactly as famjam/ ships it (its own code, art and sounds, loaded unchanged through the page's
   <base href="../famjam/">) shown in a 3D arena for a Quest or any WebXR headset: the court, hoops and stands in 3D, the players standing
   on the floor as life-size cut-outs drawn by the game's own sprite code every frame, a real ball, the arcade picture (scoreboard,
   slow-motion close-ups, callouts) up on the jumbotron, the menus on a big screen in front of you that you point at, and the Touch
   controllers for the stick and buttons. Nothing in famjam/ is changed: this file only wraps what the game already exposes.
   Court meters (gfx.js): x along the length, z into the screen (0 = near sideline), y up. In three.js the same point is (x, y, -z),
   so you sit on the near side looking down -z with +x on your right, like the arcade camera. */
(function () {
  'use strict';
  var FALLBACK = ['data', 'audio', 'font', 'gfx', 'crowd', 'game', 'ai', 'replay', 'net', 'count', 'presence', 'notify', 'ui', 'main'].map(function (n) { return 'js/' + n + '.js'; });
  var V = window.FJVR = { view: 'high' };
  var HW, X, G, UI, In, K, Au, Fo;

  /* ---------- 1. load the game's scripts in famjam/index.html's order (a famjam update comes in by itself, new files too) ---------- */
  function load(list, done) {
    var left = list.length;
    list.forEach(function (src) { var s = document.createElement('script'); s.src = src; s.async = false; s.onload = s.onerror = function () { if (--left === 0) done(); }; document.head.appendChild(s); });
  }
  fetch('index.html', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (html) {
    var re = /<script[^>]*\bsrc="(js\/[^"]+)"/g, m, out = []; while ((m = re.exec(html))) out.push(m[1]); return out.length ? out : FALLBACK;
  }).catch(function () { return FALLBACK; }).then(function (list) {
    load(list, function () {
      hook();
      // main.js boots on DOMContentLoaded: if the page got there before the scripts were in, send it again (it only listens once)
      if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', afterBoot);
      else { document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true })); afterBoot(); }
    });
  });

  /* ---------- 2. hooks, before the game boots ---------- */
  // the game's loop asks for animation frames; in a headset the page's own frames stop, so they're queued here and run from the
  // headset's frame (or the screen's, outside VR)
  var Q = [], qid = 0, RAF = window.requestAnimationFrame.bind(window);
  function flush(ts) { var q = Q; Q = []; for (var i = 0; i < q.length; i++) { try { q[i].cb(ts); } catch (e) { console.error(e); } } }
  function hook() {
    HW = window.HW; X = HW.GFX; G = HW.Jam; UI = HW.JamUI; In = HW.In; K = X.K; Au = HW.Audio; Fo = HW.Font;
    HW.TOUCH = false;   // (the Quest browser says it has touch: no phone buttons, no fullscreen grab)
    window.requestAnimationFrame = function (cb) { Q.push({ id: ++qid, cb: cb }); return qid; };
    window.cancelAnimationFrame = function (id) { for (var i = 0; i < Q.length; i++) if (Q[i].id === id) { Q.splice(i, 1); return; } };
    // an invite link sends the family to the regular game on their phones
    if (HW.Net) HW.Net.inviteURL = function () { return location.origin + location.pathname.replace(/famjam-vr\/[^/]*$/, 'famjam/') + '?room=' + HW.Net.code; };
    wrapFx();
  }

  /* ---------- small helpers ---------- */
  function cnv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function ctex(c, rep) { var t = new THREE.CanvasTexture(c); if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  function flatTex(c) { var t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var colCache = {};
  function rgbOf(s) {
    var c = colCache[s]; if (c) return c;
    var col = new THREE.Color(); try { col.setStyle(s); } catch (e) { col.set(0xffffff); }
    return (colCache[s] = [col.r, col.g, col.b]);
  }
  // merge geometries (positions already in place) into one, so a whole set of parts is one draw call
  function merge(list) {
    var pos = [], nor = [], uv = [], idx = [], off = 0;
    list.forEach(function (g) {
      var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (var i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i)); else nor.push(0, 1, 0); if (u) uv.push(u.getX(i), u.getY(i)); else uv.push(0, 0); }
      if (g.index) for (var j = 0; j < g.index.count; j++) idx.push(g.index.getX(j) + off); else for (var k = 0; k < p.count; k++) idx.push(k + off);
      off += p.count;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx); return out;
  }
  function placed(geo, x, y, z, rx, ry, rz) { var m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)); m.setPosition(x, y, z); geo.applyMatrix4(m); return geo; }
  // a rod between two court points (three.js coordinates)
  function rodGeo(a, b, r) {
    var d = new THREE.Vector3().subVectors(b, a), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, 10, 1);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); return g;
  }
  function W3(x, y, z) { return new THREE.Vector3(x, y, -z); }

  /* ---------- 3. textures: the court, ads, crowd, ball, net and the effects ---------- */
  var PPM = 40, FX0 = -24, FZ0 = -3, FWm = 48, FDm = 22, FC = null;
  // the same court picture gfx.js draws its floor from (copied here, the game's own is private), in the two families' colors
  function paintFloor(c) {
    var g = c.getContext('2d');
    function px(x) { return (x - FX0) * PPM; } function pz(z) { return (FDm - (z - FZ0)) * PPM; }
    g.fillStyle = '#2b2378'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#211b5e'; g.fillRect(0, 0, c.width, pz(15.2));
    for (var y = pz(K.CD), row = 0; y < pz(0); y += 6, row++) {
      for (var x = px(-K.HL), k = 0; x < px(K.HL); k++) {
        var len = 90 + hash(row * 7 + k) * 170, t = hash(row * 3.7 + k * 1.3), streak = hash(row * 11.3 + k * 5.1) < 0.12 ? 14 : 0;
        g.fillStyle = 'rgb(' + Math.round(186 + t * 20 + streak) + ',' + Math.round(126 + t * 18 + streak) + ',' + Math.round(76 + t * 12 + streak / 2) + ')';
        g.fillRect(x, y, Math.min(len, px(K.HL) - x), 6); g.fillStyle = 'rgba(80,40,12,0.3)'; g.fillRect(x, y + 5, len, 1); g.fillRect(x, y, 1, 6);
        x += len;
      }
    }
    for (var i = -2; i <= 2; i++) { var gr = g.createRadialGradient(px(i * 6), pz(10), 0, px(i * 6), pz(10), 4 * PPM); gr.addColorStop(0, 'rgba(255,240,210,0.1)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = gr; g.fillRect(px(i * 6 - 4), pz(14), 8 * PPM, 8 * PPM); }
    var tc = FC || [HW.TEAMS[0].color, HW.TEAMS[1].color];
    [[-1, tc[0]], [1, tc[1]]].forEach(function (e) {
      var s = e[0], x0 = s * K.HL, x1 = s * (K.HL - K.LANE);
      g.fillStyle = e[1]; g.globalAlpha = 0.6; g.fillRect(Math.min(px(x0), px(x1)), pz(K.HZ + K.LANEW / 2), K.LANE * PPM, K.LANEW * PPM); g.globalAlpha = 1;
    });
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.strokeRect(px(-K.HL), pz(K.CD), 2 * K.HL * PPM, K.CD * PPM);
    g.beginPath(); g.moveTo(px(0), pz(0)); g.lineTo(px(0), pz(K.CD)); g.stroke();
    g.beginPath(); g.arc(px(0), pz(K.HZ), 1.8 * PPM, 0, 6.283); g.stroke();
    [-1, 1].forEach(function (s) {
      var x0 = s * K.HL, x1 = s * (K.HL - K.LANE), hx = s * K.RIMX;
      g.strokeRect(Math.min(px(x0), px(x1)), pz(K.HZ + K.LANEW / 2), K.LANE * PPM, K.LANEW * PPM);
      g.beginPath(); g.arc(px(x1), pz(K.HZ), 1.8 * PPM, 0, 6.283); g.stroke();
      var cz = 0.9, dz = K.HZ - cz, dx = Math.sqrt(K.R3 * K.R3 - dz * dz), a = Math.atan2(dz, dx);
      g.beginPath(); g.moveTo(px(x0), pz(cz)); g.lineTo(px(hx - s * dx), pz(cz));
      if (s > 0) g.arc(px(hx), pz(K.HZ), K.R3 * PPM, Math.PI - a, Math.PI + a, false); else g.arc(px(hx), pz(K.HZ), K.R3 * PPM, a, -a, true);
      g.lineTo(px(x0), pz(K.CD - cz)); g.stroke();
      g.save(); g.translate(px(s * 13.5), pz(3.3)); g.rotate(s * Math.PI / 2); g.scale(s * 1.25, s * 1.0);
      g.font = '60px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText('JAM', 3, 5); g.fillStyle = '#ecebff'; g.fillText('JAM', 0, 0); g.restore();
    });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 90px "Press Start 2P", monospace';
    g.save(); g.translate(px(0), pz(K.HZ)); g.scale(1, 0.9); g.fillText('JAM', 0, 6); g.restore();
  }
  // the low courtside boards (gfx.js buildWall), lettered in the arcade font
  function paintAds(c) {
    var w = c.getContext('2d'); w.fillStyle = '#0b0b16'; w.fillRect(0, 0, c.width, c.height);
    var ads = [['FAM JAM', '#c9a53a'], ['ANDERSONS', '#c46a1c'], ['2 ON 2', '#b8407e'], ['GORMANS', '#2f6cc4'], ['TURBO!', '#47b07c'], ['STOWELLS', '#8a46c8'], ['JOSEPH GEORGE', '#2bb34b'], ['FLICKINGER', '#ff7b00']];
    for (var i = 0; i < 16; i++) {
      var a = ads[i % ads.length], x = i * 128; w.fillStyle = '#15152a'; w.fillRect(x + 4, 6, 120, 40); w.fillStyle = a[1]; w.fillRect(x + 4, 6, 120, 3);
      Fo.draw(w, a[0], x + 64, 28, { scale: 1, color: a[1], shadow: 0 });
    }
  }
  var SKIN = ['#f2c9a8', '#e8b48f', '#d9a27c', '#c48a62', '#a56d47', '#7d4e32', '#5c3822', '#f0bfa0'];
  var HAIR = ['#17110d', '#2a1c13', '#3f2a1b', '#5e4027', '#8a6438', '#b8935c', '#7c7c7c', '#cfc6b4', '#22180f'];
  var SHIRT = ['#262a35', '#363b4a', '#4a4e5b', '#1c1f2b', '#5a2630', '#2c4838', '#646874', '#8a8e97', '#cfcfd3', '#7a302f', '#2e3d6c', '#ad5638', '#c39639', '#23507a', '#161616', '#e6e6e6', '#5b3f6e', '#3f6a62'];
  var TEAMC = ['#ff8a1f', '#3a86ff', '#b45cff', '#2bb34b', '#ff7b00'];
  // a strip of seated fans, 8 m of seats (16 of them) across 1024 px; cheer: on their feet with their arms up; back: the same fans seen
  // from behind (the near stands from the upper deck)
  function paintCrowd(cheer, seed, back) {
    var c = cnv(1024, 160), g = c.getContext('2d');
    for (var i = 0; i < 16; i++) {
      var r = function (n) { return hash(seed * 31 + i * 7.13 + n * 1.7); }, x = i * 64 + 32 + (r(1) - 0.5) * 8;
      // the seat back
      g.fillStyle = '#23243f'; g.fillRect(x - 26, 112, 52, 48); g.fillStyle = '#2e3052'; g.fillRect(x - 26, 112, 52, 4);
      if (r(2) < 0.07) continue;   // an empty seat
      var skin = SKIN[(r(3) * SKIN.length) | 0], hair = HAIR[(r(4) * HAIR.length) | 0], shirt = r(5) < 0.2 ? TEAMC[(r(6) * TEAMC.length) | 0] : SHIRT[(r(7) * SHIRT.length) | 0];
      var up = cheer ? 10 + r(8) * 8 : 0, tw = 40 + r(9) * 8, top = 78 - up, hy = top - 16;
      if (cheer) {   // arms up behind the head
        g.strokeStyle = shirt; g.lineWidth = 9; g.lineCap = 'round';
        [-1, 1].forEach(function (s) { var sp = 6 + r(10 + s) * 10; g.beginPath(); g.moveTo(x + s * tw * 0.38, top + 10); g.lineTo(x + s * (tw * 0.42 + sp), hy - 26); g.stroke(); g.fillStyle = skin; g.beginPath(); g.arc(x + s * (tw * 0.42 + sp), hy - 30, 5.5, 0, 6.283); g.fill(); });
      }
      g.fillStyle = shirt; g.beginPath(); g.moveTo(x - tw / 2, 160); g.lineTo(x - tw / 2, top + 12); g.quadraticCurveTo(x - tw / 2, top, x - tw * 0.2, top); g.lineTo(x + tw * 0.2, top); g.quadraticCurveTo(x + tw / 2, top, x + tw / 2, top + 12); g.lineTo(x + tw / 2, 160); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - tw / 2 + 3, top + 6, 5, 40);
      g.fillStyle = skin; g.fillRect(x - 5, top - 6, 10, 8); g.beginPath(); g.arc(x, hy, 13, 0, 6.283); g.fill();
      if (back) {   // the backs of their heads: hair (or a cap) all over, the seat back in front of them
        var hs2 = r(11); g.fillStyle = hs2 >= 0.55 && hs2 < 0.75 ? (r(12) < 0.4 ? TEAMC[(r(13) * TEAMC.length) | 0] : SHIRT[(r(14) * SHIRT.length) | 0]) : hair;
        g.beginPath(); g.arc(x, hy - 1, 13.5, Math.PI * 0.85, Math.PI * 2.15); g.fill(); if (hs2 >= 0.75) g.fillRect(x - 14, hy - 2, 28, 18); else g.fillRect(x - 12, hy, 24, 9);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2, top + 14, 4, 40);
        g.fillStyle = '#23243f'; g.fillRect(x - 26, 128, 52, 32); g.fillStyle = '#2e3052'; g.fillRect(x - 26, 128, 52, 4);
        continue;
      }
      g.fillStyle = hair; var hs = r(11);
      if (hs < 0.55) { g.beginPath(); g.arc(x, hy - 2, 13.5, Math.PI * 1.05, Math.PI * 1.95); g.fill(); g.fillRect(x - 13, hy - 6, 4, 8); g.fillRect(x + 9, hy - 6, 4, 8); }
      else if (hs < 0.75) { var cap = r(12) < 0.4 ? TEAMC[(r(13) * TEAMC.length) | 0] : SHIRT[(r(14) * SHIRT.length) | 0]; g.fillStyle = cap; g.beginPath(); g.arc(x, hy - 3, 13.5, Math.PI, 0); g.fill(); g.fillRect(x - 3, hy - 5, 20, 4); }
      else { g.beginPath(); g.arc(x, hy - 1, 14.5, Math.PI * 0.95, Math.PI * 2.05); g.fill(); g.fillRect(x - 14, hy - 2, 5, 18); g.fillRect(x + 9, hy - 2, 5, 18); }
      g.fillStyle = '#1a1010'; g.fillRect(x - 6, hy, 3, 3); g.fillRect(x + 3, hy, 3, 3);
      if (cheer) { g.fillStyle = '#4a1616'; g.fillRect(x - 3, hy + 6, 6, 4); }
    }
    return c;
  }
  function paintBall() {
    var c = cnv(256, 128), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#d8641c'); gr.addColorStop(0.5, '#f07a26'); gr.addColorStop(1, '#c25412'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    for (var i = 0; i < 900; i++) { g.fillStyle = 'rgba(80,30,0,' + (0.08 + hash(i) * 0.1) + ')'; g.fillRect(hash(i * 3.1) * 256, hash(i * 7.7) * 128, 1.5, 1.5); }
    g.strokeStyle = '#2a0e02'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();
    [64, 192].forEach(function (x) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); });
    [32, 96, 160, 224].forEach(function (x, k) { g.beginPath(); for (var y = 0; y <= 128; y += 4) { var xx = x + Math.sin(y / 128 * Math.PI) * 22 * (k % 2 ? 1 : -1); if (y) g.lineTo(xx, y); else g.moveTo(xx, y); } g.stroke(); });
    return c;
  }
  function paintNet() {
    var c = cnv(128, 64), g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.2;
    for (var i = -8; i <= 16; i++) { g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i * 8 + 64, 0); g.lineTo(i * 8, 64); g.stroke(); }
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 61, 128, 3);
    return c;
  }
  function radial(stops, n) {
    var c = cnv(n || 64, n || 64), g = c.getContext('2d'), h = c.width / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); return c;
  }
  function paintStar() {
    var c = cnv(128, 128), g = c.getContext('2d'), n = 10; g.translate(64, 64); g.fillStyle = '#ffd23a'; g.beginPath();
    for (var j = 0; j < n * 2; j++) { var an = j / (n * 2) * 6.283, rr = j % 2 ? 26 : (j % 4 ? 52 : 63); g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.85); }
    g.closePath(); g.fill(); g.strokeStyle = '#ff7a00'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 18, 15, 0, 0, 6.283); g.fill(); return c;
  }
  function paintRing(col) { var c = cnv(128, 128), g = c.getContext('2d'); g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 58, 0, 6.283); g.stroke(); g.globalAlpha = 0.6; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 44, 0, 6.283); g.stroke(); return c; }
  function paintPool() {
    var c = cnv(128, 128), g = c.getContext('2d'); g.fillStyle = '#5e0606'; g.beginPath(); g.ellipse(64, 64, 60, 54, 0, 0, 6.283); g.fill();
    g.fillStyle = '#8a0c0c'; g.beginPath(); g.ellipse(54, 56, 36, 30, 0, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,200,200,0.35)'; g.fillRect(42, 40, 12, 3); return c;
  }
  function paintCrater() {
    var c = cnv(128, 128), g = c.getContext('2d'); g.fillStyle = 'rgba(45,25,10,0.6)'; g.beginPath(); g.arc(64, 64, 44, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(20,10,4,0.65)'; g.beginPath(); g.arc(64, 66, 24, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(30,15,6,0.85)'; g.lineWidth = 2.5;
    for (var i = 0; i < 7; i++) { var a = i / 7 * 6.283 + hash(i) * 0.6, l = 40 + hash(i * 3) * 22; g.beginPath(); g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.lineTo(64 + Math.cos(a + 0.15) * l * 0.7, 64 + Math.sin(a + 0.15) * l * 0.7); g.lineTo(64 + Math.cos(a - 0.1) * l, 64 + Math.sin(a - 0.1) * l); g.stroke(); }
    return c;
  }
  function paintRays() {
    var c = cnv(256, 256), g = c.getContext('2d'); g.translate(128, 128);
    for (var j = 0; j < 14; j++) { var a = j / 14 * 6.283, wd = 0.07 + 0.05 * (j % 2); g.fillStyle = j % 2 ? 'rgba(255,246,200,0.9)' : 'rgba(255,210,63,0.9)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wd) * 128, Math.sin(a - wd) * 128); g.lineTo(Math.cos(a + wd) * 128, Math.sin(a + wd) * 128); g.closePath(); g.fill(); }
    return c;
  }
  // a text panel in the arcade font (signs, banners, the seat names)
  function paintText(lines, w, h, bg, o) {
    var c = cnv(w, h), g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    lines.forEach(function (l) { Fo.draw(g, l[0], l[1] * w, l[2] * h, Object.assign({ scale: 2, scheme: 'white' }, o || {}, l[3] || {})); });
    return c;
  }

  /* ---------- 4. the 3D arena ---------- */
  var R, scene, camera, rig, world, cv, gameTex, look = { yaw: 0, pitch: -0.2 };
  var floorC, floorTex, adsC, adsTex, crowdTex = [], crowdGroups = [], nets = [], arenaOnly = [], nearOnly = [], tableGroup, panel, panelFrame, callMesh, callC, callTex, flash, toastMesh, toastT = 0;
  var clipUp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), clipDown = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  function build3D() {
    R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); R.setSize(innerWidth, innerHeight);
    R.domElement.className = 'vr3d'; document.body.insertBefore(R.domElement, document.getElementById('vrui'));
    R.xr.enabled = true; R.localClippingEnabled = true;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05050c); scene.fog = new THREE.Fog(0x05050c, 48, 120);
    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 300); camera.rotation.order = 'YXZ';
    rig = new THREE.Group(); rig.add(camera); scene.add(rig);
    world = new THREE.Group(); scene.add(world);
    scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x2a1d36, 0.95));
    var sun = new THREE.DirectionalLight(0xfff2e0, 0.55); sun.position.set(-6, 20, 8); scene.add(sun);
    buildFloor(); buildStands(); buildHoops(); buildJumbotron(); buildArena(); buildScreens(); buildBall(); buildFx(); buildTable();
    setView(V.view, true);
    V.three = { R: R, scene: scene, camera: camera, rig: rig, world: world, panel: panel, callMesh: callMesh, callC: callC, cards: cards };   // (for the tests)
    R.setAnimationLoop(onFrame);
  }
  function buildFloor() {
    floorC = cnv(FWm * PPM, FDm * PPM); paintFloor(floorC); floorTex = ctex(floorC); floorTex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    // (it writes no depth: the players' reflections under it show through, everything standing on it covers it)
    var m = new THREE.Mesh(new THREE.PlaneGeometry(FWm, FDm), new THREE.MeshBasicMaterial({ map: floorTex, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(FX0 + FWm / 2, 0, -(FZ0 + FDm / 2)); m.renderOrder = -10; world.add(m);
    var om = new THREE.MeshLambertMaterial({ color: 0x0d0c20 }), cz = -(FZ0 + FDm / 2);
    [[0, cz - FDm / 2 - 30, 140, 60], [0, cz + FDm / 2 + 30, 140, 60], [-FWm / 2 - 25, cz, 50, FDm], [FWm / 2 + 25, cz, 50, FDm]].forEach(function (e) {
      var o = new THREE.Mesh(new THREE.PlaneGeometry(e[2], e[3]), om); o.rotation.x = -Math.PI / 2; o.position.set(e[0], -0.002, e[1]); world.add(o); arenaOnly.push(o);
    });
  }
  // the bowl: twelve rows of seats rising on all four sides, packed with fans; the upper deck seat is in the near stands at row 5, with an
  // aisle in front of it so the court is in full view
  var ROWS = 12, RD = 0.85, FAN_H = 1.25, AISLE = 1.5, SEAT_ROW = 5;
  function rowH(i) { return 0.5 + i * 0.42; }
  function buildStands() {
    adsC = cnv(2048, 52); paintAds(adsC); adsTex = ctex(adsC, true);
    // [front calm, front cheer, back calm, back cheer] for two different strips
    crowdTex = [1, 2].map(function (sd) { return [paintCrowd(false, sd), paintCrowd(true, sd), paintCrowd(false, sd, true), paintCrowd(true, sd, true)].map(function (c) { return ctex(c, true); }); });
    var stepMat = new THREE.MeshLambertMaterial({ color: 0x1b1c34 }), adsGeos = [], lightGeos = [];
    // sides: the front edge's middle (court x, z), the way along it, the way back from the court, its length
    var SIDES = [
      { o: [0, 16.25], a: [1, 0], b: [0, 1], L: 34, ads: [0, 15.6] },
      { o: [0, -3.55], a: [1, 0], b: [0, -1], L: 34, ads: [0, -3.4], aisle: true },
      { o: [-17.1, 7], a: [0, 1], b: [-1, 0], L: 19.4, ads: [-16.45, 7] },
      { o: [17.1, 7], a: [0, 1], b: [1, 0], L: 19.4, ads: [16.45, 7] }
    ];
    SIDES.forEach(function (S, si) {
      var steps = [];
      for (var i = 0; i < ROWS; i++) {
        var h = rowH(i), d = i * RD + RD / 2, cx = S.o[0] + S.b[0] * d, cz = S.o[1] + S.b[1] * d, alongX = S.a[0] !== 0;
        steps.push(placed(new THREE.BoxGeometry(alongX ? S.L : RD, h, alongX ? RD : S.L), cx, h / 2, -cz));
      }
      // the facade above the top row: a dark band with a strip of warm lights
      var fd = ROWS * RD + 0.2, fx = S.o[0] + S.b[0] * fd, fz = S.o[1] + S.b[1] * fd, alongX2 = S.a[0] !== 0;
      steps.push(placed(new THREE.BoxGeometry(alongX2 ? S.L : 0.4, 2.2, alongX2 ? 0.4 : S.L), fx, rowH(ROWS - 1) + 1.1, -fz));
      var stepMesh = new THREE.Mesh(merge(steps), stepMat); world.add(stepMesh); if (S.aisle) nearOnly.push(stepMesh);
      lightGeos.push(placed(new THREE.BoxGeometry(alongX2 ? S.L : 0.06, 0.1, alongX2 ? 0.06 : S.L), fx - S.b[0] * 0.22, rowH(ROWS - 1) + 1.5, -(fz - S.b[1] * 0.22)));
      var flip = S.a[0] * S.b[1] - S.a[1] * S.b[0] < 0;   // (fans' quads wound to face the court)
      // the fans, in three groups of four rows (each group jumps up on its own on a big play)
      for (var gi = 0; gi < 3; gi++) {
        var pos = [], uv = [], idx = [], n = 0;
        for (var r = gi * 4; r < gi * 4 + 4; r++) {
          var h2 = rowH(r) - 0.05, d2 = r * RD + 0.55, ox = S.o[0] + S.b[0] * d2, oz = S.o[1] + S.b[1] * d2, u0 = hash(si * 13 + r * 5.3) * 8;
          var segs = S.aisle && r <= SEAT_ROW + 1 ? [[-S.L / 2, -AISLE], [AISLE, S.L / 2]] : [[-S.L / 2, S.L / 2]];
          if (S.aisle && r === SEAT_ROW) segs = [[-S.L / 2, -AISLE - 0.6], [AISLE + 0.6, S.L / 2]];   // (room beside the upper deck seat)
          segs.forEach(function (sg) {
            if (flip) sg = [sg[1], sg[0]];
            var a0x = ox + S.a[0] * sg[0], a0z = oz + S.a[1] * sg[0], a1x = ox + S.a[0] * sg[1], a1z = oz + S.a[1] * sg[1], ua = u0 + (sg[0] + S.L / 2) / 8, ub = u0 + (sg[1] + S.L / 2) / 8;
            pos.push(a0x, h2, -a0z, a1x, h2, -a1z, a1x, h2 + FAN_H, -a1z, a0x, h2 + FAN_H, -a0z); uv.push(ua, 0, ub, 0, ub, 1, ua, 1);
            idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
          });
        }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
        var set = crowdTex[(si + gi) % 2], mat = new THREE.MeshBasicMaterial({ map: set[0], alphaTest: 0.5, color: 0x8e90b4 }), bmat = new THREE.MeshBasicMaterial({ map: set[2], alphaTest: 0.5, side: THREE.BackSide, color: 0x7a7c9c });
        var mesh = new THREE.Mesh(geo, mat), bmesh = new THREE.Mesh(geo, bmat); mesh.add(bmesh);
        mesh.userData = { set: set, back: bmesh, ph: hash(si * 3 + gi) * 6.28, k: hash(si * 7 + gi * 3), cheer: false }; world.add(mesh); crowdGroups.push(mesh); if (S.aisle) nearOnly.push(mesh);
      }
      // the courtside boards
      var ax = S.ads[0], az = S.ads[1], alongX3 = S.a[0] !== 0, L = S.L - 2, ag = new THREE.PlaneGeometry(L, 0.62);
      var uvs = ag.attributes.uv; for (var k = 0; k < uvs.count; k++) uvs.setX(k, uvs.getX(k) * L / 32);
      ag.rotateY(Math.atan2(-S.b[0], S.b[1]));   // (facing the court)
      ag.translate(ax, 0.31, -az); adsGeos.push(ag);
    });
    var adsMat = new THREE.MeshBasicMaterial({ map: adsTex, side: THREE.DoubleSide });
    world.add(new THREE.Mesh(merge(adsGeos), adsMat));
    world.add(new THREE.Mesh(merge(lightGeos), new THREE.MeshBasicMaterial({ color: 0xffd58a })));
  }
  // the hoops, after gfx.js: a padded red base, blue and white steel arms, the glass board, the orange rim and a white net
  function buildHoops() {
    var parts = { pad: [], white: [], blue: [], glass: [], rim: [], red: [] };
    [-1, 1].forEach(function (s) {
      var z0 = K.HZ - 0.75, z1 = K.HZ + 0.75, xi = 13.2, xo = 15.4, bh = 1.2;
      parts.pad.push(placed(new THREE.BoxGeometry(xo - xi, bh, z1 - z0), s * (xi + xo) / 2, bh / 2, -K.HZ));
      parts.white.push(placed(new THREE.BoxGeometry(xo - xi + 0.02, 0.14, z1 - z0 + 0.02), s * (xi + xo) / 2, bh * 0.68, -K.HZ));
      parts.blue.push(rodGeo(W3(s * 14.3, bh, K.HZ), W3(s * 14.3, 4.35, K.HZ), 0.1));
      parts.white.push(rodGeo(W3(s * 14.3, 4.35, K.HZ), W3(s * (K.BOARDX + 0.12), 3.62, K.HZ), 0.09));
      parts.blue.push(rodGeo(W3(s * 14.3, 2.1, K.HZ), W3(s * (K.BOARDX + 0.12), 3.12, K.HZ), 0.06));
      var bx = s * K.BOARDX, by = 3.43, bw = 1.84, bhh = 1.1;
      parts.glass.push(placed(new THREE.BoxGeometry(0.03, bhh, bw), bx, by, -K.HZ));
      // the white frame round the glass, the red shooter's square and the blue line inside the frame (on the court side)
      [[0, bhh / 2, bw, 0.06], [0, -bhh / 2, bw, 0.08], [bw / 2, 0, 0.06, bhh], [-bw / 2, 0, 0.06, bhh]].forEach(function (f) { parts.white.push(placed(new THREE.BoxGeometry(0.05, f[3], f[2]), bx, by + f[1], -K.HZ + f[0])); });
      var fx = bx - s * 0.025;
      [[3.5, 0, 0.6, 0.045], [3.05, 0, 0.6, 0.045], [3.275, 0.3, 0.045, 0.45], [3.275, -0.3, 0.045, 0.45]].forEach(function (f) { parts.red.push(placed(new THREE.BoxGeometry(0.01, f[3], f[2]), fx, f[0], -K.HZ + f[1])); });
      [[3.91, 0, 1.68, 0.025], [2.95, 0, 1.68, 0.025], [3.43, 0.84, 0.025, 0.96], [3.43, -0.84, 0.025, 0.96]].forEach(function (f) { parts.blue.push(placed(new THREE.BoxGeometry(0.01, f[3], f[2]), fx, f[0], -K.HZ + f[1])); });
      // the rim and its bracket
      parts.rim.push(placed(new THREE.TorusGeometry(0.24, 0.021, 8, 28), s * K.RIMX, K.RIM_H, -K.HZ, Math.PI / 2));
      parts.rim.push(placed(new THREE.BoxGeometry(Math.abs(K.BOARDX - K.RIMX) - 0.22, 0.04, 0.12), s * (K.RIMX + 0.24 + (K.BOARDX - K.RIMX - 0.24) / 2), K.RIM_H, -K.HZ));
      // the net (one mesh per hoop, it swings after a swish)
      var net = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.14, 0.46, 18, 1, true), netMat || (netMat = new THREE.MeshBasicMaterial({ map: ctex(paintNet(), true), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false })));
      net.geometry.translate(0, -0.23, 0); net.position.set(s * K.RIMX, K.RIM_H, -K.HZ); net.userData.side = s; world.add(net); nets.push(net);
    });
    var M = {
      pad: new THREE.MeshLambertMaterial({ color: 0xc11f29 }), white: new THREE.MeshLambertMaterial({ color: 0xeef2fa }), blue: new THREE.MeshLambertMaterial({ color: 0x2f6fd8 }),
      glass: new THREE.MeshBasicMaterial({ color: 0xb9e1ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      rim: new THREE.MeshLambertMaterial({ color: 0xff5a1f, emissive: 0x5a1800 }), red: new THREE.MeshBasicMaterial({ color: 0xff3b30 })
    };
    Object.keys(parts).forEach(function (k) { world.add(new THREE.Mesh(merge(parts[k]), M[k])); });
  }
  var netMat = null;
  // the jumbotron over center court: the arcade picture on its two big faces, the families on the ends, an LED ring under it
  var jumboSide, jumboRing;
  function buildJumbotron() {
    gameTex = flatTex(cv);
    var J = new THREE.Group(); J.position.set(0, 8.4, -K.HZ); world.add(J); arenaOnly.push(J);
    J.add(new THREE.Mesh(new THREE.BoxGeometry(8.8, 5.3, 2.6), new THREE.MeshLambertMaterial({ color: 0x14162a })));
    var scr = new THREE.MeshBasicMaterial({ map: gameTex, toneMapped: false });
    var f = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.6125), scr); f.position.z = 1.31; J.add(f);
    var b = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.6125), scr); b.position.z = -1.31; b.rotation.y = Math.PI; J.add(b);
    jumboSide = new THREE.MeshBasicMaterial({ map: ctex(paintText([['FAM', 0.5, 0.3, { scale: 4, scheme: 'fire' }], ['JAM', 0.5, 0.7, { scale: 4, scheme: 'fire' }]], 128, 128, '#0b0c1c')) });
    [-1, 1].forEach(function (s) { var e = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), jumboSide); e.position.x = s * 4.41; e.rotation.y = s * Math.PI / 2; J.add(e); });
    jumboRing = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.35, 2.8), new THREE.MeshBasicMaterial({ color: 0x22c4f2 })); jumboRing.position.y = -2.85; J.add(jumboRing);
    // cables up into the dark
    var cab = new THREE.MeshBasicMaterial({ color: 0x2a2c40 });
    [[-3.6, -1], [3.6, -1], [-3.6, 1], [3.6, 1]].forEach(function (c) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 16, 5), cab); m.position.set(c[0], 10.6, c[1] * 1.0); J.add(m); });
  }
  // the dark arena round it all: walls, ceiling, a lighting truss with its lamps, and the families' championship banners
  var lampSprites = [];
  function buildArena() {
    var shell = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 30, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x080819, side: THREE.BackSide, fog: false }));
    shell.position.set(0, 15, -K.HZ); world.add(shell); arenaOnly.push(shell);
    var ceil = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshBasicMaterial({ color: 0x06060f, fog: false })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 30, -K.HZ); world.add(ceil); arenaOnly.push(ceil);
    var truss = new THREE.MeshLambertMaterial({ color: 0x2c3360 }), tg = [];
    [2, 12].forEach(function (z) { tg.push(placed(new THREE.BoxGeometry(34, 0.25, 0.25), 0, 17, -z)); tg.push(placed(new THREE.BoxGeometry(34, 0.25, 0.25), 0, 17.8, -z)); });
    [-14, -7, 0, 7, 14].forEach(function (x) { tg.push(placed(new THREE.BoxGeometry(0.2, 0.2, 10), x, 17.4, -K.HZ)); });
    var tm = new THREE.Mesh(merge(tg), truss); world.add(tm); arenaOnly.push(tm);
    var glow = new THREE.SpriteMaterial({ map: ctex(radial([[0, 'rgba(255,252,236,1)'], [0.2, 'rgba(255,244,215,0.7)'], [1, 'rgba(255,236,200,0)']])), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    [2, 12].forEach(function (z) { for (var x = -15; x <= 15; x += 6) { var sp = new THREE.Sprite(glow); sp.position.set(x, 16.6, -z); sp.scale.set(3.2, 3.2, 1); world.add(sp); lampSprites.push(sp); arenaOnly.push(sp); } });
    // banners hung over the far stands
    var BN = [['A', '#ff8a1f', '2024'], ['G', '#3a86ff', '2025'], ['S', '#b45cff', '2026'], ['JG', '#2bb34b', '2027'], ['F', '#ff7b00', '2028'], ['FJ', '#e63946', 'CHAMPS']];
    BN.forEach(function (bn, i) {
      var c = cnv(96, 160), g = c.getContext('2d'); g.fillStyle = bn[1]; g.beginPath(); g.moveTo(0, 0); g.lineTo(96, 0); g.lineTo(96, 136); g.lineTo(48, 160); g.lineTo(0, 136); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(6, 8, 84, 4); g.fillRect(6, 112, 84, 4);
      Fo.draw(g, bn[0], 48, 56, { scale: 5, scheme: 'white' }); Fo.draw(g, bn[2], 48, 92, { scale: 1, scheme: 'white' });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.66), new THREE.MeshBasicMaterial({ map: ctex(c), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      m.position.set((i - (BN.length - 1) / 2) * 5, 11.5, -27.5); world.add(m); arenaOnly.push(m);
    });
  }
  // the screens: the menu screen in front of you (the arcade picture, pointed at with the controllers), the callouts (BANG!!!,
  // BLOCKED BY JAMES!) big over the court, a white flash for the power-up, and a sign for the seat you just moved to
  function buildScreens() {
    panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5625), new THREE.MeshBasicMaterial({ map: gameTex, toneMapped: false }));
    panelFrame = new THREE.Mesh(new THREE.PlaneGeometry(1.03, 0.5925), new THREE.MeshBasicMaterial({ color: 0x22c4f2 })); panelFrame.position.z = -0.004; panel.add(panelFrame);
    scene.add(panel);
    callC = cnv(X.W, X.H); callTex = flatTex(callC);
    callMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5625), new THREE.MeshBasicMaterial({ map: callTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    callMesh.renderOrder = 50; callMesh.visible = false; scene.add(callMesh);
    flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xfff8d6, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    flash.position.z = -0.3; flash.renderOrder = 999; flash.visible = false; camera.add(flash);
    toastMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    toastMesh.renderOrder = 60; toastMesh.visible = false; scene.add(toastMesh);
  }
  var ballMesh, ballShadow;
  function buildBall() {
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 22, 16), new THREE.MeshLambertMaterial({ map: ctex(paintBall()), emissive: 0x3a1400 }));
    ballMesh.visible = false; world.add(ballMesh);
    ballShadow = decalMesh(shadowTex(), 0.36, 0.36); ballShadow.visible = false; world.add(ballShadow);
  }
  var shTex = null;
  function shadowTex() { return shTex || (shTex = ctex(radial([[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]))); }
  function decalMesh(t, w, h, add) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; return m;
  }
  // the tabletop: a table in a dark room with the whole arena on it, the TV up behind it
  function buildTable() {
    tableGroup = new THREE.Group(); scene.add(tableGroup);
    var wood = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    tableGroup.add(new THREE.Mesh(placed(new THREE.BoxGeometry(5.2, 0.06, 3.3), 0, 0.767, -2.1), wood));
    [[-2.5, -0.55], [2.5, -0.55], [-2.5, -3.65], [2.5, -3.65]].forEach(function (l) { tableGroup.add(new THREE.Mesh(placed(new THREE.BoxGeometry(0.1, 0.74, 0.1), l[0], 0.37, l[1]), wood)); });
    var fl = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshLambertMaterial({ color: 0x15131f })); fl.rotation.x = -Math.PI / 2; tableGroup.add(fl);
    var lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex(radial([[0, 'rgba(255,240,210,0.5)'], [1, 'rgba(255,240,210,0)']])), blending: THREE.AdditiveBlending, depthWrite: false })); lamp.position.set(0, 2.8, -2.2); lamp.scale.set(4, 4, 1); tableGroup.add(lamp);
    tableGroup.traverse(function (o) { o.renderOrder = -20; });
    tableGroup.visible = false;
  }

  /* ---------- 5. seats ---------- */
  var seatY = rowH(SEAT_ROW), seatZ = 3.55 + SEAT_ROW * RD + RD / 2;
  var VIEWS = {
    high: { label: 'UPPER DECK', rig: [0, seatY, seatZ], eye: 1.2, pitch: -0.22, panel: [0, seatY + 1.3, seatZ - 2.3, 2.5], call: [0, seatY + 0.8, seatZ - 6.5, 5.0] },
    court: { label: 'COURTSIDE', rig: [0, 0, 2.7], eye: 1.2, pitch: 0.02, panel: [0, 1.4, 0.45, 2.4], call: [0, 1.15, -2.8, 4.4] },
    table: { label: 'TABLETOP', rig: [0, 0, 0], eye: 1.3, pitch: -0.26, panel: [0, 2.2, -4.4, 3.0], call: [0, 1.6, -1.3, 1.8], scale: 1 / 11, at: [0, 0.8, -2.05] }
  };
  var ORDER = ['high', 'court', 'table'];
  function setView(name, quiet) {
    var v = VIEWS[name] || VIEWS.high; V.view = VIEWS[name] ? name : 'high';
    rig.position.fromArray(v.rig);
    if (v.scale) { world.scale.setScalar(v.scale); world.position.set(v.at[0], v.at[1], v.at[2] + K.HZ * v.scale); }   // (court center on the table)
    else { world.scale.setScalar(1); world.position.set(0, 0, 0); }
    arenaOnly.forEach(function (o) { o.visible = !v.scale; }); nearOnly.forEach(function (o) { o.visible = !v.scale; }); tableGroup.visible = !!v.scale; scene.fog.near = v.scale ? 30 : 48;
    var floorY = world.position.y; clipUp.constant = -floorY; clipDown.constant = floorY;
    place(panel, v.panel, v); place(callMesh, v.call, v); place(toastMesh, [v.panel[0], v.rig[1] + v.eye + 0.4, v.panel[2] + 0.05, 1], v);
    if (!R.xr.isPresenting) { camera.position.set(0, v.eye, 0); look.yaw = 0; look.pitch = v.pitch; }
    if (!quiet) toast(v.label);
  }
  function place(m, a, v) {
    var eye = new THREE.Vector3(v.rig[0], v.rig[1] + v.eye, v.rig[2]); m.position.set(a[0], a[1], a[2]); m.scale.setScalar(a[3]); m.lookAt(eye);
  }
  function cycleView() { setView(ORDER[(ORDER.indexOf(V.view) + 1) % ORDER.length]); }
  function toast(text) {
    var c = paintText([[text, 0.5, 0.5, { scale: 3, scheme: 'yellow' }]], 320, 80, 'rgba(5,5,20,0.85)'); var old = toastMesh.material.map;
    toastMesh.material.map = flatTex(c); toastMesh.material.needsUpdate = true; if (old) old.dispose(); toastT = 1.8;
  }

  /* ---------- 6. the players: the game's own sprite drawing, onto a stand-up card per player ---------- */
  var BW = 5.4, BH = 4.2, BF = 0.7, BPPM = 72, BCX = BW / 2 * BPPM, BCY = (BH - BF) * BPPM, cards = {};
  function cardFor(p) {
    var b = cards[p.id]; if (b) return b;
    var c = cnv(BW * BPPM, BH * BPPM), g = c.getContext('2d');
    g.ellipse = function () { };   // (the floor shadow and rings gfx.js draws round his feet: the 3D floor has its own)
    var t = flatTex(c), geo = new THREE.PlaneGeometry(BW, BH); geo.translate(0, BH / 2 - BF, 0);
    var mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, clippingPlanes: [clipUp], toneMapped: false });
    var rmat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.16, depthWrite: false, alphaTest: 0.04, side: THREE.DoubleSide, clippingPlanes: [clipDown], toneMapped: false });
    var mesh = new THREE.Mesh(geo, mat), refl = new THREE.Mesh(geo, rmat); refl.renderOrder = 1;
    var sh = decalMesh(shadowTex(), 1.2, 0.9), ring = decalMesh(ringTex || (ringTex = ctex(paintRing('#2fd85a'))), 1.6, 1.6), glow = decalMesh(glowTex || (glowTex = ctex(radial([[0, 'rgba(255,190,40,0.9)'], [1, 'rgba(255,120,20,0)']]))), 2.4, 2.4, true);
    var oc = cnv(192, 96), over = new THREE.Sprite(new THREE.SpriteMaterial({ map: flatTex(oc), depthTest: false, depthWrite: false, toneMapped: false })); over.renderOrder = 40; over.scale.set(1.5, 0.75, 1);
    [mesh, refl, sh, ring, glow, over].forEach(function (o) { world.add(o); });
    b = cards[p.id] = { c: c, g: g, tex: t, mesh: mesh, refl: refl, sh: sh, ring: ring, glow: glow, over: over, oc: oc, og: oc.getContext('2d'), key: '', at: -9, okey: '' };
    return b;
  }
  var ringTex = null, glowTex = null;
  function drawCard(b, p, t) {
    var key = [p.anim, p.dir, Math.floor(p.frame) || 0, p.face, p.ssj ? 1 : 0, p.dunkFace ? 1 : 0, p.tongue ? 1 : 0].join('|');
    var live = p.ssj || p.flash > 0 || (p.trail && p.trail.length) || p.jamArm || p.hitT > 0 || (G.show && G.show.p === p) || t - b.at > 0.4;
    if (key === b.key && !live) return;
    b.key = key; b.at = t;
    var g = b.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, b.c.width, b.c.height);
    // gfx.js draws him through X.proj: for a moment it maps court meters to this card, his feet at the card's anchor
    var proj = X.proj, s0 = p.screen, s1 = p.headTop, s2 = p.handScr, px = p.x, py = p.y || 0;
    X.proj = function (x, y) { return { x: BCX + (x - px) * BPPM, y: BCY - (y - py) * BPPM, s: BPPM }; };
    try { X.drawPlayer(g, p); } catch (e) { } finally { X.proj = proj; p.screen = s0; p.headTop = s1; p.handScr = s2; }
    b.tex.needsUpdate = true;
  }
  // over your player: YOU and, while you shoot, the shot meter (the same bar the arcade HUD draws); over a man down, his countdown
  function drawOver(b, p) {
    var g = b.og, w = b.oc.width, h = b.oc.height, shooting = p.me && p.hasBall && !p.released && (p.state === 'shoot' || p.state === 'stepback' || p.state === 'cartwheel');
    var gst = HW.Net && HW.Net.mode === 'guest', sht = !shooting ? null : gst ? (p.pressAt != null ? (performance.now() - p.pressAt) / 1000 : null) : p.relPress == null ? p.sht : null;
    var hurt = p.hurtT > 0 ? Math.ceil(p.hurtT) : 0, bob = Math.floor(G.t * 4) % 2, lbl = p.me ? 'YOU' : p.human && p.lbl ? p.lbl : '';
    var key = lbl + '|' + bob + '|' + hurt + '|' + (sht != null ? Math.round(sht * 60) : '');
    if (key === b.okey) return; b.okey = key;
    g.clearRect(0, 0, w, h);
    if (lbl) {
      var col = p.me ? '#2fd85a' : '#ffffff', y = 52 + bob * 3;
      Fo.draw(g, lbl, w / 2, y, { scale: 3, color: col, outline: 2, shadow: 2 });
      g.fillStyle = '#000'; g.beginPath(); g.moveTo(w / 2 - 12, y + 16); g.lineTo(w / 2 + 12, y + 16); g.lineTo(w / 2, y + 30); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.moveTo(w / 2 - 8, y + 17); g.lineTo(w / 2 + 8, y + 17); g.lineTo(w / 2, y + 26); g.closePath(); g.fill();
    }
    if (sht != null) {
      var mw = 132, mx = (w - mw) / 2, yy = 14, prog = Math.min(1.6, sht / (p.tApex || G.shotApex(p))) / 1.6, win = G.shotWin(p), k = G.relFrac(p);
      var zone = function (wd, c) { var a = Math.max(0, (k - wd) / 1.6), z = Math.min(1, (k + wd) / 1.6); g.fillStyle = c; g.fillRect(Math.round(mx + mw * a), yy, Math.max(4, Math.round(mw * (z - a))), 14); };
      g.fillStyle = '#000'; g.fillRect(mx - 3, yy - 3, mw + 6, 20); g.fillStyle = '#3a1010'; g.fillRect(mx, yy, mw, 14);
      zone(win * 2.5, '#8a6a12'); zone(win, '#35e07c');
      var kx = Math.round(mx + mw * prog); g.fillStyle = '#000'; g.fillRect(kx - 5, yy - 7, 10, 28); g.fillStyle = '#fff'; g.fillRect(kx - 3, yy - 5, 6, 24);
    }
    if (hurt) {
      var cx = w / 2 - 14, cy = 48, r = 22; g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(cx, cy, r + 4, 0, 6.283); g.fill(); g.fillStyle = '#e8141e'; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - r * 0.55, cy - r * 0.18, r * 1.1, r * 0.36); g.fillRect(cx - r * 0.18, cy - r * 0.55, r * 0.36, r * 1.1);
      Fo.draw(g, String(hurt), cx + r + 8, cy, { scale: 3, scheme: 'white', align: 'left', outline: 1, shadow: 1 });
    }
    b.over.material.map.needsUpdate = true;
  }
  function roster() {
    if (G.phase === 'menu' || !G.players || !G.players.length) return [];
    var ps = G.players, cm = G.show && G.showCameo ? G.showCameo() : null;   // (Gator's twerk: Lisa walks on)
    if (cm) ps = ps.filter(function (q) { return q.id !== cm.id; }).concat([cm]);
    return ps;
  }
  var camL = new THREE.Vector3();
  function updatePlayers(t) {
    camera.getWorldPosition(camL); world.worldToLocal(camL);
    var used = {};
    roster().forEach(function (p) {
      var b = cardFor(p); used[p.id] = 1; drawCard(b, p, t);
      var py = p.y || 0, x = p.x, z = -p.z, ry = Math.atan2(camL.x - x, camL.z - z);
      b.mesh.position.set(x, py, z); b.mesh.rotation.y = ry; b.mesh.visible = true;
      b.refl.position.set(x, -py, z); b.refl.rotation.y = ry; b.refl.scale.y = -0.85; b.refl.visible = V.view !== 'table'; b.refl.material.opacity = Math.max(0, 0.18 - py * 0.05);
      var sr = 1 - Math.min(0.5, py * 0.12); b.sh.position.set(x, 0.012, z); b.sh.scale.set(sr, sr, 1); b.sh.material.opacity = Math.max(0.15, 0.55 - py * 0.1); b.sh.visible = true;
      var pu = 0.5 + 0.5 * Math.sin(t * 6); b.ring.visible = !!p.me; b.ring.position.set(x, 0.016, z); b.ring.material.opacity = 0.7 + 0.3 * pu; b.ring.scale.setScalar(1 + 0.06 * pu);
      b.glow.visible = !!(p.ssj || p.onFire); b.glow.position.set(x, 0.02, z); b.glow.material.opacity = p.ssj ? 0.55 + 0.15 * Math.sin(t * 17) : 0.4;
      drawOver(b, p); b.over.visible = !!(p.me || (p.human && p.lbl) || p.hurtT > 0 || (p.me && p.sht != null)); b.over.position.set(x, py + 3.15, z);
    });
    Object.keys(cards).forEach(function (id) { if (!used[id]) { var b = cards[id]; b.mesh.visible = b.refl.visible = b.sh.visible = b.ring.visible = b.glow.visible = b.over.visible = false; } });
  }
  // the ball: a real one, where the game has it; in a player's hands it sits on his card in front of him (or behind, round his back)
  // the way the arcade picture layers it, whichever way you look at him
  function updateBall(dt) {
    var B = G.ball, show = !!(B && B.visible && !B.baked && G.phase !== 'menu' && G.players.length);
    ballMesh.visible = ballShadow.visible = show; if (!show) return;
    var bx = B.x, by = B.y, bz = -B.z, h = B.holder, hc = h && cards[h.id];
    if (hc && hc.mesh.visible) {
      var ry = hc.mesh.rotation.y, lx = B.x - h.x, sz = B.z - 0.01 - (B.inFront ? 0.6 : 0) + (B.behind ? 0.4 : 0), d = sz < h.z ? (B.inFront ? 0.34 : 0.17) : -0.2;
      bx = h.x + Math.cos(ry) * lx + Math.sin(ry) * d; bz = -h.z - Math.sin(ry) * lx + Math.cos(ry) * d;
    }
    ballMesh.position.set(bx, by, bz);
    ballMesh.rotation.z -= (B.vx || 0) * dt / 0.14; ballMesh.rotation.x -= (B.vz || 0) * dt / 0.14;
    if (B.rollSpin) ballMesh.rotation.z -= B.rollSpin * 30 * dt;
    ballShadow.position.set(B.x, 0.011, -B.z); ballShadow.material.opacity = Math.max(0.15, 0.6 - B.y * 0.1);
  }

  /* ---------- 7. effects: the game's sparks, flames, blood, craters and impact stars, in 3D too ---------- */
  var PMAX = 900, parts = [], ptsN, ptsA, decals = [], sprites = [], fxTex = {};
  function pointsMat(add) {
    return new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec4 col; uniform float uScale; varying vec4 vC; void main() { vC = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, size * uScale * projectionMatrix[1][1] / -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - smoothstep(0.32, 0.5, d))); }'
    });
  }
  function pointsObj(add) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('col', new THREE.BufferAttribute(new Float32Array(PMAX * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(PMAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0); var o = new THREE.Points(geo, pointsMat(add)); o.frustumCulled = false; o.renderOrder = 30; world.add(o); return o;
  }
  function buildFx() {
    ptsN = pointsObj(false); ptsA = pointsObj(true);
    fxTex.star = ctex(paintStar()); fxTex.ring = ctex(paintRing('#ffffff')); fxTex.gold = ctex(paintRing('#ffd23f')); fxTex.pool = ctex(paintPool()); fxTex.crater = ctex(paintCrater()); fxTex.rays = ctex(paintRays());
  }
  var FLAME = ['#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a10', '#c82808'];
  function addPart(q) { if (parts.length >= PMAX * 2 - 1) parts.shift(); parts.push(q); }
  function fxOn() { return !!scene && UI.screen !== 'results'; }
  function wrap(name, after) {
    var f = X[name]; if (typeof f !== 'function') return;
    X[name] = function () { var r = f.apply(X, arguments); try { if (fxOn()) after.apply(null, arguments); } catch (e) { console.error(e); } return r; };
  }
  function wrapFx() {
    wrap('burst', function (x, y, z, n, cols, sp, life, grav) {
      for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = sp * (0.3 + Math.random()); addPart({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: Math.random() * sp + 1, vz: Math.sin(a) * s * 0.7, c: cols[(Math.random() * cols.length) | 0], life: life * (0.5 + Math.random() * 0.5), g: grav === undefined ? 9 : grav, sz: 0.06 + Math.random() * 0.06, add: false }); }
    });
    wrap('flame', function (x, y, z, n, spread) {
      for (var i = 0; i < n; i++) { var w = spread || 0.1, l = 0.25 + Math.random() * 0.2; addPart({ x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * w, z: z + (Math.random() - 0.5) * w * 0.5, vx: (Math.random() - 0.5) * 0.5, vy: 0.9 + Math.random() * 1.1, vz: 0, life: l, max: l, g: -1.5, sz: 0.06 + Math.random() * 0.05, flame: true, add: true }); }
    });
    wrap('goldSpark', function (p) {
      var l = 0.5 + Math.random() * 0.5;
      addPart({ x: p.x + (Math.random() - 0.5) * 0.9, y: Math.random() * 1.6, z: p.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.4, vy: 1.5 + Math.random() * 2.5, vz: 0, c: ['#fff6c0', '#ffe14d', '#ffc21a'][(Math.random() * 3) | 0], life: l, g: -0.5, sz: 0.04 + Math.random() * 0.04, add: true });
    });
    wrap('blood', function (x, z, amt) {
      for (var i = 0; i < 16 * amt; i++) { var a = Math.random() * 6.283, s = 0.6 + Math.random() * 1.8; addPart({ x: x, y: 0.35, z: z - 0.2, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * s * 0.6, c: ['#8f0b0b', '#b31212', '#6e0707'][i % 3], life: 0.5 + Math.random() * 0.4, g: 9, sz: 0.05 + Math.random() * 0.035, add: false }); }
      addDecal('pool', x, z - 0.35, 0, 0.32 + 0.12 * amt, 14, { grow: 1.1, sx: 1.2 + Math.random() * 0.4 });
    });
    wrap('crater', function (x, z, r) { addDecal('crater', x, z, r, r, 12, {}); });
    wrap('ring', function (x, y, z, size) { addSprite('star', x, y, z, size, 0.34); addSprite('ring', x, y, z, size, 0.34); buzz(0.6, 50); });
    wrap('powerFlash', function (p) {
      addDecal('gold', p.x, p.z, 3.2, 3.2, 0.55, { ring: true }); addSprite('star', p.x, 1.1, p.z - 0.2, 1.6, 0.35); addSprite('rays', p.x, 1.05, p.z, 1, 0.7);
      buzz(1, 160);
    });
    wrap('clearBlood', function () { clearDecals(); });
    wrap('clearFx', function () { clearDecals(); parts = []; });
    // the paint under the hoops in the two families' colors, and the floor letters once the arcade font is in
    wrap('teamColors', function (cs) { if (FC && FC[0] === cs[0] && FC[1] === cs[1]) return; FC = cs.slice(); repaint(); });
    wrap('rebuild', function () { repaint(); });
  }
  function repaint() { if (!floorC) return; paintFloor(floorC); floorTex.needsUpdate = true; }
  function addDecal(kind, x, z, r0, r1, life, o) {
    var t = kind === 'gold' ? fxTex.gold : fxTex[kind], m = decalMesh(t, 1, 1); m.position.set(x, 0.013 + decals.length * 0.0005, -z); world.add(m);
    decals.push({ m: m, kind: kind, t: 0, life: life, r0: r0, r1: r1, o: o || {} }); if (decals.length > 14) { var d = decals.shift(); world.remove(d.m); d.m.material.dispose(); }
  }
  function clearDecals() { decals.forEach(function (d) { world.remove(d.m); d.m.material.dispose(); }); decals = []; }
  function addSprite(kind, x, y, z, size, life) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex[kind], transparent: true, depthWrite: false, blending: kind === 'rays' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.set(x, y, -z); s.renderOrder = 35; world.add(s); sprites.push({ s: s, kind: kind, t: 0, life: life, size: size });
  }
  function updateFx(dt) {
    // particles (the same physics as gfx.js)
    var nN = 0, nA = 0, aN = ptsN.geometry.attributes, aA = ptsA.geometry.attributes;
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.y < 0) { q.y = 0; q.vy *= -0.4; }
      var A = q.add ? aA : aN, n = q.add ? nA : nN; if (n >= PMAX) continue;
      var rgb, alpha = 1, size = q.sz * 1.4;
      if (q.flame) { var u = 1 - q.life / q.max; rgb = rgbOf(FLAME[Math.min(4, (u * 5) | 0)]); alpha = Math.max(0, 0.9 - u * 0.8); size = q.sz * (1.1 - u * 0.6) * 2.4; }
      else rgb = rgbOf(q.c);
      A.position.array[n * 3] = q.x; A.position.array[n * 3 + 1] = q.y; A.position.array[n * 3 + 2] = -q.z;
      A.col.array[n * 4] = rgb[0]; A.col.array[n * 4 + 1] = rgb[1]; A.col.array[n * 4 + 2] = rgb[2]; A.col.array[n * 4 + 3] = alpha; A.size.array[n] = size;
      if (q.add) nA++; else nN++;
    }
    [[ptsN, nN], [ptsA, nA]].forEach(function (e) {
      var g = e[0].geometry; g.setDrawRange(0, e[1]); if (e[1]) { g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.size.needsUpdate = true; }
      var vh = R.xr.isPresenting && R.xr.getSession() && R.xr.getSession().renderState.baseLayer ? R.xr.getSession().renderState.baseLayer.framebufferHeight : R.domElement.height;
      e[0].material.uniforms.uScale.value = vh / 2 * world.scale.x;
    });
    // pools spread and fade, craters fade, the power-up's shockwave rolls out
    for (var j = decals.length - 1; j >= 0; j--) {
      var d = decals[j]; d.t += dt; if (d.t > d.life) { world.remove(d.m); d.m.material.dispose(); decals.splice(j, 1); continue; }
      var a = Math.min(1, (d.life - d.t) / (d.o.ring ? d.life : 3)), r = d.o.grow ? d.r1 * Math.min(1, d.t / d.o.grow) : d.o.ring ? d.r1 * (0.45 + 0.75 * d.t / d.life) : d.r1;
      d.m.scale.set(r * 2 * (d.o.sx || 1), r * 2, 1); d.m.material.opacity = (d.kind === 'pool' ? 0.85 : 1) * a;
    }
    for (var k = sprites.length - 1; k >= 0; k--) {
      var S = sprites[k]; S.t += dt; var u2 = S.t / S.life; if (u2 >= 1) { world.remove(S.s); S.s.material.dispose(); sprites.splice(k, 1); continue; }
      var sc = S.kind === 'star' ? S.size * (0.55 + 0.25 * u2) * 2 : S.kind === 'rays' ? (2.5 + 5 * u2) * 2 : S.size * (0.45 + 0.75 * u2) * 2;
      S.s.scale.set(sc, sc, 1); S.s.material.opacity = S.kind === 'star' ? Math.max(0, 1 - u2 / 0.6) : S.kind === 'rays' ? (1 - u2) * 0.5 : 1 - u2;
      if (S.kind === 'rays') S.s.material.rotation = S.t * 0.8;
    }
  }

  /* ---------- 8. every frame ---------- */
  var frameN = 0, lastT = 0, hoopSway = [0, 0];
  function menuUp() { return !!UI.screen || G.phase === 'menu' || !G.players.length; }
  function onFrame(time) {
    var xr = R.xr.isPresenting;
    if (xr) { pollXR(); flush(time); }   // (outside VR the screen's frames run the game, just before this)
    var dt = Math.min(0.05, (time - lastT) / 1000 || 0.016), t = time / 1000; lastT = time;
    var menu = menuUp();
    frameN++; if (!xr || menu || frameN % 2 === 0) gameTex.needsUpdate = true;   // (the arcade picture: the jumbotron and the menu screen)
    panel.visible = menu || V.view === 'table';
    updatePlayers(t); updateBall(dt); updateFx(dt);
    // the nets swing after a swish
    nets.forEach(function (n) {
      var fx = (G.hoopFx || [0, 0])[n.userData.side > 0 ? 1 : 0] || 0; n.scale.set(1 - fx * 0.12, 1 + fx * 0.32, 1 - fx * 0.12); n.rotation.y += fx * dt * 6; n.rotation.z = Math.sin(t * 20) * fx * 0.12;
    });
    // the crowd jumps up on big plays
    var hype = Math.min(1.5, X.hype || 0);
    crowdGroups.forEach(function (m) {
      var u = m.userData, on = hype > 0.25 + u.k * 0.5; if (on !== u.cheer) { u.cheer = on; m.material.map = u.set[on ? 1 : 0]; u.back.material.map = u.set[on ? 3 : 2]; }
      m.position.y = on ? Math.abs(Math.sin(t * (7 + u.k * 3) + u.ph)) * 0.14 * Math.min(1, hype) : 0;
    });
    jumboRing.material.color.setHSL((t * 0.05) % 1, 0.75, 0.55);
    // the callouts big over the court (not over the menus)
    var co = !menu && G.callouts && G.callouts.length;
    if (co) {
      if (callC.width !== X.W || callC.height !== X.H) { callC.width = X.W; callC.height = X.H; }
      var cg = callC.getContext('2d'); cg.clearRect(0, 0, callC.width, callC.height); try { UI.drawCallouts(cg); } catch (e) { } callTex.needsUpdate = true;
    }
    callMesh.visible = !!co;
    var wv = Math.min(1, X.white || 0) * 0.5; flash.visible = wv > 0.01; flash.material.opacity = wv;
    if (toastT > 0) { toastT -= dt; toastMesh.visible = true; toastMesh.material.opacity = Math.min(1, toastT / 0.4); } else toastMesh.visible = false;
    if (xr) updateLasers(menu); else { lasers.forEach(function (l) { l.line.visible = l.dot.visible = false; }); camera.rotation.set(look.pitch, look.yaw, 0); }
    R.render(scene, camera);
  }
  function master(ts) { RAF(master); if (!R.xr.isPresenting) flush(ts); }

  /* ---------- 9. the headset: ENTER VR, the Touch controllers, pointing at the menu screen ---------- */
  var session = null, ctrls = [], lasers = [], activeHand = 'right', prev = {}, shooting = false, ray = new THREE.Raycaster();
  function initXR() {
    var btn = document.getElementById('vrbtn');
    var dark = new THREE.MeshLambertMaterial({ color: 0x24263a }), lite = new THREE.MeshLambertMaterial({ color: 0x22c4f2 });
    for (var i = 0; i < 2; i++) (function (i) {
      var c = R.xr.getController(i), grip = R.xr.getControllerGrip(i); rig.add(c); rig.add(grip);
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.11), dark); body.position.z = 0.01; grip.add(body);
      var ringM = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 18), lite); ringM.position.set(0, 0.02, -0.05); ringM.rotation.x = Math.PI / 3; grip.add(ringM);
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x66e0ff }));
      line.visible = false; c.add(line);
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.renderOrder = 70; dot.visible = false; scene.add(dot);
      var e = { obj: c, src: null, line: line, dot: dot }; ctrls.push(e); lasers.push(e);
      c.addEventListener('connected', function (ev) { e.src = ev.data; });
      c.addEventListener('disconnected', function () { e.src = null; });
    })(i);
    if (!navigator.xr) { btn.textContent = 'NO VR IN THIS BROWSER: PLAYING ON SCREEN'; return; }
    navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
      if (!ok) { btn.textContent = 'NO HEADSET FOUND: PLAYING ON SCREEN'; return; }
      btn.disabled = false; btn.textContent = 'ENTER VR'; btn.onclick = enterVR;
    }).catch(function () { btn.textContent = 'NO VR HERE: PLAYING ON SCREEN'; });
  }
  function enterVR() {
    var btn = document.getElementById('vrbtn');
    if (session) { session.end(); return; }
    try { Au.init(); } catch (e) { }
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (s) {
      session = s; R.xr.setReferenceSpaceType('local-floor');
      s.addEventListener('end', function () { session = null; document.body.classList.remove('invr'); btn.textContent = 'ENTER VR'; releaseAll(); setView(V.view, true); });
      return R.xr.setSession(s).then(function () {
        document.body.classList.add('invr'); btn.textContent = 'EXIT VR'; camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
        try { var bl = s.renderState.baseLayer; if (bl && 'fixedFoveation' in bl) bl.fixedFoveation = 1; } catch (e) { }   // (Quest: sharp in the middle, cheaper at the edges)
        try { if (s.updateTargetFrameRate) s.updateTargetFrameRate(72); } catch (e) { }
        toast(VIEWS[V.view].label);
      });
    }).catch(function (err) { console.error(err); btn.textContent = 'VR DID NOT START: TAP TO TRY AGAIN'; });
  }
  function releaseAll() { In.touchMove.x = In.touchMove.y = 0; In.keys.ShiftRight = false; if (shooting) { In.shootHeld = false; In.shootUp = true; shooting = false; } prev = {}; }
  function pressed(gp, i) { var b = gp && gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.6)); }
  function axis(gp, i) { return gp && gp.axes && gp.axes.length > i ? gp.axes[i] || 0 : 0; }
  function down(k, now) { var was = !!prev[k]; prev[k] = now; return now && !was; }
  function stick(x, y) { var d = Math.hypot(x, y); if (d < 0.18) return [0, 0]; var k = Math.min(1, (d - 0.18) / 0.72) / d; return [x * k, y * k]; }
  // Touch controllers (xr-standard): buttons 0 trigger, 1 grip, 3 stick click, 4 A/X, 5 B/Y; axes 2, 3 the stick
  function pollXR() {
    var s = R.xr.getSession(); if (!s) return;
    var L = null, Rg = null, i;
    for (i = 0; i < s.inputSources.length; i++) { var src = s.inputSources[i]; if (!src.gamepad) continue; if (src.handedness === 'left') L = src.gamepad; else Rg = src.gamepad; }
    applyPads(L, Rg);
  }
  function applyPads(L, Rg) {
    var menu = menuUp(), lm = stick(axis(L, 2), axis(L, 3)), rm = stick(axis(Rg, 2), axis(Rg, 3)), mv = lm[0] || lm[1] ? lm : rm;
    var rt = pressed(Rg, 0), lt = pressed(L, 0), grips = pressed(L, 1) || pressed(Rg, 1);
    var A = pressed(Rg, 4), B = pressed(Rg, 5), Xb = pressed(L, 4), Yb = pressed(L, 5), rs = pressed(Rg, 3);
    if (menu) {
      In.touchMove.x = In.touchMove.y = 0; In.keys.ShiftRight = false;
      if (shooting) { In.shootHeld = false; In.shootUp = true; shooting = false; }
      // the stick flicks through the choices like the arrow keys; the trigger taps where the laser points
      var nx = mv[0] > 0.6 ? 'R' : mv[0] < -0.6 ? 'L' : mv[1] < -0.6 ? 'U' : mv[1] > 0.6 ? 'D' : '';
      if (nx && nx !== prev.nav) In.nav = { R: 'ArrowRight', L: 'ArrowLeft', U: 'ArrowUp', D: 'ArrowDown' }[nx]; prev.nav = nx;
      var tr = down('rt', rt), tl = down('lt', lt);
      if (tr || tl) { if (tl && !tr) activeHand = 'left'; else if (tr) activeHand = 'right'; try { Au.init(); } catch (e) { } var hit = laserHit(activeHand); if (hit) In.tap = hit.px; }
      if (down('A', A)) In.enter = true;
      if (down('B', B)) In.pauseDown = true;
    } else {
      In.touchMove.x = mv[0]; In.touchMove.y = -mv[1];   // (stick forward = up the court, away from you)
      In.keys.ShiftRight = grips || lt;   // (turbo exactly like the keyboard's Shift: TURBO + PASS shoves, TURBO + SHOOT at the rim dunks)
      // A shoots (hold it, let go at the top), B passes or steals, the trigger shoves (or dunks with the ball)
      var was = !!prev.A; prev.A = A; down('lt', lt);
      if (A && !was) { In.shootHeld = true; In.shootDown = true; shooting = true; }
      else if (!A && was && shooting) { In.shootHeld = false; In.shootUp = true; shooting = false; }
      if (down('B', B)) In.passDown = true;
      if (down('rt', rt)) In.actDown = true;
      prev.nav = '';
    }
    if (down('Y', Yb)) In.pauseDown = true;
    var xv = down('X', Xb), rv = down('rs', rs); if (xv || rv) cycleView();
  }
  V.applyPads = function (L, Rg) { applyPads(L, Rg); };   // (for the tests: fake pads)
  function ctrlFor(hand) { for (var i = 0; i < ctrls.length; i++) { var c = ctrls[i]; if (c.src && c.src.handedness === hand) return c; } return ctrls[hand === 'left' ? 0 : 1] || null; }
  // where a laser meets the menu screen, in the arcade picture's pixels
  function hitPanel(origin, dir) {
    if (!panel.visible) return null; ray.set(origin, dir); var h = ray.intersectObject(panel, false)[0]; if (!h || !h.uv) return null;
    return { point: h.point, dist: h.distance, px: { x: h.uv.x * X.W, y: (1 - h.uv.y) * X.H } };
  }
  var tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function laserHit(hand) {
    var c = ctrlFor(hand); if (!c) return null; c.obj.getWorldPosition(tmpO); c.obj.getWorldQuaternion(tmpQ); tmpD.set(0, 0, -1).applyQuaternion(tmpQ);
    return hitPanel(tmpO, tmpD);
  }
  function updateLasers(menu) {
    lasers.forEach(function (l) { l.line.visible = l.dot.visible = false; });
    if (!menu) return;
    var c = ctrlFor(activeHand), h = c && laserHit(activeHand); if (!c) return;
    c.line.visible = true; c.line.scale.z = h ? h.dist / (rig.scale.x || 1) : 3;
    if (h) { c.dot.visible = true; c.dot.position.copy(h.point); }
  }
  function buzz(v, ms) {
    var s = R && R.xr.getSession(); if (!s) return;
    for (var i = 0; i < s.inputSources.length; i++) { var gp = s.inputSources[i].gamepad, ha = gp && gp.hapticActuators && gp.hapticActuators[0]; try { if (ha && ha.pulse) ha.pulse(v, ms); } catch (e) { } }
  }

  /* ---------- 10. on a screen: the keyboard as in the arcade game, the mouse to look round and click the menus ---------- */
  function initScreen() {
    var el = R.domElement, drag = null, mouse = new THREE.Vector2();
    function rayAt(x, y) { mouse.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); return hitPanel(ray.ray.origin, ray.ray.direction); }
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('mousedown', function (e) {
      try { Au.init(); } catch (er) { }
      if (e.button === 2 || e.button === 1) { drag = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch }; return; }
      if (e.button !== 0) return;
      if (menuUp()) { var h = rayAt(e.clientX, e.clientY); if (h) In.tap = h.px; return; }
      if (!UI.overlay()) { In.shootHeld = true; In.shootDown = true; }   // (as a click on the arcade picture: shoot; letting go is ui.js's)
    });
    window.addEventListener('mousemove', function (e) { if (!drag) return; look.yaw = drag.yaw - (e.clientX - drag.x) * 0.005; look.pitch = clamp(drag.pitch - (e.clientY - drag.y) * 0.005, -1.4, 1.4); });
    window.addEventListener('mouseup', function (e) { if (e.button === 2 || e.button === 1) drag = null; });
    var tdrag = null;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); try { Au.init(); } catch (er) { } var t = e.changedTouches[0]; tdrag = { x: t.clientX, y: t.clientY, yaw: look.yaw, pitch: look.pitch, moved: false }; }, { passive: false });
    el.addEventListener('touchmove', function (e) { e.preventDefault(); var t = e.changedTouches[0]; if (!tdrag) return; var dx = t.clientX - tdrag.x, dy = t.clientY - tdrag.y; if (Math.hypot(dx, dy) > 8) tdrag.moved = true; look.yaw = tdrag.yaw - dx * 0.006; look.pitch = clamp(tdrag.pitch - dy * 0.006, -1.4, 1.4); }, { passive: false });
    el.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; if (tdrag && !tdrag.moved && t) { var h = rayAt(t.clientX, t.clientY); if (h) In.tap = h.px; } tdrag = null; });
    window.addEventListener('keydown', function (e) { if (e.code === 'KeyV' && !e.repeat) cycleView(); });
    var help = document.getElementById('vrhide'); if (help) help.onclick = function () { document.body.classList.toggle('nohelp'); help.textContent = document.body.classList.contains('nohelp') ? 'HELP' : 'HIDE HELP'; };
    // voice chat (the game's voice.js): the headset asks about the microphone out here, before VR, so VOICE in the lobby just works
    var mb = document.getElementById('vrmic'), md = navigator.mediaDevices;
    if (mb && md && md.getUserMedia) mb.onclick = function () {
      mb.disabled = true; mb.textContent = 'ASKING...';
      md.getUserMedia({ audio: true }).then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); mb.textContent = 'MIC ALLOWED'; }, function () { mb.disabled = false; mb.textContent = 'MIC NOT ALLOWED - TRY AGAIN'; });
    };
    else if (mb) mb.style.display = 'none';
  }
  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (!R.xr.isPresenting) R.setSize(innerWidth, innerHeight); }
  // the arcade picture stays 640 x 360 (16:9, the jumbotron's shape) whatever shape the browser window is
  function fixSize() { if (X.W !== 640) X.setWidth(640); if (cv.width !== X.W || cv.height !== X.H) { cv.width = X.W; cv.height = X.H; } }

  /* ---------- 11. after the game has booted ---------- */
  function afterBoot() {
    cv = document.getElementById('game'); fixSize();
    window.addEventListener('resize', function () { fixSize(); resize(); });
    build3D(); initXR(); initScreen();
    RAF(master);
  }
})();
