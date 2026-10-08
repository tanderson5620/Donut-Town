/* athlete.js - realistic skinned basketball player (sculpted body, face, hands, hair, uniform), shared by all nine players.
   The body is the baked game mesh from js/body-data.js (built offline by Donut Town's tools/rimshot bake); the head, hair,
   eyes, uniform and shoes are generated here. Model space: meters, faces +Z, feet at y=0, about 1.89 m tall before scaling. */
window.HW = window.HW || {};
(function (HW) {
  var V3 = THREE.Vector3, TAU = Math.PI * 2;
  var rr = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var g1 = function (x) { return Math.exp(-x * x); };
  var wrap = function (a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  function hash2(x, y) { var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
  }
  function canvasTex(w, h, draw, rep) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); draw(g, w, h, c);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  function lin(c) { return new THREE.Color(c).convertSRGBToLinear(); }
  function STD(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: 0.7, metalness: 0 }, o || {})); }
  function lerpTab(tab, x) {
    if (x <= tab[0][0]) return tab[0].slice(1);
    for (var i = 1; i < tab.length; i++) if (x <= tab[i][0]) { var a = tab[i - 1], b = tab[i], k = (x - a[0]) / (b[0] - a[0]); return a.slice(1).map(function (v, j) { return lerp(v, b[j + 1], k); }); }
    return tab[tab.length - 1].slice(1);
  }

  /* ---------- geometry helpers ---------- */
  function orient(pos, index, centre) {
    var s = 0, A = new V3(), B = new V3(), Cc = new V3(), n = new V3();
    for (var k = 0; k < index.length; k += 3) {
      A.fromArray(pos, index[k] * 3); B.fromArray(pos, index[k + 1] * 3); Cc.fromArray(pos, index[k + 2] * 3);
      n.subVectors(B, A).cross(Cc.sub(A)); s += Math.sign(n.dot(A.sub(centre(index[k]))));
    }
    if (s < 0) for (var q = 0; q < index.length; q += 3) { var t = index[q + 1]; index[q + 1] = index[q + 2]; index[q + 2] = t; }
  }
  function skinGrid(R, C, fn) {
    var pos = [], uv = [], si = [], sw = [], keep = [], cen = [], i, j;
    for (i = 0; i <= R; i++) for (j = 0; j <= C; j++) {
      var v = fn(i / R, j / C);
      pos.push(v.p.x, v.p.y, v.p.z); uv.push(v.uv[0], v.uv[1]); cen.push(v.c);
      var ws = v.w.filter(function (e) { return e[1] > 1e-4; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4), tot = 0;
      ws.forEach(function (e) { tot += e[1]; });
      for (var k = 0; k < 4; k++) { si.push(ws[k] ? ws[k][0] : 0); sw.push(ws[k] ? ws[k][1] / tot : 0); }
      keep.push(v.keep !== false);
    }
    var index = [];
    for (i = 0; i < R; i++) for (j = 0; j < C; j++) {
      var a = i * (C + 1) + j, b = a + 1, c = a + C + 1, d = c + 1;
      if (keep[a] && keep[b] && keep[c] && keep[d]) index.push(a, c, b, b, c, d);
    }
    orient(pos, index, function (k) { return cen[k]; });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(index); g.computeVertexNormals();
    var nm = g.attributes.normal;
    for (i = 0; i <= R; i++) {
      var a2 = i * (C + 1), b2 = a2 + C, x = nm.getX(a2) + nm.getX(b2), y = nm.getY(a2) + nm.getY(b2), z = nm.getZ(a2) + nm.getZ(b2), l = Math.hypot(x, y, z) || 1;
      nm.setXYZ(a2, x / l, y / l, z / l); nm.setXYZ(b2, x / l, y / l, z / l);
    }
    return g;
  }
  function mergeIndexed(geos) {
    var out = new THREE.BufferGeometry(), names = Object.keys(geos[0].attributes);
    names.forEach(function (n) {
      var a0 = geos[0].attributes[n], len = 0; geos.forEach(function (g) { len += g.attributes[n].array.length; });
      var arr = new a0.array.constructor(len), o = 0; geos.forEach(function (g) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; });
      out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize));
    });
    var idx = [], base = 0; geos.forEach(function (g) { var ia = g.index.array; for (var i = 0; i < ia.length; i++) idx.push(ia[i] + base); base += g.attributes.position.count; });
    out.setIndex(idx); return out;
  }

  /* ---------- body shape tables (same skeleton the baked mesh was weighted to) ---------- */
  var TORSO = [
    [0.84, 0.0, 0.0, -0.005], [0.86, 0.11, 0.08, -0.006], [0.9, 0.15, 0.104, -0.01], [0.96, 0.167, 0.117, -0.012], [1.02, 0.161, 0.111, -0.008],
    [1.08, 0.149, 0.103, 0], [1.14, 0.141, 0.099, 0.004], [1.2, 0.147, 0.103, 0.006], [1.27, 0.159, 0.111, 0.008], [1.34, 0.175, 0.121, 0.01],
    [1.41, 0.187, 0.125, 0.01], [1.48, 0.195, 0.121, 0.006], [1.53, 0.197, 0.109, 0], [1.57, 0.172, 0.094, -0.008], [1.61, 0.14, 0.078, -0.012],
    [1.645, 0.092, 0.066, -0.012], [1.675, 0.062, 0.058, -0.01]
  ];
  function torsoPoint(y, th, off, out) {
    var t = lerpTab(TORSO, y), W = t[0], D = t[1], zo = t[2], c = Math.cos(th), s = Math.sin(th);
    var k = Math.pow(Math.pow(Math.abs(c), 2.4) + Math.pow(Math.abs(s), 2.4), -1 / 2.4);
    var x0 = s * W * k, ax = Math.abs(x0), front = smooth(0.2, 0.7, c), back = smooth(0.2, 0.7, -c), a = off;
    a += 0.013 * g1((ax - 0.075) / 0.055) * g1((y - 1.405) / 0.045) * front;
    a += 0.008 * g1((Math.abs(s) - 0.95) / 0.25) * g1((y - 1.33) / 0.07);
    a += 0.022 * g1((ax - 0.07) / 0.06) * g1((y - 0.955) / 0.06) * back;
    a += 0.012 * g1((ax - 0.085) / 0.045) * g1((y - 1.6) / 0.035) * smooth(0.3, -0.5, c);
    return out.set(x0 + s * a, y, c * D * k + zo + c * a);
  }
  var HD = { rx: 0.08, ry: 0.109, rz: 0.099, cy: 0.083, cz: 0.012 };
  var MOUTH_NY = -0.492, TH_M = Math.acos(MOUTH_NY), TH_JAW = Math.acos(-0.55);
  function headDir(th, ph) {
    if (th <= TH_JAW) return [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
    var q = (th - TH_JAW) / (Math.PI - TH_JAW), hr = Math.sin(TH_JAW) * Math.pow(Math.cos(q * Math.PI / 2), 0.45);
    return [Math.sin(ph) * hr, -0.55 - 0.36 * Math.sin(q * Math.PI / 2), Math.cos(ph) * hr];
  }
  function headPoint(nx, ny, nz, inflate, out) {
    var front = smooth(0.05, 0.55, nz), side = nx < 0 ? -1 : 1, ax = Math.abs(nx);
    var x = nx * HD.rx, y = ny * HD.ry, z = (nz > 0 ? Math.pow(nz, 0.8) : nz) * HD.rz;
    var low = smooth(-0.05, -0.8, ny);
    x *= 1 - 0.15 * low * smooth(-0.6, 0.4, nz) * smooth(-0.45, -0.95, ny) - 0.06 * low;
    var nape = smooth(-0.25, -0.9, ny) * smooth(0.1, -0.7, nz); x *= 1 - 0.18 * nape; z *= 1 - 0.22 * nape;
    x *= 1 - 0.05 * g1((ny - 0.35) / 0.25) * front;
    z += 0.015 * g1(nx / 0.32) * g1((ny + 0.84) / 0.13) * front;
    x += side * 0.006 * g1((ax - 0.78) / 0.14) * g1((ny + 0.62) / 0.13);
    z -= 0.004 * g1((ny - 0.75) / 0.2) * front;
    y -= 0.006 * g1(nx / 0.3) * g1((ny + 0.9) / 0.1) * front;
    z += 0.009 * g1((ny - 0.27) / 0.07) * smooth(0.6, 0.2, ax) * front;
    z -= 0.003 * g1(nx / 0.06) * g1((ny - 0.2) / 0.04) * front;
    z -= 0.009 * g1((ax - 0.4) / 0.13) * g1((ny - 0.12) / 0.1) * front;
    x += side * 0.009 * g1((ax - 0.6) / 0.14) * g1(ny / 0.13) * front;
    z += 0.007 * g1((ax - 0.52) / 0.13) * g1((ny + 0.03) / 0.11) * front;
    z -= 0.004 * g1((ax - 0.48) / 0.12) * g1((ny + 0.3) / 0.12) * front;
    var nh = ny > -0.22 ? 0.004 + 0.023 * smooth(0.2, -0.22, ny) : 0.027 * smooth(-0.34, -0.22, ny);
    z += nh * g1(nx / lerp(0.08, 0.19, smooth(0.15, -0.28, ny))) * front * smooth(0.32, 0.18, ny);
    z += 0.012 * g1((ax - 0.16) / 0.065) * g1((ny + 0.275) / 0.055) * front;
    x += side * 0.004 * g1((ax - 0.17) / 0.06) * g1((ny + 0.28) / 0.05) * front;
    z += 0.0095 * g1((ny + 0.452) / 0.03) * g1(nx / 0.24) * front;
    z += 0.0012 * g1((ny + 0.425) / 0.008) * g1(nx / 0.22) * front;
    z += 0.011 * g1((ny + 0.537) / 0.036) * g1(nx / 0.22) * front;
    z -= 0.003 * g1((ax - 0.27) / 0.035) * g1((ny - MOUTH_NY) / 0.04) * front;
    z -= 0.0025 * g1((ny - MOUTH_NY) / 0.012) * g1(nx / 0.27) * front;
    z -= 0.0015 * g1(nx / 0.03) * g1((ny + 0.39) / 0.035) * front;
    return out.set(x + nx * inflate, HD.cy + y + ny * inflate, HD.cz + z + nz * inflate);
  }
  function headPaint(nx, ny, nz, th, ph) {
    var front = smooth(0.05, 0.5, nz), ax = Math.abs(nx), r = 1, g = 1, b = 1;
    var lips = Math.max(g1((ny + 0.452) / 0.03), g1((ny + 0.535) / 0.036)) * smooth(0.27, 0.17, ax) * front;
    r = lerp(r, 0.86, lips); g = lerp(g, 0.62, lips); b = lerp(b, 0.62, lips);
    var nos = g1((ax - 0.075) / 0.03) * g1((ny + 0.315) / 0.02) * front; r *= 1 - 0.7 * nos; g *= 1 - 0.7 * nos; b *= 1 - 0.7 * nos;
    var lid = g1((ax - 0.4) / 0.12) * g1((ny - 0.17) / 0.06) * front; r *= 1 - 0.12 * lid; g *= 1 - 0.15 * lid; b *= 1 - 0.15 * lid;
    var cheek = g1((ax - 0.5) / 0.15) * g1((ny + 0.12) / 0.15) * front; g *= 1 - 0.05 * cheek; b *= 1 - 0.06 * cheek;
    var m = 0.95 + 0.1 * vnoise(th * 40, ph * 40);
    return [r * m, g * m, b * m];
  }
  // skin shading: light wraps past the terminator with a warm tint (cheap subsurface scattering) and a soft rim
  function addSkinShading(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'vec3 irradiance = dotNL * directLight.color;',
          'vec3 irradiance = dotNL * directLight.color;\n\tfloat wrapNL = saturate( ( dot( geometry.normal, directLight.direction ) + 0.5 ) / 1.5 );\n\treflectedLight.directDiffuse += max( wrapNL - dotNL, 0.0 ) * directLight.color * vec3( 0.55, 0.17, 0.1 ) * material.diffuseColor;'))
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 3.0 ) * vec3( 0.045, 0.03, 0.024 );');
    };
    mat.customProgramCacheKey = function () { return 'hw-skin'; };
    return mat;
  }

  /* ---------- hair: per-style hairline (ny by |phi|/PI, 0 = forehead, 1 = nape) and thickness ---------- */
  var HAIR = {
    fade:  { line: [[0, 0.62], [0.12, 0.6], [0.2, 0.5], [0.26, 0.55], [0.33, 0.3], [0.4, 0.02], [0.44, 0.12], [0.56, 0.2], [0.7, -0.05], [1, -0.38]], thick: 0.006, top: 0.002, coil: true },
    short: { line: [[0, 0.6], [0.15, 0.56], [0.25, 0.46], [0.33, 0.32], [0.4, 0.12], [0.45, 0.22], [0.6, 0.15], [0.8, -0.1], [1, -0.36]], thick: 0.007, top: 0.012 },
    swept: { line: [[0, 0.68], [0.1, 0.64], [0.18, 0.56], [0.28, 0.44], [0.38, 0.3], [0.45, 0.33], [0.6, 0.24], [0.8, 0.0], [1, -0.2]], thick: 0.0025, top: 0.006, back: true },
    afro:  { line: [[0, 0.6], [0.15, 0.56], [0.3, 0.4], [0.4, 0.1], [0.45, 0.2], [0.7, -0.15], [1, -0.4]], thick: 0.03, top: 0.03, coil: true },
    long:  { line: [[0, 0.56], [0.12, 0.52], [0.22, 0.38], [0.3, 0.1], [0.4, -0.25], [0.6, -0.4], [1, -0.55]], thick: 0.008, top: 0.01 }
  };
  HAIR.pony = HAIR.long; HAIR.bun = HAIR.long;
  function hairNy(style, ph) { return lerpTab(style.line, Math.abs(ph) / Math.PI)[0]; }

  /* ---------- shared, built once ---------- */
  var S = null;
  function shared() {
    if (S) return S;
    S = {};
    var D = HW.BODY_DATA;
    if (D) {
      var s = atob(D.bin), u8 = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      var buf = u8.buffer, m = D.body, arr = function (k, T) { return new T(buf, m[k][0], m[k][1]); }, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr('position', Float32Array), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(arr('normal', Int8Array), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(arr('uv', Uint16Array), 2, true));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(arr('skinIndex', Uint8Array), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(arr('skinWeight', Uint8Array), 4, true));
      g.setIndex(new THREE.BufferAttribute(arr('index', m.index[2] === 'uint16' ? Uint16Array : Uint32Array), 1));
      g.setAttribute('uv2', g.attributes.uv);
      S.bodyGeo = g;
      var loader = new THREE.TextureLoader();
      S.tex = function (k) { return D.images[k] ? loader.load(D.images[k]) : null; };
      S.bodyNrm = S.tex('body_nrm'); S.bodyAO = S.tex('body_ao'); S.headNrm = S.tex('head_nrm'); S.headAO = S.tex('head_ao');
      S.jerseyNrm = S.tex('jersey_nrm'); S.jerseyAO = S.tex('jersey_ao'); S.shortsNrm = S.tex('shorts_nrm'); S.shortsAO = S.tex('shorts_ao');
    }
    // head color multiplier (lips, nostrils, lids) and roughness (oily T-zone)
    var HWd = 512, HHd = 256;
    S.headCol = canvasTex(HWd, HHd, function (g) {
      var img = g.createImageData(HWd, HHd), d = img.data;
      for (var y = 0; y < HHd; y++) { var th = (y + 0.5) / HHd * Math.PI;
        for (var x = 0; x < HWd; x++) { var ph = (x + 0.5) / HWd * TAU - Math.PI, n = headDir(th, ph), c = headPaint(n[0], n[1], n[2], th, ph), o = (y * HWd + x) * 4;
          d[o] = clamp(c[0], 0, 1.1) * 232; d[o + 1] = clamp(c[1], 0, 1.1) * 232; d[o + 2] = clamp(c[2], 0, 1.1) * 232; d[o + 3] = 255; } }
      g.putImageData(img, 0, 0);
    });
    S.headRough = canvasTex(256, 128, function (g, w, h) {
      var img = g.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var n = headDir((y + 0.5) / h * Math.PI, (x + 0.5) / w * TAU - Math.PI), nx = n[0], ny = n[1], nz = n[2], fr = smooth(0.1, 0.5, nz);
        var tz = Math.max(g1(nx / 0.35) * g1((ny - 0.45) / 0.15), g1(nx / 0.13) * g1((ny + 0.05) / 0.22)) * fr;
        var lip = Math.max(g1((ny + 0.452) / 0.03), g1((ny + 0.537) / 0.036)) * smooth(0.25, 0.17, Math.abs(nx)) * fr;
        var r = clamp(0.6 - 0.2 * tz - 0.25 * lip + 0.04 * (hash2(x, y) - 0.5), 0.2, 0.9), o = (y * w + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = r * 255; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }); if (THREE.LinearEncoding !== undefined) S.headRough.encoding = THREE.LinearEncoding;
    // head geometry (split at the mouth line so the jaw can open)
    buildHeadGeo();
    S.eyeGeo = new THREE.SphereGeometry(0.0122, 20, 14); S.eyeGeo.rotateX(Math.PI / 2);
    S.eyeTex = {};
    // hair textures: straight strands (white, tinted by the material) and tight coils
    S.strandTex = canvasTex(512, 256, function (g, w, h) {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { var x = rr(0, w), y = rr(0, h), l = rr(14, 60), v = rr(150, 255); g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + rr(0.25, 0.7) + ')'; g.lineWidth = rr(0.6, 1.6); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-3, 3), y + l); g.stroke(); }
      for (var j = 0; j < 900; j++) { g.fillStyle = 'rgba(40,40,40,' + rr(0.08, 0.2) + ')'; g.fillRect(rr(0, w), rr(0, h), 1, rr(10, 40)); }
      var gr = g.createLinearGradient(0, h * 0.86, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    S.coilTex = canvasTex(512, 256, function (g, w, h) {
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 16000; i++) { var v = rr(120, 255); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + rr(0.3, 0.8) + ')'; g.beginPath(); g.arc(rr(0, w), rr(0, h), rr(0.8, 2.2), 0, TAU); g.fill(); }
    });
    S.hairGeo = {};
    S.limbGeo = {};
    return S;
  }

  function buildHeadGeo() {
    var PI = Math.PI, TH = [], PH = [], seg = function (arr, a, b, n) { for (var i = 0; i < n; i++) arr.push(a + (b - a) * i / n); };
    seg(TH, 0, 0.38 * PI, 12); seg(TH, 0.38 * PI, 0.6 * PI, 22); seg(TH, 0.6 * PI, TH_M, 10); seg(TH, TH_M, 0.72 * PI, 8); seg(TH, 0.72 * PI, PI, 16); TH.push(PI);
    seg(PH, -PI, -0.6 * PI, 10); seg(PH, -0.6 * PI, 0.6 * PI, 52); seg(PH, 0.6 * PI, PI, 10); PH.push(PI);
    var R = TH.length, C = PH.length, jm = 12 + 22 + 10, pos = [], uv = [], meta = [], p = new V3(), r, c;
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) {
      var th = TH[r], ph = PH[c], n = headDir(th, ph);
      headPoint(n[0], n[1], n[2], 0, p); pos.push(p.x, p.y, p.z); uv.push((ph + PI) / TAU, 1 - th / PI); meta.push([th, n[0], n[2]]);
    }
    var index = [];
    for (r = 0; r < R - 1; r++) for (c = 0; c < C - 1; c++) { var a = r * C + c, b = a + 1, cc = a + C, d = cc + 1; index.push(a, cc, b, b, cc, d); }
    var ctr = new V3(0, HD.cy, HD.cz); orient(pos, index, function () { return ctr; });
    var tmpG = new THREE.BufferGeometry(); tmpG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tmpG.setIndex(index); tmpG.computeVertexNormals();
    var nrm = Array.from(tmpG.attributes.normal.array);
    for (r = 0; r < R; r++) { var a1 = r * C * 3, b1 = (r * C + C - 1) * 3; for (var k = 0; k < 3; k++) { var v = (nrm[a1 + k] + nrm[b1 + k]) / 2; nrm[a1 + k] = nrm[b1 + k] = v; } }
    var dup = {};
    for (c = 0; c < C; c++) { var kk = jm * C + c, nx = meta[kk][1], nz = meta[kk][2]; if (Math.abs(nx) < 0.24 && nz > 0) { dup[kk] = pos.length / 3; pos.push(pos[kk * 3], pos[kk * 3 + 1], pos[kk * 3 + 2]); uv.push(uv[kk * 2], uv[kk * 2 + 1]); nrm.push(nrm[kk * 3], nrm[kk * 3 + 1], nrm[kk * 3 + 2]); meta.push([meta[kk][0] + 0.05, nx, nz]); } }
    for (var q = 0; q < index.length; q += 6) { if (Math.floor(Math.min(index[q], index[q + 1], index[q + 2]) / C) !== jm) continue; for (var k2 = q; k2 < q + 6; k2++) if (dup[index[k2]] !== undefined) index[k2] = dup[index[k2]]; }
    S.headMeta = meta; S.headPos = pos; S.headNrmArr = nrm; S.headIndex = index; S.headUV = uv;
  }

  // hair cap following the scalp out to the style's hairline; k-th shell of n
  function hairGeo(styleName, k, n) {
    var key = styleName + k + '/' + n; if (S.hairGeo[key]) return S.hairGeo[key];
    var st = HAIR[styleName] || HAIR.short, R = 16, C = 48, PI = Math.PI, q = new V3(), ctr = new V3(0, HD.cy, HD.cz), pos = [], uv = [], idx = [];
    for (var r = 0; r <= R; r++) for (var c = 0; c <= C; c++) {
      var ph = c / C * TAU - PI, s = r / R, th = s * Math.acos(clamp(hairNy(st, ph), -1, 1));
      var crown = smooth(0.85, 0.1, s), frontF = smooth(0.6, 0.1, Math.abs(ph) / PI);
      var thick = (st.thick + st.top * crown * (st.back ? lerp(0.6, 1.2, frontF) : 1)) * smooth(1.02, 0.75, s) + 0.0012;
      headPoint(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph), 0.0006 + thick * (k + 1) / n, q);
      pos.push(q.x, q.y, q.z); uv.push(c / C * 2, 1 - s);
    }
    for (r = 0; r < R; r++) for (c = 0; c < C; c++) { var a = r * (C + 1) + c, b = a + 1, cc = a + C + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    orient(pos, idx, function () { return ctr; });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return (S.hairGeo[key] = g);
  }

  function eyeTexture(iris) {
    if (S.eyeTex[iris]) return S.eyeTex[iris];
    var ic = new THREE.Color(iris);
    return (S.eyeTex[iris] = canvasTex(256, 128, function (g, w, h) {
      var img = g.createImageData(w, h), d = img.data;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var th = (y + 0.5) / h, o = (y * w + x) * 4, r, gg, b;
        if (th < 0.075) { r = gg = b = 8; }
        else if (th < 0.2) { var f = 0.55 + 0.45 * vnoise(x * 0.35, y * 0.2), e = smooth(0.17, 0.2, th); r = ic.r * 255 * f * (1 - e * 0.7); gg = ic.g * 255 * f * (1 - e * 0.7); b = ic.b * 255 * f * (1 - e * 0.7); }
        else { var pink = smooth(0.5, 0.95, th); r = 236 - pink * 10; gg = 228 - pink * 40; b = 214 - pink * 40; }
        d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }));
  }

  /* ---------- per player ---------- */
  // o: { skin, iris, hair:{style,color}, brow, jersey, trim, dark, num, team, name, shorts, shoe:{base,accent,sole}, band, glasses, bulk }
  HW.Athlete = { available: function () { return !!HW.BODY_DATA; } };
  HW.Athlete.build = function (o) {
    shared();
    var P = { sh: [], el: [], th: [], kn: [], hand: [], feet: [], palm: [], hipY: 1.02, mats: [] };
    var bones = [], I = {};
    var bone = function (name, parent, x, y, z) { var b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); I[name] = bones.length; bones.push(b); return b; };
    P.root = new THREE.Group(); P.body = new THREE.Group(); P.root.add(P.body);
    P.hips = bone('hips', null, 0, P.hipY, 0); P.body.add(P.hips);
    P.spine = bone('spine', P.hips, 0, 0.08, 0); P.chest = bone('chest', P.spine, 0, 0.22, 0);
    P.neck = bone('neck', P.chest, 0, 0.31, -0.012); P.head = bone('head', P.neck, 0, 0.093, 0.008); P.jaw = bone('jaw', P.head, 0, 0.07, -0.005);
    [-1, 1].forEach(function (s) {
      var sh = bone('sh' + s, P.chest, s * 0.195, 0.232, -0.012); sh.rotation.z = s * 0.12;
      var el = bone('el' + s, sh, 0, -0.33, 0), hd = bone('hand' + s, el, 0, -0.28, 0);
      var th = bone('th' + s, P.hips, s * 0.095, -0.03, 0), kn = bone('kn' + s, th, 0, -0.46, 0), ft = bone('ft' + s, kn, 0, -0.45, 0);
      P.sh.push(sh); P.el.push(el); P.hand.push(hd); P.th.push(th); P.kn.push(kn); P.feet.push(ft);
    });
    P.root.updateMatrixWorld(true);
    var J = {}; bones.forEach(function (b) { J[b.name] = b.getWorldPosition(new V3()); });
    var meshes = [];
    var skinned = function (geo, mat, name) { var m = new THREE.SkinnedMesh(geo, mat); m.name = name; m.frustumCulled = false; P.root.add(m); meshes.push(m); return m; };

    // ---- skin ----
    var skinC = lin(o.skin);
    var SK = function (x) { return addSkinShading(new THREE.MeshStandardMaterial(Object.assign({ color: skinC, roughness: 0.55, metalness: 0, skinning: true, emissive: 0x0b0503 }, x))); };
    var bodyMat = S.bodyGeo ? SK({ normalMap: S.bodyNrm, aoMap: S.bodyAO }) : SK({});
    var headMat = SK({ map: S.headCol, normalMap: S.headNrm, aoMap: S.headAO, roughness: 1, roughnessMap: S.headRough });
    var plainSkin = addSkinShading(new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.55, metalness: 0, emissive: 0x0b0503 }));
    P.mats.push(bodyMat, headMat);
    if (S.bodyGeo) skinned(S.bodyGeo, bodyMat, 'body');

    // ---- head ----
    var meta = S.headMeta, si = [], sw = [];
    meta.forEach(function (mm) {
      var th = mm[0], nx = mm[1], nz = mm[2], PI = Math.PI;
      var wj = smooth(TH_M - 0.001, TH_M + 0.05, th) * smooth(-0.45, 0.1, nz) * (1 - smooth(0.86 * PI, 0.97 * PI, th)) * smooth(0.75, 0.45, Math.abs(nx));
      si.push(I.head, I.jaw, 0, 0); sw.push(1 - wj, wj, 0, 0);
    });
    if (!S.headGeo) {
      var hg = new THREE.BufferGeometry();
      hg.setAttribute('position', new THREE.Float32BufferAttribute(S.headPos, 3)); hg.setAttribute('normal', new THREE.Float32BufferAttribute(S.headNrmArr, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(S.headUV, 2));
      hg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); hg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); hg.setIndex(S.headIndex);
      hg.translate(J.head.x, J.head.y, J.head.z); hg.setAttribute('uv2', hg.attributes.uv); S.headGeo = hg;
    }
    skinned(S.headGeo, headMat, 'head');

    var H = P.head, Fc = { eyes: [], lidsU: [], lidsL: [], brows: [], blink: 0, blinkT: rr(1, 4) };
    var mouthY = HD.cy + MOUTH_NY * HD.ry;
    var cav = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), STD('#2a0c0c', { roughness: 0.9 })); cav.scale.set(0.03, 0.02, 0.03); cav.position.set(0, mouthY, 0.065); H.add(cav);
    var eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(o.iris || '#5a3a20'), roughness: 0.06, metalness: 0 });
    var lashM = STD('#0c0806', { roughness: 0.9 }), browM = STD(o.brow || o.hair.color, { roughness: 0.95 });
    [-1, 1].forEach(function (s) {
      var nx = s * 0.4, ny = 0.12, nz = Math.sqrt(1 - nx * nx - ny * ny), sp = headPoint(nx, ny, nz, 0, new V3());
      var eg = new THREE.Group(); eg.position.set(sp.x, sp.y, sp.z - 0.0065); H.add(eg);
      var ball = new THREE.Mesh(S.eyeGeo, eyeMat); eg.add(ball);
      var lu = new THREE.Group(), ll = new THREE.Group(); eg.add(lu); eg.add(ll);
      lu.add(new THREE.Mesh(new THREE.SphereGeometry(0.0138, 16, 8, 0, TAU, 0, Math.PI * 0.46), plainSkin));
      var lash = new THREE.Mesh(new THREE.TorusGeometry(0.0134 * Math.sin(Math.PI * 0.46) + 0.0006, 0.0005, 3, 14, Math.PI), lashM);
      lash.rotation.x = Math.PI / 2 - 0.3; lash.position.y = 0.0134 * Math.cos(Math.PI * 0.46); lu.add(lash);
      ll.add(new THREE.Mesh(new THREE.SphereGeometry(0.0131, 16, 6, 0, TAU, Math.PI * 0.66, Math.PI * 0.34), plainSkin));
      Fc.eyes.push(ball); Fc.lidsU.push(lu); Fc.lidsL.push(ll);
      var bg = new THREE.Group(); H.add(bg);
      for (var i = 0; i < 7; i++) {
        var bx = s * lerp(0.17, 0.66, i / 6), by = 0.29 + 0.035 * Math.sin(i / 6 * Math.PI) - i * 0.004, bz = Math.sqrt(Math.max(0, 1 - bx * bx - by * by));
        var qq = headPoint(bx, by, bz, 0.0018, new V3());
        var hair = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), browM); hair.scale.set(0.0064, 0.0019 - i * 0.00008, 0.0013);
        hair.position.copy(qq); hair.rotation.z = s * (-0.15 + i * 0.05); hair.rotation.y = s * bx * 0.8; bg.add(hair);
      }
      Fc.brows.push(bg);
      var ep = headPoint(s * 0.985, -0.04, 0.17, 0, new V3()), ear = new THREE.Group(); ear.position.set(ep.x + s * 0.004, ep.y, ep.z - 0.006); ear.rotation.y = s * 0.35; H.add(ear);
      var shell = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), plainSkin); shell.scale.set(0.008, 0.03, 0.019); ear.add(shell);
      var helix = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0032, 6, 16, Math.PI * 1.3), plainSkin); helix.rotation.y = Math.PI / 2; helix.rotation.x = -0.5; helix.position.set(s * 0.004, 0.006, -0.002); helix.scale.set(1, 1.5, 1); ear.add(helix);
    });

    // ---- hair ----
    var hs = o.hair.style, hc = lin(o.hair.color), coil = HAIR[hs] && HAIR[hs].coil;
    var base = new THREE.Mesh(hairGeo(hs, 0, 6), new THREE.MeshStandardMaterial({ color: hc.clone().multiplyScalar(0.7), roughness: 0.85, metalness: 0 })); H.add(base);
    var NS = coil ? 3 : 2;
    for (var k = 0; k < NS; k++) {
      var shade = lerp(0.75, 1.05, k / Math.max(1, NS - 1));
      H.add(new THREE.Mesh(hairGeo(hs, k + 1, NS), new THREE.MeshStandardMaterial({ map: coil ? S.coilTex : S.strandTex, color: hc.clone().multiplyScalar(shade), roughness: coil ? 0.95 : 0.6, metalness: 0, transparent: k === NS - 1, opacity: k === NS - 1 ? 0.92 : 1 })));
    }
    var hairM = new THREE.MeshStandardMaterial({ map: S.strandTex, color: hc, roughness: 0.6, metalness: 0 });
    if (hs === 'pony') {
      var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.006, 0.26, 10, 4), hairM); tail.geometry.translate(0, -0.13, 0);
      var tg = new THREE.Group(); tg.position.set(0, HD.cy + 0.06, HD.cz - 0.1); tg.rotation.x = -0.35; tg.add(tail); H.add(tg); P.pony = tg;
      var tie = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), STD(o.jersey)); tie.rotation.x = Math.PI / 2; tg.add(tie);
    } else if (hs === 'bun') {
      var bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), hairM); bun.scale.set(1, 0.85, 1); bun.position.set(0, HD.cy + 0.105, HD.cz - 0.06); H.add(bun);
    }
    if (o.band) {
      var bandM = STD(o.band, { roughness: 1, side: THREE.DoubleSide }), bp = [], bu = [], bi = [], BC = 48, q = new V3(), ctr = new V3(0, HD.cy, HD.cz);
      for (var r = 0; r < 3; r++) for (var c = 0; c <= BC; c++) {
        var ph = c / BC * TAU - Math.PI, ny = lerp(0.52, 0.3, smooth(0.15, 1, Math.abs(ph) / Math.PI)) + (r - 1) * 0.11, th = Math.acos(ny);
        headPoint(Math.sin(th) * Math.sin(ph), ny, Math.sin(th) * Math.cos(ph), 0.011 + (r === 1 ? 0.002 : 0) + HAIR[hs].thick * 0.6, q); bp.push(q.x, q.y, q.z); bu.push(c / BC * 6, r / 2);
      }
      for (var rr2 = 0; rr2 < 2; rr2++) for (var c2 = 0; c2 < BC; c2++) { var a = rr2 * (BC + 1) + c2, b = a + 1, cc = a + BC + 1, d = cc + 1; bi.push(a, cc, b, b, cc, d); }
      orient(bp, bi, function () { return ctr; });
      var bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bgeo.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bgeo.setIndex(bi); bgeo.computeVertexNormals();
      H.add(new THREE.Mesh(bgeo, bandM));
    }
    if (o.glasses) {   // thin dark wire frames with brown tinted lenses
      var frame = STD('#2b2724', { roughness: 0.3, metalness: 0.7 }), lens = new THREE.MeshStandardMaterial({ color: lin('#5a3c28'), roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.62 });
      [-1, 1].forEach(function (s) {
        var c0 = headPoint(s * 0.4, 0.12, Math.sqrt(1 - 0.16 - 0.0144), 0, new V3());
        var lg = new THREE.Group(); lg.position.set(c0.x, c0.y - 0.002, c0.z + 0.014); H.add(lg);
        var l = new THREE.Mesh(new THREE.CircleGeometry(0.021, 20), lens); l.scale.set(1.2, 0.85, 1); lg.add(l);
        var rim = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0011, 4, 24), frame); rim.scale.set(1.2, 0.85, 1); lg.add(rim);
        var ep2 = headPoint(s * 0.97, 0.05, 0.1, 0.002, new V3());
        var from = new V3(c0.x + s * 0.024, c0.y + 0.004, c0.z + 0.012), dv = ep2.clone().sub(from), len = dv.length();
        var temple = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, len), frame); temple.position.copy(from).addScaledVector(dv, 0.5); H.add(temple);
        temple.quaternion.setFromUnitVectors(new V3(0, 0, 1), dv.normalize());
      });
      var bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0016, 0.002), frame); var cb = headPoint(0, 0.16, 1, 0.006, new V3()); bridge.position.set(0, cb.y, cb.z + 0.004); H.add(bridge);
    }
    P.face = Fc;

    // ---- jersey: tank top with arm holes and scoop neck, colors and numbers per player ----
    var NECK_X = 0.08, ARM_X = 0.145, ARM_Y = 1.38, J0 = 0.93, J1 = 1.645;
    var neckY = function (th) { return 1.615 - 0.045 * Math.pow(Math.max(0, Math.cos(th)), 2); };
    var jerseyHole = function (x, y, th, m) { m = m || 0; return (Math.abs(x) > ARM_X + m && y > ARM_Y + m) || (Math.abs(x) < NECK_X - m && y > neckY(th) + m); };
    var jc = new THREE.Color(o.jersey), tc = new THREE.Color(o.trim || '#f6f6f2');
    var jerseyTex = canvasTex(512, 512, function (g, w, h) {
      var img = g.createImageData(w, h), d = img.data;
      for (var py = 0; py < h; py++) {
        var y = J0 + (1 - py / h) * (J1 - J0), W = lerpTab(TORSO, y)[0];
        for (var px = 0; px < w; px++) {
          var th = px / w * TAU - Math.PI, ax = Math.abs(Math.sin(th)) * W, oo = (py * w + px) * 4;
          var dA = ax < ARM_X && y > ARM_Y ? ARM_X - ax : ax >= ARM_X && y <= ARM_Y ? ARM_Y - y : ax < ARM_X ? Math.hypot(ARM_X - ax, ARM_Y - y) : 0;
          var ny = neckY(th), dN = ax >= NECK_X && y > ny ? ax - NECK_X : ax < NECK_X && y <= ny ? ny - y : ax >= NECK_X ? Math.hypot(ax - NECK_X, ny - y) : 0;
          var trim = Math.min(dA, dN) < 0.014 || (Math.abs(Math.sin(th)) > 0.975 && y < ARM_Y);
          var mesh = ((px % 4 < 1) && (py % 4 < 1)) ? 0.88 : 1, n = 0.94 + 0.06 * hash2(px, py), col = trim ? tc : jc, mm = trim ? n : mesh * n;
          d[oo] = col.r * 255 * mm; d[oo + 1] = col.g * 255 * mm; d[oo + 2] = col.b * 255 * mm;
          d[oo + 3] = (ax > ARM_X && y > ARM_Y) || (ax < NECK_X && y > ny) ? 0 : 255;
        }
      }
      g.putImageData(img, 0, 0);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      var vy = function (y) { return (1 - (y - J0) / (J1 - J0)) * h; }, num = String(o.num);
      var drawNum = function (x, y, s) { g.font = '900 ' + s + 'px Arial Black, Arial, sans-serif'; g.lineWidth = s * 0.12; g.strokeStyle = o.dark || '#111'; g.strokeText(num, x, y); g.fillStyle = o.trim || '#f6f6f2'; g.fillText(num, x, y); };
      drawNum(w * 0.5, vy(1.33), 112);
      g.font = '800 ' + (o.team.length > 7 ? 19 : 26) + 'px Arial, sans-serif'; g.fillStyle = o.trim || '#f6f6f2'; g.fillText(o.team, w * 0.5, vy(1.46));
      [0, w].forEach(function (x) { drawNum(x, vy(1.3), 140); g.font = '800 30px Arial, sans-serif'; g.fillStyle = o.trim || '#f6f6f2'; g.fillText(o.name, x, vy(1.47)); });
    });
    var clothMat = function (map, nrm, ao) { return new THREE.MeshStandardMaterial({ map: map, normalMap: nrm, aoMap: ao, roughness: 0.78, metalness: 0, skinning: true, side: THREE.DoubleSide, alphaTest: 0.5 }); };
    var torsoWeights = function (p, w) {
      var y = p.y, ax = Math.abs(p.x), s = p.x >= 0 ? 1 : -1, wh = 1 - smooth(1.02, 1.14, y), wc = smooth(1.22, 1.36, y);
      w.push([I.hips, wh], [I.spine, Math.max(0, 1 - wh - wc)], [I.chest, wc]);
      var wt = 0.6 * smooth(1.0, 0.86, y) * smooth(0.02, 0.1, ax); if (wt > 0.01) w.push([I['th' + s], wt]);
      var wsh = 0.75 * g1(p.distanceTo(J['sh' + s]) / 0.075); if (wsh > 0.01) w.push([I['sh' + s], wsh]);
      var wn = 0.6 * smooth(1.6, 1.68, y); if (wn > 0.01) w.push([I.neck, wn]);
      return w;
    };
    var torsoGrid = function (y0, y1, off, R, C, extra) {
      return skinGrid(R, C, function (a, b) {
        var y = lerp(y0, y1, a), th = b * TAU - Math.PI, p = new V3();
        torsoPoint(Math.min(y, 1.675), th, off + (extra ? extra.off(y, th) : 0), p);
        var zo = lerpTab(TORSO, y)[2];
        return { p: p, c: new V3(0, y, zo), uv: extra.uv(a, b), w: torsoWeights(p, []), keep: extra.keep ? extra.keep(p, th) : true };
      });
    };
    if (!S.jerseyGeo) {
      S.jerseyGeo = torsoGrid(J0, J1, 0.009, 36, 44, { off: function (y, th) { return 0.0035 * vnoise(th * 4, y * 28) + 0.004 * smooth(1.25, 1.02, y); }, uv: function (a, b) { return [b, a]; }, keep: function (p, th) { return !jerseyHole(p.x, p.y, th, 0.03); } });
      S.jerseyGeo.setAttribute('uv2', S.jerseyGeo.attributes.uv);
    }
    var jMat = clothMat(jerseyTex, S.jerseyNrm, S.jerseyAO); P.mats.push(jMat);
    skinned(S.jerseyGeo, jMat, 'jersey');

    // ---- shorts ----
    var sc = o.shorts || o.jersey;
    var shortsTex = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = sc; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { g.fillStyle = 'rgba(0,0,0,' + rr(0.03, 0.07) + ')'; g.fillRect(rr(0, w), rr(0, h), 2, 2); }
      if (!o.plainShorts) {
        g.fillStyle = o.trim || '#f6f6f2'; g.fillRect(0, 0, w, h * 0.06);
        g.fillStyle = o.dark || '#111'; g.fillRect(0, h * 0.06, w, h * 0.012); g.fillStyle = o.trim || '#f6f6f2';
        [0.375, 0.875].forEach(function (u) { g.fillRect(u * w - 5, h * 0.5, 10, h * 0.5); });
        g.fillRect(0, h * 0.965, w, h * 0.035);
      } else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, h * 0.05); }
    });
    if (!S.shortsGeo) {
      var thighR = [[0, 0.085, 0.088], [0.15, 0.088, 0.09], [0.45, 0.08, 0.078], [0.8, 0.062, 0.062], [1, 0.052, 0.055]];
      var band = torsoGrid(0.9, 1.115, 0.016, 12, 44, { off: function (y) { return 0.004 * smooth(1.0, 0.9, y); }, uv: function (a, b) { return [b, 0.5 + 0.5 * a]; } });
      var legs = [-1, 1].map(function (s) {
        var A = J['th' + s], B = J['kn' + s], dd = B.clone().sub(A), L = dd.length(); dd.divideScalar(L);
        var f = new V3(0, 0, 1).addScaledVector(dd, -dd.z).normalize(), lat = new V3().crossVectors(dd, f); if (lat.x * s < 0) lat.negate();
        return skinGrid(14, 30, function (a, b) {
          var t = lerp(-0.08, 0.9, a), th = b * TAU - Math.PI, rab = lerpTab(thighR, t), off = 0.034 + 0.018 * t + 0.005 * Math.sin(th * 5 + t * 3) * smooth(0.2, 0.9, t);
          var c = A.clone().addScaledVector(dd, t * L); c.x -= s * 0.04 * smooth(0.45, 0.0, t); c.z += 0.008 * smooth(0.45, 0.0, t); var p = c.clone().addScaledVector(f, Math.cos(th) * (rab[0] + off)).addScaledVector(lat, Math.sin(th) * (rab[1] + off));
          return { p: p, c: c, uv: [(s < 0 ? 0 : 0.5) + 0.5 * b, 0.5 * (1 - a)], w: [[I['th' + s], smooth(0, 0.3, t)], [I.hips, 1 - smooth(0, 0.3, t)]] };
        });
      });
      S.shortsGeo = mergeIndexed([band].concat(legs)); S.shortsGeo.setAttribute('uv2', S.shortsGeo.attributes.uv);
    }
    var sMat = clothMat(shortsTex, S.shortsNrm, S.shortsAO); P.mats.push(sMat);
    skinned(S.shortsGeo, sMat, 'shorts');

    // ---- socks + shoes (rigid on shin / foot bones) ----
    var shoe = o.shoe || { base: '#f5f5f3', accent: o.jersey, sole: '#f7f7f4' };
    var sockM = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, function (g, w, h) { g.fillStyle = o.sock || '#f2f2ef'; g.fillRect(0, 0, w, h); for (var x = 0; x < w; x += 4) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, 0, 2, h); } if (!o.sock) { g.fillStyle = o.jersey; g.fillRect(0, 4, w, 5); } }, [3, 1]), roughness: 1 });
    var FOOT = [[0, 0], [0.04, 0.03], [0.1, 0.037], [0.3, 0.037], [0.55, 0.045], [0.72, 0.053], [0.85, 0.05], [0.95, 0.035], [1, 0.004]];
    var footW = function (t) { return lerpTab(FOOT, clamp(t, 0, 1))[0]; };
    if (!S.shoeGeo) {
      var fp = new THREE.Shape(), pts = [], n = 22;
      for (var i2 = 0; i2 <= n; i2++) { var t = i2 / n; pts.push([footW(t) * (t > 0.3 && t < 0.62 ? 0.9 : 1), -0.07 + t * 0.33]); }
      fp.moveTo(0, -0.07); pts.forEach(function (p) { fp.lineTo(p[0], p[1]); }); for (var i3 = n; i3 >= 0; i3--) fp.lineTo(-pts[i3][0], pts[i3][1]);
      var soleG = new THREE.ExtrudeGeometry(fp, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4 }); soleG.rotateX(Math.PI / 2);
      var upperG = new THREE.SphereGeometry(1, 20, 12), up = upperG.attributes.position, uvA = upperG.attributes.uv;
      for (var i4 = 0; i4 < up.count; i4++) {
        var x = up.getX(i4), y = up.getY(i4), z = up.getZ(i4);
        z = 0.09 + z * 0.165; var tt = (z + 0.07) / 0.33; x *= footW(tt) * 0.98 + 0.004; y = -0.022 + y * 0.062;
        if (y < -0.044) y = -0.044; if (y > -0.044) y = -0.044 + (y + 0.044) * lerp(1, 0.42, smooth(0.07, 0.24, z));
        if (z < 0.02 && y > 0.0) y += 0.012 * smooth(0, 0.035, y);
        up.setXYZ(i4, x, y, z); uvA.setXY(i4, clamp((z + 0.075) / 0.34, 0, 1), clamp((y + 0.05) / 0.11, 0, 1));
      }
      upperG.computeVertexNormals(); S.shoeGeo = { sole: soleG, upper: upperG };
    }
    var shoeTex = canvasTex(256, 128, function (g, w, h) {
      g.fillStyle = shoe.base; g.fillRect(0, 0, w, h);
      if (shoe.suede) { for (var i = 0; i < 1500; i++) { g.fillStyle = 'rgba(0,0,0,' + rr(0.02, 0.08) + ')'; g.fillRect(rr(0, w), rr(0, h), 2, 2); } g.strokeStyle = 'rgba(0,0,0,.25)'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(w * 0.62, h); g.quadraticCurveTo(w * 0.75, h * 0.35, w, h * 0.42); g.stroke(); }
      else {
        g.fillStyle = shoe.accent; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.25); g.quadraticCurveTo(w * 0.18, h * 0.2, w * 0.26, h * 0.55); g.lineTo(w * 0.26, h); g.fill();
        g.strokeStyle = shoe.accent; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(w * 0.2, h * 0.72); g.bezierCurveTo(w * 0.38, h * 0.95, w * 0.55, h * 0.45, w * 0.78, h * 0.62); g.stroke();
        g.fillStyle = '#1b1d20'; g.fillRect(0, h * 0.94, w, h * 0.06);
      }
    });
    var upperM = new THREE.MeshStandardMaterial({ map: shoeTex, roughness: shoe.suede ? 1 : 0.5 }), soleM = STD(shoe.sole, { roughness: 0.75 }), laceM = STD(shoe.lace || '#ffffff', { roughness: 0.9 });
    for (var fi = 0; fi < 2; fi++) {
      var fg = new THREE.Group(); P.feet[fi].add(fg);
      var sole = new THREE.Mesh(S.shoeGeo.sole, soleM); sole.position.y = -0.045; fg.add(sole);
      fg.add(new THREE.Mesh(S.shoeGeo.upper, upperM));
      if (!shoe.suede) for (var k3 = 0; k3 < 5; k3++) { var lz = 0.03 + k3 * 0.02, ly = 0.038 - k3 * 0.009, lc = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.003, 0.006), laceM); lc.position.set(0, ly, lz); lc.rotation.x = -0.35; fg.add(lc); }
      if (!o.noSocks) { var sock = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.035, 0.15, 16, 1, true), sockM); sock.position.y = -0.36; P.kn[fi].add(sock); }
    }
    // palm points for holding the ball
    for (var hi = 0; hi < 2; hi++) { var s2 = hi ? 1 : -1, palmPt = new THREE.Object3D(); palmPt.position.set(-s2 * 0.03, -0.07, 0); P.hand[hi].add(palmPt); P.palm.push(palmPt); }

    P.root.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(bones);
    meshes.forEach(function (m) { m.bind(skeleton); });
    P.skeleton = skeleton; P.meshes = meshes; P.jawRest = P.jaw.rotation.x;

    var fwd = new V3(), lookL = new V3();
    Fc.update = function (dt, target) {
      Fc.blinkT -= dt; if (Fc.blinkT <= 0) { Fc.blink = 0.14; Fc.blinkT = rr(2.2, 5.5); }
      if (Fc.blink > 0) Fc.blink -= dt;
      var b = Fc.blink > 0 ? Math.sin(Math.PI * (1 - Fc.blink / 0.14)) : 0, lid = lerp(-0.2, 0.95, b);
      Fc.lidsU.forEach(function (l) { l.rotation.x = lid; }); Fc.lidsL.forEach(function (l) { l.rotation.x = -0.15 * b; });
      if (target) {
        for (var i = 0; i < Fc.eyes.length; i++) {
          var e = Fc.eyes[i]; lookL.copy(target); e.parent.worldToLocal(lookL);
          if (lookL.z < 0.15 || Math.abs(lookL.x) > lookL.z * 0.7 || Math.abs(lookL.y) > lookL.z * 0.5) lookL.set(0, 0, 1);
          e.lookAt(e.parent.localToWorld(fwd.copy(lookL)));
        }
      }
    };
    return P;
  };
})(window.HW);
