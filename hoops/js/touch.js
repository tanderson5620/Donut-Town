/* touch.js - phone / tablet controls: floating joystick, arcade buttons (TURBO, PASS/STEAL, SHOOT/JUMP), pause, landscape */
window.HW = window.HW || {};
(function (HW) {
  var I = HW.Input;
  var T = HW.Touch = { stickId: null, ox: 0, oy: 0, R: 60 };
  I.touchMove = { x: 0, y: 0 }; I.touchTurbo = false;

  function $(id) { return document.getElementById(id); }

  T.init = function (canvas) {
    if (!HW.TOUCH) return;
    document.body.classList.add('touch');
    var zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
    function firstGesture() {
      HW.Audio.init();
      // Android: go fullscreen and lock to landscape. iPhone can't lock, so a "turn sideways" card covers portrait.
      if (!T.fsTried) {
        T.fsTried = true; var de = document.documentElement;
        try { var p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : null; if (p && p.then) p.then(lock, function () { }); else lock(); } catch (e) { /* not allowed */ }
      }
    }
    function lock() { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); } catch (e) { /* not supported */ } }

    // floating joystick on the left part of the screen
    zone.addEventListener('touchstart', function (e) {
      e.preventDefault(); firstGesture(); if (T.stickId !== null) return;
      var t = e.changedTouches[0]; T.stickId = t.identifier; T.ox = t.clientX; T.oy = t.clientY;
      base.style.left = T.ox + 'px'; base.style.top = T.oy + 'px'; base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });
    zone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; if (t.identifier !== T.stickId) continue;
        var dx = t.clientX - T.ox, dy = t.clientY - T.oy, d = Math.hypot(dx, dy), k = d > T.R ? T.R / d : 1;
        dx *= k; dy *= k; I.touchMove.x = dx / T.R; I.touchMove.y = -dy / T.R;
        knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      }
    }, { passive: false });
    function endStick(e) {
      for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === T.stickId) {
        T.stickId = null; I.touchMove.x = I.touchMove.y = 0; base.classList.remove('on');
      }
    }
    zone.addEventListener('touchend', endStick); zone.addEventListener('touchcancel', endStick);

    function hold(id, down, up) {
      var el = $(id);
      el.addEventListener('touchstart', function (e) { e.preventDefault(); firstGesture(); el.classList.add('down'); down(); }, { passive: false });
      function u(e) { e.preventDefault(); el.classList.remove('down'); if (up) up(); }
      el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false });
    }
    hold('bTurbo', function () { I.touchTurbo = true; }, function () { I.touchTurbo = false; });
    hold('bPass', function () { I.pass = true; });
    hold('bShoot', function () { I.shootHeld = true; I.shootEdge = true; I.mouse.down = true; }, function () { I.shootHeld = false; I.shootRelease = true; I.mouse.down = false; });
    hold('bPause', function () { I.pause = true; });
    hold('bCam', function () { I.camToggle = true; });

    // taps on the 3D menus act like mouse clicks
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault(); firstGesture();
      var t = e.changedTouches[0], r = canvas.getBoundingClientRect();
      I.mouse.x = ((t.clientX - r.left) / r.width) * 2 - 1; I.mouse.y = -((t.clientY - r.top) / r.height) * 2 + 1; I.mouseEdge = true;
    }, { passive: false });
    document.addEventListener('touchend', function () { HW.Audio.init(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  };

  // relabel the buttons for offense / defense like the arcade cabinet
  T.update = function (p) {
    if (!HW.TOUCH) return;
    var off = !!(p && p.hasBall), key = off ? 1 : 0;
    if (key === T.key) return; T.key = key;
    $('bShoot').textContent = off ? 'SHOOT' : 'JUMP';
    $('bPass').textContent = off ? 'PASS' : 'STEAL';
  };
})(window.HW);
