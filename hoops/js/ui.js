/* ui.js - canvas panels with laser-pointer hit testing, callouts, floating scoreboard, wrist / corner HUD */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U, FONT = 'Arial Black, Impact, Helvetica, sans-serif';
  var PIXEL = '"Press Start 2P", "Courier New", monospace';
  var UI = HW.UI = { FONT: FONT, PIXEL: PIXEL };
  // arcade pixel lettering everywhere; sizes are given for a heavy sans, so the wide pixel font is scaled down to match widths
  UI.font = function (size, weight) { return Math.round(size * 0.62) + 'px ' + PIXEL; };
  UI.fontReady = function (cb) {
    var done = function () { if (cb) cb(); };
    try { if (document.fonts && document.fonts.load) document.fonts.load('16px "Press Start 2P"').then(done, done); else done(); } catch (e) { done(); }
  };

  /* ---------- Panel: a plane with a 2D canvas; immediate-mode buttons ---------- */
  function Panel(wm, hm, pw, ph, opts) {
    opts = opts || {};
    this.w = wm; this.h = hm; this.pw = pw; this.ph = ph;
    this.tex = U.canvasTex(pw, ph, null, { aniso: 4 }); this.cv = this.tex.userData.canvas; this.g = this.tex.userData.ctx;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), this.mat); this.mesh.renderOrder = opts.order || 10;
    this.btns = []; this.hover = null; this.dirty = true; this.draw = null;
    this._m = new THREE.Matrix4(); this._o = new THREE.Vector3(); this._d = new THREE.Vector3();
  }
  Panel.prototype.redraw = function () {
    this.btns.length = 0; this.g.clearRect(0, 0, this.pw, this.ph);
    if (this.draw) this.draw(this.g, this.pw, this.ph, this); this.tex.needsUpdate = true; this.dirty = false;
  };
  Panel.prototype.text = function (s, x, y, size, color, align, o) {
    var g = this.g; o = o || {}; g.font = UI.font(size, o.weight); g.textAlign = align || 'left'; g.textBaseline = 'middle';
    if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || size * 0.16; g.strokeStyle = o.stroke; g.strokeText(s, x, y); }
    g.fillStyle = color || '#fff'; g.fillText(s, x, y);
  };
  // Registers + draws a button. o: {color, selected, disabled, size, sub}
  Panel.prototype.button = function (id, x, y, w, h, label, o) {
    o = o || {}; var g = this.g, hov = this.hover === id && !o.disabled, col = o.color || '#ff8a1f';
    var b = { id: id, x: x, y: y, w: w, h: h, disabled: !!o.disabled, onClick: o.onClick }; this.btns.push(b);
    g.save(); g.globalAlpha = o.disabled ? 0.35 : 1;
    U.roundRect(g, x, y, w, h, Math.min(24, h / 3)); g.fillStyle = o.selected ? col : (hov ? 'rgba(255,255,255,0.22)' : 'rgba(20,22,40,0.88)'); g.fill();
    g.lineWidth = o.selected || hov ? 6 : 3; g.strokeStyle = hov ? '#ffffff' : col; g.stroke();
    var size = o.size || Math.min(44, h * 0.46);
    this.text(label, x + w / 2, y + h / 2 + (o.sub ? -size * 0.35 : 0), size, o.selected ? '#101018' : '#ffffff', 'center');
    if (o.sub) this.text(o.sub, x + w / 2, y + h / 2 + size * 0.75, size * 0.5, o.selected ? '#202030' : '#b8c0d8', 'center', { weight: 'normal' });
    g.restore(); return b;
  };
  // Intersect a world ray with the panel; returns {px, py, t} in canvas pixels or null.
  Panel.prototype.hit = function (origin, dir) {
    this.mesh.updateMatrixWorld(); this._m.copy(this.mesh.matrixWorld).invert();
    var o = this._o.copy(origin).applyMatrix4(this._m), d = this._d.copy(dir).transformDirection(this._m);
    if (Math.abs(d.z) < 1e-5) return null; var t = -o.z / d.z; if (t < 0) return null;
    var x = o.x + d.x * t, y = o.y + d.y * t; if (Math.abs(x) > this.w / 2 || Math.abs(y) > this.h / 2) return null;
    return { px: (x / this.w + 0.5) * this.pw, py: (0.5 - y / this.h) * this.ph, t: t };
  };
  Panel.prototype.btnAt = function (px, py) {
    for (var i = this.btns.length - 1; i >= 0; i--) { var b = this.btns[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b; }
    return null;
  };
  UI.Panel = Panel;

  /* ---------- Callouts: big announcer text that floats in front of the player ---------- */
  var callouts = [];
  UI.initCallouts = function (scene) {
    for (var i = 0; i < 3; i++) {
      var p = new Panel(3.2, 0.8, 1024, 256, { order: 20 }); p.mesh.visible = false; p.t = 0; p.life = 0; p.text0 = ''; scene.add(p.mesh); callouts.push(p);
    }
  };
  UI.callout = function (text, color, opts) {
    opts = opts || {}; var view = HW.view, p = null, i;
    for (i = 0; i < callouts.length; i++) if (!callouts[i].mesh.visible) { p = callouts[i]; break; }
    if (!p) { p = callouts[0]; for (i = 1; i < callouts.length; i++) if (callouts[i].t > p.t) p = callouts[i]; }
    var size = opts.size || (text.length > 14 ? 96 : 130);
    p.draw = function (g, w, h) { p.text(text, w / 2, h / 2, size, color || '#ffd23f', 'center', { stroke: '#000', strokeW: 22 }); };
    p.redraw(); p.t = 0; p.life = opts.life || 1.7; p.big = opts.big || 1; p.mesh.visible = true;
    var d = opts.dist || 4.2, yaw = view.yaw;
    p.mesh.position.set(view.pos.x - Math.sin(yaw) * d, view.pos.y + (opts.up === undefined ? 0.55 : opts.up), view.pos.z - Math.cos(yaw) * d);
    p.mesh.rotation.set(0, yaw, 0); p.base = d / 4.2;
    if (HW.Audio.say && !opts.silent) HW.Audio.say(text);
    UI.dom.callout(text, color);
  };
  UI.updateCallouts = function (dt) {
    for (var i = 0; i < callouts.length; i++) {
      var p = callouts[i]; if (!p.mesh.visible) continue; p.t += dt;
      var a = p.t < 0.15 ? p.t / 0.15 : 1, pop = 1 + Math.max(0, 0.5 - p.t * 3) * 0.7, fade = p.life - p.t < 0.4 ? Math.max(0, (p.life - p.t) / 0.4) : 1;
      var s = pop * p.big * p.base * (0.4 + 0.6 * a); p.mesh.scale.set(s, s, 1); p.mat.opacity = fade * a;
      if (p.t > p.life) p.mesh.visible = false;
    }
  };

  /* ---------- DOM helpers for desktop (callout echo, hint text) ---------- */
  var domCall = null, domTimer = 0;
  UI.dom = {
    init: function () { domCall = document.getElementById('callout'); },
    callout: function (text, color) {
      if (!domCall || HW.Input.vr) return; domCall.textContent = text; domCall.style.color = color || '#ffd23f'; domCall.classList.remove('show'); void domCall.offsetWidth; domCall.classList.add('show');
    }
  };

  /* ---------- Scoreboard: four-sided cube hung over center court ---------- */
  var SB = UI.scoreboard = {};
  SB.build = function (scene) {
    var g = new THREE.Group(); g.position.set(0, 8.2, 0); scene.add(g);
    var panel = new Panel(4.8, 2.4, 1024, 512, { order: 1 }); SB.panel = panel; SB.group = g; SB.key = '';
    panel.draw = function (c, w, h) { SB.drawBoard(c, w, h, panel); };
    var body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.3, 4.6), new THREE.MeshLambertMaterial({ color: 0x101018 })); g.add(body);
    for (var i = 0; i < 4; i++) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: panel.tex, fog: false }));
      m.rotation.y = i * Math.PI / 2; m.position.set(Math.sin(i * Math.PI / 2) * 2.31, 0, Math.cos(i * Math.PI / 2) * 2.31); g.add(m);
    }
    [[-1.6, 1.6], [1.6, 1.6], [-1.6, -1.6], [1.6, -1.6]].forEach(function (p) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 5), new THREE.MeshBasicMaterial({ color: 0x444455 })); c.position.set(p[0], 4, p[1]); g.add(c);
    });
    SB.state = { score: [0, 0], names: ['AND', 'GOR'], colors: ['#ff8a1f', '#3a86ff'], quarter: 1, clock: 180, shot: 24, msg: '', fire: [false, false], poss: -1 };
    panel.redraw(); return g;
  };
  function fmt(t) { t = Math.max(0, t); var m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10); return t < 10 ? s + '.' + d : m + ':' + (s < 10 ? '0' : '') + s; }
  UI.fmtClock = fmt;
  SB.drawBoard = function (g, w, h, p) {
    var s = SB.state; g.fillStyle = '#080a14'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff8a1f'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    p.text('HOOPS JAM', w / 2, 52, 40, '#ff8a1f', 'center');
    [0, 1].forEach(function (i) {
      var cx = i ? w - 215 : 215;
      p.text(s.names[i], cx, 120, 54, s.colors[i], 'center');
      p.text(String(s.score[i]), cx, 250, 190, '#ffffff', 'center');
      if (s.fire[i]) p.text('ON FIRE', cx, 380, 52, '#ff5a1f', 'center', { stroke: '#ffd23f', strokeW: 6 });
      if (s.poss === i) { g.fillStyle = s.colors[i]; g.beginPath(); g.moveTo(cx - 30, 440); g.lineTo(cx + 30, 440); g.lineTo(cx, 470); g.fill(); }
    });
    p.text(s.quarter > 4 ? 'OT' : 'Q' + s.quarter, w / 2, 130, 78, '#ffd23f', 'center');
    p.text(fmt(s.clock), w / 2, 258, 120, '#ff3b3b', 'center');
    p.text('SHOT', w / 2 - 70, 400, 34, '#aab', 'center'); p.text(String(Math.ceil(Math.max(0, s.shot))), w / 2 + 40, 400, 76, s.shot < 6 ? '#ff3b3b' : '#ffd23f', 'center');
    if (s.msg) p.text(s.msg, w / 2, 468, 36, '#ffffff', 'center');
  };
  SB.set = function (patch) {
    var s = SB.state, key = '';
    for (var k in patch) s[k] = patch[k];
    key = [s.score[0], s.score[1], s.quarter, Math.floor(s.clock * (s.clock < 10 ? 10 : 1)), Math.ceil(Math.max(0, s.shot)), s.msg, s.fire[0], s.fire[1], s.poss, s.names[0], s.names[1]].join('|');
    if (key !== SB.key) { SB.key = key; SB.panel.redraw(); }
  };

  /* ---------- HUD: wrist panel in VR, corner overlay on desktop (same drawing code) ---------- */
  var HUD = UI.hud = { state: { score: [0, 0], names: ['AND', 'GOR'], colors: ['#ff8a1f', '#3a86ff'], clock: 0, quarter: 1, shot: 24, turbo: 100, fire: false, charge: -1, green: [0, 0], msg: '', teamIdx: 0 }, key: '' };
  HUD.draw = function (g, w, h) {
    var s = HUD.state; g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,10,20,0.78)'; U.roundRect(g, 4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = s.fire ? '#ff7a1a' : '#ffffff55'; g.lineWidth = s.fire ? 8 : 3; g.stroke();
    function t(str, x, y, size, col, al) { g.font = UI.font(size); g.textAlign = al || 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, x, y); }
    t(s.names[0], w * 0.2, 36, 28, s.colors[0]); t(String(s.score[0]), w * 0.2, 92, 64, '#fff');
    t(s.names[1], w * 0.8, 36, 28, s.colors[1]); t(String(s.score[1]), w * 0.8, 92, 64, '#fff');
    t((s.quarter > 4 ? 'OT' : 'Q' + s.quarter), w / 2, 34, 28, '#ffd23f'); t(UI.fmtClock(s.clock), w / 2, 84, 46, '#ff3b3b');
    t('SHOT ' + Math.ceil(Math.max(0, s.shot)), w / 2, 130, 26, s.shot < 6 ? '#ff3b3b' : '#cfd3ff');
    // turbo bar
    var bx = 30, by = h - 62, bw = w - 60, bh = 26;
    g.fillStyle = '#222'; U.roundRect(g, bx, by, bw, bh, 12); g.fill();
    var tv = U.clamp(s.turbo / 100, 0, 1); g.fillStyle = s.fire ? '#ff7a1a' : (tv > 0.25 ? '#34e08a' : '#ff5a4a'); U.roundRect(g, bx, by, Math.max(14, bw * tv), bh, 12); g.fill();
    t(s.fire ? 'ON FIRE!' : 'TURBO', w / 2, by + bh / 2 + 1, 20, '#000');
    // desktop shot meter
    if (s.charge >= 0) {
      var my = h - 112; g.fillStyle = '#222'; g.fillRect(bx, my, bw, 18);
      var gx = bx + bw * (0.65 - 0.06 * s.green[0]), gw = bw * 0.12 * s.green[0]; g.fillStyle = '#35e07c'; g.fillRect(gx, my, gw, 18);
      g.fillStyle = '#fff'; g.fillRect(bx + bw * s.charge - 3, my - 5, 6, 28);
    }
    if (s.msg) t(s.msg, w / 2, 150, 20, '#fff');
  };
  HUD.build = function () {
    HUD.panel = new Panel(0.2, 0.125, 512, 320, { order: 30 }); HUD.panel.draw = HUD.draw; HUD.panel.mesh.visible = false;
    HUD.cv = document.getElementById('hud'); if (HUD.cv) HUD.ctx = HUD.cv.getContext('2d');
  };
  HUD.update = function (patch, vr) {
    var s = HUD.state, k, key;
    for (k in patch) s[k] = patch[k];
    key = [s.score[0], s.score[1], s.quarter, Math.floor(s.clock), Math.ceil(s.shot), Math.round(s.turbo / 3), s.fire, s.charge >= 0 ? Math.round(s.charge * 30) : -1, s.msg].join('|');
    if (key === HUD.key) return; HUD.key = key;
    HUD.panel.redraw();
    if (!vr && HUD.ctx) { HUD.ctx.clearRect(0, 0, HUD.cv.width, HUD.cv.height); HUD.ctx.drawImage(HUD.panel.cv, 0, 0, HUD.cv.width, HUD.cv.height); }
  };

  /* ---------- arcade HUD on flat screens: names + turbo across the top, score strip at the bottom ---------- */
  var JAM = UI.jam = { key: '', els: null };
  JAM.update = function (G) {
    var on = !HW.Input.vr && G.players.length && G.phase !== 'menu';
    document.body.classList.toggle('jamon', !!on); if (!on) return;
    if (!JAM.els) JAM.els = { t: [0, 1, 2, 3].map(function (i) { return document.getElementById('jt' + i); }), s0: document.getElementById('js0'), s1: document.getElementById('js1'), q: document.getElementById('jsq'), meter: document.getElementById('jammeter'), green: document.getElementById('jmgreen'), mark: document.getElementById('jmmark') };
    var E = JAM.els, P = G.players.slice().sort(function (a, b) { return a.team - b.team || (b.isHuman - a.isHuman) || a.slot - b.slot; });
    P.forEach(function (p, i) {
      var el = E.t[i]; if (!el) return;
      var k = p.def.id + '|' + Math.round(p.turbo / 4) + '|' + p.onFire + '|' + (G.ball.holder === p);
      if (el.dataset.k === k) return; el.dataset.k = k;
      el.innerHTML = '<div class="nm' + (p.onFire ? ' fire' : '') + '" style="--tc:' + p.def.color + '">' + (p.isHuman ? '<em>P1</em>' : '') + p.def.name.split(' ')[0].toUpperCase() + '</div>' +
        '<div class="tb"><i style="width:' + Math.max(3, p.turbo) + '%"></i></div><div class="sub">' + (p.onFire ? 'ON FIRE!' : 'TURBO') + '</div>';
    });
    var key = G.score.join('-') + '|' + G.q + '|' + Math.ceil(G.clock) + '|' + Math.ceil(G.shotClock);
    if (key !== JAM.key) {
      JAM.key = key;
      E.s0.innerHTML = '<b style="color:' + HW.TEAMS[0].color + '">' + HW.TEAMS[0].short + '</b> ' + G.score[0];
      E.s1.innerHTML = G.score[1] + ' <b style="color:' + HW.TEAMS[1].color + '">' + HW.TEAMS[1].short + '</b>';
      E.q.innerHTML = (G.q > 4 ? 'OT' : ['1ST', '2ND', '3RD', '4TH'][G.q - 1]) + ' ' + UI.fmtClock(G.clock) + '<small>' + Math.ceil(Math.max(0, G.shotClock)) + '</small>';
    }
    var h = G.human, charging = h && h.charging;
    E.meter.style.visibility = charging ? 'visible' : 'hidden';
    if (charging) { var gw = 0.12 * h.st.greenWin; E.green.style.left = ((0.65 - gw / 2) * 100) + '%'; E.green.style.width = (gw * 100) + '%'; E.mark.style.left = (G.charge * 100) + '%'; }
  };
})(window.HW);
