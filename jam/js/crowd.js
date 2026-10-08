/* crowd.js - the arena behind the far sideline: rising rows of shaded fans in the dark, aisles, camera flashes, a crowd that jumps up on big plays */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.Crowd = {};
  var CW = 1700, calm = null, cheer = null, built = '', bandY = [], flashes = [];
  function hash(n) { var s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var SKIN = ['#f2c9a8', '#e8b48f', '#d9a27c', '#c48a62', '#a56d47', '#7d4e32', '#5c3822', '#f0bfa0'];
  var HAIR = ['#17110d', '#2a1c13', '#3f2a1b', '#5e4027', '#8a6438', '#b8935c', '#7c7c7c', '#cfc6b4', '#22180f'];
  var SHIRT = ['#262a35', '#363b4a', '#4a4e5b', '#1c1f2b', '#5a2630', '#2c4838', '#646874', '#8a8e97', '#cfcfd3', '#7a302f', '#2e3d6c', '#ad5638', '#c39639', '#23507a', '#161616', '#e6e6e6', '#5b3f6e', '#3f6a62'];
  var TEAM = ['#ff8a1f', '#3a86ff'];
  function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(c) { return Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)))); } return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }

  // one fan, standing on (x, by) = the middle of the shoulders' bottom edge, scale sc (1 = front row)
  function fan(g, x, by, sc, r, pose) {
    var skin = SKIN[(r(1) * SKIN.length) | 0], hair = HAIR[(r(2) * HAIR.length) | 0], shirt = r(3) < 0.16 ? TEAM[(r(4) * 2) | 0] : SHIRT[(r(5) * SHIRT.length) | 0];
    var tw = (13 + r(6) * 4) * sc, th = 20 * sc, hr = (5 + r(7) * 0.9) * sc, hy = by - th - hr * 0.9, lift = pose === 2 ? 4 * sc : 0;
    by -= lift; hy -= lift;
    // arms up (cheering) go behind the head and torso
    if (pose === 2) {
      var sp = 0.35 + r(8) * 0.35;
      [-1, 1].forEach(function (s) {
        var sx = x + s * tw * 0.42, sy = by - th * 0.85, ex = sx + s * (5 + sp * 6) * sc, ey = sy - 13 * sc, hx = ex + s * 1.5 * sc, hy2 = ey - 6 * sc;
        g.strokeStyle = shade(shirt, -0.25); g.lineWidth = 3.2 * sc; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = skin; g.lineWidth = 2.6 * sc; g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy2); g.stroke();
        g.fillStyle = skin; g.beginPath(); g.arc(hx, hy2 - 0.8 * sc, 1.9 * sc, 0, 6.283); g.fill();
      });
    }
    // torso: rounded shoulders, lit from the upper left
    g.fillStyle = shirt; g.beginPath(); g.moveTo(x - tw / 2, by); g.lineTo(x - tw / 2, by - th * 0.7); g.quadraticCurveTo(x - tw / 2, by - th, x - tw * 0.2, by - th); g.lineTo(x + tw * 0.2, by - th); g.quadraticCurveTo(x + tw / 2, by - th, x + tw / 2, by - th * 0.7); g.lineTo(x + tw / 2, by); g.closePath(); g.fill();
    g.fillStyle = shade(shirt, -0.38); g.fillRect(x + tw * 0.12, by - th * 0.85, tw * 0.38, th * 0.85);
    g.fillStyle = shade(shirt, 0.16); g.fillRect(x - tw * 0.42, by - th * 0.92, tw * 0.22, th * 0.3);
    // clapping hands in front of the chest
    if (pose === 1) { g.fillStyle = skin; g.fillRect(x - 2 * sc, by - th * 0.55, 4 * sc, 3 * sc); g.fillStyle = shade(shirt, -0.2); g.fillRect(x - tw * 0.38, by - th * 0.5, tw * 0.3, 2.5 * sc); g.fillRect(x + tw * 0.08, by - th * 0.5, tw * 0.3, 2.5 * sc); }
    // neck and head with a shadowed right side
    g.fillStyle = shade(skin, -0.25); g.fillRect(x - 1.6 * sc, by - th - 2.5 * sc, 3.2 * sc, 3 * sc);
    g.fillStyle = skin; g.beginPath(); g.ellipse(x, hy, hr * 0.86, hr, 0, 0, 6.283); g.fill();
    g.fillStyle = shade(skin, -0.32); g.beginPath(); g.ellipse(x + hr * 0.32, hy + hr * 0.08, hr * 0.5, hr * 0.88, 0, -1.3, 1.6); g.fill();
    // hair: short, long, bald, ball cap, curly, ponytail
    var hs = r(9), hairS = shade(hair, -0.2);
    g.fillStyle = hair;
    if (hs < 0.32) { g.beginPath(); g.ellipse(x, hy - hr * 0.25, hr * 0.92, hr * 0.8, 0, Math.PI * 1.02, Math.PI * 1.98); g.fill(); g.fillRect(x - hr * 0.9, hy - hr * 0.35, hr * 0.3, hr * 0.5); }
    else if (hs < 0.52) { g.beginPath(); g.ellipse(x, hy - hr * 0.2, hr * 1.02, hr * 0.92, 0, Math.PI, 0); g.fill(); g.fillRect(x - hr * 1.02, hy - hr * 0.2, hr * 0.42, hr * 1.9); g.fillRect(x + hr * 0.6, hy - hr * 0.2, hr * 0.42, hr * 1.9); }
    else if (hs < 0.62) { g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x - hr * 0.45, hy - hr * 0.8, hr * 0.4, hr * 0.25); }
    else if (hs < 0.76) { var cap = r(10) < 0.4 ? TEAM[(r(11) * 2) | 0] : SHIRT[(r(12) * SHIRT.length) | 0]; g.fillStyle = cap; g.beginPath(); g.ellipse(x, hy - hr * 0.3, hr * 0.98, hr * 0.78, 0, Math.PI, 0); g.fill(); g.fillStyle = shade(cap, -0.3); g.fillRect(x - hr * 1.0, hy - hr * 0.36, hr * 2.4, hr * 0.28); }
    else if (hs < 0.9) { g.beginPath(); g.ellipse(x, hy - hr * 0.3, hr * 1.12, hr * 0.95, 0, Math.PI * 0.92, Math.PI * 2.08); g.fill(); }
    else { g.beginPath(); g.ellipse(x, hy - hr * 0.25, hr * 0.92, hr * 0.8, 0, Math.PI, 0); g.fill(); g.fillStyle = hairS; g.beginPath(); g.ellipse(x - hr * 0.95, hy + hr * 0.2, hr * 0.35, hr * 0.7, 0.3, 0, 6.283); g.fill(); }
    // eyes on the bigger front fans
    if (sc > 0.8) { g.fillStyle = 'rgba(20,10,8,0.85)'; g.fillRect(x - hr * 0.45, hy - hr * 0.05, Math.max(1, sc), Math.max(1, sc)); g.fillRect(x + hr * 0.18, hy - hr * 0.05, Math.max(1, sc), Math.max(1, sc)); }
    // a few homemade signs held up when the place goes wild
    if (pose === 2 && r(13) < 0.05) { var sw = 22 * sc, shh = 12 * sc, sy2 = hy - hr - shh - 4 * sc; g.fillStyle = '#eeeeea'; g.fillRect(x - sw / 2, sy2, sw, shh); g.fillStyle = TEAM[(r(14) * 2) | 0]; g.fillRect(x - sw * 0.38, sy2 + shh * 0.3, sw * 0.76, shh * 0.18); g.fillRect(x - sw * 0.3, sy2 + shh * 0.6, sw * 0.6, shh * 0.14); }
  }

  // paint every row once into a calm picture and a cheering one (same fans, arms up and on their feet)
  function build(v) {
    var H = Math.ceil(v.wallTop) + 6, s1 = Math.max(0.6, v.s * 0.2 / 11);   // front-row head ~0.2 m tall
    built = Math.round(v.wallTop) + ':' + Math.round(v.s);
    calm = canvas(CW, H); cheer = canvas(CW, H);
    var rows = [], by = H + 10 * s1, sc = s1;
    while (by - 34 * sc > -10) { rows.push({ by: by, sc: sc }); by -= 23 * sc; sc *= 0.94; }
    var aisles = [CW * 0.17, CW * 0.5, CW * 0.83];
    bandY = [0, Math.round(H * 0.4), Math.round(H * 0.72), H];
    [calm, cheer].forEach(function (cv, which) {
      var g = cv.getContext('2d');
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05050b'); bg.addColorStop(0.5, '#0d0c18'); bg.addColorStop(1, '#17142a'); g.fillStyle = bg; g.fillRect(0, 0, CW, H);
      for (var i = rows.length - 1; i >= 0; i--) {
        var R = rows[i], sc2 = R.sc;
        // seat backs and the step of this row
        g.fillStyle = '#121022'; g.fillRect(0, R.by - 9 * sc2, CW, 10 * sc2); g.fillStyle = '#1d1a33'; g.fillRect(0, R.by - 9 * sc2, CW, Math.max(1, sc2));
        for (var x = 6 + hash(i * 7) * 10, k = 0; x < CW; x += (15.5 + hash(i * 131 + k) * 4) * sc2, k++) {
          if (aisles.some(function (a) { return Math.abs(x - a) < 14 * sc2; })) continue;
          var seed = i * 1000 + k, r = function (n) { return hash(seed * 1.37 + n * 17.3); };
          if (r(0) < 0.06) { g.fillStyle = '#26223e'; g.fillRect(x - 6 * sc2, R.by - 16 * sc2, 12 * sc2, 8 * sc2); continue; }   // empty seat
          var pose = which ? (r(15) < 0.7 ? 2 : 1) : (r(16) < 0.08 ? 1 : 0);
          fan(g, x, R.by + (r(17) - 0.5) * 2 * sc2, sc2 * (0.92 + r(18) * 0.16), r, pose);
        }
      }
      // aisles: steps climbing between the sections
      aisles.forEach(function (a) { for (var j = 0; j < rows.length; j++) { var R2 = rows[j], w = 22 * R2.sc; g.fillStyle = j % 2 ? '#1b1930' : '#221f3a'; g.fillRect(a - w / 2, R2.by - 23 * R2.sc, w, 23 * R2.sc); g.fillStyle = '#3a3658'; g.fillRect(a - w / 2, R2.by - 23 * R2.sc, w, Math.max(1, R2.sc)); } });
      // the upper deck fades into the dark, the lower rows catch a little court light
      var fog = g.createLinearGradient(0, 0, 0, H); fog.addColorStop(0, 'rgba(3,3,10,0.72)'); fog.addColorStop(0.55, 'rgba(3,3,10,0.28)'); fog.addColorStop(1, 'rgba(3,3,10,0)'); g.fillStyle = fog; g.fillRect(0, 0, CW, H);
      var glow = g.createLinearGradient(0, H * 0.7, 0, H); glow.addColorStop(0, 'rgba(255,220,170,0)'); glow.addColorStop(1, 'rgba(255,220,170,0.08)'); g.fillStyle = glow; g.fillRect(0, H * 0.7, CW, H * 0.3);
    });
  }

  C.init = function () { calm = cheer = null; built = ''; };
  C.draw = function (g, v) {
    if (built !== Math.round(v.wallTop) + ':' + Math.round(v.s)) build(v);
    var off = Math.round((CW - v.W) / 2 + v.camX * v.s * 0.85 + v.shakeX), ox = Math.max(0, Math.min(CW - v.W, off)), H = calm.height, top = Math.round(v.wallTop) + 6 - H;
    g.fillStyle = '#05050b'; if (top > 0) g.fillRect(0, 0, v.W, top + 1);
    if (v.hype > 0.6) {
      // on their feet: each third of the stands bounces on its own beat
      for (var b = 0; b < 3; b++) {
        var y0 = bandY[b], y1 = bandY[b + 1], bob = Math.round(-Math.abs(Math.sin(v.t * (8 + b) + b * 1.9)) * Math.min(4, 1 + v.hype));
        g.drawImage(cheer, ox, y0, v.W, y1 - y0, 0, top + y0 + bob, v.W, y1 - y0);
      }
    } else g.drawImage(calm, ox, 0, v.W, H, 0, top, v.W, H);
    if (HW.GFX.drawWall) HW.GFX.drawWall(g, v);
    // camera flashes (drawn after the arena dimming by C.over)
    var rate = 0.9 + v.hype * 3;
    if (Math.random() < rate / 60) flashes.push({ x: Math.random() * CW, y: top + Math.random() * (H * 0.85), life: 0.12 + Math.random() * 0.08 });
    C.ox = ox;
  };
  C.over = function (g, v, dt) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i]; f.life -= dt || 1 / 60; if (f.life <= 0) { flashes.splice(i, 1); continue; }
      var x = f.x - C.ox; if (x < -4 || x > v.W + 4) continue;
      g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,240,' + Math.min(1, f.life * 8) + ')';
      g.fillRect(x - 1, f.y - 1, 3, 3); g.fillRect(x - 4, f.y, 9, 1); g.fillRect(x, f.y - 4, 1, 9); g.globalCompositeOperation = 'source-over';
    }
  };
})(window.HW);
