/* ui.js - input (keyboard + touch), arcade HUD, callouts and full-screen arcade menus (big select-screen cards), all drawn
   on the game canvas in HW.Font. Menu art (wood border, emblems, pixel portraits) is built once into canvases. */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, Au = HW.Audio, Fo = HW.Font;
  var UI = HW.JamUI = { screen: 'title', btns: [], st: { team: 0, picks: [], ctrl: null, diff: 'normal', qlen: 60 }, t: 0 };
  // quarter length is remembered on this device
  var QLENS = [60, 90, 120, 180];
  try { var ql = +(localStorage.getItem('famjam.qlen') || localStorage.getItem('hoopsjam.qlen')); if (QLENS.indexOf(ql) >= 0) UI.st.qlen = ql; } catch (e) { }
  function clockText(s) { return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  var In = HW.In = { digits: [], mx: 0, mz: 0, turbo: false, shootHeld: false, shootDown: false, shootUp: false, passDown: false, pauseDown: false, tap: null, keys: {}, touchMove: { x: 0, y: 0 }, stickTurbo: false, comboTurbo: false, actDown: false, nav: null };
  var CY = '#22c4f2', PB = '#262a8c', P1C = '#2fd85a';

  /* ---------- input ---------- */
  UI.initInput = function (cv) {
    UI.cv = cv;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return; var k = e.code; In.keys[k] = true; Au.init();
      if (k === 'KeyJ' || k === 'Space') { In.shootHeld = true; In.shootDown = true; e.preventDefault(); }
      if (k === 'KeyK') In.passDown = true;
      if (k === 'Escape' || k === 'KeyP') In.pauseDown = true;
      if (k === 'Enter') In.enter = true;
      if (/^(Digit|Numpad)\d$/.test(k)) In.digits.push(k.slice(-1)); else if (k === 'Backspace') In.digits.push('DEL');   // queued: two keys in one slow frame both count
      if (/^Arrow/.test(k)) In.nav = k;
    });
    window.addEventListener('keyup', function (e) { In.keys[e.code] = false; if (e.code === 'KeyJ' || e.code === 'Space') { In.shootHeld = false; In.shootUp = true; } });
    function toCanvas(cx, cy) { var r = cv.getBoundingClientRect(); return { x: (cx - r.left) / r.width * X.W, y: (cy - r.top) / r.height * X.H }; }
    cv.addEventListener('mousedown', function (e) { Au.init(); In.tap = toCanvas(e.clientX, e.clientY); if (HW.Jam.phase !== 'menu' && !UI.overlay()) { In.shootHeld = true; In.shootDown = true; } });
    window.addEventListener('mouseup', function () { if (In.shootHeld && !In.keys.KeyJ && !In.keys.Space) { In.shootHeld = false; In.shootUp = true; } });
    cv.addEventListener('touchstart', function (e) { e.preventDefault(); Au.init(); var t = e.changedTouches[0]; In.tap = toCanvas(t.clientX, t.clientY); UI.firstGesture(); }, { passive: false });
    // the phone's share sheet (and the clipboard) only open straight from the tap itself, not a frame later: the online lobby's
    // SEND INVITE button answers the finger lifting off it here
    function shareTap(x, y) {
      var p = toCanvas(x, y), b = UI.btns.filter(function (q) { return q.id === 'share'; })[0];
      if (b && UI.screen === 'lobby' && !UI.popOn && HW.Net && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) HW.Net.share();
    }
    cv.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; if (t) shareTap(t.clientX, t.clientY); });
    cv.addEventListener('click', function (e) { shareTap(e.clientX, e.clientY); });
    UI.initTouch();
    if (HW.Presence) { HW.Presence.onArrive = arrived; HW.Presence.onInvite = invited; HW.Presence.describe = function () { return { nm: UI.who() || '', dv: HW.TOUCH ? 'p' : 'c', st: myState() }; }; }
  };
  UI.firstGesture = function () {
    Au.init(); if (UI.fsTried || !HW.TOUCH) return; UI.fsTried = true;
    try { var de = document.documentElement, p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : null; var lock = function () { try { screen.orientation.lock('landscape').catch(function () { }); } catch (e) { } }; if (p && p.then) p.then(lock, function () { }); else lock(); } catch (e) { }
  };
  // touch button labels are drawn in the arcade font (pixel images), so they match the HUD
  function labelBtn(id, text, k) {
    var el = document.getElementById(id), sp = el && el.querySelector('span'); if (!sp) return;
    try { var c = Fo.canvas(text, { scheme: 'white', shadow: 1 }); sp.style.backgroundImage = 'url(' + c.toDataURL() + ')'; sp.style.width = c.width * k + 'px'; sp.style.height = c.height * k + 'px'; sp.textContent = ''; } catch (e) { }
  }
  UI.initTouch = function () {
    labelBtn('bShoot', 'SHOOT', 1.5); labelBtn('bPass', 'PASS', 1.5); labelBtn('bPause', 'II', 1.5);
    if (!HW.TOUCH) return; document.body.classList.add('touch');
    var zone = document.getElementById('stickZone'), base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob'), id = null, ox = 0, oy = 0, R = 55;
    zone.addEventListener('touchstart', function (e) { e.preventDefault(); UI.firstGesture(); if (id !== null) return; var t = e.changedTouches[0]; id = t.identifier; ox = t.clientX; oy = t.clientY; base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); }, { passive: false });
    zone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; if (t.identifier !== id) continue;
        // full speed at the ring; drag past it (and keep it there) for TURBO, so the right thumb only ever taps one button
        var dx = t.clientX - ox, dy = t.clientY - oy, d = Math.hypot(dx, dy), turbo = d > R * (In.stickTurbo ? 1.08 : 1.25), lim = turbo ? R * 1.18 : R, k = d > lim ? lim / d : 1;
        if (turbo !== In.stickTurbo) { In.stickTurbo = turbo; base.classList.toggle('turbo', turbo); }
        dx *= k; dy *= k; var n = Math.min(1, Math.hypot(dx, dy) / R) / (Math.hypot(dx, dy) || 1); In.touchMove.x = dx * n; In.touchMove.y = -dy * n;
        knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      }
    }, { passive: false });
    var end = function (e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === id) { id = null; In.touchMove.x = In.touchMove.y = 0; In.stickTurbo = false; base.classList.remove('on', 'turbo'); knob.style.transform = 'translate(-50%,-50%)'; } };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    function hold(elId, down, up) { var el = document.getElementById(elId); el.addEventListener('touchstart', function (e) { e.preventDefault(); UI.firstGesture(); el.classList.add('down'); down(); }, { passive: false }); var u = function (e) { e.preventDefault(); el.classList.remove('down'); if (up) up(); }; el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false }); }
    hold('bShoot', function () { In.shootHeld = true; In.shootDown = true; }, function () { In.shootHeld = false; In.shootUp = true; });
    hold('bPass', function () { In.passDown = true; });
    hold('bAct', function () { In.actDown = true; });
    hold('bPause', function () { In.pauseDown = true; });
  };
  UI.readInput = function () {
    var k = In.keys, mx = 0, mz = 0;
    if (k.ArrowRight || k.KeyD) mx += 1; if (k.ArrowLeft || k.KeyA) mx -= 1; if (k.ArrowUp || k.KeyW) mz += 1; if (k.ArrowDown || k.KeyS) mz -= 1;
    if (In.touchMove.x || In.touchMove.y) { mx = In.touchMove.x; mz = In.touchMove.y; }
    In.mx = mx; In.mz = mz; In.comboTurbo = !!(k.ShiftLeft || k.ShiftRight || k.KeyL); In.turbo = In.comboTurbo || In.stickTurbo;
  };
  // the touch controls follow the play: the third button is DUNK with the ball (lit when you're in range) or SHOVE without it,
  // and the ring round the stick is your turbo meter
  var tState = '', tLevel = -1;
  UI.syncTouch = function (G) {
    if (!HW.TOUCH) return;
    var h = G.human; if (!h) return;
    var st = h.hasBall ? (G.canDunk(h) ? 'dunk' : 'dunk off') : 'shove';
    var lbl = h.hasBall ? 'DUNK' : 'SHOVE';   // (the Ball Handlers mix layups in)
    if (st + lbl !== tState) { tState = st + lbl; var b = document.getElementById('bAct'); b.className = 'tb ' + st; b.textContent = lbl; }
    // the pass button steals on defense
    var bh = HW.Jam.ball && HW.Jam.ball.holder, pl = bh && bh.team !== h.team ? 'STEAL' : 'PASS';
    if (pl !== UI.passLbl) { UI.passLbl = pl; labelBtn('bPass', pl, 1.5); }
    var lv = Math.round(h.onFire ? 100 : h.turbo);
    if (lv !== tLevel) { tLevel = lv; var r = document.getElementById('stickRing'); r.style.setProperty('--t', lv); r.style.setProperty('--tc', h.onFire ? '#ff7a1a' : lv > 25 ? '#3df07a' : '#ff4b3a'); }
  };
  UI.endFrame = function () { In.shootDown = In.shootUp = In.passDown = In.actDown = In.pauseDown = In.enter = false; In.tap = null; In.nav = null; In.digits.length = 0; };

  /* ---------- safe area (notch, home bar) in canvas pixels ---------- */
  var probe, safeKey, safeV = { l: 0, r: 0, t: 0, b: 0 };
  UI.safe = function () {
    var key = innerWidth + 'x' + innerHeight + 'x' + X.W + (UI.safeOverride ? JSON.stringify(UI.safeOverride) : '');
    if (key === safeKey) return safeV; safeKey = key;
    try {
      if (!probe) { probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(probe); }
      var cs = getComputedStyle(probe), o = UI.safeOverride || {}, r = UI.cv.getBoundingClientRect(), k = X.W / (r.width || 1);
      var L = o.l !== undefined ? o.l : parseFloat(cs.paddingLeft) || 0, R = o.r !== undefined ? o.r : parseFloat(cs.paddingRight) || 0, B = o.b !== undefined ? o.b : parseFloat(cs.paddingBottom) || 0;
      safeV = { l: Math.round(Math.max(0, (L - r.left) * k)), r: Math.round(Math.max(0, (R - (innerWidth - r.right)) * k)), t: 0, b: Math.round(Math.max(0, (B - (innerHeight - r.bottom)) * k)) };
    } catch (e) { safeV = { l: 0, r: 0, t: 0, b: 0 }; }
    return safeV;
  };

  /* ---------- pixel-art helpers (run once per asset, never per frame) ---------- */
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function hash(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
  function rgb(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // hard alpha, then either snap to a palette or posterize with an ordered dither; optional dark outline around the silhouette
  function pixelize(c, o) {
    o = o || {}; var g = c.getContext('2d'), w = c.width, h = c.height, im;
    try { im = g.getImageData(0, 0, w, h); } catch (e) { return c; }
    var d = im.data, pal = o.pal && o.pal.map(rgb), lv = o.levels || 0, st = lv ? 255 / (lv - 1) : 0, ct = o.contrast || 1, A = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4; if (d[i + 3] < (o.alpha || 110)) { d[i + 3] = 0; continue; }
      d[i + 3] = 255; A[y * w + x] = 1;
      if (pal) { var best = 0, bd = 1e9; for (var k = 0; k < pal.length; k++) { var p = pal[k], e = (p[0] - d[i]) * (p[0] - d[i]) + (p[1] - d[i + 1]) * (p[1] - d[i + 1]) + (p[2] - d[i + 2]) * (p[2] - d[i + 2]); if (e < bd) { bd = e; best = k; } } d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2]; }
      else if (lv) { var th = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * st * 0.85; for (var ch = 0; ch < 3; ch++) { var v = (d[i + ch] - 128) * ct + 128 + (o.lift || 0) + th; d[i + ch] = Math.max(0, Math.min(255, Math.round(v / st) * st)); } }
    }
    if (o.outline) {
      var oc = rgb(o.outline);
      for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
        if (A[y2 * w + x2]) continue;
        if ((x2 > 0 && A[y2 * w + x2 - 1]) || (x2 < w - 1 && A[y2 * w + x2 + 1]) || (y2 > 0 && A[(y2 - 1) * w + x2]) || (y2 < h - 1 && A[(y2 + 1) * w + x2])) { var j = (y2 * w + x2) * 4; d[j] = oc[0]; d[j + 1] = oc[1]; d[j + 2] = oc[2]; d[j + 3] = 255; }
      }
    }
    g.putImageData(im, 0, 0); return c;
  }
  function up(c, k) { var o = canvas(c.width * k, c.height * k), g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, o.width, o.height); return o; }

  /* ---------- wood-grain cabinet border (whole screen; the card sits on top) ---------- */
  var woodC = null;
  function wood() {
    if (woodC && woodC.width === X.W) return woodC;
    var W = X.W, H = X.H, c = woodC = canvas(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
    var pal = [[46, 20, 6], [86, 42, 14], [116, 60, 22], [146, 80, 30], [178, 104, 44]];
    for (var y = 0; y < H; y++) {
      var pl = Math.floor(y / 22), py = y - pl * 22, joint = (hash(pl * 3.1) * W) | 0;
      for (var x = 0; x < W; x++) {
        var v = y * 0.21 + Math.sin(x * 0.018 + pl * 1.7) * 1.4 + Math.sin(x * 0.0061 + pl * 4.1) * 3.2 + hash(pl * 17 + ((x / 9) | 0)) * 0.35, f = v - Math.floor(v);
        var k = f < 0.16 ? 1 : f < 0.5 ? 3 : f < 0.8 ? 2 : 4; if (hash(x * 0.37 + y * 9.13) < 0.06) k = Math.max(1, k - 1);
        if (py === 0) k = 0; else if (py === 1) k = Math.min(4, k + 1); else if (py === 21) k = 1;
        if (Math.abs(x - joint) < 1) k = 0;
        var p = pal[k], i = (y * W + x) * 4; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0); return c;
  }
  // cyan beveled frame (light top/left, dark bottom/right) around a filled panel
  function bevel(g, x, y, w, h, fill, col, t) {
    col = col || CY; t = t || 4; x |= 0; y |= 0; w |= 0; h |= 0;
    g.fillStyle = '#000'; g.fillRect(x, y, w, h);
    g.fillStyle = Fo.shade(col, -0.5); g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = Fo.shade(col, 0.55); g.fillRect(x + 1, y + 1, w - 3, h - 3);
    g.fillStyle = col; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#000'; g.fillRect(x + t, y + t, w - 2 * t, h - 2 * t);
    if (fill) { g.fillStyle = fill; g.fillRect(x + t + 1, y + t + 1, w - 2 * t - 2, h - 2 * t - 2); }
  }
  // the whole screen as one card: wood all round, cyan frame, dark blue inside. Returns the inner rectangle. see: whatever is
  // already drawn there shows through the inside, dimmed by that color (the final scoreboard over its highlight reel)
  function card(g, fill, see) {
    var S = UI.safe(), W = X.W, H = X.H;
    var L = S.l + 8, R = W - S.r - 8, T = 8, B = H - Math.max(8, S.b + 2);
    if (see) { g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(L + 5, T + 5, R - L - 10, B - T - 10); g.clip('evenodd'); }
    g.drawImage(wood(), 0, 0); bevel(g, L, T, R - L, B - T, fill || PB);
    if (see) { g.restore(); g.fillStyle = see; g.fillRect(L + 5, T + 5, R - L - 10, B - T - 10); }
    return { L: L + 5, R: R - 5, T: T + 5, B: B - 5, W: R - L - 10, H: B - T - 10, oL: L, oR: R };
  }
  function seeBevel(g, x, y, w, h, tint, col, t) {   // a bevel panel with a see-through inside
    t = t || 4; g.save(); g.beginPath(); g.rect(x, y, w, h); g.rect(x + t + 1, y + t + 1, w - 2 * t - 2, h - 2 * t - 2); g.clip('evenodd');
    bevel(g, x, y, w, h, null, col, t); g.restore(); g.fillStyle = tint; g.fillRect(x + t + 1, y + t + 1, w - 2 * t - 2, h - 2 * t - 2);
  }

  /* ---------- team emblems (procedural, bold, 64 px art shown at 2x) ---------- */
  var embC = {};
  function emblem(ti, k) {
    var key = ti + 'x' + k; if (embC[key]) return embC[key];
    var c = canvas(64, 64), g = c.getContext('2d'), t = HW.TEAMS[ti];
    if (ti === 0) {
      // flaming basketball with a big A
      var FL = ['#b81e06', '#f04a10', '#ff9a1f', '#ffd23f'];
      FL.forEach(function (col, i) {
        g.fillStyle = col; g.beginPath(); var s = 1 - i * 0.17, n = 7; g.moveTo(32 - 27 * s, 46);
        for (var q = 0; q <= n; q++) { var xx = 32 - 27 * s + q * 54 * s / n, tip = q % 2 ? 2 + i * 6 + hash(q + i) * 6 : 20 + i * 5; g.lineTo(xx, tip); }
        g.lineTo(32 + 27 * s, 46); g.closePath(); g.fill();
      });
      g.fillStyle = '#000'; g.beginPath(); g.arc(32, 40, 23, 0, 6.283); g.fill();
      g.fillStyle = '#a8460c'; g.beginPath(); g.arc(32, 40, 21.5, 0, 6.283); g.fill();
      g.fillStyle = '#f07a26'; g.beginPath(); g.arc(30, 38, 19, 0, 6.283); g.fill();
      g.fillStyle = '#ffb070'; g.beginPath(); g.arc(24, 31, 6, 0, 6.283); g.fill();
      g.strokeStyle = '#1a0a02'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 40); g.lineTo(54, 40); g.moveTo(32, 18); g.lineTo(32, 62); g.stroke();
      g.beginPath(); g.arc(8, 40, 15, -1.1, 1.1); g.stroke(); g.beginPath(); g.arc(56, 40, 15, 2.04, 4.24); g.stroke();
      pixelize(c, { pal: ['#000000', '#1a0a02', '#a8460c', '#f07a26', '#ffb070', '#b81e06', '#f04a10', '#ff9a1f', '#ffd23f'] });
      Fo.draw(g, 'A', 32, 41, { scale: 3, scheme: 'white', shadowColor: t.dark });
    } else if (ti === 2) {
      // a gold-rimmed purple star with a big S
      var star = function (r, ri) { g.beginPath(); for (var q = 0; q < 10; q++) { var an = -Math.PI / 2 + q * Math.PI / 5, rr = q % 2 ? ri : r; g.lineTo(32 + rr * Math.cos(an), 35 + rr * Math.sin(an)); } g.closePath(); };
      g.fillStyle = '#000'; star(32, 16); g.fill(); g.fillStyle = '#ffd23f'; star(29, 14.5); g.fill(); g.fillStyle = '#5a189a'; star(25.5, 12.5); g.fill();
      g.save(); star(25.5, 12.5); g.clip(); g.fillStyle = '#9b5de5'; g.fillRect(0, 0, 32, 64); g.restore();
      pixelize(c, { pal: ['#000000', '#ffd23f', '#5a189a', '#9b5de5'] });
      Fo.draw(g, 'S', 32, 36, { scale: 3, scheme: 'white', shadowColor: t.dark });
    } else if (ti === 3) {
      // a gold-rimmed green diamond with JG
      var dia = function (r) { g.beginPath(); g.moveTo(32, 32 - r); g.lineTo(32 + r, 32); g.lineTo(32, 32 + r); g.lineTo(32 - r, 32); g.closePath(); };
      g.fillStyle = '#000'; dia(32); g.fill(); g.fillStyle = '#ffd23f'; dia(29); g.fill(); g.fillStyle = '#0d4a1c'; dia(25); g.fill();
      g.save(); dia(25); g.clip(); g.fillStyle = '#2bb34b'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#1f8f3a'; g.fillRect(32, 0, 32, 64); g.restore();
      pixelize(c, { pal: ['#000000', '#ffd23f', '#0d4a1c', '#2bb34b', '#1f8f3a'] });
      Fo.draw(g, 'JG', 32, 33, { scale: 2, scheme: 'white', shadowColor: t.dark });
    } else {
      // shield with a lightning bolt and a big G
      function shield(m) { g.beginPath(); g.moveTo(8 + m, 6 + m); g.lineTo(56 - m, 6 + m); g.lineTo(56 - m, 30); g.quadraticCurveTo(56 - m, 50 - m * 0.3, 32, 61 - m * 1.3); g.quadraticCurveTo(8 + m, 50 - m * 0.3, 8 + m, 30); g.closePath(); }
      g.fillStyle = '#000'; shield(0); g.fill(); g.fillStyle = '#ffffff'; shield(2); g.fill(); g.fillStyle = '#10306b'; shield(4.5); g.fill();
      g.save(); shield(4.5); g.clip(); g.fillStyle = '#3a86ff'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#2462d8'; g.fillRect(32, 0, 32, 64); g.restore();
      g.fillStyle = '#000'; g.beginPath(); g.moveTo(44, 2); g.lineTo(22, 34); g.lineTo(33, 34); g.lineTo(18, 63); g.lineTo(48, 26); g.lineTo(36, 26); g.lineTo(52, 2); g.closePath(); g.fill();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(45, 5); g.lineTo(26, 32); g.lineTo(37, 32); g.lineTo(23, 57); g.lineTo(44, 28); g.lineTo(33, 28); g.lineTo(49, 5); g.closePath(); g.fill();
      pixelize(c, { pal: ['#000000', '#ffffff', '#10306b', '#3a86ff', '#2462d8', '#ffd23f'] });
      Fo.draw(g, 'G', 30, 31, { scale: 3, scheme: 'white', shadowColor: t.dark });
    }
    return embC[key] = k > 1 ? up(c, k) : c;
  }

  /* ---------- player portraits: big head on tank-top shoulders, pixelized like a digitized arcade still ---------- */
  var ports = {}, boxes = {};
  function headBox(id, img) {
    var b = boxes[id]; if (b && b.src === img.src) return b;
    var w = img.naturalWidth, h = img.naturalHeight; b = { x: 0, y: 0, w: w, h: h, src: img.src };
    try {
      var c = canvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0); var d = g.getImageData(0, 0, w, h).data, rows = [], x0 = w, x1 = 0, y0 = -1, mw = 0;
      for (var y = 0; y < h; y++) { var a = -1, z = -1; for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 100) { if (a < 0) a = x; z = x; } rows.push(a < 0 ? 0 : z - a + 1); if (a >= 0) { x0 = Math.min(x0, a); x1 = Math.max(x1, z); if (y0 < 0) y0 = y; } mw = Math.max(mw, rows[y]); }
      var y1 = y0; for (var y2 = 0; y2 < h; y2++) if (rows[y2] >= mw * 0.42) y1 = y2;   // chin: last wide row (ignores a hanging ponytail)
      if (y0 >= 0) b = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, src: img.src };
    } catch (e) { }
    return boxes[id] = b;
  }
  function portrait(id, PW, PH) {
    var key = id + ':' + PW + 'x' + PH, f = X.face(id), img = f && f.front, ok = !!(img && img.complete && img.naturalWidth), c = ports[key];
    if (c && (c.ok || !ok)) return c;
    var d = HW.PLAYERS[id], w = PW >> 1, h = PH >> 1, lo = canvas(w, h), g = lo.getContext('2d'), cx = w / 2;
    var b = ok ? headBox(id, img) : { w: 63, h: 80 }, HH = h * 0.66, k = HH / b.h, hw = b.w * k, top = h * 0.04, chin = top + HH;
    var nh = hw * 0.2, ys = chin + h * 0.04, sw = Math.min(w * 0.49, hw * 1.32), so = sw * 0.52;
    // neck, shoulders and arms in skin
    g.fillStyle = d.skin; g.beginPath(); g.moveTo(cx - nh, chin - hw * 0.35); g.lineTo(cx - nh, ys - 1); g.quadraticCurveTo(cx - nh - 3, ys + 2, cx - sw * 0.72, ys + 3);
    g.quadraticCurveTo(cx - sw, ys + 4, cx - sw, ys + 16); g.lineTo(cx - sw, h); g.lineTo(cx + sw, h); g.lineTo(cx + sw, ys + 16); g.quadraticCurveTo(cx + sw, ys + 4, cx + sw * 0.72, ys + 3);
    g.quadraticCurveTo(cx + nh + 3, ys + 2, cx + nh, ys - 1); g.lineTo(cx + nh, chin - hw * 0.35); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - sw * 0.74, ys + 10, 1, h); g.fillRect(cx + sw * 0.74, ys + 10, 1, h);
    // tank top in the jersey colour with trim at the scoop neck and armholes
    var trim = HW.TEAMS[d.team].dark, jb = function () { g.beginPath(); g.moveTo(cx - nh * 1.6, ys - 1); g.lineTo(cx - so, ys + 1); g.quadraticCurveTo(cx - so * 0.9, ys + (h - ys) * 0.55, cx - so * 1.18, h + 1); g.lineTo(cx + so * 1.18, h + 1); g.quadraticCurveTo(cx + so * 0.9, ys + (h - ys) * 0.55, cx + so, ys + 1); g.lineTo(cx + nh * 1.6, ys - 1); g.quadraticCurveTo(cx, ys + 11, cx - nh * 1.6, ys - 1); g.closePath(); };
    g.fillStyle = trim; jb(); g.fill(); g.save(); g.translate(0, 1.5); g.scale(1, 1); g.fillStyle = d.color; g.beginPath(); g.moveTo(cx - nh * 1.6 + 1.5, ys); g.lineTo(cx - so + 1.5, ys + 1.5); g.quadraticCurveTo(cx - so * 0.9 + 1.5, ys + (h - ys) * 0.55, cx - so * 1.18 + 1.5, h + 1); g.lineTo(cx + so * 1.18 - 1.5, h + 1); g.quadraticCurveTo(cx + so * 0.9 - 1.5, ys + (h - ys) * 0.55, cx + so - 1.5, ys + 1.5); g.lineTo(cx + nh * 1.6 - 1.5, ys); g.quadraticCurveTo(cx, ys + 10, cx - nh * 1.6 + 1.5, ys); g.closePath(); g.fill(); g.restore();
    // light from the upper left: shade the right side, highlight the left shoulder, shadow under the chin
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,30,0.28)'; g.fillRect(cx + sw * 0.18, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(cx - sw * 0.62, ys + 5, sw * 0.22, 3.5, 0, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(cx, chin + 1, nh * 1.3, 3.5, 0, 0, 6.283); g.fill();
    g.globalCompositeOperation = 'source-over';
    if (ok) { g.imageSmoothingQuality = 'high'; g.drawImage(img, cx - (b.x + b.w / 2) * k, top - b.y * k, img.naturalWidth * k, img.naturalHeight * k); }
    else { g.fillStyle = d.skin; g.beginPath(); g.ellipse(cx, top + HH / 2, hw / 2, HH / 2, 0, 0, 6.283); g.fill(); g.fillStyle = d.hair; g.beginPath(); g.ellipse(cx, top + HH * 0.3, hw / 2, HH * 0.3, 0, Math.PI, 0); g.fill(); }
    pixelize(lo, { levels: 7, contrast: 1.1, outline: '#06061a' });
    Fo.draw(g, String(d.num), cx, Math.min(h - 6, ys + (h - ys) * 0.62), { scheme: 'white', shadow: 0 });
    c = ports[key] = up(lo, 2); c.ok = ok; return c;
  }
  // small head-only face for the box score and the off-screen arrows
  var minis = {};
  function miniFace(id, hpx) {
    var key = id + ':' + hpx, f = X.face(id), img = f && f.front, ok = !!(img && img.complete && img.naturalWidth), c = minis[key];
    if (c && (c.ok || !ok)) return c;
    var b = ok ? headBox(id, img) : { x: 0, y: 0, w: 63, h: 80 }, k = (hpx - 2) / b.h; c = canvas(Math.ceil(b.w * k) + 2, hpx);
    var g = c.getContext('2d'); if (ok) { g.imageSmoothingQuality = 'high'; g.drawImage(img, 1 - b.x * k, 1 - b.y * k, img.naturalWidth * k, img.naturalHeight * k); }
    pixelize(c, { levels: 7, contrast: 1.1, outline: '#06061a' }); c.ok = ok; return minis[key] = c;
  }

  /* ---------- small cached sprites: arrows, ball icon, flames, P1 marker ---------- */
  var spr = {};
  function tri(dir, s, col) {   // pixel triangle with a black outline and a darker lower half
    var key = dir + s + col; if (spr[key]) return spr[key];
    var horiz = dir === 'l' || dir === 'r', c = horiz ? canvas(s + 4, s * 2 + 5) : canvas(s * 2 + 5, s + 4), g = c.getContext('2d');
    function slices(grow, color, lowerOnly) {
      g.fillStyle = color;
      for (var i = 0; i <= s; i++) {
        var hh = s - i + grow, a = (dir === 'r' || dir === 'd') ? 2 + i - (i === s ? 0 : 0) : 2 + s - i;
        if (i === 0 && grow) { a += (dir === 'r' || dir === 'd') ? -1 : 1; }
        var lo = -hh, len = hh * 2 + 1; if (lowerOnly) { lo = 1; len = hh; if (len <= 0) continue; }
        if (horiz) g.fillRect(a, s + 2 + lo, 1, len); else g.fillRect(s + 2 + lo, a, len, 1);
      }
      if (grow) { if (horiz) g.fillRect((dir === 'r') ? s + 3 : 0, s + 1, 1, 3); else g.fillRect(s + 1, dir === 'd' ? s + 3 : 0, 3, 1); }
    }
    slices(1, '#000'); slices(0, col); slices(0, Fo.shade(col, -0.3), true);
    return spr[key] = c;
  }
  function ballIcon(fire, fr) {
    var key = 'ball' + (fire ? fr : ''); if (spr[key]) return spr[key];
    var c = canvas(26, fire ? 40 : 26), g = c.getContext('2d'), oy = fire ? 14 : 0;
    if (fire) flameStrip(g, 3, 20, oy + 6, 18, fr, 1);
    g.fillStyle = '#000'; g.beginPath(); g.arc(13, oy + 13, 12.5, 0, 6.283); g.fill();
    g.fillStyle = '#a8460c'; g.beginPath(); g.arc(13, oy + 13, 11.5, 0, 6.283); g.fill();
    g.fillStyle = '#f07a26'; g.beginPath(); g.arc(12, oy + 12, 10, 0, 6.283); g.fill();
    g.fillStyle = '#ffb070'; g.beginPath(); g.arc(9, oy + 8, 3.2, 0, 6.283); g.fill();
    g.strokeStyle = '#1a0a02'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(2, oy + 13); g.lineTo(24, oy + 13); g.moveTo(13, oy + 2); g.lineTo(13, oy + 24); g.stroke();
    g.beginPath(); g.arc(1, oy + 13, 8, -1.2, 1.2); g.stroke(); g.beginPath(); g.arc(25, oy + 13, 8, 1.94, 4.34); g.stroke();
    pixelize(c, { pal: ['#000000', '#1a0a02', '#a8460c', '#f07a26', '#ffb070', '#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a10', '#c82808'] });
    return spr[key] = c;
  }
  var FLC = ['#fff3a0', '#ffd23f', '#ff9a1f', '#ff5a10', '#c82808'];
  // a row of pixel flame tongues standing on y=base, from x0 for n columns of size p
  function flameStrip(g, x0, n, base, hmax, fr, p) {
    for (var i = 0; i < n; i++) {
      var u = Math.sin(i * 0.9 + fr * 2.1) * 0.5 + 0.5, v = Math.sin(i * 2.3 - fr * 1.3) * 0.5 + 0.5, ht = Math.max(1, Math.round((hmax / p) * (0.25 + 0.5 * u + 0.25 * v)));
      for (var j = 0; j < ht; j++) { g.fillStyle = FLC[Math.min(4, Math.floor(j / ht * 5))]; g.fillRect(x0 + i * p, base - (j + 1) * p, p, p); }
    }
  }
  // flames licking up off the top of a rendered string (three frames)
  function flamesFor(c, fr, p) {
    var key = 'fl' + fr + p, o = c[key]; if (o) return o;
    var hmax = c.height * 0.9; o = canvas(c.width, c.height + hmax); var g = o.getContext('2d'), tops = [];
    try { var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (var x = 0; x < c.width; x += p) { var t = -1; for (var y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 0) { t = y; break; } tops.push(t); } } catch (e) { return o; }
    tops.forEach(function (t, i) {
      if (t < 0) return; var u = Math.sin(i * 0.8 + fr * 2.3) * 0.5 + 0.5, v = Math.sin(i * 2.1 - fr * 1.7 + 1) * 0.5 + 0.5, ht = Math.max(1, Math.round((hmax / p) * (0.15 + 0.55 * u * v + 0.3 * u)));
      for (var j = 0; j < ht; j++) { g.fillStyle = FLC[Math.min(4, Math.floor(j / ht * 5))]; g.fillRect(i * p, hmax + t + p - (j + 1) * p, p, p); }
    });
    return c[key] = o;
  }
  function flaming(g, text, x, y, o, fr) {   // centered text with flames behind it
    var c = Fo.canvas(text, o), p = Math.max(1, (o.scale || 1) - 1), fl = flamesFor(c, fr % 3, p), x0 = Math.round(x - c.width / 2), y0 = Math.round(y - c.height / 2);
    g.drawImage(fl, x0, y0 - (fl.height - c.height)); g.drawImage(c, x0, y0);
  }
  function marker(col, label, sc) {
    sc = sc || 1; var key = 'mk' + col + label + sc; if (spr[key]) return spr[key];
    var t = Fo.canvas(label, { scheme: 'white', shadow: 0, scale: sc }), w = t.width + 4 * sc, a = 4 * sc, c = canvas(w + 2, t.height + 2 * sc + a + 3), g = c.getContext('2d'), th = t.height + 2 * sc;
    g.fillStyle = '#000'; g.fillRect(0, 0, w + 2, th + 2); g.beginPath(); g.moveTo(w / 2 - a - 1, th + 1); g.lineTo(w / 2 + a + 3, th + 1); g.lineTo(w / 2 + 1, th + a + 3); g.fill();
    g.fillStyle = col; g.fillRect(1, 1, w, th); g.beginPath(); g.moveTo(w / 2 - a + 1, th + 1); g.lineTo(w / 2 + a + 1, th + 1); g.lineTo(w / 2 + 1, th + a); g.fill();
    g.fillStyle = Fo.shade(col, 0.45); g.fillRect(1, 1, w, sc);
    g.drawImage(t, 1 + 2 * sc, 1 + sc); return spr[key] = c;
  }

  /* ---------- buttons ---------- */
  function button(g, id, x, y, w, h, label, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    UI.btns.push({ id: id, x: x, y: y, w: w, h: h, fn: o.fn, disabled: o.disabled });
    var lit = o.on !== false, base = lit ? (o.color || '#ffc61a') : '#2a2d5c';
    if (o.disabled) g.globalAlpha = 0.4;
    g.fillStyle = '#000'; g.fillRect(x, y, w, h);
    g.fillStyle = Fo.shade(base, -0.5); g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = Fo.shade(base, 0.55); g.fillRect(x + 1, y + 1, w - 3, h - 3);
    g.fillStyle = base; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    var hh = (h - 4) >> 1; g.fillStyle = Fo.shade(base, -0.2); g.fillRect(x + 2, y + 2 + hh, w - 4, h - 4 - hh);
    Fo.draw(g, label, x + w / 2, y + h / 2, { scale: o.size || 2, scheme: lit ? 'white' : 'gray' });
    g.globalAlpha = 1;
  }
  function arrowBtn(g, id, x, y, w, h, dir, fn, boxed) {
    x = Math.round(x); y = Math.round(y); UI.btns.push({ id: id, x: x, y: y, w: w, h: h, fn: fn });
    if (boxed) bevel(g, x, y, w, h, '#0a0c2a', CY, 3);
    var s = Math.max(4, Math.round(Math.min(dir === 'l' || dir === 'r' ? w * 0.42 : h * 0.42, dir === 'l' || dir === 'r' ? h * 0.3 : w * 0.3))), c = tri(dir, s, '#ffd23f');
    var bob = Math.floor(UI.t * 3) % 2, dx = dir === 'l' ? -bob : dir === 'r' ? bob : 0, dy = dir === 'u' ? -bob : dir === 'd' ? bob : 0;
    g.drawImage(c, Math.round(x + w / 2 - c.width / 2 + dx), Math.round(y + h / 2 - c.height / 2 + dy));
  }
  function bigTab(g, x, y, label, col) {   // the YOU tab on the player you control
    var t = Fo.canvas(label, { scheme: 'black', shadow: 0, outline: 0, scale: 2 }), w = t.width + 14, h = t.height + 8;
    x = Math.round(x - w / 2); y = Math.round(y);
    g.fillStyle = '#000'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = col; g.fillRect(x, y, w, h); g.fillStyle = Fo.shade(col, 0.5); g.fillRect(x, y, w, 2); g.fillStyle = Fo.shade(col, -0.3); g.fillRect(x, y + h - 2, w, 2);
    g.drawImage(t, x + 7, y + 4); return w;
  }
  function tab(g, x, y, label, col, dark) {   // small label tab (CPU)
    var t = Fo.canvas(label, { scheme: dark ? 'black' : 'white', shadow: 0, outline: dark ? 0 : 1 }), w = t.width + 8, h = t.height + 4;
    x = Math.round(x - w / 2); y = Math.round(y);
    g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x, y, w, h); g.fillStyle = Fo.shade(col, 0.5); g.fillRect(x, y, w, 1);
    g.drawImage(t, x + 4, y + 2); return w;
  }
  UI.txt = function (g, s, x, y, size, col, align) { Fo.draw(g, s, x, y, { scale: Math.max(1, Math.round((size || 9) / 9)), color: col || '#fff', align: align || 'center' }); };

  /* ---------- stat panel (name, type, stats) like the arcade select screen ---------- */
  var STATS = [['SPD', 'speed', 'POWER', 'str'], ['3PTS', 'tp', 'STEAL', 'steal'], ['DUNK', 'dunk', 'BLOCK', 'block'], ['PASS', 'pass']];
  function statLines(g, d, x, y, w, sc, rowH) {
    var colon = true, lw1 = 0, lw2 = 0, vw = Fo.measure('10', sc);
    function fit() { lw1 = 0; lw2 = 0; STATS.forEach(function (r) { lw1 = Math.max(lw1, Fo.measure(r[0] + (colon ? ':' : ''), sc)); if (r[2]) lw2 = Math.max(lw2, Fo.measure(r[2] + (colon ? ':' : ''), sc)); }); return lw1 + lw2 + 2 * vw + 6 * sc + 4; }
    if (fit() > w) { colon = false; if (fit() > w && sc > 1) { sc = 1; colon = true; vw = Fo.measure('10', 1); fit(); } }
    var tot = lw1 + lw2 + 2 * vw + 6 * sc, x0 = Math.round(x + (w - tot) / 2);
    STATS.forEach(function (r, i) {
      var yy = y + i * rowH, a = d.stats[r[1]], b = d.stats[r[3]], c1 = x0 + lw1, c2 = c1 + 2 * sc + vw + 4 * sc + lw2;
      Fo.draw(g, r[0] + (colon ? ':' : ''), c1, yy, { scale: sc, scheme: 'yellow', align: 'right' }); Fo.draw(g, String(a), c1 + 2 * sc, yy, { scale: sc, scheme: a >= 8 ? 'cyan' : 'white', align: 'left' });
      if (r[2]) { Fo.draw(g, r[2] + (colon ? ':' : ''), c2, yy, { scale: sc, scheme: 'yellow', align: 'right' }); Fo.draw(g, String(b), c2 + 2 * sc, yy, { scale: sc, scheme: b >= 8 ? 'cyan' : 'white', align: 'left' }); }
    });
  }

  /* ---------- menus ---------- */
  UI.overlay = function () { var G = HW.Jam; return G.phase === 'menu' || G.phase === 'paused' || UI.screen === 'results' || UI.screen === 'paused'; };
  UI.show = function (s) {
    if ((s === 'title' || s === 'team') && HW.Net && HW.Net.mode) HW.Net.leave();   // back to the menus: off line
    UI.screen = s; if (s !== 'results' && s !== 'paused') HW.Jam.phase = 'menu'; if (s === 'team') fixPicks();
  };
  var DIFFS = ['easy', 'normal', 'hard'];
  UI.memo = {};
  function fixPicks() {
    var st = UI.st, r = HW.TEAMS[st.team].roster, m = UI.memo[st.team];
    if (!st.picks || st.picks.length !== 2 || r.indexOf(st.picks[0]) < 0 || r.indexOf(st.picks[1]) < 0 || st.picks[0] === st.picks[1]) st.picks = m ? m.picks.slice() : [r[0], r[1]];
    if (st.picks.indexOf(st.ctrl) < 0) st.ctrl = m && st.picks.indexOf(m.ctrl) >= 0 ? m.ctrl : st.picks[0];
    fixOpp();
  }
  // who you play against (one of the other families)
  function fixOpp() { var st = UI.st; if (st.opp == null || st.opp === st.team || !HW.TEAMS[st.opp]) st.opp = st.team === 0 ? 1 : 0; }
  function nextOpp(dir) { var st = UI.st, n = HW.TEAMS.length; do { st.opp = (st.opp + dir + n) % n; } while (st.opp === st.team); Au.click(); }
  function switchTeam(dir) { var st = UI.st, was = st.team; UI.memo[st.team] = { picks: st.picks.slice(), ctrl: st.ctrl }; st.team = (st.team + dir + HW.TEAMS.length) % HW.TEAMS.length; if (st.opp === st.team) st.opp = was; st.picks = []; fixPicks(); Au.click(); }
  function cycle(slot, dir) {
    var st = UI.st, r = HW.TEAMS[st.team].roster, cur = st.picks[slot], other = st.picks[1 - slot], i = r.indexOf(cur);
    do { i = (i + dir + r.length) % r.length; } while (r[i] === other);
    st.picks[slot] = r[i]; if (st.ctrl === cur) st.ctrl = r[i]; Au.click();
  }
  function blink(n) { return Math.floor(UI.t * (n || 2.5)) % 2 === 0; }

  /* ---------- invites (presence.js): someone else came online - invite them? - and someone invited you - join? ---------- */
  // ask: someone came on (pending until you're on a menu); got: an invite to a room; want: INVITE pressed, sending it once the room's
  // up; sent: the room we invited people to; no: invites turned down; snooze: NOT NOW holds off the next "came online" for a while
  var INV = UI.inv = { ask: null, got: null, want: false, sent: null, no: {}, snooze: 0, key: null };
  function nowMs() { return performance.now(); }
  /* who you are, for who's online and challenges: one of the family, picked once on this phone (WHO ARE YOU?, the 'who' screen);
     '-' when skipped. Sent round with the presence check-ins along with what you're doing */
  var WHO = 'famjam.who';
  UI.who = function () { try { var v = localStorage.getItem(WHO); return v && HW.PLAYERS[v] ? v : null; } catch (e) { return null; } };
  UI.whoAsked = function () { try { return !!localStorage.getItem(WHO); } catch (e) { return true; } };
  function setWho(id) { try { localStorage.setItem(WHO, id || '-'); } catch (e) { } if (HW.Presence && HW.Presence.update) HW.Presence.update(); }
  function nameOf(id) { var d = id && HW.PLAYERS[id]; return d ? d.first.toUpperCase() : ''; }
  // m: on the menus, c: playing the CPU, h: hosting a room, r: in someone's room, g: in an online game
  function myState() { var Net = HW.Net, G = HW.Jam; if (Net && Net.playing()) return 'g'; if (Net && Net.mode === 'host') return 'h'; if (Net && Net.mode === 'guest') return 'r'; return G.players.length && G.phase !== 'menu' ? 'c' : 'm'; }
  UI.presTick = function () { var s = myState(); if (s !== UI.lastSt) { UI.lastSt = s; if (HW.Presence && HW.Presence.update) HW.Presence.update(); } };   // (main loop: a change shows on the others' lists right away)
  function arrived(n, first, names, ids) {
    if (HW.Net && HW.Net.playing() || nowMs() < INV.snooze) return;
    var a = INV.ask;
    INV.ask = { t: nowMs(), n: n + (a ? a.n : 0), first: first && !a, ppl: HW.Net ? HW.Net.people.length : 0, names: (a ? a.names : []).concat(names || []), ids: (a ? a.ids : []).concat(ids || []) };
  }
  // an invite can be taken unless you're already in someone's room or have people in yours (or a game on)
  function canTake(code) {
    var Net = HW.Net; if (!Net || INV.no[code]) return false;
    if (!Net.mode) return true;
    if (Net.mode !== 'host' || Net.code === code || Net.stage !== 'lobby' && Net.stage !== 'connecting' || Net.people.length > 1) return false;
    return !(INV.sent && INV.sent === Net.code && code > Net.code);   // two of you invited each other at once: the lower room code's host stays put
  }
  function invited(code, fr) { if (canTake(code)) { INV.got = { code: code, t: nowMs(), fr: HW.PLAYERS[fr] ? fr : '' }; INV.ask = null; } }
  // send the room's code: to one person (to: their presence tag) or everyone else online
  function sendInvite() {
    var Net = HW.Net, w = INV.want || {}, n = HW.Presence ? HW.Presence.invite(Net.code, w.to || null) : 0; INV.sent = Net.code; INV.want = false;
    Net.note = n ? (w.nm ? 'CHALLENGE SENT TO ' + w.nm + '!' : 'INVITE SENT!') : w.to ? 'THEY JUST WENT OFFLINE' : 'NOBODY ELSE IS ONLINE RIGHT NOW'; Net.noteUntil = nowMs() + 4000;
  }
  // invite (to: one person's tag, nm: their name) - into the room you're hosting, or a new one, sent as soon as it has its code
  function inviteThem(to, nm) {
    var Net = HW.Net, a = INV.ask; INV.ask = null;
    if (to === undefined && a && a.ids && a.ids.length === 1) { to = a.ids[0]; nm = a.names && a.names.length === 1 ? a.names[0] && nameOf(a.names[0]) : ''; }   // one person came on: just them
    INV.want = { to: to || null, nm: nm || '' };
    if (Net.mode === 'host' && Net.stage === 'lobby' && Net.code) { sendInvite(); return; }
    if (HW.Jam.phase !== 'menu') HW.Jam.players = [];
    Net.host(); UI.show('lobby');
  }
  UI.challenge = inviteThem;
  function joinThem(code) {
    INV.got = null; INV.ask = null;
    if (HW.Jam.phase !== 'menu') HW.Jam.players = [];
    if (HW.Net.mode) HW.Net.leave();
    UI.code = code; UI.show('join'); HW.Net.join(code);
  }
  // which pop-up this screen gets, if any (invites go stale after a minute and a half, "came online" after three, or once they've gone)
  function popFor(s) {
    var Net = HW.Net, Pr = HW.Presence, t = nowMs();
    if (!Net || !Pr) return null;
    if (INV.want && (Net.mode !== 'host' || Net.stage !== 'connecting' && Net.stage !== 'lobby')) INV.want = false;
    if (INV.want && Net.mode === 'host' && Net.stage === 'lobby' && Net.code) sendInvite();
    if (Net.playing()) { INV.ask = INV.got = null; return null; }
    if (INV.got && (t - INV.got.t > 90000 || !canTake(INV.got.code))) INV.got = null;
    // "came online" goes when it's old, when they've really gone (not seen for 10 s - the count dips for a moment whenever a phone
    // reconnects to the lobby), or when they're busy: in a room (yours too, if they came straight in with the link) or an online game
    if (INV.ask) {
      var a = INV.ask, live = (Pr.ok ? Pr.people : []).filter(function (q) { return a.ids.indexOf(q.id) >= 0; });
      if (live.length || a.seenT == null) a.seenT = t;
      var gone = !live.length && t - a.seenT > 10000, busy = live.length && live.every(function (q) { return q.st === 'r' || q.st === 'g'; });
      if (t - a.t > 180000 || t < INV.snooze || Net.mode === 'guest' || gone || busy) INV.ask = null;
    }
    if (INV.got && /^(title|team|matchup|online|who|lobby|results|paused|neterr)$/.test(s)) return { kind: 'got', code: INV.got.code, fr: INV.got.fr };
    var hosting = Net.mode === 'host' && Net.stage === 'lobby' && Net.code && Net.people.length < 4;
    if (INV.ask && (/^(title|team|online|results|paused)$/.test(s) && !Net.mode || s === 'lobby' && hosting)) return { kind: 'ask', n: INV.ask.n, first: INV.ask.first, hosting: !!hosting, nm: INV.ask.n === 1 && INV.ask.names.length === 1 ? nameOf(INV.ask.names[0]) : '' };
    return null;
  }
  // the pop-up: the screen dimmed behind a card with two buttons (Enter = the green one, Esc = no)
  function drawPop(g, pop) {
    var W = X.W, H = X.H, fr = Math.floor(UI.t * 12);
    g.fillStyle = 'rgba(2,3,16,0.7)'; g.fillRect(0, 0, W, H);
    var bw = Math.min(480, W - 40), bh = 196, x = Math.round((W - bw) / 2), y = Math.round((H - bh) / 2) - 6, cx = Math.round(W / 2);
    bevel(g, x, y, bw, bh, '#141a6a', CY, 3);
    var got = pop.kind === 'got', who = got ? nameOf(pop.fr) : pop.nm;   // (named when they picked who they are)
    var head = got ? (who ? who + ' CHALLENGES YOU!' : 'YOU\'RE INVITED!') : who ? who + (pop.first ? ' IS ON!' : ' JUST CAME ON!') : pop.first ? (pop.n > 1 ? pop.n + ' OTHERS ARE ON!' : 'SOMEONE ELSE IS ON!') : pop.n > 1 ? pop.n + ' PEOPLE JUST CAME ON!' : 'SOMEONE JUST CAME ON!';
    var hs = 4; while (hs > 2 && Fo.measure(head, hs) > bw - 30) hs--;
    flaming(g, head, cx, y + 42, { scale: hs, scheme: got ? 'fire' : 'yellow', outline: 2, shadow: 2 }, fr);
    var line = got ? 'JOIN THEIR GAME?' : who ? 'CHALLENGE ' + who + (pop.hosting ? ' TO YOUR ROOM?' : '?') : pop.hosting ? 'INVITE THEM TO YOUR ROOM?' : 'INVITE THEM TO PLAY?';
    var ls = Fo.measure(line, 2) <= bw - 30 ? 2 : 1;
    Fo.draw(g, line, cx, y + 86, { scale: ls, scheme: 'white' });
    Fo.draw(g, got ? (who || 'SOMEONE ONLINE') + ' INVITED YOU TO ROOM ' + pop.code : 'THEY GET A POP-UP TO JOIN YOUR GAME', cx, y + 112, { scale: 1, scheme: 'cyan', shadow: 0 });
    var b2 = Math.round((bw - 50) / 2), by = y + bh - 58;
    var yes = got ? function () { joinThem(pop.code); } : function () { inviteThem(); };
    var no = got ? function () { INV.no[pop.code] = 1; INV.got = null; } : function () { INV.ask = null; INV.snooze = nowMs() + 300000; };
    button(g, 'popyes', x + 18, by, b2, 42, got ? 'JOIN' : who ? 'CHALLENGE' : 'INVITE', { color: '#1fb04c', size: 2, fn: yes });
    button(g, 'popno', x + bw - 18 - b2, by, b2, 42, got ? 'NO THANKS' : 'NOT NOW', { on: false, size: 2, fn: no });
    if (In.enter) yes(); else if (In.pauseDown) no();
  }

  UI.drawMenu = function (g, dt) {
    UI.t += dt; UI.btns = []; var s = UI.screen, st = UI.st, T = HW.TEAMS;
    var fr = Math.floor(UI.t * 12);
    // a pop-up over this screen takes the input: the screen under it is drawn without any
    var pop = popFor(s), held = null, pk = pop && pop.kind + (pop.code || ''), fresh = pk !== INV.key;
    if (pk && fresh) { Au.chime && Au.chime(); try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([70, 50, 70]); } catch (e) { } }
    INV.key = pk; UI.popOn = !!pop;
    if (pop) { held = { tap: In.tap, enter: In.enter, esc: In.pauseDown }; In.tap = null; In.enter = false; In.pauseDown = false; In.nav = null; In.digits.length = 0; }
    if (s === 'title') {
      var C = card(g, '#141a6a'), W = X.W, cx = Math.round((C.L + C.R) / 2);
      g.drawImage(rays(C), C.L, C.T);
      // logo: FAM over a big flaming JAM with a ball behind it
      var big = C.W >= 600 ? 9 : 8, by = C.T + 140;
      var ball = bigBall(); g.drawImage(ball, cx - ball.width / 2, by - ball.height / 2 - 4);
      flaming(g, 'JAM', cx, by, { scale: big, scheme: 'fire', outline: 3, shadow: 4, shadowColor: '#3a0800' }, fr);
      Fo.draw(g, 'FAM', cx, C.T + 42, { scale: 6, scheme: 'white', outline: 2, shadow: 3, shadowColor: '#0a1050' });   // in front of JAM's flames
      var e0 = emblem(0, 2), e1 = emblem(1, 2), ex = Math.min(C.W * 0.36, (C.W - 60) / 2 - 64);
      if (C.W >= 520) { g.drawImage(e0, Math.round(cx - ex - 64), C.T + 50); g.drawImage(e1, Math.round(cx + ex - 64), C.T + 50); Fo.draw(g, T[0].name, cx - ex, C.T + 190, { scale: 2, color: T[0].color }); Fo.draw(g, T[1].name, cx + ex, C.T + 190, { scale: 2, color: T[1].color }); }
      if (C.W >= 520) Fo.draw(g, 'VS', cx, C.T + 230, { scale: 3, scheme: 'red' });
      else Fo.draw(g, T[0].name + ' VS ' + T[1].name, cx, C.T + 230, { scale: 2, scheme: 'red' });
      Fo.draw(g, '2 ON 2 ARCADE BASKETBALL', cx, C.T + 258, { scale: 1, scheme: 'cyan' });
      var go = HW.TOUCH ? 'TAP TO START' : 'CLICK TO START';
      if (blink()) Fo.draw(g, go, cx, C.T + 286, { scale: 2, scheme: 'yellow' });
      if (!HW.TOUCH) Fo.draw(g, 'MOVE: ARROWS  SHOOT: J  PASS: K  TURBO: L/SHIFT  PAUSE: P', cx, C.B - 10, { scale: 1, scheme: 'gray', shadow: 0 });
      UI.btns.push({ id: 'start', x: 0, y: 0, w: W, h: X.H, fn: function () { UI.show('team'); } });
      // the ONLINE button (play the family on their own phones) and who's on right now (presence.js), as big as fits in the
      // bottom-right corner beside TAP TO START
      var Pr = HW.Presence, Ct = HW.Count, colR = C.R - 8, colW = colR - (cx + Fo.measure(go, 2) / 2 + 14);
      var obw = Math.round(Math.max(110, Math.min(200, colW))), big = obw >= 168, obh = big ? 46 : 34, obx = colR - obw, oby = C.T + 244;
      if (HW.Net) button(g, 'online', obx, oby, obw, obh, 'ONLINE', { color: '#22c4f2', size: big ? 3 : 2, fn: function () { UI.show('online'); } });
      if (Pr && Pr.ok && Pr.count > 0) {
        var ot = Pr.count + ' ONLINE NOW', os = 2;
        if (Fo.measure(ot, 2) > colW + 8) ot = Pr.count + ' ONLINE';
        if (Fo.measure(ot, 2) > colW + 8) { ot = Pr.count + ' ONLINE NOW'; os = 1; }
        Fo.draw(g, ot, Math.min(obx + obw / 2, C.R - 4 - Fo.measure(ot, os) / 2), oby + obh + (os === 2 ? 14 : 10), { scale: os, scheme: 'green', shadow: os === 2 ? 2 : 0 });
      }
      // how many have played (count.js); on the owner's own devices, bottom left, also how many of those were his and how many everyone
      // else's (the split started after the first Ct.PRE games, which can't be told apart)
      var tot = Ct ? [Ct.games != null ? Ct.games + ' GAMES PLAYED' : '', Ct.players != null ? Ct.players + (Ct.players === 1 ? ' PLAYER' : ' PLAYERS') : ''].filter(Boolean).join('   ') : '';
      var y0 = HW.TOUCH ? C.B - 10 : C.B - 24;
      if (tot && Ct.owner != null && Ct.games != null) {
        var oth = Math.max(0, Ct.games - Ct.owner - Ct.PRE);
        Fo.draw(g, tot, C.L + 10, y0 - 14, { scale: 1, scheme: 'gray', shadow: 0, align: 'left' });
        Fo.draw(g, Ct.owner + ' BY YOU, ' + oth + ' BY OTHERS' + (Ct.PRE ? ' (+' + Ct.PRE + ' FROM BEFORE)' : ''), C.L + 10, y0, { scale: 1, scheme: 'white', shadow: 0, align: 'left' });
      } else if (tot) Fo.draw(g, tot, cx, y0, { scale: 1, scheme: 'gray', shadow: 0 });
      if (HW.Notify && HW.Notify.marked) ['GOT IT: THIS DEVICE WON\'T', 'SEND YOU NOTIFICATIONS'].forEach(function (t, i) { Fo.draw(g, t, C.L + 10, C.T + 10 + i * 12, { scale: 1, scheme: 'green', shadow: 0, align: 'left' }); });   // (opened with ?me; top left, clear of the logo)
      if (In.enter) UI.show('team');
    } else if (s === 'team') {
      drawTeamCard(g, fr);
    } else if (s === 'matchup') {
      drawMatchup(g, fr);
    } else if (s === 'paused') {
      var C2 = card(g), cx2 = Math.round((C2.L + C2.R) / 2), G = HW.Jam;
      flaming(g, 'PAUSED', cx2, C2.T + 34, { scale: 4, scheme: 'yellow', outline: 2, shadow: 2 }, fr);
      scoreLine(g, cx2, C2.T + 74);
      var bw = Math.min(240, C2.W * 0.4);
      var onl = HW.Net && HW.Net.playing(), resume = function () { UI.screen = null; if (!onl) HW.Jam.phase = UI.prevPhase || 'play'; };
      button(g, 'resume', cx2 - bw - 6, C2.T + 98, bw, 40, 'RESUME', { color: '#1fb04c', size: 2, fn: resume });
      button(g, 'quit', cx2 + 6, C2.T + 98, bw, 40, onl ? 'LEAVE GAME' : 'QUIT', { color: '#e0302a', size: 2, fn: function () { UI.show('title'); HW.Jam.players = []; } });
      if (onl) Fo.draw(g, HW.Net.mode === 'host' ? 'ONLINE: THE GAME KEEPS GOING. IF YOU LEAVE, IT ENDS FOR EVERYONE' : 'ONLINE: THE GAME KEEPS GOING. IF YOU LEAVE, THE CPU PLAYS FOR YOU', cx2, C2.T + 148, { scale: 1, scheme: 'cyan', shadow: 0 });
      var hy = C2.T + (onl ? 158 : 152); bevel(g, C2.L + 6, hy, C2.W - 12, C2.B - hy - 6, '#000', CY, 3);
      var help = HW.TOUCH ?
        [['TURBO:', 'PUSH THE STICK PAST ITS RING'], ['SHOOT:', 'HOLD, LET GO AT THE TOP OF THE JUMP'], ['DUNK:', 'DUNK BUTTON, OR TURBO + SHOOT AT THE RIM (BALL HANDLERS LAY IT UP)'], ['DEFENSE:', 'PASS = STEAL  SHOVE  SHOOT = BLOCK'], ['NO BALL:', 'PASS = CALL FOR IT  SHOVE  SHOOT = TEAMMATE SHOOTS']] :
        [['SHOOT:', 'HOLD, LET GO AT THE TOP OF THE JUMP'], ['DUNK:', 'TURBO + SHOOT NEAR THE RIM'], ['DEFENSE:', 'PASS = STEAL  TURBO+PASS = SHOVE  SHOOT = BLOCK'], ['NO BALL:', 'PASS = CALL FOR IT  TURBO+PASS = SHOVE'], ['ON FIRE:', '3 BUCKETS IN A ROW']];
      var lx = C2.L + 20, sc = C2.W > 620 ? 2 : 1, lh = sc === 2 ? 0 : 0;
      var fitsBig = help.every(function (r) { return Fo.measure(r[0] + ' ' + r[1], 2) + 8 < C2.W - 40; }); sc = fitsBig ? 2 : 1;
      help.forEach(function (r, i) { var yy = hy + 18 + i * (sc === 2 ? 30 : 22) + lh; var w1 = Fo.draw(g, r[0], lx, yy, { scale: sc, scheme: 'yellow', align: 'left' }); Fo.draw(g, r[1], lx + w1 + 4 * sc, yy, { scale: sc, scheme: 'white', align: 'left' }); });
      if (In.enter) resume();
    } else if (s === 'results') {
      drawResults(g, fr, dt);
    } else if (s === 'online') drawOnline(g, fr);
    else if (s === 'who') drawWho(g, fr);
    else if (s === 'join') drawJoin(g, fr);
    else if (s === 'lobby') drawLobby(g, fr);
    else if (s === 'neterr') drawNetErr(g, fr);
    if (pop && UI.screen === s) { UI.btns = []; if (!fresh) { In.tap = held.tap; In.enter = held.enter; In.pauseDown = held.esc; } drawPop(g, pop); }   // (not the press that brought it up: Esc pausing the game)
    if (In.tap) { for (var i = UI.btns.length - 1; i >= 0; i--) { var b = UI.btns[i]; if (!b.disabled && In.tap.x >= b.x && In.tap.x <= b.x + b.w && In.tap.y >= b.y && In.tap.y <= b.y + b.h) { Au.click(); b.fn && b.fn(); break; } } }
  };

  // spotlight rays behind the title logo
  var raysC = null;
  function rays(C) {
    if (raysC && raysC.width === C.W && raysC.height === C.H) return raysC;
    var c = raysC = canvas(C.W, C.H), g = c.getContext('2d'), ox = C.W / 2, oy = C.H * 0.42;
    g.fillStyle = '#141a6a'; g.fillRect(0, 0, C.W, C.H); g.fillStyle = '#232c9a';
    for (var i = 0; i < 18; i++) { var a = i / 18 * 6.283, b = a + 6.283 / 36; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a) * 900, oy + Math.sin(a) * 900); g.lineTo(ox + Math.cos(b) * 900, oy + Math.sin(b) * 900); g.closePath(); g.fill(); }
    return pixelize(c, { pal: ['#141a6a', '#232c9a'] });
  }
  var bigBallC = null;
  function bigBall() {
    if (bigBallC) return bigBallC;
    var c = canvas(84, 84), g = c.getContext('2d');
    g.fillStyle = '#000'; g.beginPath(); g.arc(42, 42, 41, 0, 6.283); g.fill();
    g.fillStyle = '#a8460c'; g.beginPath(); g.arc(42, 42, 39.5, 0, 6.283); g.fill();
    g.fillStyle = '#f07a26'; g.beginPath(); g.arc(39, 39, 35, 0, 6.283); g.fill();
    g.fillStyle = '#ffb070'; g.beginPath(); g.arc(28, 26, 11, 0, 6.283); g.fill();
    g.strokeStyle = '#1a0a02'; g.lineWidth = 3; g.beginPath(); g.moveTo(3, 42); g.lineTo(81, 42); g.moveTo(42, 3); g.lineTo(42, 81); g.stroke();
    g.beginPath(); g.arc(-4, 42, 30, -1.15, 1.15); g.stroke(); g.beginPath(); g.arc(88, 42, 30, 1.99, 4.29); g.stroke();
    pixelize(c, { pal: ['#000000', '#1a0a02', '#a8460c', '#f07a26', '#ffb070'] });
    return bigBallC = up(c, 2);
  }

  // Gator's card: his picture for 5 s, then his twerk for 5 s (cross-fading), back and forth
  function twerkCard(g, id, x, y, w, h) {
    X.loadPlayer(id); if (!X.hasAnim({ id: id }, 'twerk')) return;   // his sprites (loaded once)
    var c = UI.t % 10, a = c < 5 ? 0 : Math.max(0, Math.min(1, (c - 5) / 0.35, (10 - c) / 0.35)); if (a <= 0) return;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalAlpha = a;
    g.fillStyle = PB; g.fillRect(x, y, w, h);
    X.drawFrameAt(g, id, 'twerk', Math.floor(UI.t / 0.05) % 6, x + w * 0.5, y + h - 18, h * 0.6);
    g.restore();
  }
  function drawTeamCard(g, fr) {
    var st = UI.st, T = HW.TEAMS, t = T[st.team]; fixPicks();
    var C = card(g), aw = 30, cL = C.L + aw + 4, cR = C.R - aw - 4, cw = cR - cL;
    var CW = Math.max(132, Math.min(230, cw - 2 * 214 - 12)), PWd = Math.floor((cw - CW - 12) / 2) & ~1, PH = 172, py = C.T + 1, divY = py + PH;
    var mid = Math.round((C.L + C.R) / 2);
    // portraits on the blue, emblem and team name between them
    [0, 1].forEach(function (slot) {
      var id = st.picks[slot], x = slot ? cR - PWd : cL, pc = portrait(id, PWd, PH);
      g.drawImage(pc, x, py);
      if (HW.PLAYERS[id].powerup === 'twerk') twerkCard(g, id, x, py, PWd, PH);
      // the player you control gets a glowing yellow frame; the computer's teammate is dimmed
      if (st.ctrl === id) { var gl = blink(2) ? '#ffe14d' : '#ffb000'; g.fillStyle = gl; g.fillRect(x, py, PWd, 3); g.fillRect(x, py + PH - 3, PWd, 3); g.fillRect(x, py, 3, PH); g.fillRect(x + PWd - 3, py, 3, PH); }
      else { g.fillStyle = 'rgba(5,6,20,0.45)'; g.fillRect(x, py, PWd, PH); }
      UI.btns.push({ id: 'slot' + slot, x: x, y: py, w: PWd, h: PH, fn: function () { cycle(slot, 1); } });
      var ax = slot ? x - 2 : x + PWd - 36;
      arrowBtn(g, 'up' + slot, ax, py + 6, 38, 40, 'u', function () { cycle(slot, -1); });
      arrowBtn(g, 'dn' + slot, ax, py + 50, 38, 40, 'd', function () { cycle(slot, 1); });
    });
    // pick a team: one button per family, the chosen one lit in its colors; under them, the family you play against (tap to switch)
    Fo.draw(g, 'PICK YOUR TEAM', mid, py + 9, { scale: 1, scheme: 'cyan', shadow: 0 });
    // (four teams: the rows closer together, so the VS row still fits above the divider)
    var tbw = Math.min(CW, 200), tbx = Math.round(mid - tbw / 2), rp = T.length > 3 ? 22 : 27, rh = T.length > 3 ? 20 : 24, r0 = T.length > 3 ? 15 : 16;
    T.forEach(function (tt, i) {
      var on = st.team === i, by = py + r0 + i * rp;
      button(g, 'team' + i, tbx, by, tbw, rh, tt.name.toUpperCase(), { on: on, size: 2, color: tt.color, fn: function () { if (st.team !== i) switchTeam(i - st.team); } });
      if (on) { var ar = tri('r', 6, '#ffe14d'); g.drawImage(ar, tbx - ar.width - 3 - (Math.floor(UI.t * 3) % 2), by + (rh >> 1) - (ar.height >> 1)); }
    });
    var oy = py + r0 + T.length * rp + (T.length > 3 ? 5 : 6), ot = T[st.opp];
    g.drawImage(emblem(st.team, 1), tbx + 4, oy - 6, 30, 30); g.drawImage(emblem(st.opp, 1), tbx + tbw - 34, oy - 6, 30, 30);
    flaming(g, 'VS', mid, oy + 9, { scale: 2, scheme: 'fire', outline: 1, shadow: 1 }, fr);
    button(g, 'opp', tbx, oy + 28, tbw, 24, ot.name.toUpperCase(), { on: true, size: 2, color: ot.color, fn: function () { nextOpp(1); } });
    var al = tri('l', 5, '#ffe14d'), arr = tri('r', 5, '#ffe14d'); g.drawImage(al, tbx + 5, oy + 40 - (al.height >> 1)); g.drawImage(arr, tbx + tbw - 5 - arr.width, oy + 40 - (arr.height >> 1));
    // big arrows on the card edges switch team
    arrowBtn(g, 'tprev', C.oL - 6, C.T + 58, aw + 8, 90, 'l', function () { switchTeam(-1); }, true);
    arrowBtn(g, 'tnext', C.oR - aw - 2, C.T + 58, aw + 8, 90, 'r', function () { switchTeam(1); }, true);
    // divider, then black name/stat panels left and right with the controls in the middle
    g.fillStyle = CY; g.fillRect(C.L - 1, divY, C.W + 2, 4); g.fillStyle = Fo.shade(CY, 0.55); g.fillRect(C.L - 1, divY, C.W + 2, 1); g.fillStyle = '#000'; g.fillRect(C.L, divY + 4, C.W, C.B - divY - 4);
    var pTop = divY + 4, pH = C.B - pTop, colL = cL, colR = cR - PWd, ccx = cL + PWd + 6, ccw = CW;
    g.fillStyle = CY; g.fillRect(ccx - 4, pTop, 3, pH); g.fillRect(ccx + ccw + 1, pTop, 3, pH);
    var notch = tri('d', 9, CY); g.drawImage(notch, Math.round(mid - notch.width / 2), divY - 3);
    [0, 1].forEach(function (slot) {
      var id = st.picks[slot], d = HW.PLAYERS[id], x = slot ? colR : colL, cxp = x + PWd / 2, me = st.ctrl === id;
      Fo.draw(g, d.first, cxp, pTop + 22, nameFit(d.first, PWd - 4, { scheme: 'white', shadowColor: Fo.shade(d.color, -0.4) }));
      Fo.draw(g, HW.TYPES[d.type].label, cxp, pTop + 40, { scale: 1, color: d.color });
      statLines(g, d, x + 2, pTop + 58, PWd - 4, 2, 20);
      if (me) Fo.draw(g, HW.TYPES[d.type].blurb, cxp, C.B - 10, { scale: 1, scheme: 'gray', shadow: 0 });
      else button(g, 'as' + slot, x + 8, C.B - 22, PWd - 16, 18, 'PLAY AS ' + d.first.toUpperCase(), { size: 1, color: '#22c4f2', fn: function () { if (st.ctrl !== id) { st.ctrl = id; Au.click(); } } });
      if (me) bigTab(g, slot ? x + PWd - 34 : x + 34, py + 8, 'YOU', '#ffd23f'); else tab(g, cxp, divY - 8, 'CPU', '#5a5e7a', false);   // YOU in the portrait's free top corner (the arrows sit in the other one)
      UI.btns.push({ id: 'ctrl' + slot, x: x, y: pTop, w: PWd, h: pH, fn: function () { if (st.ctrl !== id) { st.ctrl = id; Au.click(); } } });
    });
    var bw = Math.floor((ccw - 8) / 3);
    DIFFS.forEach(function (dk, i) { button(g, 'd' + dk, ccx + i * (bw + 4), pTop + 22, bw, 20, dk.toUpperCase(), { on: st.diff === dk, size: 1, color: ['#1fb04c', '#ffc61a', '#e0302a'][i], fn: function () { st.diff = dk; } }); });
    // quarter length
    Fo.draw(g, 'QUARTER LENGTH', mid, pTop + 52, { scale: 1, scheme: 'gray', shadow: 0 });
    var qw = Math.floor((ccw - 12) / 4);
    QLENS.forEach(function (q, i) { button(g, 'q' + q, ccx + i * (qw + 4), pTop + 60, qw, 20, clockText(q), { on: st.qlen === q, size: 1, color: '#22c4f2', fn: function () { st.qlen = q; try { localStorage.setItem('famjam.qlen', q); } catch (e) { } } }); });
    button(g, 'go', ccx, pTop + 88, ccw, 38, 'PLAY', { size: 3, fn: function () { UI.matchup(); } });
    button(g, 'back', ccx + ccw / 2 - 40, pTop + 132, 80, 22, 'BACK', { on: false, size: 1, fn: function () { UI.show('title'); } });
    if (In.nav === 'ArrowLeft') switchTeam(-1); else if (In.nav === 'ArrowRight') switchTeam(1);
    else if (In.nav === 'ArrowUp' || In.nav === 'ArrowDown') cycle(st.picks.indexOf(st.ctrl), In.nav === 'ArrowUp' ? -1 : 1);
    if (In.enter) UI.matchup();
  }

  // a player's name at scale 2, squeezed to half width (same height) when it won't fit w (UNCLE KENNY on a small phone)
  function nameFit(text, w, o) { o.sy = 2; o.sx = Fo.measure(text, 2) + 4 <= w ? 2 : 1; return o; }
  function drawMatchup(g, fr) {
    var m = UI.mu, T = HW.TEAMS, C = card(g), mid = Math.round((C.L + C.R) / 2), vsW = 70, gap = 4;
    var PWm = Math.floor((C.W - vsW - 2 * gap - 8) / 4) & ~1, PH = 150, hy = C.T + 18, py = C.T + 34, divY = py + PH;
    var order = [m.teams[0].indexOf(m.human) >= 0 ? 0 : 1]; order.push(1 - order[0]);
    g.fillStyle = '#000'; g.fillRect(C.L, divY + 4, C.W, C.B - divY - 4);
    g.fillStyle = CY; g.fillRect(C.L - 1, divY, C.W + 2, 4); g.fillStyle = Fo.shade(CY, 0.55); g.fillRect(C.L - 1, divY, C.W + 2, 1);
    var pTop = divY + 4, stripY = C.B - 34;
    g.fillStyle = CY; g.fillRect(C.L - 1, stripY, C.W + 2, 3);
    order.forEach(function (ti, side) {
      var x0 = side ? mid + vsW / 2 + gap : C.L + 4, tf = T[m.fams ? m.fams[ti] : ti], tt = m.names && m.names[ti] ? Object.assign({}, tf, m.names[ti]) : tf;
      Fo.draw(g, tt.name, x0 + PWm + gap / 2, hy, { scale: 2, color: tt.color });
      m.teams[ti].forEach(function (id, k) {
        var x = x0 + k * (PWm + gap), d = HW.PLAYERS[id], cxp = x + PWm / 2, me = id === m.human;
        g.drawImage(portrait(id, PWm, PH), x, py);
        if (k === 0) { g.fillStyle = CY; g.fillRect(x + PWm + 1, pTop, 2, stripY - pTop); }
        Fo.draw(g, d.first, cxp, pTop + 16, nameFit(d.first, PWm - 4, { scheme: 'white', shadowColor: Fo.shade(d.color, -0.4) }));
        Fo.draw(g, HW.TYPES[d.type].label, cxp, pTop + 33, { scale: 1, color: d.color });
        statLines(g, d, x + 2, pTop + 48, PWm - 4, 1, 12);
        var who = me ? 'YOU' : m.humans && m.humans[id] || 'CPU';   // online: the other people's P2, P3...
        tab(g, cxp, divY - 8, who, me ? '#ffd23f' : who !== 'CPU' ? '#1aa6d8' : '#5a5e7a', me);
      });
    });
    g.fillStyle = CY; g.fillRect(mid - vsW / 2 - 2, pTop, 3, stripY - pTop); g.fillRect(mid + vsW / 2, pTop, 3, stripY - pTop);
    flaming(g, 'VS', mid, py + PH / 2, { scale: 4, scheme: 'fire', outline: 2, shadow: 3 }, fr);
    var e0 = emblem(m.fams ? m.fams[order[0]] : order[0], 1), e1 = emblem(m.fams ? m.fams[order[1]] : order[1], 1);
    if (vsW >= 64) { g.drawImage(e0, mid - 32, pTop + 4, 32, 32); g.drawImage(e1, mid, pTop + 50, 32, 32); }
    Fo.draw(g, (HW.DIFFICULTY[m.diff] || { label: 'NORMAL' }).label + '   ' + clockText(m.qlen || 60) + ' QUARTERS', C.L + 14, stripY + 18, { scale: 1, scheme: 'gray', align: 'left', shadow: 0 });
    var Net = HW.Net, wait = m.online && Net && Net.mode === 'host' ? Net.waiting() : [];
    if (UI.loading) Fo.draw(g, 'LOADING...', mid, stripY + 18, { scale: 2, scheme: 'white' });
    else if (m.online && Net && Net.mode !== 'host') { if (blink()) Fo.draw(g, 'WAITING FOR P1 TO TIP OFF', mid, stripY + 18, { scale: 2, scheme: 'yellow' }); }
    else if (wait.length) Fo.draw(g, 'WAITING FOR ' + wait.join(' + ') + '...', mid, stripY + 18, { scale: 2, scheme: 'white' });
    else if (m.online) {
      if (blink()) Fo.draw(g, HW.TOUCH ? 'TAP TO TIP OFF' : 'CLICK TO TIP OFF', mid, stripY + 18, { scale: 2, scheme: 'yellow' });
      UI.btns.push({ id: 'tip', x: 0, y: 0, w: X.W, h: X.H, fn: function () { Net.go(); } }); if (In.enter) Net.go();
    } else {
      if (blink()) Fo.draw(g, HW.TOUCH ? 'TAP TO TIP OFF' : 'CLICK TO TIP OFF', mid, stripY + 18, { scale: 2, scheme: 'yellow' });
      var go = function () { UI.screen = null; HW.Jam.start(m); };
      UI.btns.push({ id: 'tip', x: 0, y: 0, w: X.W, h: X.H, fn: go }); if (In.enter) go();
    }
  }
  UI.matchup = function () {
    var st = UI.st, T = HW.TEAMS; fixOpp(); var mate = st.picks.filter(function (id) { return id !== st.ctrl; })[0], teams = [null, null];
    var opp = T[st.opp].roster.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    var fams = st.team < st.opp ? [st.team, st.opp] : [st.opp, st.team], mine = fams.indexOf(st.team);
    teams[mine] = [st.ctrl, mate]; teams[1 - mine] = opp;
    UI.mu = { teams: teams, fams: fams, human: st.ctrl, diff: st.diff, qlen: st.qlen || 60 }; UI.screen = 'matchup'; UI.loading = true;
    Promise.all(HW.Jam.loadIds(teams).map(X.loadPlayer)).then(function () { UI.loading = false; });
  };

  /* ---------- online: host or join, the room-code keypad, the lobby, and when it goes wrong ---------- */
  function wrapText(text, w, sc) {
    var lines = [], cur = ''; text.split(' ').forEach(function (wd) { var t = cur ? cur + ' ' + wd : wd; if (cur && Fo.measure(t, sc) > w) { lines.push(cur); cur = wd; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function drawOnline(g, fr) {
    if (!UI.whoAsked()) { UI.whoNext = 'online'; UI.screen = 'who'; drawWho(g, fr); return; }   // the first time: who are you?
    var C = card(g), cx = Math.round((C.L + C.R) / 2), Net = HW.Net;
    flaming(g, 'PLAY ONLINE', cx, C.T + 36, { scale: 4, scheme: 'fire', outline: 2, shadow: 2 }, fr);
    Fo.draw(g, 'THE FAMILY ON THEIR OWN PHONES, FROM ANYWHERE', cx, C.T + 72, { scale: 1, scheme: 'cyan', shadow: 0 });
    var bw = Math.floor(Math.min(250, (C.W - 40) / 2)), by = C.T + 90, bh = 56;
    button(g, 'host', cx - bw - 8, by, bw, bh, 'HOST A GAME', { color: '#1fb04c', size: 2, fn: function () { Net.host(); UI.show('lobby'); } });
    button(g, 'joinb', cx + 8, by, bw, bh, 'JOIN A GAME', { color: '#1aa6d8', size: 2, fn: function () { UI.code = ''; UI.show('join'); } });
    Fo.draw(g, 'GET A CODE TO SEND', cx - bw / 2 - 8, by + bh + 13, { scale: 1, scheme: 'white', shadow: 0 });
    Fo.draw(g, 'TYPE THE HOST\'S CODE', cx + bw / 2 + 8, by + bh + 13, { scale: 1, scheme: 'white', shadow: 0 });
    var hy = by + bh + 28, hh = C.B - hy - 40; bevel(g, C.L + 6, hy, C.W - 12, hh, '#000', CY, 3);
    var Pr = HW.Presence, others = Pr && Pr.ok ? Pr.people : [];
    if (others.length) drawOnNow(g, C, hy, hh, others);   // who's on, each with a CHALLENGE button
    else ['1. ONE PERSON HOSTS AND SENDS THE CODE OR THE INVITE LINK', '2. EVERYONE ELSE JOINS AND PICKS WHO THEY PLAY', '3. THE HOST STARTS IT. ANY EMPTY SPOTS ARE CPU', 'UP TO 4 PEOPLE, 2 ON A TEAM'].forEach(function (t, i) {
      Fo.draw(g, t, C.L + 20, hy + 18 + i * Math.min(20, (hh - 24) / 4), { scale: 1, scheme: i === 3 ? 'yellow' : 'white', align: 'left', shadow: 0 });
    });
    button(g, 'back', cx - 40, C.B - 30, 80, 24, 'BACK', { on: false, size: 1, fn: function () { UI.show('title'); } });
    // who you are (change it), bottom left
    var me = UI.who(), mw = Math.min(150, cx - 52 - C.L - 6);
    button(g, 'whoami', C.L + 6, C.B - 30, mw, 24, me ? 'YOU: ' + nameOf(me) : 'WHO ARE YOU?', { on: !!me, color: '#7a3cc8', size: 1, fn: function () { UI.whoNext = 'online'; UI.show('who'); } });
    // who's on: big at the bottom right if it fits beside BACK
    if (Pr && Pr.ok && Pr.count > 0) { var pt = Pr.count === 1 ? 'JUST YOU ONLINE NOW' : Pr.count + ' PEOPLE ONLINE NOW', ps = Fo.measure(pt, 2) <= C.R - 10 - (cx + 52) ? 2 : 1; Fo.draw(g, pt, C.R - 10, C.B - 18, { scale: ps, scheme: 'green', shadow: ps === 2 ? 2 : 0, align: 'right' }); }
    if (In.enter) { Net.host(); UI.show('lobby'); }
  }
  // the ON NOW list on the online screen: everyone else online - their face and name if they picked who they are, what they're up
  // to, and a CHALLENGE button (you host a room and it pops up on their screen); CHALLENGE ALL sends it to everyone who's free
  var DOING = { m: 'ON THE MENUS', c: 'PLAYING THE CPU', h: 'HOSTING A ROOM', r: 'IN SOMEONE\'S ROOM', g: 'IN AN ONLINE GAME' };
  function drawOnNow(g, C, hy, hh, others) {
    var free = others.filter(function (q) { return q.st !== 'r' && q.st !== 'g'; }), rowH = Math.floor((hh - 30) / 34) >= Math.min(others.length, Math.floor((hh - 30) / 30)) ? 34 : 30, rows = Math.max(1, Math.floor((hh - 30) / rowH)), x0 = C.L + 18, bw = 132;
    Fo.draw(g, 'ON NOW', x0, hy + 14, { scale: 1, scheme: 'yellow', align: 'left', shadow: 0 });
    if (free.length > 1) button(g, 'chall', C.R - 16 - bw, hy + 5, bw, 20, 'CHALLENGE ALL', { color: '#e0302a', size: 1, fn: function () { inviteThem(null, ''); } });
    others.slice(0, others.length > rows ? rows - 1 : rows).forEach(function (q, i) {
      var y = hy + 28 + i * rowH, nm = nameOf(q.nm), busy = q.st === 'r' || q.st === 'g', fx = x0;
      if (nm) { var f = miniFace(q.nm, rowH - 6); g.drawImage(f, fx, y); fx += f.width + 8; }
      else { g.fillStyle = '#2a2d5c'; g.fillRect(fx, y + 2, rowH - 8, rowH - 8); Fo.draw(g, '?', fx + (rowH - 8) / 2, y + rowH / 2 - 1, { scale: 2, scheme: 'white', shadow: 0 }); fx += rowH; }
      var w1 = Fo.draw(g, nm || 'SOMEONE', fx, y + 9, { scale: 2, scheme: nm ? 'white' : 'gray', align: 'left', shadow: 0 });
      Fo.draw(g, (q.dv === 'c' ? 'ON A COMPUTER, ' : 'ON A PHONE, ') + DOING[q.st || 'm'], fx, y + 22, { scale: 1, scheme: busy ? 'gray' : 'green', align: 'left', shadow: 0 });
      button(g, 'ch' + q.id, C.R - 16 - bw, y + 2, bw, rowH - 6, busy ? 'BUSY' : 'CHALLENGE', { color: '#1fb04c', size: 1, disabled: busy, fn: function () { inviteThem(q.id, nm); } });
    });
    if (others.length > rows) Fo.draw(g, '+' + (others.length - rows + 1) + ' MORE ON', x0, hy + 28 + (rows - 1) * rowH + 12, { scale: 1, scheme: 'gray', align: 'left', shadow: 0 });
  }
  // WHO ARE YOU? - pick yourself from the family once on this phone, so the others see who's on and can challenge you
  function drawWho(g, fr) {
    var C = card(g), cx = Math.round((C.L + C.R) / 2), T = HW.TEAMS, cur = UI.who();
    flaming(g, 'WHO ARE YOU?', cx, C.T + 28, { scale: 3, scheme: 'fire', outline: 2, shadow: 2 }, fr);
    Fo.draw(g, 'SO THE FAMILY CAN SEE WHO\'S ON AND CHALLENGE YOU', cx, C.T + 56, { scale: 1, scheme: 'cyan', shadow: 0 });
    var NF = T.length, pw = Math.floor((C.W - 4 * (NF + 1)) / NF), py = C.T + 68, maxR = 0;
    T.forEach(function (Tm) { maxR = Math.max(maxR, Tm.roster.length); });
    var rowH = Math.min(36, Math.floor((C.B - 36 - py - 26) / maxR)), done = function (id) { setWho(id); UI.show(UI.whoNext || 'online'); };
    T.forEach(function (Tm, ti) {
      var x = C.L + 4 + ti * (pw + 4);
      bevel(g, x, py, pw, 26 + Tm.roster.length * rowH + 4, '#06081e', Tm.color, 3);
      Fo.draw(g, Tm.name.toUpperCase(), x + pw / 2, py + 14, { scale: 2, color: Tm.color });
      Tm.roster.forEach(function (id, r) {
        var y = py + 26 + r * rowH, f = miniFace(id, rowH - 4), d = HW.PLAYERS[id];
        if (cur === id) { g.fillStyle = blink(2) ? '#ffe14d' : '#ffb000'; g.fillRect(x + 5, y, pw - 10, rowH - 1); g.fillStyle = '#06081e'; g.fillRect(x + 7, y + 2, pw - 14, rowH - 5); }
        g.drawImage(f, x + 10, y + 2);
        Fo.draw(g, d.first, x + 16 + f.width, y + rowH / 2, nameFit(d.first, pw - f.width - 30, { scheme: 'white', align: 'left', shadow: 0 }));
        UI.btns.push({ id: 'who' + id, x: x + 4, y: y, w: pw - 8, h: rowH - 1, fn: function () { done(id); } });
      });
    });
    button(g, 'whoskip', cx - 60, C.B - 30, 120, 24, cur ? 'BACK' : 'SKIP', { on: false, size: 1, fn: function () { if (!cur) setWho('-'); UI.show(UI.whoNext || 'online'); } });
  }
  function drawJoin(g, fr) {
    var C = card(g), cx = Math.round((C.L + C.R) / 2), Net = HW.Net, code = UI.code || '', busy = Net.mode === 'guest' && Net.stage === 'connecting';
    Fo.draw(g, busy ? 'JOINING ROOM ' + Net.code + '...' : 'TYPE THE ROOM CODE', cx, C.T + 18, { scale: 2, scheme: busy ? 'yellow' : 'cyan' });
    var bw0 = 46, gap = 10, x0 = Math.round(cx - (4 * bw0 + 3 * gap) / 2), shown = busy ? Net.code : code;
    for (var i = 0; i < 4; i++) {
      var bx = x0 + i * (bw0 + gap); bevel(g, bx, C.T + 34, bw0, 54, '#0a0c2a', !busy && i === code.length && blink(2) ? '#ffd23f' : CY, 3);
      if (shown[i]) Fo.draw(g, shown[i], bx + bw0 / 2, C.T + 61, { scale: 4, scheme: 'white' });
    }
    // the 4th digit joins
    var add = function (d) {
      if (busy) return;
      if (d === 'DEL') code = code.slice(0, -1); else if (/^\d$/.test(d) && code.length < 4) code += d;
      UI.code = code; if (code.length === 4 && (d !== 'DEL')) Net.join(code);
    };
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'JOIN'], kw = 70, kh = 34, kg = 6, kx0 = Math.round(cx - (3 * kw + 2 * kg) / 2), ky0 = C.T + 98;
    keys.forEach(function (k, i) {
      var col = i % 3, row = (i / 3) | 0;
      button(g, 'k' + k, kx0 + col * (kw + kg), ky0 + row * (kh + kg), kw, kh, k, { size: k.length > 1 ? 1 : 2, color: k === 'JOIN' ? '#1fb04c' : k === 'DEL' ? '#e0302a' : '#22c4f2', disabled: busy || (k === 'JOIN' && code.length < 4), fn: function () { if (k === 'JOIN') Net.join(code); else add(k); } });
    });
    if (!busy && HW.TOUCH) Fo.draw(g, 'GOT A LINK? JUST TAP IT', cx, C.B - 46, { scale: 1, scheme: 'gray', shadow: 0 });
    button(g, 'back', C.L + 10, C.B - 32, 90, 26, busy ? 'CANCEL' : 'BACK', { on: false, size: 1, fn: function () { if (Net.mode) Net.leave(); UI.show('online'); } });
    In.digits.forEach(add); if (In.enter && code.length === 4 && !busy) Net.join(code);
  }
  function drawLobby(g, fr) {
    var C = card(g), cx = Math.round((C.L + C.R) / 2), Net = HW.Net, isHost = Net.mode === 'host';
    if (!Net.mode) { UI.show('online'); return; }
    if (Net.stage === 'connecting') {
      flaming(g, isHost ? 'MAKING A ROOM...' : 'JOINING...', cx, C.T + 130, { scale: 3, scheme: 'yellow', outline: 2, shadow: 2 }, fr);
      button(g, 'cancel', cx - 50, C.B - 34, 100, 26, 'CANCEL', { on: false, size: 1, fn: function () { Net.leave(); UI.show('online'); } });
      return;
    }
    // the room code, big, and (host) the button that texts it to the family
    Fo.draw(g, 'ROOM CODE', C.L + 12, C.T + 10, { scale: 1, scheme: 'cyan', align: 'left', shadow: 0 });
    Fo.draw(g, Net.code, C.L + 12, C.T + 36, { scale: 4, scheme: 'fire', outline: 2, shadow: 2, align: 'left' });
    var noted = Net.note && performance.now() < (Net.noteUntil || 0);
    if (isHost) {
      button(g, 'share', C.R - 172, C.T + 6, 162, 32, navigator.share ? 'SEND INVITE' : 'COPY LINK', { color: '#1fb04c', size: 2 });   // shareTap() does it
      Fo.draw(g, noted ? Net.note : 'TEXT IT TO THE FAMILY', C.R - 10, C.T + 50, { scale: 1, scheme: noted ? 'green' : 'white', align: 'right', shadow: 0 });
    } else Fo.draw(g, 'YOU\'RE IN! TAP WHO YOU PLAY', C.R - 10, C.T + 50, { scale: 1, scheme: 'green', align: 'right', shadow: 0 });
    // together (the people on one team vs the CPU) or against each other: the host picks
    var tw = 100, tmid = Math.round((C.L + 120 + C.R - 176) / 2), ty = C.T + 6;
    [['TOGETHER', false], ['AGAINST', true]].forEach(function (o, i) {
      button(g, i ? 'vs' : 'coop', tmid - tw - 3 + i * (tw + 6), ty, tw, 26, o[0], { on: Net.vs === o[1], size: 1, color: i ? '#e0302a' : '#1fb04c', fn: isHost ? function () { Net.setVs(o[1]); } : null });
    });
    Fo.draw(g, Net.vs ? 'PEOPLE ON OPPOSITE TEAMS' : 'TEAM UP VS THE CPU (2 PEOPLE)', tmid, ty + 38, { scale: 1, scheme: Net.vs ? 'red' : 'green', shadow: 0 });
    // both families: tap a player to be him (again to let him go); people's picks are tagged, YOU flashing
    var NF = HW.TEAMS.length, py = C.T + 60, pw = Math.floor((C.W - 4 * (NF + 1)) / NF), rowH = 27, ph = 26 + 5 * rowH + 4;
    HW.TEAMS.forEach(function (T, ti) {
      var x = C.L + 4 + ti * (pw + 4);
      bevel(g, x, py, pw, ph, '#06081e', T.color, 3);
      Fo.draw(g, T.name.toUpperCase(), x + pw / 2, py + 15, { scale: 2, color: T.color });
      T.roster.forEach(function (id, r) {
        var d = HW.PLAYERS[id], y = py + 27 + r * rowH, who = Net.claimedBy(id), me = !!who && who === Net.me, f = miniFace(id, rowH - 3);
        if (me) { g.fillStyle = blink(2) ? '#ffe14d' : '#ffb000'; g.fillRect(x + 5, y, pw - 10, rowH - 1); g.fillStyle = '#06081e'; g.fillRect(x + 7, y + 2, pw - 14, rowH - 5); }
        g.globalAlpha = who && !me ? 0.45 : 1;
        g.drawImage(f, x + 10, y + 1);
        Fo.draw(g, d.first, x + 16 + f.width, y + rowH / 2, nameFit(d.first, pw - f.width - 74, { scheme: 'white', align: 'left', shadowColor: Fo.shade(d.color, -0.4) }));
        g.globalAlpha = 1;
        if (who) tab(g, x + pw - 30, y + rowH / 2 - 7, me ? 'YOU' : who, me ? '#ffd23f' : '#1aa6d8', me);
        UI.btns.push({ id: 'pick' + id, x: x + 4, y: y, w: pw - 8, h: rowH - 1, fn: function () { if (!who || me) Net.pick(id); } });
      });
    });
    // who's here, the host's settings and START; everyone else waits for it
    var by = py + ph + 9, ppl = Net.people.map(function (q) { return q.lbl + ' ' + (q.claim ? HW.PLAYERS[q.claim].first.toUpperCase() : 'PICKING...'); }).join('   ');
    Fo.draw(g, ppl, cx, by, { scale: 1, scheme: 'white', shadow: 0 });
    var y2 = by + 12;
    if (isHost) {
      var dw = 54, qw = 40, sx0 = C.L + 8;
      DIFFS.forEach(function (dk, i) { button(g, 'd' + dk, sx0 + i * (dw + 4), y2, dw, 20, dk.toUpperCase(), { on: Net.diff === dk, size: 1, color: ['#1fb04c', '#ffc61a', '#e0302a'][i], fn: function () { Net.setDiff(dk); } }); });
      QLENS.forEach(function (q, i) { button(g, 'q' + q, sx0 + 3 * (dw + 4) + 8 + i * (qw + 4), y2, qw, 20, clockText(q), { on: Net.qlen === q, size: 1, color: '#22c4f2', fn: function () { Net.setQlen(q); } }); });
      var ok = Net.canStart(), need = Net.need();
      button(g, 'start', C.R - 160, y2, 152, 50, 'START', { size: 3, disabled: !ok, fn: function () { Net.start(); } });
      Fo.draw(g, ok ? 'CPU DIFFICULTY  /  QUARTER LENGTH' : need, sx0, y2 + 32, { scale: 1, scheme: ok ? 'gray' : 'yellow', align: 'left', shadow: 0 });
      if (In.enter && ok) Net.start();
    } else {
      Fo.draw(g, 'CPU: ' + (HW.DIFFICULTY[Net.diff] || { label: 'NORMAL' }).label + '   ' + clockText(Net.qlen || 60) + ' QUARTERS', C.L + 12, y2 + 10, { scale: 1, scheme: 'gray', align: 'left', shadow: 0 });
      if (blink()) Fo.draw(g, Net.claim ? 'WAITING FOR P1 TO START' : 'PICK A PLAYER', C.R - 12, y2 + 10, { scale: 2, scheme: 'yellow', align: 'right' });
    }
    button(g, 'leave', C.L + 8, C.B - 26, 90, 22, 'LEAVE', { on: false, size: 1, fn: function () { UI.show('online'); Net.leave(); } });
  }
  function drawNetErr(g, fr) {
    var C = card(g), cx = Math.round((C.L + C.R) / 2), Net = HW.Net, msg = Net.err || 'SOMETHING WENT WRONG', badCode = /^NO (GAME|ANSWER)/.test(msg);
    flaming(g, 'UH OH!', cx, C.T + 54, { scale: 5, scheme: 'fire', outline: 2, shadow: 2 }, fr);
    wrapText(msg, C.W - 60, 2).forEach(function (t, i) { Fo.draw(g, t, cx, C.T + 116 + i * 26, { scale: 2, scheme: 'white' }); });
    var bw = Math.min(200, (C.W - 40) / 2), by = C.T + 200;
    button(g, 'retry', cx - bw - 6, by, bw, 44, badCode ? 'TYPE IT AGAIN' : 'TRY AGAIN', { color: '#1fb04c', size: 2, fn: function () {
      if (Net.lastMode === 'host') { Net.host(); UI.show('lobby'); }
      else if (badCode) { UI.code = ''; UI.show('join'); }
      else { UI.code = Net.code; UI.show('join'); Net.join(Net.code); }
    } });
    button(g, 'menu', cx + 6, by, bw, 44, 'MENU', { color: '#1aa6d8', size: 2, fn: function () { UI.show('title'); } });
  }

  function qtr(G) { return G.q > 4 ? 'OT' : ['1ST', '2ND', '3RD', '4TH'][G.q - 1]; }
  function clockStr(G) { var c = Math.max(0, G.clock), m = Math.floor(c / 60), s = Math.floor(c % 60); return c < 10 ? c.toFixed(1) : m + ':' + (s < 10 ? '0' : '') + s; }
  function scoreLine(g, cx, y) {
    var G = HW.Jam, T = [G.team(0), G.team(1)];
    Fo.draw(g, T[0].name + ' ' + G.score[0], cx - 20, y, { scale: 2, color: T[0].color, align: 'right' });
    Fo.draw(g, '-', cx, y, { scale: 2, scheme: 'white' });
    Fo.draw(g, G.score[1] + ' ' + T[1].name, cx + 20, y, { scale: 2, color: T[1].color, align: 'left' });
  }

  // the final scoreboard, over the game's highlights replaying behind it (replay.js; the plain card if there are none); it fades in
  function drawResults(g, fr, dt) {
    var G = HW.Jam, T = [G.team(0), G.team(1)], w = G.score[0] > G.score[1] ? 0 : 1, Rp = HW.Replay, reel = !!(Rp && Rp.draw(g, dt || 0));
    var C = card(g, null, reel ? 'rgba(8,10,46,0.28)' : null), cx = Math.round((C.L + C.R) / 2);
    var hc = reel && Rp.now(); if (hc) {   // a TV-style REPLAY tag, and whose highlight it is when there's room left of the title
      var rt = Fo.canvas('REPLAY', { scale: 1, scheme: 'white', shadow: 0 }), rx = C.L + 8, ry = C.T + 8;
      g.fillStyle = '#000'; g.fillRect(rx - 1, ry - 1, rt.width + 18, rt.height + 8); g.fillStyle = '#d8141e'; g.fillRect(rx, ry, rt.width + 16, rt.height + 6);
      g.fillStyle = Math.floor(UI.t * 2) % 2 ? '#fff' : '#ff9a9a'; g.fillRect(rx + 4, ry + rt.height / 2 + 1, 4, 4); g.drawImage(rt, rx + 11, ry + 3);
      var tw = Fo.measure(T[w].name + ' WIN!', C.W > 560 ? 4 : 3) / 2 + 30;
      if (hc.label && rx + Fo.measure(hc.label, 1) + 4 < cx - tw) Fo.draw(g, hc.label, rx, ry + rt.height + 16, { scale: 1, scheme: 'yellow', align: 'left' });
    }
    // the level it was played on, top right across from the replay tag (green Easy, yellow Normal, red Hard), so a screenshot says it
    var lv = ((G.diff && G.diff.label) || 'Normal').toUpperCase() + ' LEVEL', lvc = { 'EASY LEVEL': '#35e07c', 'HARD LEVEL': '#ff5a4a' }[lv] || '#ffd23f';
    var lw = Fo.measure(lv, 2) + 14, lx = C.R - 10 - lw, ly = C.T + 8; g.fillStyle = '#000'; g.fillRect(lx - 2, ly - 2, lw + 4, 26); g.fillStyle = lvc; g.fillRect(lx, ly, lw, 22);
    Fo.draw(g, lv, lx + lw / 2, ly + 11, { scale: 2, scheme: 'black', shadow: 0, outline: 0 });
    flaming(g, T[w].name + ' WIN!', cx, C.T + 30, { scale: C.W > 560 ? 4 : 3, color: T[w].color, outline: 2, shadow: 2 }, fr);
    Fo.draw(g, G.score[0] + ' - ' + G.score[1], cx, C.T + 70, { scale: 3, scheme: 'white' });
    var px = C.L + 6, pw = C.W - 12, py = C.T + 90, ph = 160; if (reel) seeBevel(g, px, py, pw, ph, 'rgba(0,0,0,0.45)', CY, 3); else bevel(g, px, py, pw, ph, '#000', CY, 3);
    var cols = [['PTS', 0.44], ['FG', 0.52], ['3PT', 0.6], ['AST', 0.68], ['DNK', 0.76], ['STL', 0.84], ['BLK', 0.92]];
    Fo.draw(g, 'PLAYER', px + 46, py + 14, { scale: 1, scheme: 'cyan', align: 'left' });
    cols.forEach(function (c) { Fo.draw(g, c[0], px + pw * c[1], py + 14, { scale: 1, scheme: 'cyan' }); });
    G.players.slice().sort(function (a, b) { return a.team - b.team || a.slot - b.slot; }).forEach(function (p, i) {
      var y = py + 42 + i * 33, sv = p.stats, f = miniFace(p.id, 30);
      if (i === 2) { g.fillStyle = '#20245a'; g.fillRect(px + 6, y - 19, pw - 12, 1); }
      g.drawImage(f, px + 12, y - 15);
      Fo.draw(g, p.def.first, px + 46, y, { scale: 2, color: p.def.color, align: 'left' });
      if (p.me) tab(g, px + 52 + Fo.measure(p.def.first, 2) + 18, y - 7, 'YOU', '#ffd23f', true);
      else if (p.lbl) tab(g, px + 52 + Fo.measure(p.def.first, 2) + 14, y - 7, p.lbl, '#1aa6d8', false);
      [sv.pts, sv.fgm + '/' + sv.fga, sv.tpm + '/' + sv.tpa, sv.ast, sv.dunks, sv.steals, sv.blocks].forEach(function (v, k) { Fo.draw(g, String(v), px + pw * cols[k][1], y, { scale: k === 1 || k === 2 ? 1 : 2, scheme: k ? 'white' : 'yellow' }); });
    });
    var bw = Math.min(220, (C.W - 30) / 2), by = py + ph + 10, bh = Math.min(40, C.B - by - 2), Net = HW.Net;
    if (Net && Net.mode === 'guest') {   // online, the host decides what's next
      if (blink()) Fo.draw(g, 'WAITING FOR P1: REMATCH OR NEW TEAMS', cx - 70, by + bh / 2, { scale: 1, scheme: 'yellow' });
      button(g, 'leave', C.R - 130, by, 120, bh, 'LEAVE', { color: '#e0302a', size: 2, fn: function () { UI.show('title'); } });
    } else if (Net && Net.mode === 'host') {
      button(g, 'again', cx - bw - 6, by, bw, bh, 'REMATCH', { size: 2, fn: function () { Net.go(); } });
      button(g, 'new', cx + 6, by, bw, bh, 'NEW TEAMS', { color: '#1aa6d8', size: 2, fn: function () { Net.toLobby(); } });
    } else {
      button(g, 'again', cx - bw - 6, by, bw, bh, 'REMATCH', { size: 2, fn: function () { UI.screen = null; HW.Jam.start(G.setup); } });
      button(g, 'new', cx + 6, by, bw, bh, 'NEW TEAMS', { color: '#1aa6d8', size: 2, fn: function () { UI.show('team'); HW.Jam.players = []; } });
    }
    var fin = UI.resAt != null ? (UI.t - UI.resAt) / 0.5 : 1; if (fin < 1) { g.fillStyle = 'rgba(0,0,0,' + (1 - Math.max(0, fin)) + ')'; g.fillRect(0, 0, X.W, X.H); }
  }

  /* ---------- in-game HUD ---------- */
  UI.drawHUD = function (g) {
    UI.syncTouch(HW.Jam);
    var G = HW.Jam, W = X.W, S = UI.safe(), fr = Math.floor(G.t * 12);
    var P = G.players.slice().sort(function (a, b) { return a.team - b.team || (!!b.me - !!a.me) || (!!b.human - !!a.human) || a.slot - b.slot; });
    var l = S.l + 4, r = W - S.r - 4, span = (r - l) / 4;
    // four names across the top, ball behind whoever has it, slim turbo meters underneath
    P.forEach(function (p, i) {
      var cx = Math.round(l + span * (i + 0.5)), name = p.def.first, nw = Fo.measure(name, 1);
      if (p.hasBall) { var bi = ballIcon(p.onFire, fr % 3); g.drawImage(bi, Math.round(cx - nw / 2 - 6), 15 - bi.height); }
      var fire = p.onFire && blink(6);
      Fo.draw(g, name, cx, 9, { scheme: fire ? 'fire' : 'yellow' });
      if (p.me || (p.human && p.lbl)) { var m1 = p.me ? marker(P1C, 'YOU') : marker('#1aa6d8', p.lbl); g.drawImage(m1, Math.round(cx - nw / 2 - m1.width - 3), 2, m1.width, m1.height - 6); }   // online: who's playing whom
      var tw = 40, tx = cx - tw / 2, ty = 17, tv = Math.max(0, Math.min(1, p.turbo / 100));
      g.fillStyle = '#000'; g.fillRect(tx - 1, ty - 1, tw + 2, 6); g.fillStyle = '#26284a'; g.fillRect(tx, ty, tw, 4);
      g.fillStyle = p.onFire ? (blink(8) ? '#ff5a10' : '#ffd23f') : tv > 0.5 ? '#3df07a' : tv > 0.25 ? '#ffd23f' : '#ff4b3a'; g.fillRect(tx, ty, Math.round(tw * (p.onFire ? 1 : tv)), 4);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(tx, ty, Math.round(tw * (p.onFire ? 1 : tv)), 1);
    });
    // scoreboard: compact, top centre under the names, clear of the hoops and the touch buttons
    var T = [G.team(0), G.team(1)], cx = Math.round(W / 2), bw = 176, bx = cx - bw / 2, by = 26, bh = 26;
    bevel(g, bx, by, bw, bh, '#000', CY, 2);
    Fo.draw(g, T[0].short, bx + 6, by + 13, { scale: 1, color: T[0].color, align: 'left' });
    Fo.draw(g, String(G.score[0]), bx + 62, by + 13, { scale: 2, scheme: 'white', align: 'right' });
    Fo.draw(g, qtr(G), cx, by + 8, { scale: 1, scheme: 'yellow', shadow: 0 });
    Fo.draw(g, clockStr(G), cx, by + 19, { scale: 1, scheme: G.clock < 10 ? 'red' : 'white', shadow: 0 });
    Fo.draw(g, String(G.score[1]), bx + bw - 62, by + 13, { scale: 2, scheme: 'white', align: 'left' });
    Fo.draw(g, T[1].short, bx + bw - 6, by + 13, { scale: 1, color: T[1].color, align: 'right' });
    var sc = Math.ceil(Math.max(0, G.shot)); g.fillStyle = '#000'; g.fillRect(cx - 11, by + bh - 1, 22, 13); g.fillStyle = CY; g.fillRect(cx - 12, by + bh - 1, 1, 14); g.fillRect(cx + 11, by + bh - 1, 1, 14); g.fillRect(cx - 12, by + bh + 12, 24, 1);
    Fo.draw(g, String(sc), cx, by + bh + 5, { scale: 1, scheme: sc <= 5 ? 'red' : 'yellow', shadow: 0 });
    // P1 marker over your player, shot meter above it while you are in the air with the ball
    var h = G.human;
    if (h && h.screen && h.headTop !== undefined && h.screen.x > -20 && h.screen.x < W + 20) {
      var mk = marker(P1C, 'YOU', 2), my = Math.max(64, Math.round(h.headTop - mk.height - 3 - (Math.floor(G.t * 4) % 2)));   // big bobbing YOU over your player
      g.drawImage(mk, Math.round(h.screen.x - mk.width / 2 + 1), my);
      // the shot meter fills from the press of SHOOT, the same for every jump shot (a step-back or cartwheel first doesn't slow it), until
      // you let go; online a guest's runs off his own press (h.pressAt), as the host judges it
      var gst = HW.Net && HW.Net.mode === 'guest', shooting = h.hasBall && !h.released && (h.state === 'shoot' || h.state === 'stepback' || h.state === 'cartwheel');
      var sht = !shooting ? null : gst ? (h.pressAt != null ? (performance.now() - h.pressAt) / 1000 : null) : h.relPress == null ? h.sht : null;
      if (sht != null) {
        // the bar runs from the press to 1.6x the top of the jump: dark red for a bad release, amber for ok, green for green - the same
        // window the game judges it by (G.shotWin, wider for a shooter's three); anywhere in a zone counts the same
        var mw = 44, mx = Math.round(h.screen.x - mw / 2), yy = my - 10, prog = Math.min(1.6, sht / (h.tApex || G.shotApex(h))) / 1.6, win = G.shotWin(h);
        var k = G.relFrac(h);   // (the sweet spot: the top of the jump, a 3-point shooter's on the way up)
        var zone = function (w, col) { var a = Math.max(0, (k - w) / 1.6), b = Math.min(1, (k + w) / 1.6); g.fillStyle = col; g.fillRect(Math.round(mx + mw * a), yy, Math.max(2, Math.round(mw * (b - a))), 5); };
        g.fillStyle = '#000'; g.fillRect(mx - 1, yy - 1, mw + 2, 7); g.fillStyle = '#3a1010'; g.fillRect(mx, yy, mw, 5);
        zone(win * 2.5, '#8a6a12'); zone(win, '#35e07c');
        var kx = Math.round(mx + mw * prog); g.fillStyle = '#000'; g.fillRect(kx - 2, yy - 3, 4, 11); g.fillStyle = '#fff'; g.fillRect(kx - 1, yy - 2, 2, 9);
      }
    }
    // arrows at the screen edge for players the camera can't see
    P.forEach(function (p) {
      if (!p.screen) return; var off = p.screen.x < S.l - 6 ? -1 : p.screen.x > W - S.r + 6 ? 1 : 0; if (!off) return;
      var ay = Math.max(74, Math.min(176, Math.round(p.screen.y - 90))), a = tri(off < 0 ? 'l' : 'r', 7, p.def.color), ax = off < 0 ? S.l + 2 : W - S.r - 2 - a.width;
      g.drawImage(a, ax, ay - a.height / 2 | 0);
      Fo.draw(g, p.me ? 'YOU' : p.human && p.lbl ? p.lbl : String(p.def.num), off < 0 ? ax + a.width + 2 : ax - 2, ay, { scale: 1, scheme: p.me ? 'green' : 'white', align: off < 0 ? 'left' : 'right', shadow: 0 });
    });
    // an invite came in, or someone came online, during a game against the CPU: it waits on the pause menu
    var iv = INV.got || INV.ask, ia = iv && performance.now() - iv.t;
    if (iv && !(HW.Net && HW.Net.mode) && ia < 12000 && Math.floor(ia / 400) % 3 < 2) Fo.draw(g, INV.got ? (nameOf(INV.got.fr) ? nameOf(INV.got.fr) + ' CHALLENGES YOU! PAUSE TO JOIN' : 'GAME INVITE! PAUSE TO JOIN IT') : INV.ask.n === 1 && INV.ask.names.length === 1 && nameOf(INV.ask.names[0]) ? nameOf(INV.ask.names[0]) + ' CAME ONLINE! PAUSE TO CHALLENGE' : 'SOMEONE CAME ONLINE! PAUSE TO INVITE THEM', cx, by + bh + 26, { scale: 1, scheme: 'green' });
    UI.drawCallouts(g);
  };
  // callouts: big flaming arcade text that pops in
  UI.drawCallouts = function (g) {
    var G = HW.Jam, W = X.W, S = UI.safe(), fr = Math.floor(G.t * 12), maxW = W - S.l - S.r - 30, cy = 112, cy0;
    // (a low one - BLOCKED BY JAMES! over the chase-down's close-up - goes down near the bottom, clear of the two of them)
    G.callouts.forEach(function (c, i) {
      if (c.low) { cy0 = cy; cy = X.H - 52 - S.b; }
      var sc0 = c.size >= 1.2 ? 4 : c.size >= 0.85 ? 3 : 2; while (sc0 > 1 && Fo.measure(c.text, sc0) > maxW) sc0--;
      var pop = c.t < 0.05 ? 2 : c.t < 0.11 ? 1 : 0, sc1 = sc0 + pop; if (Fo.measure(c.text, sc1) > maxW) sc1 = sc0;
      var a = c.life - c.t < 0.3 ? Math.max(0, (c.life - c.t) / 0.3) : 1, rgbv = rgb(c.color.length === 4 ? '#' + c.color[1] + c.color[1] + c.color[2] + c.color[2] + c.color[3] + c.color[3] : c.color);
      var hot = rgbv[0] > 200 && rgbv[2] < 130, orange = hot && rgbv[1] < 190, o = { scale: sc1, outline: sc1 >= 3 ? 2 : 1, shadow: 2 };
      if (orange) o.scheme = 'fire'; else o.color = c.color;
      g.globalAlpha = a;
      if (hot && !pop) flaming(g, c.text, W / 2, cy, o, fr); else Fo.draw(g, c.text, W / 2, cy, o);
      g.globalAlpha = 1; cy += Fo.height({ scale: sc0 }) + 12;
      if (c.low) cy = cy0;
    });
  };
})(window.HW);
