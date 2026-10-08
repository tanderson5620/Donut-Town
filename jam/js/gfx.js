/* gfx.js - the arcade view: fixed side camera that slides along the court, scanline floor, crowd, hoops, sprites with big digitized heads */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX = {};
  var W = 640, H = 360;
  // court (meters): x along the length, z into the screen (0 = near sideline), y up
  var K = X.K = { HL: 12.5, CD: 14, RIMX: 11.3, BOARDX: 11.95, HZ: 7, RIM_H: 3.05, R3: 6.6, LANE: 4.8, LANEW: 4.2 };
  // camera: perspective from in front of the near sideline, looking slightly down
  var D = 24, F = 1181, CAMH = 9.5, HY = 345 - CAMH * F / D;
  X.W = W; X.H = H; X.camX = 0; X.shake = 0;
  // wide phones get a wider view instead of black bars (height stays 360)
  X.setWidth = function (w) { W = X.W = Math.round(Math.max(560, Math.min(800, w)) / 2) * 2; };
  X.proj = function (x, y, z) { var d = D + z, s = F / d; return { x: W / 2 + (x - X.camX) * s + X.shakeX, y: HY + (CAMH - y) * s + X.shakeY, s: s }; };
  X.shakeX = 0; X.shakeY = 0;

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  /* ---------- floor: a top-down court picture sampled one scanline at a time ---------- */
  var PPM = 24, FX0 = -24, FZ0 = -3, FWm = 48, FDm = 22, floorTex;
  function buildFloor() {
    var c = floorTex = canvas(FWm * PPM, FDm * PPM), g = c.getContext('2d');
    function px(x) { return (x - FX0) * PPM; } function pz(z) { return (FDm - (z - FZ0)) * PPM; }   // far side at the top of the picture, like the screen
    g.fillStyle = '#26246e'; g.fillRect(0, 0, c.width, c.height);
    // planks along the length
    for (var y = pz(K.CD); y < pz(0); y += 5) {
      for (var x = px(-K.HL), k = 0; x < px(K.HL); k++) {
        var len = 60 + hash(y * 7 + k) * 120, t = hash(y * 3.7 + k * 1.3);
        g.fillStyle = 'rgb(' + Math.round(214 + t * 26) + ',' + Math.round(128 + t * 24) + ',' + Math.round(58 + t * 14) + ')';
        g.fillRect(x, y, Math.min(len, px(K.HL) - x), 5); g.fillStyle = 'rgba(90,40,10,0.25)'; g.fillRect(x, y + 4, len, 1); g.fillRect(x, y, 1, 5);
        x += len;
      }
    }
    var teams = HW.TEAMS;
    // paint: each team's color under the hoop it defends (team 0 attacks +x, so defends -x)
    [[-1, teams[0].color], [1, teams[1].color]].forEach(function (e) {
      var s = e[0], x0 = s * K.HL, x1 = s * (K.HL - K.LANE);
      g.fillStyle = e[1]; g.globalAlpha = 0.85; g.fillRect(Math.min(px(x0), px(x1)), pz(K.HZ + K.LANEW / 2), K.LANE * PPM, K.LANEW * PPM); g.globalAlpha = 1;
    });
    g.strokeStyle = '#fff'; g.lineWidth = 3;
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
    });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 54px "Press Start 2P", monospace';
    g.save(); g.translate(px(0), pz(K.HZ)); g.scale(1, 0.9); g.fillText('JAM', 0, 4); g.restore();
    g.font = '28px "Press Start 2P", monospace'; g.fillStyle = '#ffd23f';
    [-7, 7].forEach(function (x) { g.fillText('HOOPS JAM', px(x), pz(-1.2)); });
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(teams[0].name.toUpperCase(), px(-6), pz(K.CD + 1.2)); g.fillText(teams[1].name.toUpperCase(), px(6), pz(K.CD + 1.2));
  }
  function drawFloor(g) {
    var top = Math.max(0, Math.ceil(X.proj(0, 0, 17).y));
    for (var sy = top; sy < H; sy++) {
      var d = CAMH * F / (sy + 0.5 - HY - X.shakeY), z = d - D, half = (W / 2) * d / F, x0 = X.camX - X.shakeX * d / F - half;
      var tv = (FDm - (z - FZ0)) * PPM; if (tv < 0 || tv >= floorTex.height) continue;
      g.drawImage(floorTex, (x0 - FX0) * PPM, tv, 2 * half * PPM, 1, 0, sy, W, 1);
    }
  }

  /* ---------- crowd backdrop with parallax, bouncing on big plays ---------- */
  var crowdC, CROWD_W = 1400, wallC;
  function buildCrowd() {
    crowdC = canvas(CROWD_W, 230); var g = crowdC.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 230); grd.addColorStop(0, '#05050c'); grd.addColorStop(0.35, '#191433'); grd.addColorStop(1, '#2a2050'); g.fillStyle = grd; g.fillRect(0, 0, CROWD_W, 230);
    for (var i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,240,200,' + (0.25 + hash(i) * 0.3) + ')'; g.beginPath(); g.arc(hash(i * 3) * CROWD_W, 8 + hash(i * 5) * 20, 2 + hash(i * 7) * 2, 0, 6.283); g.fill(); }
    var skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#ffdbac'], hairs = ['#1a1a1a', '#3b2314', '#6b4423', '#c9a227', '#a0522d', '#888'];
    var shirts = ['#e63946', '#ffb703', '#3a86ff', '#06d6a0', '#ffffff', '#8338ec', '#fb5607', '#222', '#2ec4b6', '#ff006e', '#9ad0ff', '#ffd23f'];
    for (var row = 0; row < 7; row++) {
      var y = 40 + row * 25, sc = 0.55 + row * 0.09;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 18 * sc, CROWD_W, 6);
      for (var x = 4 + (row % 2) * 7, k = 0; x < CROWD_W; x += (13 + hash(row * 99 + k) * 5) * sc, k++) {
        var r = function (n) { return hash(row * 1000 + k * 7.1 + n); }, skin = skins[(r(1) * 6) | 0];
        g.fillStyle = shirts[(r(2) * shirts.length) | 0]; g.fillRect(x - 6 * sc, y + 6 * sc, 12 * sc, 16 * sc);
        if (r(3) < 0.3) { g.strokeStyle = skin; g.lineWidth = 2.5 * sc; g.beginPath(); g.moveTo(x - 5 * sc, y + 9 * sc); g.lineTo(x - 9 * sc, y - 6 * sc); g.moveTo(x + 5 * sc, y + 9 * sc); g.lineTo(x + 9 * sc, y - 6 * sc); g.stroke(); }
        g.fillStyle = skin; g.beginPath(); g.arc(x, y + 2 * sc, 5 * sc, 0, 6.283); g.fill();
        g.fillStyle = hairs[(r(4) * 6) | 0]; g.beginPath(); g.arc(x, y + 0.5 * sc, 5.2 * sc, Math.PI, 0); g.fill();
        if (r(5) < 0.04) { g.fillStyle = '#fff'; g.fillRect(x - 9 * sc, y - 16 * sc, 18 * sc, 10 * sc); g.fillStyle = r(6) < 0.5 ? '#e63946' : '#3a86ff'; g.fillRect(x - 7 * sc, y - 13 * sc, 14 * sc, 2 * sc); }
      }
    }
    // courtside wall of ads
    wallC = canvas(1600, 40); var w = wallC.getContext('2d'); w.fillStyle = '#101018'; w.fillRect(0, 0, 1600, 40);
    w.font = '16px "Press Start 2P", monospace'; w.textBaseline = 'middle';
    var ads = [['HOOPS JAM', '#ffd23f'], ['ANDERSONS', '#ff8a1f'], ['2 ON 2', '#ff4fa3'], ['GORMANS', '#3a86ff'], ['TURBO!', '#5cffa0']];
    for (var i2 = 0, x2 = 20; x2 < 1600; i2++) { var a2 = ads[i2 % ads.length]; w.fillStyle = a2[1]; w.fillText(a2[0], x2, 21); x2 += w.measureText(a2[0]).width + 50; }
  }
  X.hype = 0;
  function drawCrowd(g, t) {
    var s = F / (D + 20), off = X.camX * s * 0.9, top = X.proj(0, 1.0, 15.5).y, bob = Math.abs(Math.sin(t * (6 + X.hype * 3))) * (1 + X.hype * 3);
    var ox = ((CROWD_W - W) / 2 + off + X.shakeX) | 0;
    g.drawImage(crowdC, Math.max(0, Math.min(CROWD_W - W, ox)), 0, W, 230, 0, top - 230 + 18 - bob, W, 230);
    g.fillStyle = '#05050c'; if (top - 212 - bob > 0) g.fillRect(0, 0, W, top - 212 - bob + 1);
    // ad wall standing on the far sideline apron
    var a = X.proj(0, 0.8, 15.5), b = X.proj(0, 0, 15.5), ws = F / (D + 15.5), off = ((X.camX * ws) % 800 + 800) % 800;
    g.drawImage(wallC, off, 0, W, 40, 0, a.y, W, b.y - a.y);
  }

  /* ---------- hoops: stanchion, glass board seen at an angle, rim and net ---------- */
  function drawHoopBack(g, side) {
    var bx = side * K.BOARDX, z = K.HZ;
    var base = X.proj(side * 13.6, 0, z), top = X.proj(side * 13.6, 4.15, z), arm = X.proj(bx + side * 0.15, 3.8, z);
    g.fillStyle = '#1e2a6e'; g.fillRect(base.x - 0.6 * base.s, base.y - 0.7 * base.s, 1.2 * base.s, 0.7 * base.s);
    g.strokeStyle = '#4a5068'; g.lineWidth = Math.max(3, 0.2 * base.s); g.beginPath(); g.moveTo(base.x, base.y - 0.6 * base.s); g.lineTo(top.x, top.y); g.lineTo(arm.x, arm.y); g.stroke();
    // board quad, skewed so it reads like the arcade's angled glass
    var q = [[-0.95, 2.85], [0.95, 2.85], [0.95, 4.0], [-0.95, 4.0]].map(function (c) { return X.proj(bx - side * c[0] * 0.55, c[1], z + c[0]); });
    g.fillStyle = 'rgba(190,225,255,0.32)'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); q.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); g.fill(); g.stroke();
    var r = [[-0.3, 3.0], [0.3, 3.0], [0.3, 3.45], [-0.3, 3.45]].map(function (c) { return X.proj(bx - side * c[0] * 0.55, c[1], z + c[0]); });
    g.strokeStyle = '#ff3b30'; g.beginPath(); r.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); g.stroke();
  }
  function rimShape(side) { var c = X.proj(side * K.RIMX, K.RIM_H, K.HZ); return { c: c, rx: 0.32 * c.s, ry: 0.11 * c.s }; }
  function drawRim(g, side, front, swish) {
    var r = rimShape(side), c = r.c, b = X.proj(side * (K.BOARDX - 0.05), K.RIM_H, K.HZ);
    if (!front) { g.strokeStyle = '#d34a10'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(c.x + side * r.rx, c.y); g.stroke(); }
    // net: tapered mesh below the rim
    if (front) {
      var drop = (0.55 + (swish || 0) * 0.15) * c.s, nb = r.rx * 0.6;
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
      for (var i = 0; i <= 8; i++) { var u = i / 8 * 2 - 1; g.beginPath(); g.moveTo(c.x + u * r.rx, c.y + Math.sqrt(1 - u * u) * r.ry * 0.9); g.lineTo(c.x + u * nb + (swish || 0) * 2 * Math.sin(i), c.y + drop); g.stroke(); }
      for (var j = 1; j <= 3; j++) { var k = j / 3, w = r.rx + (nb - r.rx) * k; g.beginPath(); g.ellipse(c.x, c.y + drop * k, w, r.ry * (1 - k * 0.5), 0, 0, Math.PI); g.stroke(); }
    }
    g.strokeStyle = '#ff5a1f'; g.lineWidth = Math.max(2, 0.05 * c.s);
    g.beginPath(); g.ellipse(c.x, c.y, r.rx, r.ry, 0, front ? 0 : Math.PI, front ? Math.PI : 2 * Math.PI); g.stroke();
  }

  /* ---------- sprites ---------- */
  var sheets = {}, faces = {};
  X.loadPlayer = function (id) {
    if (sheets[id]) return sheets[id].ready;
    var s = sheets[id] = { img: new Image(), meta: null };
    s.ready = Promise.all([
      fetch('sprites/' + id + '.json').then(function (r) { return r.json(); }).then(function (m) { s.meta = m; }),
      new Promise(function (res) { s.img.onload = res; s.img.onerror = res; s.img.src = 'sprites/' + id + '.png'; }),
      X.loadFace(id)
    ]);
    return s.ready;
  };
  X.loadFace = function (id) {
    if (faces[id]) return faces[id].ready;
    var f = faces[id] = { front: new Image(), back: new Image() };
    f.ready = Promise.all(['front', 'back'].map(function (k) { return new Promise(function (res) { f[k].onload = res; f[k].onerror = res; f[k].src = 'faces/' + id + '_' + k + '.png'; }); }));
    return f.ready;
  };
  X.face = function (id) { return faces[id]; };

  var HEAD_M = 0.56;   // big digitized head width in meters (arcade proportions)
  X.drawPlayer = function (g, p) {
    var sh = sheets[p.id]; if (!sh || !sh.meta) return;
    var m = sh.meta, A = m.anim[p.anim] || m.anim.idle, list = A[p.dir] || A.R || A[Object.keys(A)[0]];
    var fi = list[Math.min(list.length - 1, Math.floor(p.frame) % list.length)];
    var ground = X.proj(p.x, 0, p.z), k = ground.s / m.ppm, flip = p.face < 0;
    p.screen = ground;
    // shadow
    var sr = 0.55 * ground.s; g.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.35 - p.y * 0.08) + ')'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * (1 - Math.min(0.5, p.y * 0.12)), sr * 0.28, 0, 0, 6.283); g.fill();
    if (p.onFire) { g.fillStyle = 'rgba(255,120,20,0.35)'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * 1.3, sr * 0.38, 0, 0, 6.283); g.fill(); }
    var lift = p.y * ground.s, sx = (fi % m.cols) * m.fw, sy = Math.floor(fi / m.cols) * m.fh, fx = m.feet[0], fy = m.feet[1];
    g.save(); g.translate(ground.x, ground.y - lift); if (flip) g.scale(-1, 1);
    if (p.flash > 0) g.filter = 'brightness(1.8)';
    g.drawImage(sh.img, sx, sy, m.fw, m.fh, -fx * k, -fy * k, m.fw * k, m.fh * k);
    g.filter = 'none';
    // big digitized head on the neck
    var hd = m.head[fi], f = faces[p.id], img = f && (p.dir === 'B' ? f.back : f.front);
    if (img && img.naturalWidth) {
      var hw = HEAD_M * ground.s * (p.bigHead || 1), hh = hw * img.naturalHeight / img.naturalWidth;
      var hx = (hd[0] - fx) * k, hy = (hd[1] - fy) * k;
      g.drawImage(img, hx - hw / 2, hy - hh * 0.8, hw, hh);
    }
    g.restore();
    p.headTop = ground.y - lift + (hd ? (hd[1] - fy) * k : -2 * ground.s) - HEAD_M * ground.s;
    // ball hand (for dribbles and holding), in screen space
    var hand = m.hand[fi]; p.handScr = { x: ground.x + (flip ? -1 : 1) * (hand[0] - fx) * k, y: ground.y - lift + (hand[1] - fy) * k };
  };

  /* ---------- ball and particles ---------- */
  X.drawBall = function (g, b, t) {
    var sh = X.proj(b.x, 0, b.z), p = X.proj(b.x, b.y, b.z), r = Math.max(3, 0.17 * p.s);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(sh.x, sh.y, r * 1.1, r * 0.35, 0, 0, 6.283); g.fill();
    if (b.fire) for (var i = 0; i < 4; i++) { g.fillStyle = ['rgba(255,80,0,0.55)', 'rgba(255,170,0,0.5)'][i % 2]; g.beginPath(); g.arc(p.x - b.vx * 0.012 * i * p.s / 20, p.y - b.vy * 0.012 * i * p.s / 20 + Math.sin(t * 30 + i) * 2, r * (1.5 - i * 0.2), 0, 6.283); g.fill(); }
    var gr = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    gr.addColorStop(0, '#ffb066'); gr.addColorStop(1, '#c4520e'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(40,15,0,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y); g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r); g.stroke();
    b.scr = p;
  };
  var parts = [];
  X.burst = function (x, y, z, n, cols, sp, life, grav) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = sp * (0.3 + Math.random()); parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: Math.random() * sp + 1, vz: Math.sin(a) * s * 0.5, c: cols[(Math.random() * cols.length) | 0], life: life * (0.5 + Math.random() * 0.5), g: grav === undefined ? 9 : grav, sz: 0.06 + Math.random() * 0.06 }); }
  };
  X.drawParts = function (g, dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.y < 0) { q.y = 0; q.vy *= -0.4; }
      var p = X.proj(q.x, q.y, q.z); g.fillStyle = q.c; g.fillRect(p.x, p.y, Math.max(1.5, q.sz * p.s), Math.max(1.5, q.sz * p.s));
    }
  };

  X.init = function () { buildFloor(); buildCrowd(); };
  X.rebuild = function () { buildFloor(); buildCrowd(); };

  // full scene, back to front; `things` are players + ball, each with x,z
  X.drawScene = function (g, t, dt, players, ball, hoopFx) {
    X.shake = Math.max(0, X.shake - dt * 3); X.shakeX = (Math.random() - 0.5) * X.shake * 10; X.shakeY = (Math.random() - 0.5) * X.shake * 8;
    X.hype = Math.max(0, X.hype - dt * 0.7);
    drawCrowd(g, t); drawFloor(g);
    var items = players.map(function (p) { return { z: p.z, draw: function () { X.drawPlayer(g, p); } }; });
    [-1, 1].forEach(function (side) {
      items.push({ z: K.HZ + 0.6, draw: function () { drawHoopBack(g, side); drawRim(g, side, false); } });
      items.push({ z: K.HZ - 0.35, draw: function () { drawRim(g, side, true, hoopFx[side > 0 ? 1 : 0]); } });
    });
    if (ball && ball.visible) items.push({ z: ball.z - 0.01 - (ball.inFront ? 0.6 : 0), draw: function () { X.drawBall(g, ball, t); } });
    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.draw(); });
    X.drawParts(g, dt);
  };
})(window.HW);
