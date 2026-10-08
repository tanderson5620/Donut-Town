/* input.js - one input state for Quest controllers and desktop mouse/keyboard */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U;
  var I = HW.Input = {
    vr: false,
    move: { x: 0, y: 0 },        // stick: x right, y forward
    turbo: false, shootHeld: false, shootEdge: false, shootRelease: false,
    jump: false, pass: false, steal: false, pause: false, recenter: false, camToggle: false, sprintToggle: false,
    snap: 0, smoothTurn: 0,
    lookYaw: 0, lookPitch: -0.18,             // desktop camera angles
    hands: [], rays: [], keys: {}, mouse: { x: 0, y: 0, down: false, inside: false },
    charge: 0, wantLock: false, locked: false, cursorMenu: true
  };
  for (var h = 0; h < 2; h++) I.hands.push({ hand: h ? 'right' : 'left', valid: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), hist: [], grip: false, gripEdge: false, gripRelease: false, trig: 0, trigEdge: false, ctrl: null });
  var _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _off = new THREE.Vector3(0, 0, -0.1);
  var prevBtn = {}, snapReady = true, canvas = null, camera = null;

  I.init = function (cv, cam) {
    canvas = cv; camera = cam;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return; var k = e.code; I.keys[k] = true; HW.Audio.init();
      if (k === 'Space') { I.jump = true; e.preventDefault(); }
      else if (k === 'KeyQ') I.pass = true; else if (k === 'KeyE') I.steal = true;
      else if (k === 'KeyC') I.camToggle = true; else if (k === 'Escape' || k === 'KeyP') I.pause = true; else if (k === 'KeyR') I.recenter = true;
    });
    window.addEventListener('keyup', function (e) { I.keys[e.code] = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('mousedown', function (e) {
      HW.Audio.init();
      if (e.button === 2) { I.steal = true; return; }
      if (I.wantLock && !I.locked && !I.noLock && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (er) { I.noLock = true; } return; }   // the capturing click is not a shot
      I.mouse.down = true; I.shootHeld = true; I.shootEdge = true; I.mouseEdge = true;
    });
    window.addEventListener('mouseup', function (e) { if (e.button === 2) return; if (I.mouse.down) { I.shootRelease = true; I.mouseUp = true; } I.mouse.down = false; I.shootHeld = false; });
    window.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect(); I.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; I.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      I.mouse.inside = true;
      if (I.locked) { I.lookYaw -= e.movementX * 0.0025; I.lookPitch = U.clamp(I.lookPitch - e.movementY * 0.0025, -0.9, 0.6); }
    });
    document.addEventListener('pointerlockchange', function () {
      var was = I.locked; I.locked = document.pointerLockElement === canvas;
      if (was && !I.locked && !I.ignoreUnlock) I.pause = true; I.ignoreUnlock = false;
    });
    document.addEventListener('pointerlockerror', function () { I.noLock = true; });
    I.rays.push({ origin: new THREE.Vector3(), dir: new THREE.Vector3(), pressed: false, justPressed: false, hand: null });
  };

  I.exitLock = function () { if (document.pointerLockElement && document.exitPointerLock) { I.ignoreUnlock = true; document.exitPointerLock(); } };
  I.resetHistory = function () { I.hands.forEach(function (h) { h.hist.length = 0; h.vel.set(0, 0, 0); }); };
  I.onControllerChange = function () { I.resetHistory(); };

  function btn(gp, i) { return gp && gp.buttons[i] ? gp.buttons[i] : null; }
  function edge(key, now) { var was = prevBtn[key]; prevBtn[key] = now; return now && !was; }

  // Called once per frame before the game update. `now` is performance seconds.
  I.update = function (dt, now, rig) {
    var xr = HW.XR;
    I.vr = !!xr.presenting;
    if (I.vr) {
      rig.updateMatrixWorld(true);
      var stickL = { x: 0, y: 0 }, stickR = { x: 0, y: 0 }, turbo = false;
      I.rays.length = 0;
      for (var n = 0; n < xr.ctrls.length; n++) {
        var c = xr.ctrls[n], src = c.src, gp = src && src.gamepad, side = c.hand, hs = I.hands[side === 'left' ? 0 : 1];
        hs.ctrl = c; hs.valid = !!src;
        if (!src) continue;
        // hand position: grip space nudged forward into the palm
        _v.copy(_off); c.grip.localToWorld(_v); hs.pos.copy(_v);
        hs.hist.push({ t: now, p: _v.clone() }); while (hs.hist.length > 2 && now - hs.hist[0].t > 0.13) hs.hist.shift();
        if (hs.hist.length > 1) { var a = hs.hist[0], b = hs.hist[hs.hist.length - 1], d = Math.max(0.016, b.t - a.t); hs.vel.copy(b.p).sub(a.p).multiplyScalar(1 / d); }
        var trig = btn(gp, 0), sq = btn(gp, 1), ax = gp ? gp.axes : [0, 0, 0, 0];
        var sx = ax.length > 3 ? ax[2] : ax[0], sy = ax.length > 3 ? ax[3] : ax[1];
        hs.trig = trig ? trig.value : 0; var tp = hs.trig > 0.6; hs.trigEdge = edge(side + 'T', tp); hs.trigDown = tp;
        var g = sq ? (sq.value > 0.55 || sq.pressed) : false; hs.gripEdge = edge(side + 'G', g); hs.gripRelease = !g && prevBtn[side + 'Gp'] === true; prevBtn[side + 'Gp'] = g; hs.grip = g;
        var b4 = btn(gp, 4), b5 = btn(gp, 5), b3 = btn(gp, 3);
        if (side === 'left') {
          stickL.x = sx; stickL.y = sy;
          if (edge('X', b4 && b4.pressed)) I.jump = true;
          if (edge('Y', b5 && b5.pressed)) I.pause = true;
          if (edge('LS', b3 && b3.pressed)) I.recenter = true;
        } else {
          stickR.x = sx; stickR.y = sy; turbo = tp;
          if (edge('A', b4 && b4.pressed)) I.pass = true;
          if (edge('B', b5 && b5.pressed)) I.steal = true;
        }
        I.rays.push({ origin: c.ray.getWorldPosition(new THREE.Vector3()), dir: new THREE.Vector3(0, 0, -1).applyQuaternion(c.ray.getWorldQuaternion(_q)), pressed: tp, justPressed: hs.trigEdge, hand: side, ctrl: c });
      }
      var dz = 0.18;
      function dead(v) { return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz); }
      I.move.x = dead(stickL.x); I.move.y = -dead(stickL.y); I.turbo = turbo;
      // left-handed players: nothing special, controllers are mapped by handedness
      var rx = dead(stickR.x);
      I.snap = 0; I.smoothTurn = 0;
      if (HW.settings.turnMode === 'snap') {
        if (Math.abs(rx) > 0.7) { if (snapReady) { I.snap = -Math.sign(rx); snapReady = false; } } else if (Math.abs(rx) < 0.35) snapReady = true;
      } else I.smoothTurn = -rx;
      // up/down on the right stick are free for menu scrolling
      I.shootHeld = false;
    } else {
      var k = I.keys, mx = 0, my = 0;
      if (k.KeyW || k.ArrowUp) my += 1; if (k.KeyS || k.ArrowDown) my -= 1; if (k.KeyD) mx += 1; if (k.KeyA) mx -= 1;
      if (I.touchMove && (I.touchMove.x || I.touchMove.y)) { mx = I.touchMove.x; my = I.touchMove.y; }
      I.move.x = mx; I.move.y = my; I.turbo = !!(k.ShiftLeft || k.ShiftRight || I.touchTurbo);
      if (k.ArrowLeft) I.lookYaw += 1.9 * dt; if (k.ArrowRight) I.lookYaw -= 1.9 * dt;
      if (camera) {
        if (!I.rays[0] || I.rays[0].ctrl) I.rays[0] = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), pressed: false, justPressed: false, hand: null };
        var rc = I.rays[0]; camera.updateMatrixWorld();
        _v.set(I.mouse.x, I.mouse.y, 0.5).unproject(camera); rc.origin.setFromMatrixPosition(camera.matrixWorld); rc.dir.copy(_v).sub(rc.origin).normalize();
        rc.justPressed = !!I.mouseEdge; rc.pressed = I.mouse.down; I.rays.length = 1;
      }
    }
  };

  // Clear one-frame edges after the game consumed them.
  I.endFrame = function () {
    I.jump = I.pass = I.steal = I.pause = I.recenter = I.camToggle = false; I.shootEdge = I.shootRelease = false; I.mouseEdge = false; I.mouseUp = false;
    I.snap = 0;
  };

  // Velocity of a hand averaged over the last ~100ms (for the physical throw).
  I.handVel = function (i) { return I.hands[i].vel; };
})(window.HW);
