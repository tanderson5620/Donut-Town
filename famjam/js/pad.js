/* pad.js - a PlayStation controller (DualSense, DualShock 4) or any other standard game controller, through the browser's Gamepad
   API (a computer over USB or Bluetooth, a phone or tablet over Bluetooth). In a game: the left stick (or the D-pad) moves,
   CROSS shoots (hold, let go at the top) and jumps on defense, SQUARE passes and steals, CIRCLE shoves (dunks with the ball), R2 /
   R1 / L2 / L1 turbo, OPTIONS pauses. On the menus the controller gets a cursor: the D-pad or the stick moves it from button to
   button, CROSS presses the one it's on (or does the screen's main thing, like Enter), CIRCLE goes back. Big hits rumble it (they
   follow the screen shake). Only controllers the browser reports with the standard layout count, so a VR headset's own
   controllers (the VR page) are left alone. */
window.HW = window.HW || {};
(function (HW) {
  var P = HW.Pad = { active: false, name: '', focus: null, lastT: 0 };
  var X = HW.GFX, prev = {}, navT = 0, navDir = null, shake0 = 0, connT = -1e9;
  var B = { X: 0, O: 1, S: 2, T: 3, L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPT: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  function now() { return performance.now(); }
  function pad() {
    var ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].connected && ps[i].mapping === 'standard') return ps[i];
    return null;
  }
  window.addEventListener('gamepadconnected', function (e) { if (e.gamepad && e.gamepad.mapping === 'standard') { connT = now(); P.name = /054c|dualsense|dualshock|wireless controller/i.test(e.gamepad.id) ? 'PLAYSTATION CONTROLLER' : 'CONTROLLER'; } });
  window.addEventListener('touchstart', function () { if (P.active) { P.active = false; document.body.classList.remove('pad'); } }, { passive: true });
  function pressed(gp, k) { var b = gp.buttons[B[k]]; return !!b && (b.pressed || b.value > 0.4); }
  function edge(gp, k) { var d = pressed(gp, k), was = !!prev[k]; prev[k] = d; return d && !was ? 1 : !d && was ? -1 : 0; }
  // the buttons on this screen the cursor can go to (not the tap-anywhere ones that cover the whole screen)
  function targets() { var UI = HW.JamUI; return (UI.btns || []).filter(function (b) { return !b.disabled && b.w * b.h < 0.6 * X.W * X.H; }); }
  function byId(id) { var t = targets(); for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function mid(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  // the next button that way: the nearest one in that direction, sideways distance counting double
  function move(dir) {
    var t = targets(); if (!t.length) return;
    var cur = P.focus && byId(P.focus);
    if (!cur) { t.sort(function (a, b) { return a.y - b.y || a.x - b.x; }); P.focus = t[0].id; return; }
    var c = mid(cur), dx = dir === 'LEFT' ? -1 : dir === 'RIGHT' ? 1 : 0, dy = dir === 'UP' ? -1 : dir === 'DOWN' ? 1 : 0, best = null, bs = 1e9;
    t.forEach(function (b) {
      if (b === cur) return; var m = mid(b), vx = m.x - c.x, vy = m.y - c.y, along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along < 4) return; var sc = along + 2 * side; if (sc < bs) { bs = sc; best = b; }
    });
    if (best) { P.focus = best.id; HW.Audio && HW.Audio.click && HW.Audio.click(); }
  }
  function rumble(gp, m) {
    var a = gp.vibrationActuator; if (!a || !a.playEffect) return;
    try { a.playEffect('dual-rumble', { startDelay: 0, duration: Math.round(110 + 200 * m), weakMagnitude: Math.min(1, 0.35 + 0.5 * m), strongMagnitude: Math.min(1, m) }); } catch (e) { }
  }
  // each frame, after the keyboard and touch (ui.js readInput): the controller adds to In
  P.read = function (In) {
    var gp = pad(); if (!gp) { if (P.active) { P.active = false; document.body.classList.remove('pad'); } return; }
    var UI = HW.JamUI, menu = !!UI.screen, ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, mag = Math.hypot(ax, ay);
    if (mag < 0.22) { ax = ay = 0; } else { var k = Math.min(1, (mag - 0.22) / 0.7) / mag; ax *= k; ay *= k; }
    if (pressed(gp, 'LEFT')) ax = -1; else if (pressed(gp, 'RIGHT')) ax = 1;
    if (pressed(gp, 'UP')) ay = -1; else if (pressed(gp, 'DOWN')) ay = 1;
    var any = ax || ay || gp.buttons.some(function (b) { return b && b.pressed; });
    if (any && !P.active) { P.active = true; document.body.classList.add('pad'); if (HW.Audio && HW.Audio.init) HW.Audio.init(); }
    if (any) P.lastT = now();
    var eX = edge(gp, 'X'), eO = edge(gp, 'O'), eS = edge(gp, 'S'), eOpt = edge(gp, 'OPT');
    if (menu !== P.wasMenu) { P.wasMenu = menu; if (In.padShoot) { In.padShoot = false; In.shootHeld = false; } }
    if (UI.screen !== P.scr) { P.scr = UI.screen; P.focus = null; }
    if (menu) {
      var dir = Math.abs(ax) > 0.6 && Math.abs(ax) >= Math.abs(ay) ? (ax < 0 ? 'LEFT' : 'RIGHT') : Math.abs(ay) > 0.6 ? (ay < 0 ? 'UP' : 'DOWN') : null, t = now();
      if (dir && (dir !== navDir || t > navT)) { move(dir); navT = t + (dir !== navDir ? 380 : 150); }
      navDir = dir;
      if (eX === 1) { var f = P.focus && byId(P.focus); if (f && (!UI.popOn || /^pop/.test(f.id))) In.tap = mid(f); else In.enter = true; }
      if (eO === 1) { var bk = !UI.popOn && (byId('back') || byId('fback') || byId('whoskip')); if (bk) In.tap = mid(bk); else In.pauseDown = true; }
      if (eOpt === 1) In.pauseDown = true;
    } else {
      if (ax || ay) { In.mx = ax; In.mz = -ay; }
      var turbo = pressed(gp, 'R2') || pressed(gp, 'R1') || pressed(gp, 'L2') || pressed(gp, 'L1');
      if (turbo) { In.comboTurbo = true; In.turbo = true; }
      if (eX === 1) { In.shootHeld = true; In.shootDown = true; In.padShoot = true; }
      else if (eX === -1 && In.padShoot) { In.shootHeld = false; In.shootUp = true; In.padShoot = false; }
      if (eS === 1) In.passDown = true;
      if (eO === 1) In.actDown = true;
      if (eOpt === 1) In.pauseDown = true;
    }
    // the big hits rumble it: whenever the screen shake jumps
    var sh = X.shake || 0; if (sh > shake0 + 0.25) rumble(gp, Math.min(1, sh / 1.4)); shake0 = sh;
  };
  // the PlayStation symbols, drawn (the arcade font has no glyphs for them): cross, circle, square, triangle
  var COL = { x: '#7fb2ff', o: '#ff6b6b', s: '#ff8ee0', t: '#47e3a4' };
  P.glyph = function (g, k, x, y, r) {
    g.save(); g.fillStyle = '#111426'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.stroke();
    g.strokeStyle = COL[k]; g.lineWidth = Math.max(1.5, r * 0.22); g.beginPath(); var q = r * 0.48;
    if (k === 'x') { g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x + q, y - q); g.lineTo(x - q, y + q); }
    else if (k === 'o') g.arc(x, y, q * 1.05, 0, 6.283);
    else if (k === 's') g.rect(x - q * 0.9, y - q * 0.9, q * 1.8, q * 1.8);
    else { g.moveTo(x, y - q * 1.05); g.lineTo(x + q * 1.05, y + q * 0.75); g.lineTo(x - q * 1.05, y + q * 0.75); g.closePath(); }
    g.stroke(); g.restore();
  };
  // a line of controls with the symbols in it, centred: parts are words or one of 'x' 'o' 's' 't'
  P.legend = function (g, parts, cx, y, scale) {
    var Fo = HW.Font, sc = scale || 1, r = 4 + 2 * sc, gap = 4 * sc, w = 0;
    parts.forEach(function (p) { w += (COL[p] ? r * 2 : Fo.measure(p, sc)) + gap; });
    var x = Math.round(cx - w / 2);
    parts.forEach(function (p) {
      if (COL[p]) { P.glyph(g, p, x + r, y, r); x += r * 2 + gap; }
      else { Fo.draw(g, p, x, y, { scale: sc, scheme: 'gray', align: 'left', shadow: 0 }); x += Fo.measure(p, sc) + gap; }
    });
  };
  var MAIN = ['popyes', 'go', 'resume', 'again'];   // where the cursor starts: JOIN / CHALLENGE on a pop-up, PLAY, RESUME, PLAY AGAIN
  P.PLAY = ['MOVE: STICK', 'x', 'SHOOT', 's', 'PASS', 'o', 'SHOVE/DUNK', 'R2 TURBO', 'OPTIONS PAUSE'];
  // on the menus (ui.js drawMenu, after the buttons): the cursor round the button it's on, and a note when a controller connects
  P.draw = function (g) {
    var t = now(), UI = HW.JamUI, Fo = HW.Font;
    if (P.active && !P.focus) for (var i = 0; i < MAIN.length; i++) if (byId(MAIN[i])) { P.focus = MAIN[i]; break; }   // (the screen's main button first)
    if (P.active && P.focus) {
      var b = byId(P.focus);
      if (b) {   // a thick blinking frame, yellow and white, outlined in black so it shows on any colour
        g.save(); g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        g.lineWidth = 4; g.strokeStyle = Math.floor(t / 180) % 2 ? '#ffe14d' : '#ffffff'; g.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); g.restore();
      }
      else P.focus = null;
    }
    if (t - connT < 4000 && UI.screen) {
      var msg = (P.name || 'CONTROLLER') + ' CONNECTED', w = Fo.measure(msg, 1) + 70, x = Math.round((X.W - w) / 2);
      g.fillStyle = 'rgba(5,6,24,0.88)'; g.fillRect(x, 4, w, 20); g.strokeStyle = '#22c4f2'; g.strokeRect(x + 0.5, 4.5, w - 1, 19);
      Fo.draw(g, msg, x + 8, 14, { scale: 1, scheme: 'cyan', align: 'left', shadow: 0 }); P.glyph(g, 'x', x + w - 52, 14, 6); Fo.draw(g, 'SELECT', x + w - 44, 14, { scale: 1, scheme: 'white', align: 'left', shadow: 0 });
    }
  };
})(window.HW);
