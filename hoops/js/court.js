/* court.js - arena, hardwood court, hoops with nets, blob shadows */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U;

  function courtTexture() {
    var PPM = 64, W = 15 * PPM, H = 25 * PPM;
    return U.canvasTex(W, H, function (g) {
      function X(x) { return (x + 7.5) * PPM; } function Z(z) { return (z + 12.5) * PPM; }
      // planks run along the length (z)
      var pw = Math.round(PPM * 0.13);
      for (var x = 0; x < W; x += pw) {
        var t = U.hash(x * 0.37) * 0.5;
        g.fillStyle = 'rgb(' + Math.round(196 + t * 30) + ',' + Math.round(146 + t * 28) + ',' + Math.round(82 + t * 20) + ')';
        g.fillRect(x, 0, pw, H);
        g.fillStyle = 'rgba(80,45,15,0.25)'; g.fillRect(x, 0, 1, H);
        for (var k = 0; k < 6; k++) { var yy = U.hash(x + k * 91) * H; g.fillStyle = 'rgba(70,40,10,0.10)'; g.fillRect(x + 2, yy, 1, 40 + U.hash(k + x) * 120); }
      }
      // out of bounds stain
      g.fillStyle = 'rgba(40,25,10,0.38)';
      g.fillRect(0, 0, W, Z(-C.HALF_L)); g.fillRect(0, Z(C.HALF_L), W, H - Z(C.HALF_L));
      g.fillRect(0, 0, X(-C.HALF_W), H); g.fillRect(X(C.HALF_W), 0, W - X(C.HALF_W), H);
      // paint (team colors)
      [[-1, HW.TEAMS[1].color], [1, HW.TEAMS[0].color]].forEach(function (e) {
        var s = e[0], z0 = s * C.HALF_L, z1 = s * (C.HALF_L - C.LANE_L);
        g.fillStyle = e[1]; g.globalAlpha = 0.78;
        g.fillRect(X(-C.LANE_W / 2), Math.min(Z(z0), Z(z1)), C.LANE_W * PPM, C.LANE_L * PPM); g.globalAlpha = 1;
      });
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.lineCap = 'round';
      g.strokeRect(X(-C.HALF_W), Z(-C.HALF_L), 2 * C.HALF_W * PPM, 2 * C.HALF_L * PPM);
      g.beginPath(); g.moveTo(X(-C.HALF_W), Z(0)); g.lineTo(X(C.HALF_W), Z(0)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 1.8 * PPM, 0, 6.283); g.stroke();
      [-1, 1].forEach(function (s) {
        var z0 = s * C.HALF_L, z1 = s * (C.HALF_L - C.LANE_L), hz = s * C.RIM_Z;
        g.strokeRect(X(-C.LANE_W / 2), Math.min(Z(z0), Z(z1)), C.LANE_W * PPM, C.LANE_L * PPM);
        g.beginPath(); g.arc(X(0), Z(z1), 1.8 * PPM, 0, 6.283); g.stroke();   // free-throw circle
        // three point line: straight corners + arc around the rim
        var dz = Math.sqrt(C.R3 * C.R3 - C.CORNER_X * C.CORNER_X), a = Math.atan2(dz, C.CORNER_X);
        g.beginPath(); g.moveTo(X(-C.CORNER_X), Z(z0)); g.lineTo(X(-C.CORNER_X), Z(hz - s * dz));
        if (s < 0) g.arc(X(0), Z(hz), C.R3 * PPM, Math.PI - a, a, true); else g.arc(X(0), Z(hz), C.R3 * PPM, -(Math.PI - a), -a, false);
        g.lineTo(X(C.CORNER_X), Z(z0)); g.stroke();
        g.beginPath(); g.arc(X(0), Z(hz), 0.5 * PPM, 0, 6.283); g.stroke();
      });
      // lettering
      g.save(); g.fillStyle = 'rgba(255,255,255,0.92)'; g.textAlign = 'center'; g.font = 'bold 70px Arial Black, Impact, sans-serif';
      g.translate(X(0), Z(0)); g.fillText('HOOPS', 0, 24); g.restore();
      [[-1, HW.TEAMS[1].name], [1, HW.TEAMS[0].name]].forEach(function (e) {
        g.save(); g.translate(X(0), Z(e[0] * 8.3)); g.rotate(e[0] > 0 ? Math.PI : 0); g.fillStyle = 'rgba(255,255,255,0.9)';
        g.textAlign = 'center'; g.font = 'bold 44px Arial Black, Impact, sans-serif'; g.fillText(e[1].toUpperCase(), 0, 15); g.restore();
      });
    });
  }

  function crowdTexture() {
    return U.canvasTex(256, 64, function (g, w, h) {
      g.fillStyle = '#1a1624'; g.fillRect(0, 0, w, h);
      var cols = ['#d94f4f', '#f2c14e', '#4f8bd9', '#e8e8e8', '#6ac48a', '#b46fd6', '#f28c4e'];
      for (var i = 0; i < 520; i++) { g.fillStyle = cols[(U.hash(i) * cols.length) | 0]; g.fillRect(U.hash(i * 3.1) * w, U.hash(i * 7.7) * h, 3, 3); }
    }, { aniso: 2 });
  }

  function netTexture() {
    return U.canvasTex(128, 128, function (g, w, h) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 5;
      for (var i = -4; i < 12; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 64, h); g.stroke(); g.beginPath(); g.moveTo(i * 16 + 64, 0); g.lineTo(i * 16, h); g.stroke(); }
    }, { aniso: 1 });
  }

  function boardTexture() {
    return U.canvasTex(256, 148, function (g, w, h) {
      g.fillStyle = 'rgba(235,245,255,0.55)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.strokeStyle = '#ff4b2b'; g.lineWidth = 7; g.strokeRect(w / 2 - 46, h - 78, 92, 62);
    }, { aniso: 2 });
  }

  var blobTex = null;
  function makeBlob(radius) {
    if (!blobTex) blobTex = U.canvasTex(64, 64, function (c) {
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }, { aniso: 1 });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; m.userData.r = radius; return m;
  }

  function buildHoop(scene, idx, ctx) {
    var dir = idx === 0 ? 1 : -1, z = idx === 0 ? -C.RIM_Z : C.RIM_Z;
    var g = new THREE.Group(); g.position.set(0, 0, z); g.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(g);
    var back = C.BOARD_Z - C.RIM_Z;                               // board is this far behind rim center
    var steel = new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), pad = new THREE.MeshLambertMaterial({ color: new THREE.Color(HW.TEAMS[idx === 0 ? 1 : 0].color) });
    var pz = -(back + 1.55);
    var base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), pad); base.position.set(0, 0.25, pz); g.add(base);
    var pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, C.RIM_H + 0.6, 0.22), steel); pole.position.set(0, (C.RIM_H + 0.6) / 2, pz); g.add(pole);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.55 - 0.1), steel); arm.position.set(0, C.RIM_H + 0.5, pz + 0.8); g.add(arm);
    var board = new THREE.Mesh(new THREE.BoxGeometry(C.BOARD_W, C.BOARD_H, 0.05), new THREE.MeshLambertMaterial({ map: boardTexture(), transparent: true, side: THREE.DoubleSide, emissive: 0x334455 }));
    board.position.set(0, C.RIM_H + 0.45, -back); g.add(board);
    var rimGroup = new THREE.Group(); rimGroup.position.set(0, C.RIM_H, 0); g.add(rimGroup);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(C.RIM_R, C.RIM_TUBE, 6, 24), new THREE.MeshLambertMaterial({ color: 0xff5a1f, emissive: 0x551a00 }));
    rim.rotation.x = Math.PI / 2; rimGroup.add(rim);
    var plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, back - C.RIM_R), new THREE.MeshLambertMaterial({ color: 0xff5a1f }));
    plate.position.set(0, 0, -(C.RIM_R + (back - C.RIM_R) / 2)); rimGroup.add(plate);
    var nt = ctx.netTex; nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(2, 1);
    var net = new THREE.Mesh(new THREE.CylinderGeometry(C.RIM_R * 0.97, C.RIM_R * 0.62, 0.45, 14, 1, true),
      new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    net.position.y = -0.225; rimGroup.add(net);
    var h = { idx: idx, dir: dir, x: 0, z: z, group: g, rimGroup: rimGroup, net: net, board: board, rim: rim,
      pos: new THREE.Vector3(0, C.RIM_H, z), shake: 0, swish: 0, shatter: 0 };
    return h;
  }

  HW.buildWorld = function (scene) {
    var world = { hoops: [], blobs: [] };
    scene.background = new THREE.Color(0x0b0d1a); scene.fog = new THREE.Fog(0x0b0d1a, 28, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.95));
    var sun = new THREE.DirectionalLight(0xfff2dd, 0.55); sun.position.set(4, 20, 6); scene.add(sun);

    var floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ color: 0x14141c }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);
    var court = new THREE.Mesh(new THREE.PlaneGeometry(15, 25), new THREE.MeshLambertMaterial({ map: courtTexture(), emissive: 0x2a1c10 }));
    court.rotation.x = -Math.PI / 2; court.position.y = 0; scene.add(court);

    var ctx = { netTex: netTexture() };
    world.hoops.push(buildHoop(scene, 0, ctx), buildHoop(scene, 1, ctx));

    // stands: stepped tiers with crowd texture on both sidelines and behind the baselines
    var crowd = crowdTexture(); crowd.wrapS = crowd.wrapT = THREE.RepeatWrapping;
    function tiers(cx, cz, len, rotY) {
      var gr = new THREE.Group(); gr.position.set(cx, 0, cz); gr.rotation.y = rotY;
      for (var i = 0; i < 5; i++) {
        var t = crowd.clone(); t.needsUpdate = true; t.repeat.set(len / 6, 1);
        var top = new THREE.MeshLambertMaterial({ map: t }), side = new THREE.MeshLambertMaterial({ color: 0x23202e });
        var b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75 * (i + 1), len), [side, side, top, side, side, side]);
        b.position.set(i * 1.4, 0.375 * (i + 1), 0); gr.add(b);
      }
      scene.add(gr);
    }
    tiers(8.6, 0, 26, 0); tiers(-8.6, 0, 26, Math.PI);
    tiers(0, 13.6, 18, -Math.PI / 2); tiers(0, -13.6, 18, Math.PI / 2);
    // ad boards around the court
    var adTex = U.canvasTex(1024, 64, function (g, w, h) {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.font = 'bold 40px Arial Black, Impact'; g.textBaseline = 'middle';
      var t = ['HOOPS JAM', 'ANDERSONS', '2 ON 2', 'GORMANS', 'HOOPS JAM'], x = 16;
      t.forEach(function (s, i) { g.fillStyle = ['#ff8a1f', '#ffffff', '#ff4fa3', '#6ae3a6', '#3a86ff'][i]; g.fillText(s, x, h / 2); x += g.measureText(s).width + 50; });
    }, { aniso: 2 });
    adTex.wrapS = THREE.RepeatWrapping; adTex.repeat.set(2, 1);
    var adMat = new THREE.MeshBasicMaterial({ map: adTex });
    [[7.7, 0, 24, 0], [-7.7, 0, 24, 0], [0, 12.7, 16, Math.PI / 2], [0, -12.7, 16, Math.PI / 2]].forEach(function (a) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, a[2]), adMat); m.position.set(a[0], 0.375, a[1]); m.rotation.y = a[3]; scene.add(m);
    });
    // roof lights
    var lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d8 });
    for (var i = -2; i <= 2; i++) { var l = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 0.8), lamp); l.position.set(0, 13, i * 5.5); scene.add(l); }
    var roof = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x15151f, side: THREE.DoubleSide })); roof.rotation.x = Math.PI / 2; roof.position.y = 14; scene.add(roof);

    world.makeBlob = function (r) { var b = makeBlob(r); scene.add(b); world.blobs.push(b); return b; };
    world.removeBlob = function (b) { scene.remove(b); var i = world.blobs.indexOf(b); if (i >= 0) world.blobs.splice(i, 1); };
    world.blobAt = function (blob, x, z, height) {
      blob.position.x = x; blob.position.z = z; var s = U.clamp(1.15 - height * 0.18, 0.4, 1.2); blob.scale.set(s, s, 1); blob.material.opacity = U.clamp(1 - height * 0.12, 0.3, 1);
    };

    // hoop animation: rim shake spring and net swish
    world.update = function (dt, t) {
      world.hoops.forEach(function (h) {
        h.shake = Math.max(0, h.shake - dt * 2.2); h.swish = Math.max(0, h.swish - dt * 2.6);
        h.rimGroup.rotation.x = Math.sin(t * 38) * 0.05 * h.shake; h.rimGroup.position.y = C.RIM_H - Math.abs(Math.sin(t * 30)) * 0.04 * h.shake;
        h.net.scale.set(1 - 0.12 * h.swish, 1 + 0.55 * Math.sin(h.swish * 3.14), 1 - 0.12 * h.swish);
        if (h.shatter > 0) { h.shatter -= dt; if (h.shatter <= 0) h.board.visible = true; }
      });
    };
    world.shatter = function (h) { h.board.visible = false; h.shatter = 2.4; HW.FX.glass(new THREE.Vector3(h.x, C.RIM_H + 0.5, h.z - h.dir * 0.4), 100); HW.Audio.shatter(); };
    return world;
  };
})(window.HW);
