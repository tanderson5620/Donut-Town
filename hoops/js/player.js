/* player.js - low-poly basketball player: model, procedural animation, per-player state */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U;
  var _w = new THREE.Vector3();

  function jerseyTexture(def, teamIdx) {
    return U.canvasTex(256, 128, function (g, w, h) {
      g.fillStyle = def.color; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 10, w, 6);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h * 0.62, w, 5);
      g.font = 'bold 74px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      [0, w / 2, w].forEach(function (x, i) {
        g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(String(def.num), x, h / 2 + 6);
        g.fillStyle = '#ffffff'; g.fillText(String(def.num), x, h / 2 + 6);
      });
      g.font = 'bold 20px Arial Black, Impact, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(HW.TEAMS[teamIdx].short, w / 2, 26); g.fillText(HW.TEAMS[teamIdx].short, 0, 26); g.fillText(HW.TEAMS[teamIdx].short, w, 26);
    }, { aniso: 2 });
  }

  function nameTexture(def) {
    return U.canvasTex(512, 128, function (g, w, h) {
      g.fillStyle = 'rgba(8,10,20,0.78)'; U.roundRect(g, 6, 14, w - 12, h - 28, 30); g.fill();
      g.lineWidth = 6; g.strokeStyle = def.color; g.stroke();
      g.font = 'bold 54px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = def.color; g.fillText('#' + def.num, 92, h / 2 + 2); g.fillStyle = '#fff'; g.fillText(def.first.toUpperCase(), 318, h / 2 + 2);
    }, { aniso: 2 });
  }

  // skin with freckles and a little sun color, for players whose photo shows it
  var frCache = {};
  function freckleTexture(base) {
    if (frCache[base]) return frCache[base];
    return (frCache[base] = U.canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var c = new THREE.Color(base);
      for (var i = 0; i < 260; i++) {
        var k = 0.8 + U.hash(i * 3.3) * 0.1; g.fillStyle = 'rgba(' + Math.round(c.r * 255 * k) + ',' + Math.round(c.g * 255 * k * 0.92) + ',' + Math.round(c.b * 255 * k * 0.85) + ',' + (0.18 + U.hash(i) * 0.22) + ')';
        g.beginPath(); g.arc(U.hash(i * 1.7) * w, U.hash(i * 9.1) * h, 0.6 + U.hash(i * 4.4) * 1.0, 0, 6.283); g.fill();
      }
    }, { aniso: 2 }));
  }

  function limb(len, r0, r1, mat) { var m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 7), mat); m.position.y = -len / 2; return m; }

  function Player(def, teamIdx, slot, world, scene, isHuman) {
    this.def = def; this.team = teamIdx; this.slot = slot; this.isHuman = !!isHuman; this.st = HW.derive(def); this.world = world;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = teamIdx === 0 ? 0 : Math.PI; this.y = 0; this.vy = 0;
    this.turbo = 100; this.turboOn = false; this.state = 'idle'; this.stateT = 0; this.hasBall = false; this.onFire = false; this.streak = 0;
    this.phase = Math.random() * 6; this.cd = { steal: 0, shove: 0, jump: 0, juke: 0, pass: 0, stun: 0 }; this.slow = 0; this.slowT = 0;
    this.stats = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, dunks: 0, steals: 0, blocks: 0, shoves: 0, knockdowns: 0, rebounds: 0, assists: 0 };
    this.a = { rs: 0, re: 0, ls: 0, le: 0, rz: 0, lz: 0, crouch: 0, lean: 0, spin: 0, flip: 0 };
    this.shootT = 0; this.dribPhase = Math.random(); this.callT = 0; this.jumpT = 0; this.defendT = 0; this.dunk = null; this.downDur = 1; this.arrowOn = false;
    this.build(scene);
    this.blob = world.makeBlob(0.5);
  }

  Player.prototype.build = function (scene) {
    var d = this.def, H = d.height, k = H / 1.8, b = d.bulk;
    var skin = d.freckles ? U.mat({ map: freckleTexture(d.skin), roughness: 0.55 }) : U.mat({ color: d.skin, roughness: 0.55 }), jersey = U.mat({ map: jerseyTexture(d, this.team), roughness: 0.85 });
    var shorts = U.mat({ color: d.shorts || new THREE.Color(d.color).multiplyScalar(0.55), roughness: 0.7 });
    var shoe = U.mat({ color: d.shoes || 0xf4f4f4, roughness: d.shoes ? 0.95 : 0.45 }), sole = U.mat({ color: d.soles || new THREE.Color(d.color), roughness: 0.5 });
    var hairM = U.mat({ color: d.hair, roughness: 0.9 });
    this.mats = [skin, jersey, shorts];
    var root = this.root = new THREE.Group(); scene.add(root);
    var body = this.body = new THREE.Group(); root.add(body);                  // tilt / flip / lie-down happens here
    var hipY = 0.5 * H; var hips = this.hips = new THREE.Group(); hips.position.y = hipY; body.add(hips);
    // shorts
    var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * b * k, 0.18 * b * k, 0.2 * k, 8), shorts); sh.position.y = 0.0; hips.add(sh);
    // torso (jersey wraps around, number front and back)
    var spine = this.spine = new THREE.Group(); spine.position.y = 0.06 * k; hips.add(spine);
    var torsoH = 0.45 * k;
    var torGeo;
    if (d.belly) {   // barrel torso: a comfortable middle that eases into the chest, same jersey wrap
      var R = 0.2 * b * k, pts = [[0.8, 0], [0.95, 0.12], [1.04, 0.3], [1.02, 0.5], [0.93, 0.72], [0.98, 0.9], [0.9, 1]].map(function (q) { return new THREE.Vector2(q[0] * R, q[1] * torsoH); });
      torGeo = new THREE.LatheGeometry(pts, 14);
    } else torGeo = new THREE.CylinderGeometry(0.2 * b * k, 0.155 * b * k, torsoH, 10);
    var tor = new THREE.Mesh(torGeo, jersey); tor.position.y = d.belly ? 0 : torsoH / 2; if (d.belly) tor.scale.z = 1.08; spine.add(tor);
    // head
    var head = this.head = new THREE.Group(); head.position.y = torsoH + 0.15 * k; spine.add(head);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * k, 0.06 * k, 0.1 * k, 6), skin); neck.position.y = -0.06 * k; head.add(neck);
    var hr = 0.115 * k, hm = new THREE.Mesh(new THREE.SphereGeometry(hr, HW.HIGH ? 20 : 12, HW.HIGH ? 14 : 9), skin); hm.scale.set(0.92, 1.08, 1); head.add(hm);
    var browM = U.mat({ color: d.brow || d.hair, roughness: 0.9 }), lipM = U.mat({ color: new THREE.Color(d.skin).multiplyScalar(0.72), roughness: 0.6 });
    [-1, 1].forEach(function (s) {
      var e = new THREE.Mesh(new THREE.SphereGeometry(0.014 * k, 6, 5), new THREE.MeshBasicMaterial({ color: 0x151515 })); e.position.set(s * 0.042 * k, 0.015 * k, -hr * 0.93); head.add(e);
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.03 * k, 7, 6), skin); ear.scale.set(0.4, 0.75, 0.55); ear.position.set(s * hr * 0.9, 0.0, 0.005 * k); head.add(ear);
      var br = new THREE.Mesh(new THREE.BoxGeometry(0.038 * k, 0.008 * k, 0.012 * k), browM); br.position.set(s * 0.043 * k, 0.042 * k, -hr * 0.92); br.rotation.z = -s * 0.12; head.add(br);
    });
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.016 * k, 0.04 * k, 6), skin); nose.rotation.x = -Math.PI / 2 - 0.3; nose.position.set(0, -0.008 * k, -hr * 1.0); head.add(nose);
    [-1, 1].forEach(function (s) {   // a relaxed half smile
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.024 * k, 0.007 * k, 0.01 * k), lipM); m.position.set(s * 0.011 * k, -0.049 * k + 0.002 * k, -hr * 0.9); m.rotation.z = s * 0.2; head.add(m);
    });
    if (d.glasses) {   // thin dark wire frames with brown tinted lenses
      var frame = U.mat({ color: 0x2e2a28, roughness: 0.35, metalness: 0.6 });
      var lens = new THREE.MeshStandardMaterial({ color: 0x6a4a35, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.72 });
      [-1, 1].forEach(function (s) {
        var l = new THREE.Mesh(new THREE.CylinderGeometry(0.019 * k, 0.019 * k, 0.003 * k, 14), lens); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 0.75); l.position.set(s * 0.042 * k, 0.014 * k, -hr * 0.99); head.add(l);
        var rimTop = new THREE.Mesh(new THREE.BoxGeometry(0.042 * k, 0.003 * k, 0.004 * k), frame); rimTop.position.set(s * 0.042 * k, 0.029 * k, -hr * 0.995); head.add(rimTop);
        var tmp = new THREE.Mesh(new THREE.BoxGeometry(0.004 * k, 0.004 * k, hr * 0.95), frame); tmp.position.set(s * hr * 0.93, 0.025 * k, -hr * 0.5); head.add(tmp);
      });
      var bridge = new THREE.Mesh(new THREE.BoxGeometry(0.018 * k, 0.004 * k, 0.005 * k), frame); bridge.position.set(0, 0.024 * k, -hr * 1.01); head.add(bridge);
    }
    var hs = d.hairStyle;
    if (hs === 'afro') { var af = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.28, 10, 8), hairM); af.position.y = hr * 0.25; head.add(af); }
    else if (hs === 'fade') { var fd = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.03, 10, 7, 0, 6.283, 0, 1.25), hairM); fd.position.y = hr * 0.06; head.add(fd); }
    else if (hs === 'pony') { var pc = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.07, 10, 7, 0, 6.283, 0, 1.55), hairM); pc.position.y = hr * 0.06; head.add(pc);
      var pt = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * k, 0.045 * k, 0.2 * k, 6), hairM); pt.position.set(0, 0.0, hr * 1.0); pt.rotation.x = -0.6; head.add(pt); this.pony = pt; }
    else if (hs === 'bun') { var bc = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.07, 10, 7, 0, 6.283, 0, 1.55), hairM); bc.position.y = hr * 0.06; head.add(bc);
      var bn = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.5, 7, 6), hairM); bn.position.set(0, hr * 1.1, hr * 0.35); head.add(bn); }
    else if (hs === 'swept') {   // short, swept back, higher hairline in front
      var sw = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 16, 10, 0, 6.283, 0, 1.2), hairM); sw.position.set(0, hr * 0.1, hr * 0.03); sw.rotation.x = 0.22; sw.scale.set(0.98, 1.0, 1.02); head.add(sw);
    }
    else { var sc = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.06, 10, 7, 0, 6.283, 0, 1.4), hairM); sc.position.y = hr * 0.08; head.add(sc); }
    var band = new THREE.Mesh(new THREE.CylinderGeometry(hr * 1.02, hr * 1.02, 0.03 * k, 10, 1, true), new THREE.MeshLambertMaterial({ color: d.color, side: THREE.DoubleSide })); band.position.y = hr * 0.42; if (!d.noBand) head.add(band);
    // arms
    var self = this, armLen = 0.27 * k;
    function arm(side) {
      var sg = new THREE.Group(); sg.position.set(side * (0.22 * b * k), torsoH - 0.05 * k, 0); spine.add(sg);
      var up = limb(armLen, 0.05 * k * b, 0.042 * k * b, skin); sg.add(up);
      var eg = new THREE.Group(); eg.position.y = -armLen; sg.add(eg);
      var lo = limb(armLen * 0.95, 0.04 * k * b, 0.034 * k * b, skin); eg.add(lo);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 7, 6), skin); hand.position.y = -armLen * 0.98; eg.add(hand);
      return { s: sg, e: eg, hand: hand };
    }
    this.armR = arm(1); this.armL = arm(-1); this.handR = this.armR.hand; this.handL = this.armL.hand;
    // legs
    var legLen = 0.25 * k;
    function leg(side) {
      var hg = new THREE.Group(); hg.position.set(side * 0.085 * b * k, -0.08 * k, 0); hips.add(hg);
      var th = limb(legLen, 0.075 * b * k, 0.058 * b * k, skin); hg.add(th);
      var kg = new THREE.Group(); kg.position.y = -legLen; hg.add(kg);
      var sk = limb(legLen * 1.02, 0.055 * b * k, 0.042 * b * k, skin); kg.add(sk);
      var ft = new THREE.Mesh(new THREE.BoxGeometry(0.095 * k, 0.07 * k, 0.2 * k), shoe); ft.position.set(0, -legLen * 1.04, -0.03 * k); kg.add(ft);
      var sl = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.025 * k, 0.21 * k), sole); sl.position.set(0, -legLen * 1.04 - 0.04 * k, -0.03 * k); kg.add(sl);
      return { h: hg, k: kg };
    }
    this.legR = leg(1); this.legL = leg(-1);
    this.standY = hipY;
    if (HW.Athlete && HW.Athlete.available()) this.buildAthlete(skin);
    if (HW.HIGH) body.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    // name tag
    var nm = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(d), transparent: true, depthWrite: false, fog: false }));
    nm.scale.set(0.95, 0.24, 1); nm.position.y = H + 0.42; this.nameY = H + 0.42; root.add(nm); this.nameTag = nm;
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); arrow.rotation.x = Math.PI; arrow.position.y = H + 0.75; arrow.visible = false; root.add(arrow); this.arrow = arrow;
    var call = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.canvasTex(64, 64, function (g) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(32, 32, 28, 0, 6.283); g.fill(); g.fillStyle = '#000'; g.font = 'bold 44px Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 36); }), transparent: true, depthTest: false }));
    call.scale.set(0.28, 0.28, 1); call.position.y = H + 0.72; call.visible = false; root.add(call); this.callMark = call;
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 5, 18), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8 })); this.rim.rotation.x = Math.PI / 2; this.rim.position.y = 0.04; this.rim.visible = false; root.add(this.rim);
  };

  // Swap the simple shapes for the sculpted, skinned athlete body (the shapes stay as an invisible pose rig)
  Player.prototype.buildAthlete = function () {
    var d = this.def, L = d.look || {}, team = HW.TEAMS[this.team];
    this.body.traverse(function (o) { if (o.isMesh) o.visible = false; });
    var A = HW.Athlete.build({
      skin: d.skin, iris: L.iris, hair: { style: d.hairStyle, color: d.hair }, brow: d.brow, band: d.noBand ? null : L.band,
      glasses: L.glasses, jersey: d.color, trim: '#f6f6f2', dark: team.dark, num: d.num, team: team.name.toUpperCase(), name: d.first.toUpperCase(),
      shorts: d.shorts, plainShorts: L.plainShorts, shoe: L.shoe, noSocks: L.noSocks
    });
    var s = d.height / 1.89, bx = 1 + (d.bulk - 1) * 0.45, bz = bx * (d.belly ? 1.08 : 1);
    A.root.scale.setScalar(s); A.root.rotation.y = Math.PI; this.body.add(A.root);
    A.spine.scale.set(bx, 1, bz); A.neck.scale.set(1 / bx, 1, 1 / bz); A.sh.forEach(function (sh) { sh.scale.set(1 / bx, 1, 1 / bz); });
    if (HW.HIGH) A.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    this.ath = A; this.athS = s; this.handR = A.palm[0]; this.handL = A.palm[1]; this.mats = this.mats.concat(A.mats);
  };

  // copy the pose rig's joint angles onto the athlete skeleton (it faces +Z, so x/z rotations flip sign and sides swap)
  Player.prototype.poseAthlete = function (dt) {
    var A = this.ath, R = this.armR, Lf = this.armL;
    A.sh[0].rotation.set(-R.s.rotation.x, 0, -R.s.rotation.z - 0.04); A.el[0].rotation.x = -R.e.rotation.x;
    A.sh[1].rotation.set(-Lf.s.rotation.x, 0, -Lf.s.rotation.z + 0.04); A.el[1].rotation.x = -Lf.e.rotation.x;
    var legs = [this.legR, this.legL];
    for (var i = 0; i < 2; i++) {
      A.th[i].rotation.x = -legs[i].h.rotation.x; A.kn[i].rotation.x = -legs[i].k.rotation.x;
      A.feet[i].rotation.x = -(A.th[i].rotation.x + A.kn[i].rotation.x) * (this.y > 0.05 ? 0.4 : 0.9);
    }
    A.hips.position.y = 1.02 - (this.standY - this.hips.position.y) / this.athS;
    A.hips.rotation.x = -this.hips.rotation.x; A.spine.rotation.x = -this.spine.rotation.x * 0.6; A.chest.rotation.x = -this.spine.rotation.x * 0.4;
    A.head.rotation.x = -this.head.rotation.x;
    if (A.pony) A.pony.rotation.x = -0.35 - Math.min(0.6, Math.hypot(this.vel.x, this.vel.z) * 0.08) + Math.sin(this.phase * 2) * 0.08;
    A.face.update(dt, HW.view && HW.view.pos);
  };

  Player.prototype.eyeHeight = function () { return this.def.height - C.EYE_ADJUST; };
  Player.prototype.dir = function (out) { return U.dirOf(this.yaw, out); };
  Player.prototype.setFire = function (on) {
    this.onFire = on; this.rim.visible = on;
    var em = on ? 0x7a2a00 : 0x000000; this.mats.forEach(function (m) { m.emissive.setHex(em); });
  };
  Player.prototype.setHidden = function (hide) { this.root.visible = !hide; this.blob.visible = !hide; };

  // Hand world positions (valid after animate + updateMatrixWorld)
  Player.prototype.handWorld = function (side, out) { return (side === 'l' ? this.handL : this.handR).getWorldPosition(out); };

  var tz = 0.0;
  function dmp(c, t, r, dt) { return c + (t - c) * (1 - Math.exp(-r * dt)); }

  Player.prototype.animate = function (dt, t, ctx) {
    var a = this.a, spd = Math.hypot(this.vel.x, this.vel.z), run = Math.min(1.3, spd / 5.5), air = this.y > 0.05;
    var st = this.state, H = this.def.height, k = H / 1.8;
    if (!air && spd > 0.3) this.phase += dt * (3.2 + spd * 1.5);
    var sw = Math.sin(this.phase), co = Math.cos(this.phase);
    var legAmp = 0.95 * run, kneeAmp = 1.25 * run;
    // targets
    var T = { rs: -sw * 0.9 * run, re: 0.5 + 0.4 * run, ls: sw * 0.9 * run, le: 0.5 + 0.4 * run, rz: 0.08, lz: -0.08, crouch: 0.06 + 0.1 * run, lean: 0.28 * run, spin: 0, flip: 0, headX: 0 };
    var lr = legAmp * sw, ll = -legAmp * sw, kr = Math.max(0, -co) * kneeAmp, kl = Math.max(0, co) * kneeAmp;
    if (this.hasBall && (st === 'idle')) {
      var db = Math.sin(this.dribPhase * 6.283);
      T.rs = 0.75 + 0.35 * -Math.abs(Math.cos(this.dribPhase * 3.14159)) + 0.2 * run; T.re = 0.95; T.ls = 0.9; T.le = 1.1; T.lz = -0.55; T.rz = 0.25; T.crouch = 0.14 + 0.1 * run;
    }
    if (this.defendT > 0 && !this.hasBall && st === 'idle') { T.rs = 0.7; T.ls = 0.7; T.rz = 1.15; T.lz = -1.15; T.re = 0.25; T.le = 0.25; T.crouch = 0.26; T.lean = 0.12; }
    if (st === 'shoot') {
      var f = U.clamp(this.stateT / 0.3, 0, 1), rel = this.stateT > 0.3;
      T.rs = rel ? 2.75 : 1.2 + f * 1.5; T.ls = rel ? 2.5 : 1.0 + f * 1.5; T.re = rel ? 0.1 : 1.1 - f * 0.6; T.le = rel ? 0.2 : 1.2 - f * 0.7; T.rz = 0.1; T.lz = -0.1; T.crouch = this.y > 0.05 ? 0.02 : 0.28 * (1 - f); T.lean = 0.0; kr = kl = this.y > 0.05 ? 0.5 : 0; lr = ll = 0;
    } else if (st === 'pass') {
      T.rs = 1.45; T.ls = 1.45; T.re = 0.25; T.le = 0.25; T.rz = 0.1; T.lz = -0.1; T.crouch = 0.12;
    } else if (st === 'steal') {
      T.rs = 1.5; T.re = 0.2; T.ls = 0.8; T.le = 0.4; T.crouch = 0.22; T.lean = 0.35;
    } else if (st === 'shove') {
      var q = U.clamp(this.stateT / 0.25, 0, 1); T.rs = 1.5 * q; T.ls = 1.5 * q; T.re = 0.1; T.le = 0.1; T.crouch = 0.2; T.lean = 0.4;
    } else if (st === 'dunk') {
      var dd = this.dunk, p = dd ? dd.t : 0, style = dd ? dd.style : 'onehand';
      T.crouch = p < 0.15 ? 0.3 : 0; lr = 1.0; ll = 0.5; kr = 1.4; kl = 1.0; T.lean = 0.1;
      T.rs = p > 0.3 ? 2.9 : 2.2; T.re = 0.1; T.ls = 1.9 + 0.5 * Math.sin(p * 6); T.le = 0.6; T.lz = -0.6; T.rz = 0.1;
      if (style === 'windmill') { T.rs = p * 14; T.re = 0.1; } else if (style === 'twohand') { T.ls = 2.9; T.lz = -0.1; T.le = 0.1; } else if (style === 'tomahawk') { T.rs = 3.2; T.re = 0.0; }
      else if (style === 'spin360') { T.spin = p * 6.283; } else if (style === 'backflip') { T.flip = -Math.min(1, p * 1.25) * 6.283; }
      if (dd && dd.t > dd.hangT) { T.rs = 3.0; T.re = 0.4; }   // hanging on the rim
    } else if (air) {
      T.rs = 2.4; T.ls = 2.2; T.re = 0.5; T.le = 0.6; T.rz = 0.3; T.lz = -0.3; kr = kl = 0.7; lr = 0.5; ll = -0.2; T.crouch = 0; T.lean = 0;
    } else if (st === 'celebrate') {
      T.rs = 2.8 + 0.3 * Math.sin(t * 10); T.ls = 2.8 + 0.3 * Math.sin(t * 10 + 1); T.re = 0.3; T.le = 0.3; T.rz = 0.4; T.lz = -0.4; T.crouch = 0;
    }
    var r = 16;
    a.rs = dmp(a.rs, T.rs, r, dt); a.re = dmp(a.re, T.re, r, dt); a.ls = dmp(a.ls, T.ls, r, dt); a.le = dmp(a.le, T.le, r, dt);
    a.rz = dmp(a.rz, T.rz, r, dt); a.lz = dmp(a.lz, T.lz, r, dt); a.crouch = dmp(a.crouch, T.crouch, 12, dt); a.lean = dmp(a.lean, T.lean, 10, dt);
    a.spin = T.spin; a.flip = T.flip;
    if (st === 'dunk' && this.dunk && this.dunk.style === 'windmill') { a.rs = T.rs; }
    this.armR.s.rotation.set(a.rs, 0, a.rz); this.armR.e.rotation.x = a.re;
    this.armL.s.rotation.set(a.ls, 0, a.lz); this.armL.e.rotation.x = a.le;
    this.legR.h.rotation.x = dmp(this.legR.h.rotation.x, lr + a.crouch * 1.4, 20, dt); this.legL.h.rotation.x = dmp(this.legL.h.rotation.x, ll + a.crouch * 1.4, 20, dt);
    this.legR.k.rotation.x = dmp(this.legR.k.rotation.x, -(kr + a.crouch * 2.0), 20, dt); this.legL.k.rotation.x = dmp(this.legL.k.rotation.x, -(kl + a.crouch * 2.0), 20, dt);
    // leg rotation about x: +x swings forward (-z); knees bend backward => negative
    this.hips.position.y = this.standY - a.crouch * 0.26 * k * 2.0 + (st === 'down' ? 0 : 0);
    this.hips.rotation.x = -a.lean * 0.6; this.spine.rotation.x = -a.lean * 0.5;
    // whole-body orientation: yaw (+ dunk spin), lie-down when knocked over
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.yaw + a.spin;
    if (st === 'down') {
      var fd = U.clamp(this.stateT / 0.35, 0, 1), rec = U.clamp((this.downDur - this.stateT) / 0.4, 0, 1);
      this.body.rotation.x = U.easeOut(Math.min(fd, rec)) * (-Math.PI / 2 + 0.1); this.body.position.set(0, 0.2 * Math.min(fd, rec), 0.4 * Math.min(fd, rec));
    } else { this.body.rotation.x = a.flip; this.body.position.set(0, a.flip ? 0.4 * Math.sin(-a.flip / 2) * 0 : 0, 0); }
    if (this.pony) this.pony.rotation.x = -0.6 - run * 0.4 + Math.sin(t * 9) * 0.1 * run;
    var big = this.ath || HW.Input.vr ? 1 : 1.45; this.head.scale.setScalar(big); this.nameTag.position.y = this.nameY + (big - 1) * 0.3;   // arcade big heads off-headset
    this.head.rotation.x = st === 'down' ? 0.2 : (st === 'shoot' ? -0.35 : 0);
    // overlays
    this.arrow.visible = this.isHuman && this.arrowOn; if (this.arrow.visible) { this.arrow.position.y = H + 0.75 + Math.sin(t * 5) * 0.05; this.arrow.material.color.set(this.def.color); }
    this.callMark.visible = this.callT > 0; if (this.callT > 0) this.callT -= dt;
    if (this.onFire) { this.rim.rotation.z += dt * 3; this.rim.scale.setScalar(1 + 0.1 * Math.sin(t * 12)); }
    this.world.blobAt(this.blob, this.pos.x, this.pos.z, this.y);
    if (this.ath) this.poseAthlete(dt);
  };

  HW.Player = Player;
})(window.HW);
