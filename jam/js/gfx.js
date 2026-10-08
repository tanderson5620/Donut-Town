/* gfx.js - the arcade view: fixed side camera that slides along the court, scanline floor, crowd, hoops, sprites with big digitized heads */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX = {};
  var W = 640, H = 360;
  // court (meters): x along the length, z into the screen (0 = near sideline), y up
  var K = X.K = { HL: 12.5, CD: 14, RIMX: 11.3, BOARDX: 11.95, HZ: 7, RIM_H: 3.05, R3: 6.6, LANE: 4.8, LANEW: 4.2 };
  // camera: up close and nearly flat, like a 2D side-view arcade game - players about 40% of the screen tall, the court a shallow band
  // under them, the crowd filling the rest. Tuned by where things land on the 360-high screen: SMID px per meter at mid-court,
  // near sideline at Y0, far sideline at Y14; a long lens (big D) keeps near and far players close in size.
  var D = 40, SMID = 70, Y0 = 364, Y14 = 240;
  var F = SMID * (D + 7), CAMH = (Y0 - Y14) * D * (D + 14) / (F * 14), HY = Y0 - CAMH * F / D;
  X.W = W; X.H = H; X.camX = 0; X.shake = 0; X.SMID = SMID;
  // wide phones get a wider view instead of black bars (height stays 360)
  X.setWidth = function (w) { W = X.W = Math.round(Math.max(560, Math.min(800, w)) / 2) * 2; };
  X.proj = function (x, y, z) { var d = D + z, s = F / d; return { x: W / 2 + (x - X.camX) * s + X.shakeX, y: HY + (CAMH - y) * s + X.shakeY, s: s }; };
  X.shakeX = 0; X.shakeY = 0;
  // the camera slides along the court after the ball and stops with the stanchion at the screen edge
  X.camMax = function () { return Math.max(0, 14.4 - (W / 2) / SMID); };
  X.camClamp = function (x) { var m = X.camMax(); return Math.max(-m, Math.min(m, x)); };
  X.follow = function (tx, dt) { X.camX += (X.camClamp(tx) - X.camX) * (1 - Math.exp(-4 * dt)); };

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  /* ---------- floor: a top-down court picture sampled one scanline at a time ---------- */
  var PPM = 40, FX0 = -24, FZ0 = -3, FWm = 48, FDm = 22, floorTex;
  function buildFloor() {
    var c = floorTex = canvas(FWm * PPM, FDm * PPM), g = c.getContext('2d');
    function px(x) { return (x - FX0) * PPM; } function pz(z) { return (FDm - (z - FZ0)) * PPM; }   // far side at the top of the picture, like the screen
    g.fillStyle = '#2b2378'; g.fillRect(0, 0, c.width, c.height);
    // apron: a darker band under the far wall and a subtle sheen
    g.fillStyle = '#211b5e'; g.fillRect(0, 0, c.width, pz(15.2));
    // maple planks along the length, light orange like the arcade floor
    for (var y = pz(K.CD), row = 0; y < pz(0); y += 6, row++) {
      for (var x = px(-K.HL), k = 0; x < px(K.HL); k++) {
        var len = 90 + hash(row * 7 + k) * 170, t = hash(row * 3.7 + k * 1.3), streak = hash(row * 11.3 + k * 5.1) < 0.12 ? 14 : 0;
        g.fillStyle = 'rgb(' + Math.round(222 + t * 24 + streak) + ',' + Math.round(136 + t * 26 + streak) + ',' + Math.round(62 + t * 16 + streak / 2) + ')';
        g.fillRect(x, y, Math.min(len, px(K.HL) - x), 6); g.fillStyle = 'rgba(110,50,10,0.28)'; g.fillRect(x, y + 5, len, 1); g.fillRect(x, y, 1, 6);
        x += len;
      }
    }
    // soft reflections of the arena lights
    for (var i = -2; i <= 2; i++) { var gr = g.createRadialGradient(px(i * 6), pz(10), 0, px(i * 6), pz(10), 4 * PPM); gr.addColorStop(0, 'rgba(255,240,210,0.16)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = gr; g.fillRect(px(i * 6 - 4), pz(14), 8 * PPM, 8 * PPM); }
    var teams = HW.TEAMS;
    // paint: each team's color under the hoop it defends (team 0 attacks +x, so defends -x)
    [[-1, teams[0].color], [1, teams[1].color]].forEach(function (e) {
      var s = e[0], x0 = s * K.HL, x1 = s * (K.HL - K.LANE);
      g.fillStyle = e[1]; g.globalAlpha = 0.9; g.fillRect(Math.min(px(x0), px(x1)), pz(K.HZ + K.LANEW / 2), K.LANE * PPM, K.LANEW * PPM); g.globalAlpha = 1;
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
      // big letters on the end apron in front of the stanchion, stretched along the baseline so they read from the low camera
      g.save(); g.translate(px(s * 13.5), pz(3.3)); g.rotate(s * Math.PI / 2); g.scale(s * 1.25, s * 1.0);
      g.font = '60px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText('JAM', 3, 5); g.fillStyle = '#ecebff'; g.fillText('JAM', 0, 0); g.restore();
    });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 90px "Press Start 2P", monospace';
    g.save(); g.translate(px(0), pz(K.HZ)); g.scale(1, 0.9); g.fillText('JAM', 0, 6); g.restore();
  }
  function drawFloor(g) {
    var top = Math.max(0, Math.floor(X.proj(0, 0, 15.6).y));
    for (var sy = top; sy < H; sy++) {
      var d = CAMH * F / (sy + 0.5 - HY - X.shakeY), z = d - D, half = (W / 2) * d / F, x0 = X.camX - X.shakeX * d / F - half;
      var tv = (FDm - (z - FZ0)) * PPM; if (tv < 0 || tv >= floorTex.height) continue;
      g.drawImage(floorTex, (x0 - FX0) * PPM, tv, 2 * half * PPM, 1, 0, sy, W, 1);
    }
  }

  /* ---------- crowd: js/crowd.js paints the arena behind the far sideline (fallback: simple fans) ---------- */
  var crowdC, CROWD_W = 1400, wallC;
  function buildCrowd() {
    if (HW.Crowd && HW.Crowd.init) { HW.Crowd.init(); return; }
    crowdC = canvas(CROWD_W, 230); var g = crowdC.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 230); grd.addColorStop(0, '#05050c'); grd.addColorStop(0.35, '#191433'); grd.addColorStop(1, '#2a2050'); g.fillStyle = grd; g.fillRect(0, 0, CROWD_W, 230);
    var skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#ffdbac'], hairs = ['#1a1a1a', '#3b2314', '#6b4423', '#c9a227', '#a0522d', '#888'];
    var shirts = ['#e63946', '#ffb703', '#3a86ff', '#06d6a0', '#ffffff', '#8338ec', '#fb5607', '#222', '#2ec4b6', '#ff006e', '#9ad0ff', '#ffd23f'];
    for (var row = 0; row < 7; row++) {
      var y = 40 + row * 25, sc = 0.55 + row * 0.09;
      for (var x = 4 + (row % 2) * 7, k = 0; x < CROWD_W; x += (13 + hash(row * 99 + k) * 5) * sc, k++) {
        var r = function (n) { return hash(row * 1000 + k * 7.1 + n); }, skin = skins[(r(1) * 6) | 0];
        g.fillStyle = shirts[(r(2) * shirts.length) | 0]; g.fillRect(x - 6 * sc, y + 6 * sc, 12 * sc, 16 * sc);
        g.fillStyle = skin; g.beginPath(); g.arc(x, y + 2 * sc, 5 * sc, 0, 6.283); g.fill();
        g.fillStyle = hairs[(r(4) * 6) | 0]; g.beginPath(); g.arc(x, y + 0.5 * sc, 5.2 * sc, Math.PI, 0); g.fill();
      }
    }
    wallC = canvas(1600, 40); var w = wallC.getContext('2d'); w.fillStyle = '#101018'; w.fillRect(0, 0, 1600, 40);
    w.font = '16px "Press Start 2P", monospace'; w.textBaseline = 'middle';
    var ads = [['HOOPS JAM', '#ffd23f'], ['ANDERSONS', '#ff8a1f'], ['2 ON 2', '#ff4fa3'], ['GORMANS', '#3a86ff'], ['TURBO!', '#5cffa0']];
    for (var i2 = 0, x2 = 20; x2 < 1600; i2++) { var a2 = ads[i2 % ads.length]; w.fillStyle = a2[1]; w.fillText(a2[0], x2, 21); x2 += w.measureText(a2[0]).width + 50; }
  }
  X.hype = 0;
  // what the crowd module gets each frame: screen size, camera, the far wall's screen rows and its scale, hype for cheering
  X.crowdView = function (t) {
    var a = X.proj(0, 0.9, 15.5), b = X.proj(0, 0, 15.5);
    return { W: W, H: H, t: t, camX: X.camX, hype: X.hype, shakeX: X.shakeX, shakeY: X.shakeY, wallTop: a.y, wallBottom: b.y, s: b.s, proj: X.proj };
  };
  function drawCrowd(g, t) {
    if (HW.Crowd && HW.Crowd.draw) { HW.Crowd.draw(g, X.crowdView(t)); return; }
    var v = X.crowdView(t), bob = Math.abs(Math.sin(t * (6 + X.hype * 3))) * (1 + X.hype * 3), ox = ((CROWD_W - W) / 2 + X.camX * v.s * 0.9 + X.shakeX) | 0;
    g.drawImage(crowdC, Math.max(0, Math.min(CROWD_W - W, ox)), 0, W, 230, 0, v.wallTop - 230 + 18 - bob, W, 230);
    g.fillStyle = '#05050c'; if (v.wallTop - 212 - bob > 0) g.fillRect(0, 0, W, v.wallTop - 212 - bob + 1);
    var off = ((X.camX * v.s) % 800 + 800) % 800; g.drawImage(wallC, off, 0, W, 40, 0, v.wallTop, W, v.wallBottom - v.wallTop);
  }

  /* ---------- hoops: padded stanchion, steel support, angled glass board, rim and net ---------- */
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function tube(g, a, b, w, dark, light) {
    g.lineCap = 'round'; g.strokeStyle = '#0c1030'; g.lineWidth = w + 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = dark; g.lineWidth = w; g.stroke(); g.strokeStyle = light; g.lineWidth = Math.max(1, w * 0.4);
    g.beginPath(); g.moveTo(a.x - w * 0.18, a.y - w * 0.18); g.lineTo(b.x - w * 0.18, b.y - w * 0.18); g.stroke(); g.lineCap = 'butt';
  }
  // the board is drawn skewed (near edge toward the baseline) so it reads like the arcade's big angled glass
  function boardPt(side, c, y) { return X.proj(side * (K.BOARDX - c * 0.62), y, K.HZ + c); }
  function drawHoopBack(g, side) {
    var P = function (x, y, z) { return X.proj(side * x, y, z); }, z0 = K.HZ - 0.75, z1 = K.HZ + 0.75, xi = 13.2, xo = 15.4, bh = 1.2;
    // padded base: top, court-facing side and front, red with a white stripe
    poly(g, [P(xi, bh, z0), P(xo, bh, z0), P(xo, bh, z1), P(xi, bh, z1)], '#e2474f');
    poly(g, [P(xi, 0, z0), P(xi, bh, z0), P(xi, bh, z1), P(xi, 0, z1)], '#7e1219');
    poly(g, [P(xi, 0, z0), P(xo, 0, z0), P(xo, bh, z0), P(xi, bh, z0)], '#c11f29', '#4a070c', 1);
    poly(g, [P(xi, bh * 0.62, z0), P(xo, bh * 0.62, z0), P(xo, bh * 0.74, z0), P(xi, bh * 0.74, z0)], '#f4f4f8');
    // steel: a post out of the base, the main arm and a brace to the back of the board, in white and arcade blue
    var w = Math.max(4, 0.2 * X.proj(side * 14, 0, K.HZ).s), top = P(14.3, 4.35, K.HZ), back = P(K.BOARDX + 0.12, 3.62, K.HZ), backLo = P(K.BOARDX + 0.12, 3.12, K.HZ);
    tube(g, P(14.3, bh, K.HZ), top, w, '#2f6fd8', '#bfe2ff');
    tube(g, top, back, w * 0.9, '#e8eef8', '#ffffff');
    tube(g, P(14.3, 2.1, K.HZ), backLo, w * 0.6, '#2f6fd8', '#9fd0ff');
    // glass board
    var q = [boardPt(side, -0.92, 2.88), boardPt(side, 0.92, 2.88), boardPt(side, 0.92, 3.98), boardPt(side, -0.92, 3.98)];
    poly(g, q, 'rgba(185,225,255,0.30)', '#ffffff', 3);
    poly(g, [boardPt(side, -0.84, 2.95), boardPt(side, 0.84, 2.95), boardPt(side, 0.84, 3.91), boardPt(side, -0.84, 3.91)], null, '#3a86ff', 1.5);
    // glare streak
    g.save(); g.globalAlpha = 0.35; poly(g, [boardPt(side, -0.6, 3.9), boardPt(side, -0.35, 3.9), boardPt(side, -0.75, 2.95), boardPt(side, -0.92, 2.95)], '#ffffff'); g.restore();
    poly(g, [boardPt(side, -0.3, 3.05), boardPt(side, 0.3, 3.05), boardPt(side, 0.3, 3.5), boardPt(side, -0.3, 3.5)], null, '#ff3b30', 2.5);
    poly(g, [boardPt(side, -0.92, 2.88), boardPt(side, 0.92, 2.88), boardPt(side, 0.92, 2.94), boardPt(side, -0.92, 2.94)], '#d9e2f2');
  }
  function rimShape(side) { var c = X.proj(side * K.RIMX, K.RIM_H, K.HZ); return { c: c, rx: 0.3 * c.s, ry: 0.1 * c.s }; }
  function drawRim(g, side, front, swish) {
    var r = rimShape(side), c = r.c, b = X.proj(side * (K.BOARDX - 0.05), K.RIM_H, K.HZ), lw = Math.max(2, 0.06 * c.s);
    if (!front) {
      // bracket to the board, back half of the rim, back strands of the net
      g.fillStyle = '#b8400c'; g.fillRect(Math.min(b.x, c.x + side * r.rx), c.y - lw * 0.8, Math.abs(b.x - (c.x + side * r.rx)), lw * 1.6);
      g.strokeStyle = '#9c3208'; g.lineWidth = lw; g.beginPath(); g.ellipse(c.x, c.y, r.rx, r.ry, 0, Math.PI, 2 * Math.PI); g.stroke();
      return;
    }
    // net: diamond mesh tapering below the rim, swinging after a swish
    var drop = (0.5 + (swish || 0) * 0.14) * c.s, nb = r.rx * 0.55, n = 10, rows = 4, sw = (swish || 0) * 0.08 * c.s;
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = Math.max(1, c.s * 0.016);
    function np(u, k) { var w = r.rx + (nb - r.rx) * k, a = u * Math.PI; return { x: c.x + Math.cos(a) * w + Math.sin(k * 3 + u * 6) * sw * k, y: c.y + Math.sin(a) * r.ry * (1 - k * 0.4) + drop * k }; }
    for (var i = 0; i <= n; i++) {
      g.beginPath();
      for (var j = 0; j <= rows; j++) { var u = (i + (j % 2) * 0.5) / n, p = np(u, j / rows); if (j) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.stroke();
      g.beginPath();
      for (var j2 = 0; j2 <= rows; j2++) { var u2 = (i - (j2 % 2) * 0.5) / n, p2 = np(u2, j2 / rows); if (j2) g.lineTo(p2.x, p2.y); else g.moveTo(p2.x, p2.y); }
      g.stroke();
    }
    g.strokeStyle = '#ff5a1f'; g.lineWidth = lw; g.beginPath(); g.ellipse(c.x, c.y, r.rx, r.ry, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = '#ffb27a'; g.lineWidth = Math.max(1, lw * 0.35); g.beginPath(); g.ellipse(c.x, c.y - lw * 0.2, r.rx, r.ry, 0, 0.3, Math.PI - 0.3); g.stroke();
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
    // players with a real photo get their cut-out face (faces/<id>_photo.png) up front; the back of the head is always rendered
    var photo = HW.PLAYERS[id] && HW.PLAYERS[id].photo;
    f.ready = Promise.all(['front', 'back'].map(function (k) { return new Promise(function (res) { f[k].onload = res; f[k].onerror = res; f[k].src = 'faces/' + id + '_' + (k === 'front' && photo ? 'photo' : k) + '.png'; }); }));
    return f.ready;
  };
  X.face = function (id) { return faces[id]; };

  var HEAD_M = 0.56;   // big digitized head width in meters (arcade proportions)
  function frameOf(p) {
    var sh = sheets[p.id]; if (!sh || !sh.meta) return null;
    var m = sh.meta, A = m.anim[p.anim] || m.anim.idle, list = A[p.dir] || A.R || A[Object.keys(A)[0]];
    var fi = list[Math.min(list.length - 1, Math.floor(p.frame) % list.length)], ground = X.proj(p.x, 0, p.z);
    return { sh: sh, m: m, fi: fi, ground: ground, k: ground.s / m.ppm, flip: p.face < 0, lift: p.y * ground.s, sx: (fi % m.cols) * m.fw, sy: Math.floor(fi / m.cols) * m.fh };
  }
  function drawBody(g, p, o, alpha) {
    var m = o.m, k = o.k, fx = m.feet[0], fy = m.feet[1];
    g.drawImage(o.sh.img, o.sx, o.sy, m.fw, m.fh, -fx * k, -fy * k, m.fw * k, m.fh * k);
    var hd = m.head[o.fi], f = faces[p.id], img = f && (p.dir === 'B' ? f.back : f.front);
    if (img && img.naturalWidth && hd) {
      // photo cut-outs with lots of hair around the face (headScale) are drawn wider so every face comes out the same size
      var hs = img === f.front && p.def && p.def.headScale || 1, hw = HEAD_M * o.ground.s * (p.bigHead || 1) * hs, hh = hw * img.naturalHeight / img.naturalWidth;
      g.drawImage(img, (hd[0] - fx) * k - hw / 2, (hd[1] - fy) * k - hh * 0.8, hw, hh);
    }
  }
  // the polished floor mirrors the players faintly, like the arcade's glossy hardwood
  X.drawReflection = function (g, p) {
    var o = frameOf(p); if (!o) return;
    g.save(); g.globalAlpha = Math.max(0, 0.2 - p.y * 0.05); g.translate(o.ground.x, o.ground.y + o.lift); g.scale(o.flip ? -1 : 1, -0.85);
    drawBody(g, p, o); g.restore();
  };
  X.drawPlayer = function (g, p) {
    var o = frameOf(p); if (!o) return;
    var m = o.m, k = o.k, ground = o.ground, lift = o.lift, fx = m.feet[0], fy = m.feet[1];
    p.screen = ground;
    // shadow
    var sr = 0.55 * ground.s; g.fillStyle = 'rgba(0,0,0,' + Math.max(0.12, 0.38 - p.y * 0.08) + ')'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * (1 - Math.min(0.5, p.y * 0.12)), sr * 0.26, 0, 0, 6.283); g.fill();
    if (p.onFire) { g.fillStyle = 'rgba(255,120,20,0.35)'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * 1.3, sr * 0.36, 0, 0, 6.283); g.fill(); }
    g.save(); g.translate(ground.x, ground.y - lift); if (o.flip) g.scale(-1, 1);
    drawBody(g, p, o);
    // hit flash: the same frame again, added on top (no canvas filters - slow on phones, missing on older Safari)
    if (p.flash > 0 && Math.floor(p.flash * 16) % 2) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; drawBody(g, p, o); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    g.restore();
    var hd = m.head[o.fi];
    p.headTop = ground.y - lift + (hd ? (hd[1] - fy) * k : -2 * ground.s) - HEAD_M * ground.s;
    // ball hand (for dribbles and holding), in screen space
    var hand = m.hand[o.fi]; p.handScr = { x: ground.x + (o.flip ? -1 : 1) * (hand[0] - fx) * k, y: ground.y - lift + (hand[1] - fy) * k };
  };

  /* ---------- ball and particles ---------- */
  X.drawBall = function (g, b, t) {
    var sh = X.proj(b.x, 0, b.z), p = X.proj(b.x, b.y, b.z), r = Math.max(3, 0.15 * p.s);
    g.fillStyle = 'rgba(0,0,0,' + Math.max(0.1, 0.35 - b.y * 0.06) + ')'; g.beginPath(); g.ellipse(sh.x, sh.y, r * 1.1, r * 0.32, 0, 0, 6.283); g.fill();
    b.spin = ((b.spin || 0) + (b.vx || 0) * 0.02 + 6.283) % 6.283;
    if (b.fire) X.flame(b.x, b.y, b.z, 2, 0.2);
    var gr = g.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.05, p.x, p.y, r);
    gr.addColorStop(0, '#ffc488'); gr.addColorStop(0.45, '#f07a26'); gr.addColorStop(1, '#9c3a08'); g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fill();
    // seams turn with the spin
    g.save(); g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.clip();
    g.strokeStyle = 'rgba(35,12,0,0.85)'; g.lineWidth = Math.max(1, r * 0.11);
    var o = Math.sin(b.spin) * r * 0.55;
    g.beginPath(); g.moveTo(p.x - r, p.y + Math.cos(b.spin) * r * 0.15); g.lineTo(p.x + r, p.y - Math.cos(b.spin) * r * 0.15); g.stroke();
    g.beginPath(); g.ellipse(p.x + o, p.y, Math.abs(Math.cos(b.spin)) * r * 0.5 + 1, r, 0, 0, 6.283); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(60,20,0,0.9)'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.stroke();
    b.scr = p;
  };
  var parts = [];
  X.burst = function (x, y, z, n, cols, sp, life, grav) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, s = sp * (0.3 + Math.random()); parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: Math.random() * sp + 1, vz: Math.sin(a) * s * 0.5, c: cols[(Math.random() * cols.length) | 0], life: life * (0.5 + Math.random() * 0.5), g: grav === undefined ? 9 : grav, sz: 0.06 + Math.random() * 0.06 }); }
  };
  // fire: glowing blobs that rise, swell and cool from yellow to red
  var FLAME = ['#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a10', '#c82808'];
  X.flame = function (x, y, z, n, spread) {
    for (var i = 0; i < n; i++) { var w = spread || 0.1, l = 0.25 + Math.random() * 0.2; parts.push({ x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * w, z: z + (Math.random() - 0.5) * w * 0.5, vx: (Math.random() - 0.5) * 0.5, vy: 0.9 + Math.random() * 1.1, vz: 0, life: l, max: l, g: -1.5, sz: 0.045 + Math.random() * 0.04, flame: true }); }
  };
  X.drawParts = function (g, dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.y < 0) { q.y = 0; q.vy *= -0.4; }
      var p = X.proj(q.x, q.y, q.z);
      if (q.flame) {
        // teardrop licks: wide at the bottom, pointed on top, shrinking as they cool
        var u = 1 - q.life / q.max, rr = Math.max(1.2, q.sz * p.s * (1.1 - u * 0.6)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, 0.9 - u * 0.8);
        g.fillStyle = FLAME[Math.min(4, (u * 5) | 0)]; g.beginPath(); g.moveTo(p.x, p.y - rr * 2.4); g.quadraticCurveTo(p.x + rr * 1.1, p.y - rr * 0.2, p.x, p.y + rr); g.quadraticCurveTo(p.x - rr * 1.1, p.y - rr * 0.2, p.x, p.y - rr * 2.4); g.fill();
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      } else { g.fillStyle = q.c; g.fillRect(p.x, p.y, Math.max(1.5, q.sz * p.s), Math.max(1.5, q.sz * p.s)); }
    }
  };

  X.init = function () { buildFloor(); buildCrowd(); };
  X.rebuild = function () { buildFloor(); buildCrowd(); };

  // full scene, back to front; `things` are players + ball, each with x,z
  X.drawScene = function (g, t, dt, players, ball, hoopFx) {
    X.shake = Math.max(0, X.shake - dt * 3); X.shakeX = (Math.random() - 0.5) * X.shake * 10; X.shakeY = (Math.random() - 0.5) * X.shake * 8;
    X.hype = Math.max(0, X.hype - dt * 0.7);
    drawCrowd(g, t); drawFloor(g);
    players.forEach(function (p) { X.drawReflection(g, p); if (p.onFire && dt > 0 && Math.random() < 0.5) X.flame(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.05, p.z - 0.1, 1, 0.3); });
    var items = players.map(function (p) { return { z: p.z, draw: function () { X.drawPlayer(g, p); } }; });
    [-1, 1].forEach(function (side) {
      items.push({ z: K.HZ + 0.75, draw: function () { drawHoopBack(g, side); drawRim(g, side, false); } });
      items.push({ z: K.HZ - 0.35, draw: function () { drawRim(g, side, true, hoopFx[side > 0 ? 1 : 0]); } });
    });
    if (ball && ball.visible) items.push({ z: ball.z - 0.01 - (ball.inFront ? 0.6 : 0), draw: function () { X.drawBall(g, ball, t); } });
    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.draw(); });
    X.drawParts(g, dt);
  };
})(window.HW);
