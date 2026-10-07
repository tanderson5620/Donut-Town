/* xr.js - hand-rolled "Enter VR" button, session handling, controller objects, lasers and gloves */
window.HW = window.HW || {};
(function (HW) {
  var XR = HW.XR = { ctrls: [], session: null, supported: false, presenting: false, onStart: null, onEnd: null };

  XR.init = function (renderer, scene, rig) {
    XR.renderer = renderer; XR.rig = rig;
    renderer.xr.enabled = true;
    try { renderer.xr.setFoveation(1); } catch (e) { /* older runtimes */ }
    var glove = new THREE.MeshLambertMaterial({ color: 0xf3c9a0 });
    XR.gloveMat = glove;
    for (var i = 0; i < 2; i++) (function (i) {
      var ray = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
      rig.add(ray); rig.add(grip);
      var c = { idx: i, ray: ray, grip: grip, src: null, hand: i ? 'right' : 'left' };
      // laser + cursor (shown by the UI when pointing at menus)
      var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      c.laser = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9 }));
      c.laser.scale.z = 3; c.laser.visible = false; ray.add(c.laser);
      // glove: palm sphere, thumb and a small cuff, parented to the grip so it follows the real hand
      var gl = new THREE.Group();
      var palm = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), glove); palm.scale.set(1, 0.8, 1.2); palm.position.set(0, 0, -0.04); gl.add(palm);
      var fingers = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.06), glove); fingers.position.set(0, 0.0, -0.1); gl.add(fingers);
      var thumb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), glove); thumb.position.set(i ? -0.05 : 0.05, 0.015, -0.07); gl.add(thumb);
      var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x222222 })); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0, 0.03); gl.add(cuff);
      c.glove = gl; c.cuff = cuff; grip.add(gl);
      ray.addEventListener('connected', function (e) {
        c.src = e.data; c.hand = e.data.handedness === 'left' || e.data.handedness === 'right' ? e.data.handedness : c.hand;
        grip.visible = true; HW.Input && HW.Input.onControllerChange && HW.Input.onControllerChange();
      });
      ray.addEventListener('disconnected', function () { c.src = null; grip.visible = false; HW.Input && HW.Input.onControllerChange && HW.Input.onControllerChange(); });
      XR.ctrls.push(c);
    })(i);

    XR.button = document.createElement('button'); var b = XR.button;
    b.id = 'vrbtn'; b.textContent = 'CHECKING VR…'; b.disabled = true; document.body.appendChild(b);
    if (!navigator.xr) { XR.unsupported('VR NOT AVAILABLE' + (window.isSecureContext === false ? ' (needs HTTPS)' : '')); return; }
    navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
      if (!ok) { XR.unsupported('VR NOT SUPPORTED'); return; }
      XR.supported = true; b.disabled = false; b.textContent = 'ENTER VR';
      b.onclick = function () { XR.toggle(); };
    }).catch(function () { XR.unsupported('VR NOT AVAILABLE'); });
  };

  XR.unsupported = function (msg) { var b = XR.button; b.textContent = msg; b.disabled = true; b.classList.add('off'); };

  XR.toggle = function () {
    if (XR.session) { XR.session.end(); return; }
    HW.Audio.init();
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (s) {
      XR.session = s; XR.renderer.xr.setReferenceSpaceType('local-floor');
      s.addEventListener('end', function () {
        XR.session = null; XR.presenting = false; XR.button.textContent = 'ENTER VR'; document.body.classList.remove('invr');
        XR.ctrls.forEach(function (c) { c.src = null; });
        if (XR.onEnd) XR.onEnd();
      });
      return XR.renderer.xr.setSession(s).then(function () {
        XR.presenting = true; XR.button.textContent = 'EXIT VR'; document.body.classList.add('invr');
        try { if (s.updateTargetFrameRate) s.updateTargetFrameRate(72); } catch (e) { /* not supported */ }
        if (XR.onStart) XR.onStart();
      });
    }).catch(function (err) { XR.button.textContent = 'VR FAILED'; console.error(err); });
  };

  XR.tint = function (hex, cuffHex) { XR.gloveMat.color.set(hex); XR.ctrls.forEach(function (c) { c.cuff.material.color.set(cuffHex); }); };
})(window.HW);
