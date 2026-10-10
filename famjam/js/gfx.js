/* gfx.js - the arcade view: fixed side camera that slides along the court, scanline floor, crowd, hoops, sprites with big digitized heads */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX = {};
  var W = 640, H = 360;
  // court (meters): x along the length, z into the screen (0 = near sideline), y up
  var K = X.K = { HL: 12.5, CD: 14, RIMX: 11.3, BOARDX: 11.95, HZ: 7, RIM_H: 3.05, R3: 6.6, LANE: 4.8, LANEW: 4.2 };
  // camera: up close like a 2D side-view arcade game - players over a third of the screen tall, the court a band under them deep enough
  // that running up and down reads as well as running along it, the crowd filling the rest. Tuned by where things land on the 360-high screen: SMID px per meter at mid-court,
  // near sideline at Y0, far sideline at Y14; a long lens (big D) keeps near and far players close in size.
  var D = 40, SMID = 66, Y0 = 372, Y14 = 206;
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
        g.fillStyle = 'rgb(' + Math.round(186 + t * 20 + streak) + ',' + Math.round(126 + t * 18 + streak) + ',' + Math.round(76 + t * 12 + streak / 2) + ')';
        g.fillRect(x, y, Math.min(len, px(K.HL) - x), 6); g.fillStyle = 'rgba(80,40,12,0.3)'; g.fillRect(x, y + 5, len, 1); g.fillRect(x, y, 1, 6);
        x += len;
      }
    }
    // soft reflections of the arena lights
    for (var i = -2; i <= 2; i++) { var gr = g.createRadialGradient(px(i * 6), pz(10), 0, px(i * 6), pz(10), 4 * PPM); gr.addColorStop(0, 'rgba(255,240,210,0.1)'); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = gr; g.fillRect(px(i * 6 - 4), pz(14), 8 * PPM, 8 * PPM); }
    var teams = HW.TEAMS;
    // paint: each team's color under the hoop it defends (team 0 attacks +x, so defends -x)
    [[-1, teams[0].color], [1, teams[1].color]].forEach(function (e) {
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
    buildWall();
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
  }
  function buildWall() {
    // a low courtside board: dark panels with small lettering, so it frames the court instead of shouting over it
    wallC = canvas(1600, 40); var w = wallC.getContext('2d'); w.fillStyle = '#0b0b16'; w.fillRect(0, 0, 1600, 40);
    w.font = '8px "Press Start 2P", monospace'; w.textBaseline = 'middle'; w.textAlign = 'center';
    var ads = [['FAM JAM', '#c9a53a'], ['ANDERSONS', '#c46a1c'], ['2 ON 2', '#b8407e'], ['GORMANS', '#2f6cc4'], ['TURBO!', '#47b07c']];
    for (var i2 = 0; i2 < 16; i2++) { var a2 = ads[i2 % ads.length], x2 = i2 * 100; w.fillStyle = '#15152a'; w.fillRect(x2 + 3, 4, 94, 32); w.fillStyle = a2[1]; w.fillRect(x2 + 3, 4, 94, 2); w.fillText(a2[0], x2 + 50, 21); }
  }
  X.hype = 0;
  // what the crowd module gets each frame: screen size, camera, the far wall's screen rows and its scale, hype for cheering
  X.crowdView = function (t) {
    var a = X.proj(0, 0.55, 15.5), b = X.proj(0, 0, 15.5);
    return { W: W, H: H, t: t, camX: X.camX, hype: X.hype, shakeX: X.shakeX, shakeY: X.shakeY, wallTop: a.y, wallBottom: b.y, s: b.s, proj: X.proj };
  };
  // the stands sit in the dark so the players on the court stand out
  var DIM_TOP = 0.45, DIM_LOW = 0.34, dimG = null, dimFor = '';
  function dimCrowd(g, v) {
    var key = W + ':' + Math.round(v.wallBottom);
    if (key !== dimFor) { dimFor = key; dimG = g.createLinearGradient(0, 0, 0, v.wallBottom); dimG.addColorStop(0, 'rgba(4,4,14,' + DIM_TOP + ')'); dimG.addColorStop(1, 'rgba(4,4,14,' + DIM_LOW + ')'); }
    g.fillStyle = dimG; g.fillRect(0, 0, W, Math.ceil(v.wallBottom) + 1);
  }
  X.drawWall = function (g, v) { var off = ((X.camX * v.s) % 800 + 800) % 800; g.drawImage(wallC, off, 0, W, 40, 0, v.wallTop, W, v.wallBottom - v.wallTop); };
  function drawCrowd(g, t, dt) {
    if (HW.Crowd && HW.Crowd.draw) { var cv = X.crowdView(t); HW.Crowd.draw(g, cv); dimCrowd(g, cv); if (HW.Crowd.over) HW.Crowd.over(g, cv, dt); return; }
    var v = X.crowdView(t), bob = Math.abs(Math.sin(t * (6 + X.hype * 3))) * (1 + X.hype * 3), ox = ((CROWD_W - W) / 2 + X.camX * v.s * 0.9 + X.shakeX) | 0;
    g.drawImage(crowdC, Math.max(0, Math.min(CROWD_W - W, ox)), 0, W, 230, 0, v.wallTop - 230 + 18 - bob, W, 230);
    g.fillStyle = '#05050c'; if (v.wallTop - 212 - bob > 0) g.fillRect(0, 0, W, v.wallTop - 212 - bob + 1);
    X.drawWall(g, v);
    dimCrowd(g, v);
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
    var s = sheets[id] = { img: new Image(), meta: null }, x = s.x = { img: new Image(), meta: null };
    // extras (sprites/<id>_x.*): the on-fire power-up, the pumped-up play anims and the taunts, in a sheet of their own
    var extras = Promise.all([
      fetch('sprites/' + id + '_x.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { x.meta = m; }),
      new Promise(function (res) { x.img.onload = res; x.img.onerror = res; x.img.src = 'sprites/' + id + '_x.png'; })
    ]).catch(function () { x.meta = null; });
    s.ready = Promise.all([
      fetch('sprites/' + id + '.json').then(function (r) { return r.json(); }).then(function (m) { s.meta = m; }),
      new Promise(function (res) { s.img.onload = res; s.img.onerror = res; s.img.src = 'sprites/' + id + '.png'; }),
      X.loadFace(id).then(function () { loadGold(id); }), extras
    ]).then(function () { if (s.meta && !s.meta.outline && s.img.naturalWidth) s.img = outlined(s.img); });
    return s.ready;
  };
  // a dark rim around every sprite so players pop off the floor and the crowd (built once per sheet at load)
  function outlined(img) {
    var w = img.naturalWidth, h = img.naturalHeight, sil = canvas(w, h), sg = sil.getContext('2d'), out = canvas(w, h), og = out.getContext('2d');
    sg.drawImage(img, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#0b0710'; sg.fillRect(0, 0, w, h);
    [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) { og.drawImage(sil, d[0], d[1]); });
    og.drawImage(img, 0, 0); return out;
  }
  X.loadFace = function (id) {
    if (faces[id]) return faces[id].ready;
    var f = faces[id] = { front: new Image(), back: new Image() };
    // players with a real photo get their cut-out face (faces/<id>_photo.png) up front; the back of the head is always rendered
    var photo = HW.PLAYERS[id] && HW.PLAYERS[id].photo;
    f.ready = Promise.all(['front', 'back'].map(function (k) { return new Promise(function (res) { f[k].onload = res; f[k].onerror = res; f[k].src = 'faces/' + id + '_' + (k === 'front' && photo ? 'photo' : k) + '.png'; }); }));
    return f.ready;
  };
  X.face = function (id) { return faces[id]; };
  // the powered-up heads with the gold hair standing up (faces/<id>_ssj*.png), only for the players in a game, in the background;
  // HW.SSJ_PAD[_BACK] say where the photo's top-left corner sits in the bigger canvas
  function loadGold(id) {
    var f = faces[id]; if (!f || f.ssj) return;
    if (HW.PLAYERS[id].photo && HW.SSJ_PAD && HW.SSJ_PAD[id]) { f.ssj = new Image(); f.ssjPad = HW.SSJ_PAD[id]; f.ssj.src = 'faces/' + id + '_ssj.png'; }
    if (HW.SSJ_PAD_BACK && HW.SSJ_PAD_BACK[id]) { f.ssjBack = new Image(); f.ssjPadBack = HW.SSJ_PAD_BACK[id]; f.ssjBack.src = 'faces/' + id + '_ssj_back.png'; }
  }

  var HEAD_M = 0.56;   // big digitized head width in meters (arcade proportions)
  function frameOf(p) {
    var sh = sheets[p.id]; if (!sh || !sh.meta) return null;
    // powered up: the pumped-up version of the anim if there is one; anims the main sheet doesn't have come from the extras sheet
    var name = p.anim, X2 = sh.x && sh.x.meta && sh.x.img.naturalWidth ? sh.x : null;
    if (p.ssj && X2 && X2.meta.anim[name + '_buff']) name += '_buff';
    if (!sh.meta.anim[name] && X2 && X2.meta.anim[name]) sh = X2;
    var m = sh.meta, A = m.anim[name] || (p.anim && p.anim.indexOf('pass_') === 0 && m.anim.pass) || (p.anim && p.anim.indexOf('dr_') === 0 && m.anim.drun) || m.anim.idle, list = A[p.dir] || A.R || A[Object.keys(A)[0]];
    var n = list.length, fr = Math.floor(p.frame) || 0, fi = list[Math.min(n - 1, ((fr % n) + n) % n)], ground = X.proj(p.x, 0, p.z);   // never a negative or NaN frame
    // off: frames rendered slid over to fit the frame (a body falling backward) are slid back here
    var off = m.off && m.off[fi] || null;
    return { sh: sh, m: m, fi: fi, ground: ground, k: ground.s / m.ppm, flip: p.face < 0, lift: p.y * ground.s, sx: (fi % m.cols) * m.fw, sy: Math.floor(fi / m.cols) * m.fh, fx: m.feet[0] + (off ? off[0] : 0), fy: m.feet[1] + (off ? off[1] : 0) };
  }
  function drawBody(g, p, o, alpha) {
    var m = o.m, k = o.k, fx = o.fx, fy = o.fy;
    g.drawImage(o.sh.img, o.sx, o.sy, m.fw, m.fh, -fx * k, -fy * k, m.fw * k, m.fh * k);
    // back of the head when he's turned away (the behind-the-back view, the far side of a spin)
    var hd = m.head[o.fi], f = faces[p.id], img = f && (p.dir === 'B' || p.dir === 'W' || (m.back && m.back[o.fi]) ? f.back : f.front);
    // powered up: the face with the gold hair standing up (same face position as the photo, extra room round it: f.ssjPad)
    var gold = p.ssj && f && (img === f.front ? f.ssj && f.ssj.naturalWidth && f.ssjPad : f.ssjBack && f.ssjBack.naturalWidth && f.ssjPadBack);
    if (img && img.naturalWidth && hd) {
      // photo cut-outs with lots of hair around the face (headScale) are drawn wider so every face comes out the same size
      var hs = img === f.front && p.def && p.def.headScale || 1, hw = HEAD_M * o.ground.s * (p.bigHead || 1) * hs, hh = hw * img.naturalHeight / img.naturalWidth;
      if (p.ssj) {   // a hot glow behind the head
        var gx = (hd[0] - fx) * k, gy = (hd[1] - fy) * k - hh * 0.45, gr = hw * (0.9 + 0.08 * Math.sin((X.t || 0) * 23));
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55 * Math.min(1, p.ssj); g.drawImage(glowDot(), gx - gr, gy - gr * 1.15, gr * 2, gr * 2.3); g.restore();
      }
      var hx = (hd[0] - fx) * k, hy = (hd[1] - fy) * k, rot = m.hrot && m.hrot[o.fi] || 0;
      // a hard hit snaps his head back
      if (p.hitT > 0) { var jk = Math.min(1, p.hitT / 0.45); rot -= 0.9 * jk * jk; hx -= hw * 0.22 * jk; }
      var dx0 = -hw / 2, dy0 = -hh * 0.8, dw = hw, dh = hh;
      if (gold) { var P = img === f.front ? f.ssjPad : f.ssjPadBack, sx = hw / img.naturalWidth; img = img === f.front ? f.ssj : f.ssjBack; dx0 -= P[0] * sx; dy0 -= P[1] * sx; dw = img.naturalWidth * sx; dh = img.naturalHeight * sx; }
      if (rot) { g.save(); g.translate(hx, hy); g.rotate(rot); g.drawImage(img, dx0, dy0, dw, dh); g.restore(); }   // head turns with a flip or a fall
      else g.drawImage(img, hx + dx0, hy + dy0, dw, dh);
      if (p.tongue && img !== f.back && img !== f.ssjBack) {   // tongue hanging out (the free-throw-line dunk)
        var tx = hx + hw * 0.03, ty = hy - hh * 0.8 + hh * 0.8, tw = hw * 0.13, th = hh * 0.13;
        g.fillStyle = '#7a1d2a'; g.beginPath(); g.ellipse(tx, ty + th * 0.35, tw * 0.6, th * 0.7, 0, 0, 6.283); g.fill();
        g.fillStyle = '#e8607a'; g.beginPath(); g.ellipse(tx, ty + th * 0.4, tw * 0.5, th * 0.62, 0, 0, 6.283); g.fill();
        g.strokeStyle = '#b8304a'; g.lineWidth = Math.max(1, tw * 0.08); g.beginPath(); g.moveTo(tx, ty + th * 0.05); g.lineTo(tx, ty + th * 0.6); g.stroke();
      }
    }
  }
  // where his ball hand is right now, in court meters (the ball rides in it through a fancy pass)
  X.handWorld = function (p, left) {
    var o = frameOf(p); if (!o) return null; var hd = o.m.hand[o.fi]; if (!hd) return null; var j = left && hd.length > 3 ? 2 : 0;
    return { x: p.x + (o.flip ? -1 : 1) * (hd[j] - o.fx) / o.m.ppm, y: p.y + (o.fy - hd[j + 1]) / o.m.ppm };
  };
  // the polished floor mirrors the players faintly, like the arcade's glossy hardwood
  X.drawReflection = function (g, p) {
    var o = frameOf(p); if (!o) return;
    g.save(); g.globalAlpha = Math.max(0, 0.12 - p.y * 0.04); g.translate(o.ground.x, o.ground.y + o.lift); g.scale(o.flip ? -1 : 1, -0.85);
    drawBody(g, p, o); g.restore();
  };
  X.drawPlayer = function (g, p) {
    var o = frameOf(p); if (!o) return;
    var m = o.m, k = o.k, ground = o.ground, lift = o.lift, fx = o.fx, fy = o.fy;
    p.screen = ground;
    // shadow
    var sr = 0.6 * ground.s; g.fillStyle = 'rgba(0,0,0,' + Math.max(0.15, 0.5 - p.y * 0.1) + ')'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * (1 - Math.min(0.5, p.y * 0.12)), sr * 0.26, 0, 0, 6.283); g.fill();
    // the player you control: a bright green ring on the floor round his feet
    if (p.human) { var pu = 0.5 + 0.5 * Math.sin(X.t * 6 || 0); g.fillStyle = 'rgba(47,216,90,0.18)'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * 1.15, sr * 0.34, 0, 0, 6.283); g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(47,216,90,' + (0.75 + 0.25 * pu) + ')'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * (1.15 + 0.08 * pu), sr * 0.34, 0, 0, 6.283); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(ground.x, ground.y + 1, sr * (1.15 + 0.08 * pu) + 1.5, sr * 0.34 + 1.5, 0, 0, 6.283); g.stroke(); }
    if (p.ssj) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,200,40,' + (0.3 + 0.1 * Math.sin((X.t || 0) * 17)) + ')'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * 1.6, sr * 0.45, 0, 0, 6.283); g.fill(); g.restore(); }
    else if (p.onFire) { g.fillStyle = 'rgba(255,120,20,0.35)'; g.beginPath(); g.ellipse(ground.x, ground.y, sr * 1.3, sr * 0.36, 0, 0, 6.283); g.fill(); }
    // afterimages behind a speedster on fire
    if (p.trail && p.trail.length) p.trail.forEach(function (t, i) {
      var gp = { id: p.id, def: p.def, anim: t.anim, dir: t.dir, frame: t.frame, x: t.x, y: t.y, z: t.z, face: t.face }, go = frameOf(gp); if (!go) return;
      g.save(); g.globalAlpha = 0.3 - i * 0.08; g.translate(go.ground.x, go.ground.y - go.lift); if (go.flip) g.scale(-1, 1); drawBody(g, gp, go); g.restore();
    });
    g.save(); g.translate(ground.x, ground.y - lift); if (o.flip) g.scale(-1, 1);
    var aur = p.ssj ? (p.state === 'powerup' ? 1.35 : 0.85) * Math.min(1, p.ssj) : 0;
    if (aur) drawAura(g, p, o, X.t || 0, aur);
    drawBody(g, p, o);
    if (aur) auraFront(g, p, o, X.t || 0, aur);
    if (p.jamArm) {   // the arm stretches all the way to the rim (cartoon dunk)
      var hdj = m.head[o.fi], sx0 = (hdj ? hdj[2] - fx : 0) * k + 0.12 * ground.s, sy0 = (hdj ? hdj[3] - fy : -1.6 * ground.s) * k + 0.08 * ground.s, jb = X.proj(p.jamArm.x, p.jamArm.y, p.jamArm.z);
      var ex = (jb.x - ground.x) * (o.flip ? -1 : 1), ey = jb.y - (ground.y - lift), aw = 0.11 * ground.s;
      g.lineCap = 'round'; g.strokeStyle = '#120c18'; g.lineWidth = aw + 2; g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = p.def.skin || '#e0a68c'; g.lineWidth = aw; g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(ex, ey); g.stroke(); g.lineCap = 'butt';
    }
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
    // swoosh: a fading white streak along the ball's path through a fancy pass
    if (b.swoosh > 0) { (b.trail = b.trail || []).unshift({ x: p.x, y: p.y }); if (b.trail.length > 10) b.trail.pop(); } else if (b.trail && b.trail.length) b.trail.pop();
    if (b.trail && b.trail.length > 1) {
      g.lineCap = 'round';
      for (var ti = 1; ti < b.trail.length; ti++) { var a0 = b.trail[ti - 1], a1 = b.trail[ti], f = 1 - ti / b.trail.length; g.strokeStyle = 'rgba(255,255,255,' + (0.7 * f) + ')'; g.lineWidth = Math.max(1, r * 1.7 * f); g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.stroke(); }
      g.lineCap = 'butt';
    }
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
  // a little blood on the court: a few drops and a small pool that spreads, darkens and fades
  var pools = [];
  X.blood = function (x, z, amt) {
    for (var i = 0; i < 16 * amt; i++) { var a = Math.random() * 6.283, s = 0.6 + Math.random() * 1.8; parts.push({ x: x, y: 0.35, z: z - 0.2, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * s * 0.5, c: ['#8f0b0b', '#b31212', '#6e0707'][i % 3], life: 0.5 + Math.random() * 0.4, g: 9, sz: 0.04 + Math.random() * 0.035 }); }
    // the pool spreads out from under his head toward the camera, so the head doesn't hide it
    pools.push({ x: x, z: z - 0.35, r: 0, max: 0.32 + 0.12 * amt, t: 0, life: 14, sx: 1.2 + Math.random() * 0.4 });
    if (pools.length > 6) pools.shift();
  };
  X.clearBlood = function () { pools = []; craters = []; rings = []; };
  // impact crater where a body slams into the floor: a dark dent with cracks running out of it
  var craters = [], rings = [];
  X.crater = function (x, z, r) {
    var cr = []; for (var i = 0; i < 7; i++) cr.push([i / 7 * 6.283 + Math.random() * 0.6, 0.8 + Math.random() * 0.9, Math.random() * 0.5 - 0.25]);
    craters.push({ x: x, z: z, r: r, t: 0, life: 12, cr: cr }); if (craters.length > 5) craters.shift();
  };
  // shockwave at the point of a hard hit
  X.ring = function (x, y, z, size) { rings.push({ x: x, y: y, z: z, size: size, t: 0, life: 0.34, rot: Math.random() }); };
  // where a knocked-down player's head ends up on the floor (court x), from the last frame of his fall animation
  X.fallHeadX = function (p) {
    var sh = sheets[p.id], m = sh && sh.meta; if (!m || !m.anim.fall) return p.x - p.face * 1.4;
    var list = m.anim.fall.R, fi = list[list.length - 1], hd = m.head[fi], off = m.off && m.off[fi], fx = m.feet[0] + (off ? off[0] : 0);
    return p.x + (p.face < 0 ? -1 : 1) * (hd[0] - fx) / m.ppm;
  };
  X.pools = function () { return pools; };
  function drawCraters(g, dt) {
    for (var i = craters.length - 1; i >= 0; i--) {
      var c = craters[i]; c.t += dt; if (c.t > c.life) { craters.splice(i, 1); continue; }
      var p = X.proj(c.x, 0, c.z), rx = c.r * p.s, ry = rx * 0.3, a = Math.min(1, (c.life - c.t) / 3);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(45,25,10,0.55)'; g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(20,10,4,0.6)'; g.beginPath(); g.ellipse(p.x, p.y + ry * 0.1, rx * 0.55, ry * 0.5, 0, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(255,225,180,0.35)'; g.lineWidth = 1; g.beginPath(); g.ellipse(p.x, p.y - ry * 0.12, rx * 0.98, ry * 0.9, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.strokeStyle = 'rgba(30,15,6,0.8)'; g.lineWidth = Math.max(1, c.r * p.s * 0.04);
      c.cr.forEach(function (k) {
        var x0 = p.x + Math.cos(k[0]) * rx * 0.5, y0 = p.y + Math.sin(k[0]) * ry * 0.5, x1 = p.x + Math.cos(k[0] + k[2]) * rx * k[1], y1 = p.y + Math.sin(k[0] + k[2]) * ry * k[1];
        g.beginPath(); g.moveTo(x0, y0); g.lineTo((x0 + x1) / 2 + Math.sin(k[0] * 7) * 2, (y0 + y1) / 2); g.lineTo(x1, y1); g.stroke();
      });
      g.globalAlpha = 1;
    }
  }
  function drawRings(g, dt) {
    for (var i = rings.length - 1; i >= 0; i--) {
      var r = rings[i]; r.t += dt; if (r.t > r.life) { rings.splice(i, 1); continue; }
      var u = r.t / r.life, p = X.proj(r.x, r.y, r.z), rx = r.size * p.s * (0.45 + 0.75 * u), a = 1 - u;
      if (r.flat) {   // shockwave rolling out across the floor
        g.strokeStyle = 'rgba(255,240,170,' + a + ')'; g.lineWidth = Math.max(1, 5 * a); g.beginPath(); g.ellipse(p.x, p.y, rx, rx * 0.22, 0, 0, 6.283); g.stroke();
        g.strokeStyle = 'rgba(255,200,40,' + a * 0.7 + ')'; g.lineWidth = Math.max(1, 2 * a); g.beginPath(); g.ellipse(p.x, p.y, rx * 0.8, rx * 0.17, 0, 0, 6.283); g.stroke(); continue;
      }
      // comic-book impact star for the first instant
      if (u < 0.6) {
        var sa = 1 - u / 0.6, R = r.size * p.s * (0.55 + 0.25 * u), n = 10;
        g.globalAlpha = sa; g.fillStyle = '#ffd23a'; g.beginPath();
        for (var j = 0; j < n * 2; j++) { var an = j / (n * 2) * 6.283 + r.rot, rr = j % 2 ? R * 0.42 : R * (j % 4 ? 0.85 : 1.1); g.lineTo(p.x + Math.cos(an) * rr, p.y + Math.sin(an) * rr * 0.8); }
        g.closePath(); g.fill(); g.strokeStyle = '#ff7a00'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(p.x, p.y, R * 0.3, R * 0.24, 0, 0, 6.283); g.fill(); g.globalAlpha = 1;
      }
      g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = Math.max(1, 4 * a); g.beginPath(); g.ellipse(p.x, p.y, rx, rx * 0.75, 0, 0, 6.283); g.stroke();
      g.strokeStyle = 'rgba(255,220,90,' + (a * 0.8) + ')'; g.lineWidth = Math.max(1, 2 * a); g.beginPath(); g.ellipse(p.x, p.y, rx * 0.7, rx * 0.52, 0, 0, 6.283); g.stroke();
    }
  }
  function drawPools(g, dt) {
    drawCraters(g, dt);
    for (var i = pools.length - 1; i >= 0; i--) {
      var q = pools[i]; q.t += dt; if (q.t > q.life) { pools.splice(i, 1); continue; }
      q.r = q.max * Math.min(1, q.t / 1.1); var p = X.proj(q.x, 0, q.z), rx = q.r * p.s * q.sx, ry = q.r * p.s * 0.3, a = Math.min(1, (q.life - q.t) / 3);
      g.globalAlpha = 0.85 * a; g.fillStyle = '#5e0606'; g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, 6.283); g.fill();
      g.fillStyle = '#8a0c0c'; g.beginPath(); g.ellipse(p.x - rx * 0.15, p.y - ry * 0.2, rx * 0.6, ry * 0.55, 0, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,200,200,0.35)'; g.fillRect(p.x - rx * 0.35, p.y - ry * 0.45, Math.max(1, rx * 0.18), 1);
      g.globalAlpha = 1;
    }
  }
  X.drawParts = function (g, dt) {
    drawRays(g, dt); drawRings(g, dt);
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
    X.t = t;
    var pu = HW.Jam && (HW.Jam.pu || HW.Jam.cine), zk = 1, za = 0, zf = null, cine = pu && !HW.Jam.pu;
    if (pu) {   // the power-up camera: zoom in on him, hold, ease back out
      var D = cine ? pu.dur : HW.Jam.PU.dur, u = pu.t, e = function (v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      // zoom so he fills about 3/4 of the screen from his shoes to the tips of the hair, never showing past the edge of the scene
      var pp = pu.p, gd = X.proj(pp.x, 0, pp.z), top = pp.headTop !== undefined ? pp.headTop - X.shakeY : gd.y - 2.3 * gd.s, fig = Math.max(40, gd.y - X.shakeY - top + 0.35 * gd.s);
      var zmax = cine ? 1.75 : Math.max(1.5, Math.min(2.6, 0.92 * H / fig));
      if (cine) { fig = 0; top = top + 0.35 * gd.s; }   // a dunk close-up: on his face
      za = u < 0.25 ? e(u / 0.25) : u > D - 0.3 ? e((D - u) / 0.3) : 1; zk = 1 + (zmax - 1) * za;
      zf = cine ? { x: gd.x - X.shakeX, y: top + 0.3 * HEAD_M * gd.s } : { x: gd.x - X.shakeX, y: (gd.y - X.shakeY + top - 0.35 * gd.s) / 2 };
      var tx = zf.x + (W / 2 - zf.x) * za, ty = zf.y + (H * 0.5 - zf.y) * za;
      tx = Math.max(W - zk * (W - zf.x), Math.min(zk * zf.x, tx)); ty = Math.max(H - zk * (H - zf.y), Math.min(zk * zf.y, ty));
      g.save(); g.translate(tx, ty); g.scale(zk, zk); g.translate(-zf.x, -zf.y);
      if (za > 0.3) g.imageSmoothingEnabled = false;
    }
    drawSceneInner(g, t, dt, players, ball, hoopFx);
    if (pu) {
      g.restore(); g.imageSmoothingEnabled = true;
      // dim the edges so he owns the screen, darker while he charges
      var vg = g.createRadialGradient(W / 2, H * 0.52, H * 0.25, W / 2, H * 0.52, W * 0.62), dark = (cine ? 0.35 : pu.boom ? 0.5 : 0.7) * za;
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,' + dark + ')'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    if (X.white > 0) { g.fillStyle = 'rgba(255,248,214,' + Math.min(1, X.white) + ')'; g.fillRect(0, 0, W, H); X.white = Math.max(0, X.white - dt * 3.2); }
  };
  function drawSceneInner(g, t, dt, players, ball, hoopFx) {
    X.shake = Math.max(0, X.shake - dt * 3); X.shakeX = (Math.random() - 0.5) * X.shake * 10; X.shakeY = (Math.random() - 0.5) * X.shake * 8;
    X.hype = Math.max(0, X.hype - dt * 0.7);
    drawCrowd(g, t, dt); drawFloor(g); drawPools(g, dt);
    players.forEach(function (p) { X.drawReflection(g, p); if (p.onFire && dt > 0 && Math.random() < 0.5) { if (p.ssj) X.goldSpark(p); else X.flame(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.05, p.z - 0.1, 1, 0.3); } });
    var items = players.map(function (p) { return { z: p.z, draw: function () { X.drawPlayer(g, p); } }; });
    [-1, 1].forEach(function (side) {
      items.push({ z: K.HZ + 0.75, draw: function () { drawHoopBack(g, side); drawRim(g, side, false); } });
      items.push({ z: K.HZ - 0.35, draw: function () { drawRim(g, side, true, hoopFx[side > 0 ? 1 : 0]); } });
    });
    if (ball && ball.visible) items.push({ z: ball.z - 0.01 - (ball.inFront ? 0.6 : 0), draw: function () { X.drawBall(g, ball, t); } });
    items.sort(function (a, b) { return b.z - a.z; });
    items.forEach(function (it) { it.draw(); });
    X.drawParts(g, dt);
  }

  /* ---------- the golden power-up: aura, flash, sparks ---------- */
  var glowDotC = null;
  function glowDot() {   // a soft round light, white-gold in the middle
    if (glowDotC) return glowDotC;
    var c = glowDotC = canvas(64, 64), gg = c.getContext('2d'), gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,215,1)'); gr.addColorStop(0.35, 'rgba(255,215,70,0.7)'); gr.addColorStop(1, 'rgba(255,170,0,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64); return c;
  }
  // per sprite frame: his silhouette in gold, spread out a few pixels into a soft halo (built once per frame, no canvas filters)
  var GR = 7;
  function goldHalo(o) {
    var sh = o.sh, cache = sh.halo || (sh.halo = {}); if (cache[o.fi]) return cache[o.fi];
    var m = o.m, sil = canvas(m.fw, m.fh), sg = sil.getContext('2d');
    sg.drawImage(sh.img, o.sx, o.sy, m.fw, m.fh, 0, 0, m.fw, m.fh); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffc928'; sg.fillRect(0, 0, m.fw, m.fh);
    var c = canvas(m.fw + GR * 2, m.fh + GR * 2), cg = c.getContext('2d');
    [[GR, 0.07], [GR * 0.65, 0.12], [GR * 0.33, 0.2]].forEach(function (L) { for (var i = 0; i < 12; i++) { var a = i / 12 * 6.283; cg.globalAlpha = L[1]; cg.drawImage(sil, GR + Math.cos(a) * L[0], GR + Math.sin(a) * L[0]); } });
    return (cache[o.fi] = c);
  }
  // the flame-shaped shell round him: wide at the feet, licking up past his head in flickering tongues
  function auraShell(g, w, top, t, seed, sc, alpha, fill, edge) {
    var N = 9, pts = [], i;
    for (i = 0; i <= N; i++) {   // left side, feet to shoulders
      var v = i / N, y = -v * top * 0.78, hw = w * (0.62 + 0.38 * Math.sin(v * 2.6)) * sc;
      pts.push([-hw - Math.sin(t * 19 + i * 1.7 + seed) * w * 0.07, y]);
    }
    var T = 5; for (i = 0; i < T; i++) {   // tongues over the head
      var fx = (i + 0.5) / T * 2 - 1, len = top * (0.25 + 0.2 * Math.abs(Math.sin(t * 11 + i * 2.3 + seed))) * (1 - Math.abs(fx) * 0.35);
      pts.push([fx * w * 0.55 * sc - w * 0.1 * sc, -top * 0.82 - len * 0.35]); pts.push([fx * w * 0.5 * sc + Math.sin(t * 13 + i + seed) * w * 0.12, -top * 0.82 - len * sc]);
    }
    for (i = N; i >= 0; i--) { var v2 = i / N, y2 = -v2 * top * 0.78, hw2 = w * (0.62 + 0.38 * Math.sin(v2 * 2.6)) * sc; pts.push([hw2 + Math.sin(t * 17 + i * 2.1 + seed) * w * 0.07, y2]); }
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    g.closePath(); g.globalAlpha = alpha; g.fillStyle = fill; g.fill(); g.strokeStyle = edge; g.lineWidth = Math.max(1, w * 0.06); g.stroke();
  }
  function drawAura(g, p, o, t, I) {
    var m = o.m, k = o.k, s = o.ground.s, hd = m.head[o.fi], top = hd ? (o.fy - hd[1]) * k + HEAD_M * s * 0.75 : 2.2 * s, w = 0.62 * s;
    g.save(); g.globalCompositeOperation = 'lighter';
    var gr = g.createLinearGradient(0, 0, 0, -top * 1.25); gr.addColorStop(0, 'rgba(255,190,30,0.15)'); gr.addColorStop(0.5, 'rgba(255,210,60,0.32)'); gr.addColorStop(1, 'rgba(255,245,170,0.55)');
    auraShell(g, w, top, t, 0, 1.12, 0.55 * I, gr, 'rgba(255,225,90,0.9)');
    auraShell(g, w, top, t * 1.3, 3.1, 0.78, 0.45 * I, 'rgba(255,240,150,0.35)', 'rgba(255,255,220,0.8)');
    var h = goldHalo(o); g.globalAlpha = Math.min(1, 0.9 * I); g.drawImage(h, (-o.fx - GR) * k, (-o.fy - GR) * k, h.width * k, h.height * k);
    g.restore();
  }
  function auraFront(g, p, o, t, I) {   // light streaks shooting up through him
    var s = o.ground.s, n = 5;
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,240,160,0.8)'; g.lineWidth = Math.max(1, s * 0.025);
    for (var i = 0; i < n; i++) {
      var ph = (t * 1.6 + i / n + (p.id.length * 0.13)) % 1, x = Math.sin(i * 7.3 + Math.floor(t * 1.6 + i / n) * 3.1) * 0.42 * s, y = -ph * 2.3 * s, L = 0.25 * s;
      g.globalAlpha = I * Math.sin(ph * Math.PI) * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - L); g.stroke();
    }
    g.restore();
  }
  // the moment the arms come down: white-out, a shockwave across the floor, rays, gold sparks and chunks of floor flying
  var rays = [];
  X.powerFlash = function (p) {
    X.white = 0.85; rays.push({ p: p, t: 0, life: 0.7 });
    rings.push({ x: p.x, y: 0.02, z: p.z, size: 3.2, t: 0, life: 0.55, rot: 0, flat: true });
    rings.push({ x: p.x, y: 1.1, z: p.z - 0.2, size: 1.6, t: 0, life: 0.35, rot: Math.random() });
    X.burst(p.x, 1.0, p.z - 0.2, 40, ['#ffffff', '#fff3a0', '#ffd23f', '#ffb000'], 6, 0.6, 2);
    X.burst(p.x, 0.05, p.z - 0.1, 22, ['#8a6a46', '#b8915e', '#5e4630', '#d9c09a'], 4.5, 0.9, 11);
    for (var i = 0; i < 24; i++) X.goldSpark(p);
  };
  X.goldSpark = function (p) {
    var l = 0.5 + Math.random() * 0.5;
    parts.push({ x: p.x + (Math.random() - 0.5) * 0.9, y: Math.random() * 1.6, z: p.z - 0.15 + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.4, vy: 1.5 + Math.random() * 2.5, vz: 0, c: ['#fff6c0', '#ffe14d', '#ffc21a'][(Math.random() * 3) | 0], life: l, g: -0.5, sz: 0.03 + Math.random() * 0.03 });
  };
  X.powerDown = function (p) { X.burst(p.x, 1.2, p.z - 0.1, 18, ['#fff3a0', '#ffd23f', '#c9a53a'], 2, 0.5, 1); };
  function drawRays(g, dt) {
    for (var i = rays.length - 1; i >= 0; i--) {
      var r = rays[i]; r.t += dt; if (r.t > r.life) { rays.splice(i, 1); continue; }
      var c = X.proj(r.p.x, 1.05, r.p.z), u = r.t / r.life, R = c.s * (2.5 + 5 * u);
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(c.x, c.y); g.rotate(r.t * 0.8);
      for (var j = 0; j < 14; j++) { var a = j / 14 * 6.283, wd = 0.07 + 0.05 * (j % 2); g.globalAlpha = (1 - u) * 0.5; g.fillStyle = j % 2 ? '#fff6c8' : '#ffd23f'; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - wd) * R, Math.sin(a - wd) * R); g.lineTo(Math.cos(a + wd) * R, Math.sin(a + wd) * R); g.closePath(); g.fill(); }
      g.restore();
    }
  }
})(window.HW);

