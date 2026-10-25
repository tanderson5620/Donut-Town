/* ps.js - FAM JAM in a PlayStation's own web browser (PS5: the built-in browser, opened from a link; PS4: the Internet Browser).
   Those browsers can keep the controller for themselves - the left stick moves the browser's pointer, CROSS clicks with it,
   CIRCLE goes back a page - and pass only some buttons on to the page, as key presses. So on a PlayStation there are three ways
   in, and whichever the console allows works:
   - the controller itself through the Gamepad API (pad.js), when the browser hands it over;
   - CURSOR PLAY: your player runs to the pointer (put it far off for turbo), and a click (CROSS) does what fits where it points:
     on your teammate it passes (or calls for it), on the man with the ball it steals, on another opponent it shoves, on the rim
     it dunks, anywhere else it shoots (hold, let go at the top of the jump) or jumps to block. The browser's back (CIRCLE)
     pauses instead of leaving the game;
   - SET UP BUTTONS (title screen): press the controller button you want for each of SHOOT, PASS, SHOVE / DUNK, TURBO and PAUSE;
     whatever the browser sends for it is learned and kept on this console. The same screen shows what the browser sends.
   Open the game with ?ps on a computer to try it the way a PlayStation gets it. */
window.HW = window.HW || {};
(function (HW) {
  var UA = navigator.userAgent || '';
  var P = HW.PS = { on: /PlayStation/i.test(UA) || /[?&]ps\b/.test(location.search), ptr: null, keys: {}, last: [], step: -1, turbo: false };
  P.five = /PlayStation 5/i.test(UA);
  var X = HW.GFX, ACTS = [['shoot', 'SHOOT'], ['pass', 'PASS / STEAL'], ['act', 'SHOVE / DUNK'], ['turbo', 'TURBO'], ['pause', 'PAUSE']];
  var KEY = 'famjam.pskeys';
  try { P.keys = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { P.keys = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P.keys)); } catch (e) { } }
  // older browsers (the PS4's) only give a key number; name the common ones the way newer ones do
  var CODES = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'ShiftLeft', 27: 'Escape', 32: 'Space', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
  P.code = function (e) {
    if (e.code) return e.code; var n = e.keyCode || e.which || 0;
    if (CODES[n]) return CODES[n]; if (n >= 65 && n <= 90) return 'Key' + String.fromCharCode(n); if (n >= 48 && n <= 57) return 'Digit' + (n - 48);
    return n ? 'K' + n : '';
  };
  function keyId(e) { var c = P.code(e); return c || (e.key ? 'N' + e.key : ''); }
  function nice(id) { return !id ? '-' : id.replace(/^Key|^Digit/, '').replace(/^Arrow/, '').replace(/^K(\d+)$/, 'KEY $1').replace(/^N/, '').toUpperCase(); }
  function actFor(id) { for (var a in P.keys) if (P.keys[a] === id) return a; return null; }
  function note(s) { P.last.unshift({ s: s, t: performance.now() }); if (P.last.length > 4) P.last.length = 4; }
  function padOn() { return !!(HW.Pad && HW.Pad.active); }
  // cursor play: on a PlayStation, in the game, when the controller isn't coming through as a controller
  P.cursor = function () { var G = HW.Jam; return P.on && !padOn() && !HW.JamUI.screen && !!G.human && G.phase !== 'menu' && !G.cine; };

  P.init = function (cv, toCanvas) {
    if (!P.on) return; document.body.classList.add('ps');
    cv.addEventListener('mousemove', function (e) { P.ptr = toCanvas(e.clientX, e.clientY); });
    // CIRCLE is the browser's back: keep an extra page in the history so it pauses (or goes back a menu) instead of leaving
    arm(); window.addEventListener('popstate', function () { back(); arm(); });
  };
  function arm() { try { if (!history.state || !history.state.famjam) history.pushState({ famjam: 1 }, ''); } catch (e) { } }
  function back() {
    var UI = HW.JamUI, In = HW.In; note('BACK');
    if (!UI.screen) { In.pauseDown = true; return; }
    var b = (UI.btns || []).filter(function (q) { return /^(back|fback|popno)$/.test(q.id); })[0];
    if (b) In.tap = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; else In.pauseDown = true;
  }
  // a key press: SET UP BUTTONS learning one, or a learned button doing its job (true: it's taken care of)
  P.keydown = function (e) {
    if (!P.on) return false; var id = keyId(e), UI = HW.JamUI, In = HW.In; if (!id) return false;
    note(nice(id) + (e.keyCode ? ' (' + e.keyCode + ')' : ''));
    if (UI.screen === 'psset' && P.step >= 0 && P.step < ACTS.length) {
      var a = ACTS[P.step][0], was = actFor(id); if (was) delete P.keys[was];
      P.keys[a] = id; save(); P.step++; HW.Audio && HW.Audio.click && HW.Audio.click(); e.preventDefault(); return true;
    }
    var act = actFor(id) || (id === 'Enter' && !UI.screen ? 'shoot' : null); if (!act) return false;   // (Enter shoots in the game unless it's been given another job)
    e.preventDefault(); if (e.repeat) return true;
    if (UI.screen) { if (act === 'shoot') In.enter = true; else if (act === 'pause') back(); return true; }   // (on the menus: OK and back)
    if (act === 'shoot') { In.shootHeld = true; In.shootDown = true; P.held = true; }
    else if (act === 'pass') In.passDown = true;
    else if (act === 'act') In.actDown = true;
    else if (act === 'turbo') P.turbo = true;
    else if (act === 'pause') In.pauseDown = true;
    return true;
  };
  P.keyup = function (e) {
    if (!P.on) return false; var id = keyId(e), act = actFor(id) || (id === 'Enter' && P.held ? 'shoot' : null), In = HW.In; if (!act) return false;
    if (act === 'shoot' && P.held) { P.held = false; In.shootHeld = false; In.shootUp = true; }
    if (act === 'turbo') P.turbo = false;
    return true;
  };

  // each frame after the keyboard and the controller (ui.js readInput): steer to the pointer
  P.read = function (In) {
    if (!P.on) return;
    if (P.turbo) { In.turbo = true; In.comboTurbo = true; }
    if (!P.cursor() || !P.ptr) { P.aim = null; return; }
    var G = HW.Jam, h = G.human, f = X.floorAt(P.ptr.x, P.ptr.y), K = X.K;
    if (!f) { P.aim = null; return; }
    f.z = Math.max(0.2, Math.min(K.CD - 0.2, f.z)); f.x = Math.max(-K.HL - 1, Math.min(K.HL + 1, f.x));
    var dx = f.x - h.x, dz = f.z - h.z, d = Math.hypot(dx, dz), m = Math.max(0, Math.min(1, (d - 0.45) / 1.1));
    P.aim = { x: f.x, z: f.z, run: m > 0, turbo: d > 4.5 };
    if (m > 0 && !(In.mx || In.mz)) { In.mx = dx / d * m; In.mz = dz / d * m; }
    if (P.aim.turbo && m > 0) In.turbo = true;
  };
  // a click in the game: true if it was a pass / steal / shove / dunk (not a shot)
  function under(pt, q) {
    var c = X.proj(q.x, 0, q.z), s = c.s, ht = (q.def.height || 1.8) * s;
    return pt.x > c.x - 0.45 * s - 6 && pt.x < c.x + 0.45 * s + 6 && pt.y < c.y + 6 && pt.y > c.y - ht - 0.4 * s;
  }
  P.click = function (pt) {
    if (!P.cursor() || !pt) return false;
    var G = HW.Jam, In = HW.In, h = G.human, K = X.K, hit = null, b = G.ball.holder;
    G.players.forEach(function (q) { if (q !== h && !hit && under(pt, q)) hit = q; });
    var rim = X.proj(h.team === 0 ? K.RIMX : -K.RIMX, K.RIM_H, K.HZ), onRim = Math.hypot(pt.x - rim.x, pt.y - rim.y) < 0.9 * rim.s;
    if (h.hasBall) {
      if (hit && hit.team === h.team) { In.passDown = true; return true; }
      if (onRim) { In.actDown = true; return true; }
      return false;
    }
    if (hit && hit.team !== h.team) { if (hit === b) In.passDown = true; else In.actDown = true; return true; }
    if (hit && hit.team === h.team && b === hit) { In.passDown = true; return true; }   // (your teammate: call for it)
    return false;
  };
  // in the game, over the court: a ring on the floor where your player is running to
  P.drawGame = function (g) {
    if (!P.cursor() || !P.aim || !P.aim.run) return;
    var c = X.proj(P.aim.x, 0, P.aim.z), s = c.s, col = P.aim.turbo ? '#ff7a1a' : '#ffe14d';
    g.save(); g.translate(c.x, c.y); g.scale(1, 0.31); g.beginPath(); g.arc(0, 0, 0.42 * s, 0, 6.283); g.restore();   // (a squashed circle: older browsers have no ellipse())
    g.save(); g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke(); g.lineWidth = 2; g.strokeStyle = col; g.stroke(); g.restore();
    if (P.aim.turbo) HW.Font.draw(g, 'TURBO', c.x, c.y + 0.13 * s + 8, { scale: 1, color: col, shadow: 1 });
  };

  /* ---------- SET UP BUTTONS (the 'psset' screen) ---------- */
  P.setup = function () { P.step = 0; HW.JamUI.show('psset'); };
  P.titleBtn = function (g, C) {
    var k = HW.JamUI.kit; if (!k || padOn()) return;
    k.button(g, 'psset', C.L + 8, C.T + 8, 150, 26, 'SET UP BUTTONS', { color: '#1aa6d8', size: 1, fn: P.setup });
  };
  P.help = [['MOVE:', 'POINT WHERE TO RUN (FAR OFF = TURBO)'], ['CROSS:', 'SHOOT - HOLD, LET GO AT THE TOP'], ['ON A TEAMMATE:', 'PASS (OR CALL FOR IT)'],
    ['ON A MAN:', 'STEAL FROM HIM / SHOVE HIM'], ['ON THE RIM:', 'DUNK WHEN YOU\'RE CLOSE'], ['CIRCLE:', 'PAUSE']];
  P.legend = 'POINT TO RUN  CROSS: SHOOT  CROSS ON A PLAYER: PASS / STEAL / SHOVE';
  var DEF = { shoot: 'CROSS (A CLICK)', pass: 'CLICK ON A PLAYER', act: 'CLICK ON A PLAYER / THE RIM', turbo: 'POINTER FAR OFF', pause: 'CIRCLE (BACK)' };   // (what does it when nothing's learned)
  P.drawSetup = function (g, fr) {
    var UI = HW.JamUI, k = UI.kit, Fo = HW.Font, C = k.card(g), cx = Math.round((C.L + C.R) / 2);
    k.flaming(g, 'SET UP BUTTONS', cx, C.T + 26, { scale: 3, scheme: 'yellow', outline: 2, shadow: 2 }, fr);
    var y = C.T + 56;
    if (padOn()) {
      Fo.draw(g, 'YOUR CONTROLLER IS COMING THROUGH AS A CONTROLLER:', cx, y + 10, { scale: 1, scheme: 'green', shadow: 0 });
      Fo.draw(g, 'NOTHING TO SET UP. STICK MOVES, CROSS SHOOTS, SQUARE PASSES, CIRCLE SHOVES', cx, y + 26, { scale: 1, scheme: 'white', shadow: 0 });
    } else if (P.step >= 0 && P.step < ACTS.length) {
      Fo.draw(g, 'PRESS THE CONTROLLER BUTTON FOR', cx, y + 6, { scale: 1, scheme: 'cyan', shadow: 0 });
      Fo.draw(g, ACTS[P.step][1], cx, y + 30, { scale: 3, scheme: k.blink(3) ? 'white' : 'yellow' });
      Fo.draw(g, 'NOTHING HAPPENING? THE BROWSER KEEPS THAT BUTTON: PICK ANOTHER, OR SKIP', cx, y + 54, { scale: 1, scheme: 'gray', shadow: 0 });
    } else {
      Fo.draw(g, 'ALL SET! THESE BUTTONS WORK IN THE GAME ON THIS CONSOLE', cx, y + 10, { scale: 1, scheme: 'green', shadow: 0 });
      Fo.draw(g, 'THE POINTER STILL STEERS: YOUR PLAYER RUNS TO IT', cx, y + 26, { scale: 1, scheme: 'white', shadow: 0 });
    }
    // what each one is now
    var rows = ACTS.length, top = C.T + 132, colW = Math.min(260, (C.W - 40) / 2);
    k.bevel(g, cx - colW - 10, top - 10, 2 * colW + 20, rows * 18 + 14, '#000', '#22c4f2', 3);
    ACTS.forEach(function (a, i) {
      var yy = top + 4 + i * 18, cur = i === P.step;
      Fo.draw(g, a[1], cx - 8, yy, { scale: 1, scheme: cur ? 'yellow' : 'white', align: 'right', shadow: 0 });
      Fo.draw(g, P.keys[a[0]] ? nice(P.keys[a[0]]) : cur ? '...' : DEF[a[0]], cx + 8, yy, { scale: 1, scheme: P.keys[a[0]] ? 'green' : 'gray', align: 'left', shadow: 0 });
    });
    // what the browser has sent lately (to see what reaches the game at all)
    var ly = top + rows * 18 + 22, gp = navigator.getGamepads ? [].slice.call(navigator.getGamepads() || []).filter(Boolean) : [];
    Fo.draw(g, 'LAST FROM THE CONTROLLER: ' + (P.last.length ? P.last.map(function (l) { return l.s; }).join('  ') : 'NOTHING YET'), cx, ly, { scale: 1, scheme: 'cyan', shadow: 0 });
    Fo.draw(g, gp.length ? 'GAMEPAD SEEN: ' + gp.map(function (q) { return (q.mapping || 'raw').toUpperCase(); }).join(', ') : 'NO GAMEPAD SEEN (THE POINTER AND THE BUTTONS ABOVE ARE THE WAY IN)', cx, ly + 14, { scale: 1, scheme: 'gray', shadow: 0 });
    var bw = Math.min(150, (C.W - 60) / 3), by = C.B - 40;
    k.button(g, 'psskip', cx - 1.5 * bw - 10, by, bw, 32, 'SKIP', { color: '#e0a21a', size: 2, disabled: !(P.step >= 0 && P.step < ACTS.length), fn: function () { P.step++; } });
    k.button(g, 'psagain', cx - bw / 2, by, bw, 32, 'START OVER', { color: '#e0302a', size: 1, fn: function () { P.keys = {}; save(); P.step = 0; } });
    k.button(g, 'back', cx + bw / 2 + 10, by, bw, 32, 'DONE', { color: '#1fb04c', size: 2, fn: function () { P.step = -1; UI.show('title'); } });
  };
})(window.HW);
