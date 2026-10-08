/* ui.js - input (keyboard + touch), arcade HUD, callouts and menus, all drawn on the game canvas */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, Au = HW.Audio, PF = '"Press Start 2P", "Courier New", monospace';
  var UI = HW.JamUI = { screen: 'title', btns: [], st: { team: 0, picks: [], ctrl: null, diff: 'normal' }, t: 0 };
  var In = HW.In = { mx: 0, mz: 0, turbo: false, shootHeld: false, shootDown: false, shootUp: false, passDown: false, pauseDown: false, tap: null, keys: {}, touchMove: { x: 0, y: 0 }, touchTurbo: false };

  /* ---------- input ---------- */
  UI.initInput = function (cv) {
    UI.cv = cv;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return; var k = e.code; In.keys[k] = true; Au.init();
      if (k === 'KeyJ' || k === 'Space') { In.shootHeld = true; In.shootDown = true; e.preventDefault(); }
      if (k === 'KeyK') In.passDown = true;
      if (k === 'Escape' || k === 'KeyP') In.pauseDown = true;
      if (k === 'Enter') In.enter = true;
    });
    window.addEventListener('keyup', function (e) { In.keys[e.code] = false; if (e.code === 'KeyJ' || e.code === 'Space') { In.shootHeld = false; In.shootUp = true; } });
    function toCanvas(cx, cy) { var r = cv.getBoundingClientRect(); return { x: (cx - r.left) / r.width * X.W, y: (cy - r.top) / r.height * X.H }; }
    cv.addEventListener('mousedown', function (e) { Au.init(); In.tap = toCanvas(e.clientX, e.clientY); if (HW.Jam.phase !== 'menu' && !UI.overlay()) { In.shootHeld = true; In.shootDown = true; } });
    window.addEventListener('mouseup', function () { if (In.shootHeld && !In.keys.KeyJ && !In.keys.Space) { In.shootHeld = false; In.shootUp = true; } });
    cv.addEventListener('touchstart', function (e) { e.preventDefault(); Au.init(); var t = e.changedTouches[0]; In.tap = toCanvas(t.clientX, t.clientY); UI.firstGesture(); }, { passive: false });
    UI.initTouch();
  };
  UI.firstGesture = function () {
    Au.init(); if (UI.fsTried || !HW.TOUCH) return; UI.fsTried = true;
    try { var de = document.documentElement, p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : null; var lock = function () { try { screen.orientation.lock('landscape').catch(function () { }); } catch (e) { } }; if (p && p.then) p.then(lock, function () { }); else lock(); } catch (e) { }
  };
  UI.initTouch = function () {
    if (!HW.TOUCH) return; document.body.classList.add('touch');
    var zone = document.getElementById('stickZone'), base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob'), id = null, ox = 0, oy = 0, R = 55;
    zone.addEventListener('touchstart', function (e) { e.preventDefault(); UI.firstGesture(); if (id !== null) return; var t = e.changedTouches[0]; id = t.identifier; ox = t.clientX; oy = t.clientY; base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); }, { passive: false });
    zone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; if (t.identifier !== id) continue; var dx = t.clientX - ox, dy = t.clientY - oy, d = Math.hypot(dx, dy), k = d > R ? R / d : 1; dx *= k; dy *= k; In.touchMove.x = dx / R; In.touchMove.y = -dy / R; knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))'; }
    }, { passive: false });
    var end = function (e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === id) { id = null; In.touchMove.x = In.touchMove.y = 0; base.classList.remove('on'); knob.style.transform = 'translate(-50%,-50%)'; } };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    function hold(elId, down, up) { var el = document.getElementById(elId); el.addEventListener('touchstart', function (e) { e.preventDefault(); UI.firstGesture(); el.classList.add('down'); down(); }, { passive: false }); var u = function (e) { e.preventDefault(); el.classList.remove('down'); if (up) up(); }; el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false }); }
    hold('bShoot', function () { In.shootHeld = true; In.shootDown = true; }, function () { In.shootHeld = false; In.shootUp = true; });
    hold('bPass', function () { In.passDown = true; });
    hold('bTurbo', function () { In.touchTurbo = true; }, function () { In.touchTurbo = false; });
    hold('bPause', function () { In.pauseDown = true; });
  };
  UI.readInput = function () {
    var k = In.keys, mx = 0, mz = 0;
    if (k.ArrowRight || k.KeyD) mx += 1; if (k.ArrowLeft || k.KeyA) mx -= 1; if (k.ArrowUp || k.KeyW) mz += 1; if (k.ArrowDown || k.KeyS) mz -= 1;
    if (In.touchMove.x || In.touchMove.y) { mx = In.touchMove.x; mz = In.touchMove.y; }
    In.mx = mx; In.mz = mz; In.turbo = !!(k.ShiftLeft || k.ShiftRight || k.KeyL || In.touchTurbo);
  };
  UI.endFrame = function () { In.shootDown = In.shootUp = In.passDown = In.pauseDown = In.enter = false; In.tap = null; };

  /* ---------- drawing helpers ---------- */
  function txt(g, s, x, y, size, col, align, stroke) {
    g.font = size + 'px ' + PF; g.textAlign = align || 'center'; g.textBaseline = 'middle';
    if (stroke !== false) { g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.3); g.strokeStyle = '#000'; g.strokeText(s, x, y); }
    g.fillStyle = col || '#fff'; g.fillText(s, x, y);
  }
  UI.txt = txt;
  function button(g, id, x, y, w, h, label, o) {
    o = o || {}; UI.btns.push({ id: id, x: x, y: y, w: w, h: h, fn: o.fn, disabled: o.disabled });
    g.globalAlpha = o.disabled ? 0.35 : 1;
    g.fillStyle = o.on ? (o.color || '#ffe14d') : 'rgba(10,10,40,0.85)'; g.fillRect(x, y, w, h);
    g.strokeStyle = o.color || '#ffe14d'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    txt(g, label, x + w / 2, y + h / 2 + 1, o.size || 12, o.on ? '#000' : '#fff', 'center', !o.on);
    g.globalAlpha = 1;
  }
  // arcade player card: head on shoulders in team color, name bar, stat lines
  function card(g, id, x, y, w, h, o) {
    o = o || {}; var d = HW.PLAYERS[id], team = HW.TEAMS[d.team], f = X.face(id);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, team.dark); gr.addColorStop(1, '#0a0a28'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = o.sel ? '#5cff7a' : '#29c4e8'; g.lineWidth = o.sel ? 4 : 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    var ph = o.ph || h * 0.55, px = x + 6, py = y + 6, pw = w - 12;
    g.fillStyle = '#26245e'; g.fillRect(px, py, pw, ph);
    // jersey shoulders
    g.fillStyle = d.color; g.beginPath(); g.moveTo(px + pw * 0.08, py + ph); g.quadraticCurveTo(px + pw * 0.1, py + ph * 0.66, px + pw * 0.5, py + ph * 0.64); g.quadraticCurveTo(px + pw * 0.9, py + ph * 0.66, px + pw * 0.92, py + ph); g.fill();
    g.fillStyle = '#fff'; g.font = Math.round(ph * 0.13) + 'px ' + PF; g.textAlign = 'center'; g.fillText(String(d.num), px + pw / 2, py + ph * 0.9);
    if (f && f.front.naturalWidth) { var fw = Math.min(pw * 0.62, ph * 0.66 * f.front.naturalWidth / f.front.naturalHeight), fh = fw * f.front.naturalHeight / f.front.naturalWidth; g.drawImage(f.front, px + pw / 2 - fw / 2, py + ph * 0.7 - fh * 0.92, fw, fh); }
    var ny = py + ph + 14; txt(g, d.first.toUpperCase(), x + w / 2, ny, o.nameSize || 11, '#fff');
    txt(g, HW.TYPES[d.type].label.toUpperCase(), x + w / 2, ny + 15, 6, d.color, 'center', false);
    if (o.stats !== false) {
      var s = d.stats, rows = [['SPD', s.speed, 'POWER', s.str], ['3PTS', s.tp, 'STEAL', s.steal], ['DUNK', s.dunk, 'BLOCK', s.block]], lx = x + 6, cw = w - 12, sz = o.statSize || (cw < 120 ? 6 : 7);
      rows.forEach(function (r, i) {
        var yy = ny + 30 + i * (sz + 6);
        txt(g, r[0] + ':', lx, yy, sz, '#ffe14d', 'left', false); txt(g, String(r[1]), lx + cw * 0.42, yy, sz, '#fff', 'right', false);
        txt(g, r[2] + ':', lx + cw * 0.5, yy, sz, '#ffe14d', 'left', false); txt(g, String(r[3]), lx + cw, yy, sz, '#fff', 'right', false);
      });
    }
  }
  function frame(g, title) {
    g.fillStyle = 'rgba(4,4,20,0.78)'; g.fillRect(-200, 0, X.W + 400, X.H);
    if (title) txt(g, title, X.W / 2, 26, 16, '#ffe14d');
  }

  /* ---------- menus ---------- */
  UI.overlay = function () { var G = HW.Jam; return G.phase === 'menu' || G.phase === 'paused' || UI.screen === 'results'; };
  UI.show = function (s) { UI.screen = s; if (s !== 'results' && s !== 'paused') HW.Jam.phase = 'menu'; };
  UI.drawMenu = function (g, dt) {
    UI.t += dt; UI.btns = []; var st = UI.st, W = 640, H = X.H, s = UI.screen, T = HW.TEAMS, ox = Math.round((X.W - 640) / 2);
    g.save(); g.translate(ox, 0);   // menus are laid out on a 640-wide stage, centered on wider screens
    if (s === 'title') {
      g.fillStyle = 'rgba(4,4,20,0.55)'; g.fillRect(-ox, 0, X.W, H);
      var pulse = 1 + Math.sin(UI.t * 3) * 0.03;
      g.save(); g.translate(W / 2, 110); g.scale(pulse, pulse); txt(g, 'HOOPS', 0, -26, 44, '#fff'); txt(g, 'JAM', 0, 30, 54, '#ff7a1a'); g.restore();
      txt(g, 'ANDERSONS  vs  GORMANS', W / 2, 190, 11, '#29c4e8');
      txt(g, '2 ON 2  ARCADE  BASKETBALL', W / 2, 210, 8, '#fff', 'center', false);
      if (Math.floor(UI.t * 2) % 2 === 0) txt(g, HW.TOUCH ? 'TAP TO START' : 'CLICK OR PRESS ENTER', W / 2, 262, 13, '#ffe14d');
      UI.btns.push({ id: 'start', x: -ox, y: 0, w: X.W, h: H, fn: function () { UI.show('team'); } });
      if (In.enter) UI.show('team');
      txt(g, 'MOVE: STICK/ARROWS  SHOOT: J  PASS: K  TURBO: L/SHIFT', W / 2, 336, 6, '#9aa5cc', 'center', false);
    } else if (s === 'team') {
      frame(g, 'SELECT TEAM');
      [0, 1].forEach(function (ti) {
        var t = T[ti], x = 30 + ti * 300, y = 50, w = 280, h = 250;
        g.fillStyle = t.dark; g.fillRect(x, y, w, h); g.strokeStyle = t.color; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        txt(g, t.name.toUpperCase(), x + w / 2, y + 24, 16, t.color);
        t.roster.forEach(function (id, k) {
          var n = t.roster.length, cw = (w - 20) / n, f = X.face(id), cx = x + 10 + k * cw + cw / 2;
          if (f && f.front.naturalWidth) { var fw = Math.min(cw - 4, 52), fh = fw * f.front.naturalHeight / f.front.naturalWidth; g.drawImage(f.front, cx - fw / 2, y + 50, fw, fh); }
          txt(g, HW.PLAYERS[id].first.toUpperCase(), cx, y + 130, 6, '#fff', 'center', false);
        });
        button(g, 'team' + ti, x + 40, y + 190, w - 80, 36, 'CHOOSE', { color: t.color, fn: function () { st.team = ti; st.picks = []; UI.show('pick'); } });
      });
      button(g, 'back', 20, 318, 90, 30, 'BACK', { fn: function () { UI.show('title'); } });
    } else if (s === 'pick') {
      var t = T[st.team]; frame(g, 'PICK 2 ' + t.name.toUpperCase());
      var n = t.roster.length, cw = Math.min(118, (W - 40 - (n - 1) * 8) / n), x0 = (W - (n * cw + (n - 1) * 8)) / 2;
      t.roster.forEach(function (id, i) {
        var x = x0 + i * (cw + 8), y = 46, sel = st.picks.indexOf(id) >= 0;
        card(g, id, x, y, cw, 250, { sel: sel, ph: 130 });
        if (sel) txt(g, 'PICKED', x + cw / 2, y + 238, 8, '#5cff7a');
        UI.btns.push({ id: 'p' + id, x: x, y: y, w: cw, h: 250, fn: function () { var k = st.picks.indexOf(id); if (k >= 0) st.picks.splice(k, 1); else { if (st.picks.length >= 2) st.picks.shift(); st.picks.push(id); } Au.click(); } });
      });
      button(g, 'back', 20, 318, 90, 30, 'BACK', { fn: function () { UI.show('team'); } });
      button(g, 'next', W - 130, 314, 110, 36, 'NEXT', { on: st.picks.length === 2, disabled: st.picks.length !== 2, fn: function () { st.ctrl = st.picks[0]; UI.show('control'); } });
    } else if (s === 'control') {
      frame(g, 'WHO DO YOU PLAY?');
      st.picks.forEach(function (id, i) {
        var x = 120 + i * 220, sel = st.ctrl === id;
        card(g, id, x, 44, 180, 220, { sel: sel, ph: 120, nameSize: 12 });
        txt(g, sel ? 'YOU' : 'CPU', x + 90, 276, 10, sel ? '#5cff7a' : '#9aa5cc');
        UI.btns.push({ id: 'c' + id, x: x, y: 44, w: 180, h: 220, fn: function () { st.ctrl = id; Au.click(); } });
      });
      ['easy', 'normal', 'hard'].forEach(function (dk, i) { button(g, 'd' + dk, 170 + i * 104, 290, 96, 24, dk.toUpperCase(), { on: st.diff === dk, size: 8, fn: function () { st.diff = dk; } }); });
      button(g, 'back', 20, 318, 90, 30, 'BACK', { fn: function () { UI.show('pick'); } });
      button(g, 'go', W - 150, 320, 130, 32, 'PLAY', { on: true, fn: function () { UI.matchup(); } });
    } else if (s === 'matchup') {
      frame(g, "TONIGHT'S MATCHUP");
      var m = UI.mu;
      [0, 1].forEach(function (ti) {
        var bx = ti ? 330 : 10, tt = T[ti];
        txt(g, tt.name.toUpperCase(), bx + 150, 52, 13, tt.color);
        m.teams[ti].forEach(function (id, k) { card(g, id, bx + k * 152, 64, 146, 238, { ph: 118, sel: id === m.human }); });
      });
      txt(g, 'VS', W / 2, 180, 18, '#ff3b30');
      if (UI.loading) txt(g, 'LOADING...', W / 2, 326, 11, '#fff');
      else { if (Math.floor(UI.t * 2) % 2 === 0) txt(g, HW.TOUCH ? 'TAP TO TIP OFF' : 'CLICK TO TIP OFF', W / 2, 326, 12, '#ffe14d'); UI.btns.push({ id: 'tip', x: -ox, y: 0, w: X.W, h: H, fn: function () { UI.screen = null; HW.Jam.start(m); } }); if (In.enter) { UI.screen = null; HW.Jam.start(m); } }
    } else if (s === 'paused') {
      frame(g, 'PAUSED');
      button(g, 'resume', W / 2 - 100, 110, 200, 40, 'RESUME', { on: true, fn: function () { UI.screen = null; HW.Jam.phase = UI.prevPhase || 'play'; } });
      button(g, 'quit', W / 2 - 100, 170, 200, 40, 'QUIT', { color: '#ff5a4a', fn: function () { UI.show('title'); HW.Jam.players = []; } });
      txt(g, 'SHOOT: hold + release at the top of the jump', W / 2, 250, 7, '#ccd', 'center', false);
      txt(g, 'TURBO + SHOOT near the rim = DUNK', W / 2, 266, 7, '#ccd', 'center', false);
      txt(g, 'DEFENSE: PASS = steal, TURBO+PASS = shove, SHOOT = jump/block', W / 2, 282, 7, '#ccd', 'center', false);
      txt(g, 'PASS with no ball: call for it. SHOOT: tell your teammate to shoot', W / 2, 298, 7, '#ccd', 'center', false);
    } else if (s === 'results') {
      var G = HW.Jam, w = G.score[0] > G.score[1] ? 0 : 1; frame(g);
      txt(g, T[w].name.toUpperCase() + ' WIN', W / 2, 30, 18, T[w].color); txt(g, G.score[0] + ' - ' + G.score[1], W / 2, 58, 18, '#fff');
      var cols = [['PLAYER', 40, 'left'], ['PTS', 290, 'center'], ['FG', 350, 'center'], ['3PT', 410, 'center'], ['DNK', 465, 'center'], ['STL', 515, 'center'], ['BLK', 565, 'center']];
      cols.forEach(function (c) { txt(g, c[0], c[1], 92, 7, '#9aa5cc', c[2], false); });
      G.players.slice().sort(function (a, b) { return a.team - b.team; }).forEach(function (p, i) {
        var y = 118 + i * 30, sv = p.stats, f = X.face(p.id);
        if (f && f.front.naturalWidth) g.drawImage(f.front, 14, y - 13, 20, 26);
        txt(g, p.def.first.toUpperCase() + (p.human ? ' (YOU)' : ''), 40, y, 8, p.def.color, 'left', false);
        [sv.pts, sv.fgm + '/' + sv.fga, sv.tpm + '/' + sv.tpa, sv.dunks, sv.steals, sv.blocks].forEach(function (v, k) { txt(g, String(v), cols[k + 1][1], y, 9, k ? '#fff' : '#ffe14d', 'center', false); });
      });
      button(g, 'again', 120, 280, 180, 40, 'REMATCH', { on: true, fn: function () { UI.screen = null; HW.Jam.start(G.setup); } });
      button(g, 'new', 340, 280, 180, 40, 'NEW TEAMS', { fn: function () { UI.show('team'); HW.Jam.players = []; } });
    }
    g.restore();
    if (In.tap) { var tx = In.tap.x - ox; for (var i = UI.btns.length - 1; i >= 0; i--) { var b = UI.btns[i]; if (!b.disabled && tx >= b.x && tx <= b.x + b.w && In.tap.y >= b.y && In.tap.y <= b.y + b.h) { Au.click(); b.fn && b.fn(); break; } } }
  };
  UI.matchup = function () {
    var st = UI.st, T = HW.TEAMS, mate = st.picks.filter(function (id) { return id !== st.ctrl; })[0], teams = [null, null];
    var opp = T[1 - st.team].roster.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    teams[st.team] = [st.ctrl, mate]; teams[1 - st.team] = opp;
    UI.mu = { teams: teams, human: st.ctrl, diff: st.diff }; UI.screen = 'matchup'; UI.loading = true;
    Promise.all(teams[0].concat(teams[1]).map(X.loadPlayer)).then(function () { UI.loading = false; });
  };

  /* ---------- in-game HUD ---------- */
  UI.drawHUD = function (g) {
    var G = HW.Jam, W = X.W, P = G.players.slice().sort(function (a, b) { return a.team - b.team || (b.human - a.human) || a.slot - b.slot; });
    P.forEach(function (p, i) {
      var cx = X.W / 8 + i * X.W / 4;
      var name = p.def.first.toUpperCase(), fire = p.onFire && Math.floor(G.t * 8) % 2;
      txt(g, name, cx, 13, 10, fire ? '#ff7a1a' : '#ffe14d');
      if (p.human) { g.fillStyle = p.def.color; g.fillRect(cx - 62, 6, 18, 13); txt(g, 'P1', cx - 53, 13, 6, '#fff', 'center', false); }
      g.fillStyle = '#000'; g.fillRect(cx - 46, 23, 92, 7); g.fillStyle = p.onFire ? '#ff7a1a' : p.turbo > 25 ? '#3df07a' : '#ff4b3a'; g.fillRect(cx - 45, 24, 90 * p.turbo / 100, 5);
    });
    // score strip
    var q = G.q > 4 ? 'OT' : ['1ST', '2ND', '3RD', '4TH'][G.q - 1], clk = Math.max(0, G.clock), m = Math.floor(clk / 60), s = Math.floor(clk % 60);
    var clock = clk < 10 ? clk.toFixed(1) : m + ':' + (s < 10 ? '0' : '') + s;
    var sx = W / 2 - 150, sy = X.H - 30;
    g.fillStyle = 'rgba(8,8,40,0.88)'; g.fillRect(sx, sy, 300, 24); g.strokeStyle = '#ffe14d'; g.lineWidth = 2; g.strokeRect(sx + 1, sy + 1, 298, 22);
    txt(g, HW.TEAMS[0].short, sx + 30, sy + 13, 8, HW.TEAMS[0].color, 'center', false); txt(g, String(G.score[0]), sx + 70, sy + 13, 12, '#fff', 'center', false);
    txt(g, q + ' ' + clock, W / 2 - 6, sy + 13, 8, '#ff4b3a', 'center', false); txt(g, String(Math.ceil(Math.max(0, G.shot))), W / 2 + 50, sy + 13, 7, '#ffe14d', 'center', false);
    txt(g, String(G.score[1]), sx + 230, sy + 13, 12, '#fff', 'center', false); txt(g, HW.TEAMS[1].short, sx + 270, sy + 13, 8, HW.TEAMS[1].color, 'center', false);
    // shot meter while the human is in the air with the ball
    var h = G.human;
    if (h && h.state === 'shoot' && !h.released && h.hasBall) {
      var mw = 120, mx = W / 2 - mw / 2, my = sy - 16, prog = Math.min(1.6, h.st / h.tApex) / 1.6, win = 0.16 * (1 + (h.def.stats.tp - 5) * 0.06);
      g.fillStyle = '#111'; g.fillRect(mx, my, mw, 8); g.fillStyle = '#35e07c'; g.fillRect(mx + mw * (1 - win) / 1.6, my, mw * 2 * win / 1.6, 8);
      g.fillStyle = '#fff'; g.fillRect(mx + mw * prog - 2, my - 3, 4, 14);
    }
    // marker over your player
    if (h && h.screen && h.headTop) { var mxp = h.screen.x, myp = h.headTop - 8; g.fillStyle = h.def.color; g.beginPath(); g.moveTo(mxp - 6, myp - 8); g.lineTo(mxp + 6, myp - 8); g.lineTo(mxp, myp); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }
    // callouts
    G.callouts.forEach(function (c, i) {
      var pop = 1 + Math.max(0, 0.4 - c.t * 2) * 1.2, a = c.life - c.t < 0.3 ? (c.life - c.t) / 0.3 : 1;
      g.save(); g.globalAlpha = a; g.translate(W / 2, 110 + i * 34); g.scale(pop, pop); txt(g, c.text, 0, 0, Math.round(18 * c.size), c.color); g.restore();
    });
  };
})(window.HW);
