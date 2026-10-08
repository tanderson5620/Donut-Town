/* main.js - renderer, rig, comfort (snap / smooth turn, vignette, fade), main loop */
window.HW = window.HW || {};
(function (HW) {
  var U = HW.U, C = HW.C, I = HW.Input;
  var settings = HW.settings = Object.assign({}, HW.defaults, U.storage.get('hoops.settings', {}));
  HW.saveSettings = function () { U.storage.set('hoops.settings', settings); };

  var renderer, scene, camera, rig, clock, world, ball;
  var view = { pos: new THREE.Vector3(0, 1.7, 0), yaw: 0, pitch: 0 };
  HW.view = view;
  var ctx = HW.ctx = { view: view, settings: settings, eyeY: 1.7, rigYaw: 0 };
  var _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  var simT = 0, vign, fade, fadeT = 0, fadeDur = 0.001, vignAmt = 0, seatOffset = 0, standing = true;

  // Quality tier: headsets get the light renderer, phones and computers get shadows and shiny materials
  var UA = navigator.userAgent;
  HW.HEADSET = /OculusBrowser|Quest|Pico|Wolvic/i.test(UA);
  HW.TOUCH = ('ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) && !HW.HEADSET;
  HW.HIGH = !HW.HEADSET && settings.graphics !== 'fast';

  function boot() {
    var el = document.getElementById('app');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) { document.getElementById('info').textContent = 'WebGL is not available in this browser.'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HW.HIGH ? 2 : 1.5));
    if (HW.HIGH) {
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
    }
    renderer.setSize(window.innerWidth, window.innerHeight); el.appendChild(renderer.domElement);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 160);
    rig = new THREE.Group(); rig.add(camera); scene.add(rig);
    if (HW.HIGH) buildEnvironment(renderer, scene);
    ctx.renderer = renderer; ctx.scene = scene; ctx.camera = camera; ctx.rig = rig;

    HW.FX.init(scene); world = HW.world = HW.buildWorld(scene); ctx.world = world;
    HW.Audio.vol = settings.sfx; HW.Audio.voice = settings.announcer;
    ball = ctx.ball = new HW.Ball(scene, world);
    I.init(renderer.domElement, camera); HW.XR.init(renderer, scene, rig); HW.Touch.init(renderer.domElement);
    HW.UI.dom.init(); HW.UI.initCallouts(scene); HW.UI.scoreboard.build(scene); HW.UI.hud.build();
    buildComfort();

    HW.XR.onStart = function () { rig.rotation.y = 0; rig.position.set(0, 0, 0); standing = true; seatOffset = 0; ctx.seatOffset = 0; ctx.vrStart && ctx.vrStart(); };
    HW.XR.onEnd = function () { rig.position.set(0, 0, 0); rig.rotation.y = 0; camera.position.set(0, 0, 0); if (ctx.vrEnd) ctx.vrEnd(); };
    I.onControllerChange = function () { I.resetHistory(); attachWristHud(); };
    window.addEventListener('resize', function () { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    ctx.moveRigTo = moveRigTo; ctx.rotateRig = rotateRig; ctx.fade = doFade; ctx.recenter = recenter; ctx.setSeated = setSeated;
    HW.Game.init(ctx);
    clock = new THREE.Clock(); renderer.setAnimationLoop(loop);
    document.getElementById('info').innerHTML = '<b>WASD</b> move &middot; <b>Shift</b> turbo &middot; <b>Space</b> jump<br><b>Hold click</b> shoot (release near green), click on D to block<br><b>Q</b> pass / steal &middot; <b>Shift+E</b> shove &middot; <b>C</b> camera &middot; <b>Esc</b> pause';
    HW.UI.fontReady(function () { if (HW.Menu.open) HW.Menu.panel.redraw(); HW.UI.scoreboard.key = ''; HW.UI.hud.key = ''; });
    document.body.classList.add('ready');
    if (/[?&]debug/.test(location.search)) { window.__hw = HW; }
  }

  // Reflection environment for the physically based materials: a dark arena with bright roof light banks
  function buildEnvironment(renderer, scene) {
    try {
      var pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.background = new THREE.Color(0x15151f);
      var lamp = new THREE.MeshBasicMaterial({ color: 0xffffff }), warm = new THREE.MeshBasicMaterial({ color: 0xffb070 }), side = new THREE.BoxGeometry(1, 1, 1);
      for (var i = -2; i <= 2; i++) { var l = new THREE.Mesh(side, lamp); l.scale.set(9, 0.3, 1.2); l.position.set(0, 12, i * 5); es.add(l); }
      [[-14, 0], [14, 0]].forEach(function (p) { var w = new THREE.Mesh(side, warm); w.scale.set(0.5, 3, 20); w.position.set(p[0], 4, p[1]); es.add(w); });
      scene.environment = pm.fromScene(es, 0.04).texture; pm.dispose();
    } catch (e) { /* environment is optional */ }
  }

  function buildComfort() {
    var tex = U.canvasTex(256, 256, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.5); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { aniso: 1 });
    vign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, fog: false }));
    vign.position.z = -0.35; vign.renderOrder = 998; vign.visible = false; camera.add(vign);
    fade = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false, opacity: 0, fog: false }));
    fade.position.z = -0.3; fade.renderOrder = 999; fade.visible = false; camera.add(fade);
  }
  function doFade(dur) { fadeT = dur; fadeDur = dur; }

  function attachWristHud() {
    var p = HW.UI.hud.panel; if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    var left = HW.XR.ctrls.filter(function (c) { return c.hand === 'left'; })[0];
    if (left) { p.mesh.position.set(0.0, 0.075, 0.11); p.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0); left.grip.add(p.mesh); p.mesh.visible = true; }
  }

  // Move the rig so the head ends up at `target` (xz), clamped to the arena.
  function moveRigTo(target) {
    camera.getWorldPosition(_v);
    var tx = U.clamp(target.x, -C.BOUND_X, C.BOUND_X), tz = U.clamp(target.z, -C.BOUND_Z, C.BOUND_Z);
    rig.position.x += tx - _v.x; rig.position.z += tz - _v.z;
  }
  // Rotate the rig about the head so the view turns on the spot.
  function rotateRig(a) {
    camera.getWorldPosition(_v); var hx = _v.x, hz = _v.z;
    rig.rotation.y += a; rig.updateMatrixWorld(true); camera.getWorldPosition(_v);
    rig.position.x += hx - _v.x; rig.position.z += hz - _v.z;
  }
  // Height recenter: seated mode lifts the world so your head is at the player's eye height.
  function recenter() {
    if (!I.vr) return;
    if (settings.seated) { seatOffset = (ctx.eyeY || 1.7) - camera.position.y; } else seatOffset = 0;
    ctx.seatOffset = seatOffset; rig.position.y = seatOffset;
  }
  function setSeated(on) { settings.seated = on; HW.saveSettings(); recenter(); }

  function updateView() {
    camera.updateMatrixWorld(true);
    if (I.vr) {
      camera.getWorldPosition(view.pos); camera.getWorldQuaternion(_q); _e.setFromQuaternion(_q); view.yaw = _e.y; view.pitch = _e.x;
    } else { view.yaw = I.lookYaw; view.pitch = I.lookPitch; }
  }

  function loop() {
    var dt = Math.min(clock.getDelta(), 0.05);
    if (ctx.dtOverride) dt = ctx.dtOverride;
    simT += dt; var now = simT;
    if (ctx.hook) ctx.hook(dt, now);   // test hook
    I.update(dt, now, rig);
    if (I.vr) {
      if (I.snap) rotateRig(I.snap * settings.snapAngle * Math.PI / 180);
      if (I.smoothTurn) rotateRig(I.smoothTurn * settings.smoothSpeed * Math.PI / 180 * dt);
      if (I.recenter) recenter();
    }
    updateView();
    HW.Game.update(dt, now);
    if (!I.vr) { camera.position.copy(view.pos); camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ'); }
    HW.FX.update(dt); world.update(dt, now); HW.UI.updateCallouts(dt);
    // comfort overlays
    var mv = Math.max(Math.hypot(I.move.x, I.move.y) + Math.abs(I.smoothTurn) * 0.6, ctx.comfortBoost || 0);
    vignAmt = U.damp(vignAmt, I.vr && settings.vignette ? Math.min(1, mv) : 0, mv > 0 ? 6 : 3, dt);
    vign.visible = vignAmt > 0.02; vign.material.opacity = vignAmt * 0.9; vign.scale.setScalar(1.15 - 0.5 * vignAmt);
    if (fadeT > 0) { fadeT -= dt; fade.visible = true; fade.material.opacity = Math.min(1, Math.sin(Math.max(0, fadeT) / fadeDur * Math.PI) * 1.6); if (fadeT <= 0) fade.visible = false; }
    I.endFrame();
    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', boot);
})(window.HW);
