/* menus.js - laser-pointer menus: title, team, pick two, pick yours, settings, how to play, pause, results */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U, UI = HW.UI, I = HW.Input, Au = HW.Audio;
  var M = HW.Menu = { screen: null, open: false, st: { team: 0, picks: [], ctrl: null, diff: 'normal' }, back: 'title' };
  var panel, cursor, _v = new THREE.Vector3();
  var STATS = [['SPD', 'speed'], ['3PT', 'tp'], ['DNK', 'dunk'], ['STL', 'steal'], ['BLK', 'block'], ['STR', 'str']];

  M.init = function (scene) {
    panel = M.panel = new UI.Panel(2.4, 1.5, 1536, 960, { order: 40 }); scene.add(panel.mesh); panel.mesh.visible = false;
    panel.draw = function (g, w, h) { M.draw(g, w, h, panel); };
    cursor = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.022, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false })); cursor.renderOrder = 50; cursor.visible = false; scene.add(cursor);
    M.st.diff = HW.settings.difficulty;
  };

  M.show = function (screen) {
    if (screen === 'settings' && M.screen !== 'settings') M.back = M.screen || 'title';
    M.screen = screen; M.open = true; panel.mesh.visible = true; panel.hover = null; panel.redraw(); M.place();
    I.exitLock(); I.wantLock = false;
  };
  M.hide = function () {
    M.open = false; panel.mesh.visible = false; cursor.visible = false; M.screen = null;
    HW.XR.ctrls.forEach(function (c) { c.laser.visible = false; });
  };

  // put the panel 2.4 m in front of the viewer, facing them
  M.place = function () {
    var v = HW.view, yaw = v.yaw, d = 2.3;
    if (!I.vr && HW.Game.phase === 'menu') { panel.mesh.position.set(0, 1.55, 3.7); panel.mesh.rotation.set(0, 0, 0); panel.mesh.updateMatrixWorld(true); return; }
    if (!I.vr) {   // flat screen: straight down the camera's line of sight, whatever camera is active
      var cam = HW.ctx.camera, dd = cam.fov < 50 ? 2.7 : 2.3; cam.updateMatrixWorld(true); cam.getWorldDirection(_v);
      panel.mesh.position.setFromMatrixPosition(cam.matrixWorld).addScaledVector(_v, dd); panel.mesh.quaternion.copy(cam.quaternion); panel.mesh.updateMatrixWorld(true); return;
    }
    var y = v.pos.y - 0.12;
    panel.mesh.position.set(v.pos.x - Math.sin(yaw) * d, y, v.pos.z - Math.cos(yaw) * d); panel.mesh.rotation.set(0, yaw, 0); panel.mesh.updateMatrixWorld(true);
  };

  /* ---------- per-frame: pointer rays -> hover/click ---------- */
  M.update = function (dt) {
    if (!M.open) return;
    var best = null, i, hit, r;
    for (i = 0; i < I.rays.length; i++) {
      r = I.rays[i]; hit = panel.hit(r.origin, r.dir);
      if (r.ctrl) { r.ctrl.laser.visible = true; r.ctrl.laser.scale.z = hit ? hit.t : 2.5; }
      if (hit && (!best || r.pressed || r.justPressed)) best = { hit: hit, ray: r };
    }
    var b = best ? panel.btnAt(best.hit.px, best.hit.py) : null, id = b && !b.disabled ? b.id : null;
    if (id !== panel.hover) { panel.hover = id; if (id) Au.hover(); panel.redraw(); }
    if (best) {
      cursor.visible = true; var r2 = best.ray; _v.copy(r2.origin).addScaledVector(r2.dir, best.hit.t - 0.01); cursor.position.copy(_v); cursor.quaternion.copy(panel.mesh.quaternion);
    } else cursor.visible = false;
    if (best && best.ray.justPressed && b && !b.disabled && b.onClick) {
      Au.click(); if (best.ray.ctrl && best.ray.ctrl.src && best.ray.ctrl.src.gamepad && best.ray.ctrl.src.gamepad.hapticActuators && best.ray.ctrl.src.gamepad.hapticActuators[0]) { try { best.ray.ctrl.src.gamepad.hapticActuators[0].pulse(0.5, 40); } catch (e) { /* no haptics */ } }
      b.onClick(); panel.redraw();
    }
  };

  /* ---------- drawing ---------- */
  function frame(p, g, w, h, title, sub) {
    g.clearRect(0, 0, w, h);
    U.roundRect(g, 6, 6, w - 12, h - 12, 44); g.fillStyle = 'rgba(8,10,26,0.94)'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#ff8a1f'; g.stroke();
    if (title) p.text(title, w / 2, 86, 66, '#ffffff', 'center', { stroke: '#000', strokeW: 10 });
    if (sub) p.text(sub, w / 2, 150, 32, '#aab4d8', 'center', { weight: 'normal' });
  }
  function hoopBall(g, x, y, r) {
    g.save(); g.translate(x, y); g.fillStyle = '#e8701a'; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
    g.strokeStyle = '#1a0d05'; g.lineWidth = r * 0.07;
    g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke(); g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
    g.beginPath(); g.arc(-r * 1.25, 0, r * 0.9, -0.95, 0.95); g.stroke(); g.beginPath(); g.arc(r * 1.25, 0, r * 0.9, Math.PI - 0.95, Math.PI + 0.95); g.stroke();
    g.restore();
  }
  function statBars(p, g, x, y, w, def) {
    STATS.forEach(function (s, i) {
      var yy = y + i * 34, v = def.stats[s[1]];
      p.text(s[0], x, yy, 22, '#9aa5cc', 'left'); g.fillStyle = '#1b2040'; g.fillRect(x + 62, yy - 9, w - 62, 18);
      g.fillStyle = v >= 9 ? '#ffd23f' : v >= 6 ? '#5cffa0' : '#6ec6ff'; g.fillRect(x + 62, yy - 9, (w - 62) * v / 10, 18);
    });
  }
  function badge(g, x, y, r, def) {
    g.fillStyle = def.color; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(r * 0.95) + 'px ' + UI.FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(String(def.num), x, y + 3); g.fillText(String(def.num), x, y + 3);
  }
  function toggleRow(p, y, label, id, opts, cur, onPick) {
    p.text(label, 120, y + 36, 40, '#ffffff', 'left');
    var bw = Math.min(250, 760 / opts.length), x0 = 1416 - bw * opts.length;
    opts.forEach(function (o, i) { p.button(id + i, x0 + i * bw, y, bw - 10, 72, o.label, { selected: cur === o.v, size: 34, onClick: function () { onPick(o.v); } }); });
  }

  M.draw = function (g, w, h, p) {
    var s = M.screen, st = M.st, S = HW.settings;
    if (s === 'title') {
      frame(p, g, w, h); hoopBall(g, w / 2, 200, 92);
      p.text('HOOPS', w / 2, 350, 120, '#ffffff', 'center', { stroke: '#000', strokeW: 16 }); p.text('JAM', w / 2, 455, 90, '#ff8a1f', 'center', { stroke: '#000', strokeW: 14 });
      p.text('2-ON-2 ARCADE BASKETBALL  -  ANDERSONS vs GORMANS', w / 2, 540, 30, '#aab4d8', 'center', { weight: 'normal' });
      p.button('play', 468, 590, 600, 120, 'PLAY', { size: 64, selected: true, onClick: function () { M.show('team'); } });
      p.button('how', 468, 740, 290, 90, 'HOW TO PLAY', { size: 32, onClick: function () { M.show('how'); } });
      p.button('settings', 778, 740, 290, 90, 'SETTINGS', { size: 32, onClick: function () { M.show('settings'); } });
      p.text(I.vr ? 'Point a controller at a button and pull the trigger' : HW.TOUCH ? 'Tap a button' : 'Click a button with the mouse', w / 2, 890, 28, '#7f8ab0', 'center', { weight: 'normal' });
    } else if (s === 'team') {
      frame(p, g, w, h, 'CHOOSE YOUR TEAM', 'Pick the crew you want to play with');
      HW.TEAMS.forEach(function (t, i) {
        var x = 110 + i * 710, y = 210;
        U.roundRect(g, x, y, 640, 560, 36); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill(); g.lineWidth = 6; g.strokeStyle = t.color; g.stroke();
        p.text(t.name.toUpperCase(), x + 320, y + 70, 64, t.color, 'center', { stroke: '#000', strokeW: 10 });
        t.roster.forEach(function (id, k) { var d = HW.PLAYERS[id]; badge(g, x + 70, y + 160 + k * 72, 26, d); p.text(d.name, x + 120, y + 158 + k * 72, 34, '#fff', 'left'); p.text(HW.TYPES[d.type].label, x + 600, y + 158 + k * 72, 26, '#9aa5cc', 'right', { weight: 'normal' }); });
        p.button('team' + i, x + 120, y + 470, 400, 74, 'PLAY AS ' + t.short, { selected: false, color: t.color, size: 34, onClick: function () { st.team = i; st.picks = []; st.ctrl = null; M.show('pick'); } });
      });
      p.button('back', 60, 840, 260, 80, 'BACK', { size: 36, onClick: function () { M.show('title'); } });
    } else if (s === 'pick') {
      var t = HW.TEAMS[st.team]; frame(p, g, w, h, 'PICK YOUR 2 PLAYERS', t.name + ' roster  -  choose two (' + st.picks.length + '/2)');
      var n = t.roster.length, gap = 22, cw = Math.min(330, (w - 140 - (n - 1) * gap) / n), x0 = (w - (n * cw + (n - 1) * gap)) / 2;
      t.roster.forEach(function (id, i) {
        var d = HW.PLAYERS[id], x = x0 + i * (cw + gap), y = 200, sel = st.picks.indexOf(id) >= 0;
        var b = p.button('pl' + id, x, y, cw, 560, '', { selected: false, color: sel ? '#5cffa0' : d.color, onClick: function () { var k = st.picks.indexOf(id); if (k >= 0) st.picks.splice(k, 1); else { if (st.picks.length >= 2) st.picks.shift(); st.picks.push(id); } } });
        if (sel) { g.save(); U.roundRect(g, x, y, cw, 560, 24); g.fillStyle = 'rgba(92,255,160,0.16)'; g.fill(); g.restore(); }
        badge(g, x + cw / 2, y + 90, 56, d);
        p.text(d.first.toUpperCase(), x + cw / 2, y + 190, 44, '#fff', 'center'); p.text(d.name.split(' ')[1].toUpperCase(), x + cw / 2, y + 230, 26, '#9aa5cc', 'center', { weight: 'normal' });
        p.text(HW.TYPES[d.type].label.toUpperCase(), x + cw / 2, y + 276, 28, d.color, 'center');
        statBars(p, g, x + 30, y + 330, cw - 60, d);
        if (sel) p.text('PICKED', x + cw / 2, y + 530, 30, '#5cffa0', 'center');
      });
      p.button('back', 60, 840, 260, 80, 'BACK', { size: 36, onClick: function () { M.show('team'); } });
      p.button('next', 1216, 840, 260, 80, 'NEXT', { size: 36, selected: st.picks.length === 2, disabled: st.picks.length !== 2, onClick: function () { st.ctrl = st.picks[0]; M.show('control'); } });
    } else if (s === 'control') {
      frame(p, g, w, h, 'WHO DO YOU CONTROL?', 'You play one - the computer plays the other');
      st.picks.forEach(function (id, i) {
        var d = HW.PLAYERS[id], x = 150 + i * 650, y = 190, sel = st.ctrl === id;
        p.button('c' + id, x, y, 580, 450, '', { color: d.color, onClick: function () { st.ctrl = id; } });
        if (sel) { U.roundRect(g, x, y, 580, 450, 24); g.fillStyle = 'rgba(92,255,160,0.16)'; g.fill(); }
        badge(g, x + 110, y + 130, 66, d); p.text(d.name, x + 400, y + 90, 40, '#fff', 'center'); p.text(HW.TYPES[d.type].label.toUpperCase(), x + 400, y + 140, 28, d.color, 'center'); p.text(HW.TYPES[d.type].blurb, x + 400, y + 185, 22, '#aab4d8', 'center', { weight: 'normal' });
        statBars(p, g, x + 50, y + 252, 480, d);
        p.text(sel ? 'YOU' : 'COMPUTER', x + 110, y + 212, 26, sel ? '#5cffa0' : '#7f8ab0', 'center');
      });
      toggleRow(p, 660, 'DIFFICULTY', 'diff', [{ label: 'EASY', v: 'easy' }, { label: 'NORMAL', v: 'normal' }, { label: 'HARD', v: 'hard' }], st.diff, function (v) { st.diff = v; S.difficulty = v; HW.saveSettings(); });
      var opp = M.opponents(); p.text('vs  ' + opp.map(function (id) { return HW.PLAYERS[id].first; }).join(' & ') + '  (' + HW.TEAMS[1 - st.team].name + ')', w / 2, 790, 32, '#aab4d8', 'center', { weight: 'normal' });
      p.button('back', 60, 840, 260, 80, 'BACK', { size: 36, onClick: function () { M.show('pick'); } });
      p.button('start', 1056, 830, 420, 96, 'START GAME', { size: 48, selected: true, onClick: function () { M.startGame(); } });
    } else if (s === 'settings') {
      frame(p, g, w, h, 'SETTINGS', 'Comfort and sound');
      toggleRow(p, 190, 'TURNING', 'turn', [{ label: 'SNAP', v: 'snap' }, { label: 'SMOOTH', v: 'smooth' }], S.turnMode, function (v) { S.turnMode = v; HW.saveSettings(); });
      if (S.turnMode === 'snap') toggleRow(p, 280, 'SNAP ANGLE', 'sa', [{ label: '30', v: 30 }, { label: '45', v: 45 }, { label: '60', v: 60 }], S.snapAngle, function (v) { S.snapAngle = v; HW.saveSettings(); });
      else toggleRow(p, 280, 'TURN SPEED', 'ss', [{ label: 'SLOW', v: 60 }, { label: 'MEDIUM', v: 100 }, { label: 'FAST', v: 150 }], S.smoothSpeed, function (v) { S.smoothSpeed = v; HW.saveSettings(); });
      toggleRow(p, 370, 'VIGNETTE WHEN MOVING', 'vg', [{ label: 'ON', v: true }, { label: 'OFF', v: false }], S.vignette, function (v) { S.vignette = v; HW.saveSettings(); });
      toggleRow(p, 460, 'PLAY POSITION', 'seat', [{ label: 'STANDING', v: false }, { label: 'SEATED', v: true }], S.seated, function (v) { HW.ctx.setSeated(v); });
      toggleRow(p, 550, 'ANNOUNCER VOICE', 'voice', [{ label: 'ON', v: true }, { label: 'OFF', v: false }], S.announcer, function (v) { S.announcer = v; Au.voice = v; HW.saveSettings(); });
      toggleRow(p, 640, 'VOLUME', 'vol', [{ label: 'LOW', v: 0.4 }, { label: 'MED', v: 0.7 }, { label: 'HIGH', v: 1 }], S.sfx, function (v) { S.sfx = v; Au.setVolume(v); HW.saveSettings(); });
      if (!HW.HEADSET && !I.vr) toggleRow(p, 730, 'GRAPHICS (RELOADS)', 'gfx', [{ label: 'HIGH', v: 'high' }, { label: 'FAST', v: 'fast' }], S.graphics === 'fast' ? 'fast' : 'high', function (v) { S.graphics = v; HW.saveSettings(); location.reload(); });
      else toggleRow(p, 730, 'VR JUMP HEIGHT', 'vj', [{ label: 'NONE', v: 0 }, { label: 'LOW', v: 0.5 }, { label: 'FULL', v: 1 }], S.vrJump, function (v) { S.vrJump = v; HW.saveSettings(); });
      p.button('recenter', 60, 840, 400, 80, 'RECENTER HEIGHT', { size: 30, onClick: function () { HW.ctx.recenter(); M.place(); } });
      p.button('back', 1216, 840, 260, 80, 'BACK', { size: 36, selected: true, onClick: function () { M.show(M.back || 'title'); } });
    } else if (s === 'how') {
      frame(p, g, w, h, 'HOW TO PLAY', 'Score more than the Gormans (or Andersons) in 4 quarters of 3 minutes');
      var L = [['LEFT STICK', 'Move'], ['RIGHT STICK', 'Turn (snap or smooth)'], ['RIGHT TRIGGER', 'Turbo (+ drive at the rim = DUNK)'], ['GRIP', 'Hold the ball; release while swinging to throw'], ['A', 'Pass to your teammate'], ['B', 'Steal / shove'], ['X  or raise left hand', 'Jump'], ['Y', 'Pause menu'], ['LEFT STICK CLICK', 'Recenter height']];
      p.text('QUEST CONTROLLERS', 400, 215, 36, '#ff8a1f', 'center');
      L.forEach(function (r, i) { p.text(r[0], 90, 280 + i * 54, 26, '#ffd23f', 'left'); p.text(r[1], 390, 280 + i * 54, 25, '#e8ecff', 'left', { weight: 'normal' }); });
      var D = HW.TOUCH ? [['Left thumb', 'Joystick: move'], ['SHOOT (hold)', 'Release near green to shoot'], ['JUMP', 'On defense: jump / block'], ['PASS', 'Pass to your teammate'], ['STEAL', 'On defense: swipe the ball'], ['TURBO (hold)', 'Speed burst; + drive = DUNK'], ['TURBO + STEAL', 'Shove'], ['CAM', 'Arcade / behind / first person'], ['II', 'Pause menu']]
        : [['WASD / arrows', 'Move'], ['Hold click', 'Charge a shot, release near green'], ['Click (defense)', 'Jump / block'], ['Shift', 'Turbo (+ drive at the rim = DUNK)'], ['Space', 'Jump'], ['Q', 'Pass (steal on defense)'], ['E / right click', 'Steal (+ Shift: shove)'], ['C', 'Camera: arcade / behind / first person'], ['Esc', 'Pause menu']];
      p.text(HW.TOUCH ? 'PHONE' : 'DESKTOP', 1150, 215, 36, '#6ec6ff', 'center');
      D.forEach(function (r, i) { p.text(r[0], 830, 280 + i * 54, 26, '#ffd23f', 'left'); p.text(r[1], 1080, 280 + i * 54, 25, '#e8ecff', 'left', { weight: 'normal' }); });
      p.text('3 makes in a row = ON FIRE: flaming ball and unlimited turbo until the other team scores.  Goaltending is off, shoving is on.', w / 2, 790, 26, '#aab4d8', 'center', { weight: 'normal' });
      p.button('back', 640, 840, 260, 80, 'BACK', { size: 36, selected: true, onClick: function () { M.show('title'); } });
    } else if (s === 'pause') {
      frame(p, g, w, h, 'PAUSED', HW.TEAMS[0].short + ' ' + HW.Game.score[0] + '  -  ' + HW.Game.score[1] + ' ' + HW.TEAMS[1].short);
      p.button('resume', 468, 230, 600, 110, 'RESUME', { size: 56, selected: true, onClick: function () { HW.Game.resume(); } });
      p.button('rec', 468, 370, 600, 90, 'RECENTER HEIGHT', { size: 36, onClick: function () { HW.ctx.recenter(); } });
      p.button('set', 468, 490, 600, 90, 'SETTINGS', { size: 36, onClick: function () { M.show('settings'); } });
      p.button('how', 468, 610, 600, 90, 'CONTROLS', { size: 36, onClick: function () { M.back = 'pause'; M.screen = 'how'; panel.redraw(); } });
      p.button('quit', 468, 730, 600, 90, 'QUIT TO TITLE', { size: 36, color: '#ff5a4a', onClick: function () { HW.Game.quit(); } });
    } else if (s === 'results') {
      var G = HW.Game, win = G.score[0] > G.score[1] ? 0 : 1, T = HW.TEAMS;
      frame(p, g, w, h); p.text(T[win].name.toUpperCase() + ' WIN!', w / 2, 90, 80, T[win].color, 'center', { stroke: '#000', strokeW: 12 });
      p.text(G.score[0] + '  -  ' + G.score[1], w / 2, 190, 100, '#fff', 'center', { stroke: '#000', strokeW: 12 });
      p.text(G.humanTeam === win ? 'YOU WIN! WHAT A PERFORMANCE!' : 'TOUGH LOSS - RUN IT BACK?', w / 2, 262, 34, G.humanTeam === win ? '#5cffa0' : '#ff9f8a', 'center');
      var cols = [['PLAYER', 120, 'left'], ['PTS', 700, 'center'], ['FG', 820, 'center'], ['3PT', 940, 'center'], ['DNK', 1060, 'center'], ['STL', 1180, 'center'], ['BLK', 1290, 'center'], ['SHV', 1400, 'center']];
      cols.forEach(function (c) { p.text(c[0], c[1], 320, 28, '#8f9ac2', c[2]); });
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(90, 340, w - 180, 3);
      G.players.slice().sort(function (a, b) { return a.team - b.team; }).forEach(function (pl, i) {
        var y = 395 + i * 84, s2 = pl.stats; g.fillStyle = pl.def.color; g.beginPath(); g.arc(106, y, 16, 0, 6.283); g.fill();
        p.text(pl.def.name + (pl.isHuman ? '  (YOU)' : ''), 140, y, 32, '#fff', 'left'); p.text(HW.TEAMS[pl.team].short, 600, y, 24, HW.TEAMS[pl.team].color, 'center');
        var v = [s2.pts, s2.fgm + '/' + s2.fga, s2.tpm + '/' + s2.tpa, s2.dunks, s2.steals, s2.blocks, s2.shoves];
        v.forEach(function (x, k) { p.text(String(x), cols[k + 1][1], y, 34, k === 0 ? '#ffd23f' : '#e8ecff', 'center'); });
      });
      p.button('rematch', 130, 780, 420, 110, 'REMATCH', { size: 54, selected: true, onClick: function () { HW.Game.rematch(); } });
      p.button('teams', 570, 780, 420, 110, 'CHANGE TEAMS', { size: 40, onClick: function () { st.picks = []; M.show('team'); } });
      p.button('title', 1010, 780, 400, 110, 'TITLE', { size: 40, onClick: function () { HW.Game.quit(); } });
    }
  };

  // The opponents: two random players from the other roster (kept while the menu session lasts)
  M.opponents = function () {
    var key = M.st.team;
    if (!M.opp || M.oppFor !== key) {
      var r = HW.TEAMS[1 - key].roster.slice(); for (var i = r.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = r[i]; r[i] = r[j]; r[j] = t; }
      M.opp = r.slice(0, 2); M.oppFor = key;
    }
    return M.opp;
  };

  M.startGame = function () {
    var st = M.st, mate = st.picks.filter(function (id) { return id !== st.ctrl; })[0], teams = [null, null];
    teams[st.team] = [st.ctrl, mate]; teams[1 - st.team] = M.opponents().slice();
    M.hide(); HW.Game.start({ teams: teams, human: st.ctrl, difficulty: st.diff });
  };
})(window.HW);
