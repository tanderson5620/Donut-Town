/* shooting.js - ballistic solving and aim assist for shots and passes (humans and AI share this) */
window.HW = window.HW || {};
(function (HW) {
  var C = HW.C, U = HW.U;
  var S = HW.Shoot = {};
  var _h = new THREE.Vector3(), _t = new THREE.Vector3();

  // Launch velocity from `from` that drops through the rim center of hoop `h`.
  S.ideal = function (from, h, out) {
    var dx = h.x - from.x, dz = h.z - from.z, d = Math.hypot(dx, dz), hy = C.RIM_H - from.y;
    // pick the flattest arc that still drops into the rim at >= ~44 degrees (a shallow arc clips the front rim)
    var th = 0.8, v = 0, den, cs, tn, ok = false;
    for (var a = 44; a <= 76; a += 2) {
      th = a * Math.PI / 180; tn = Math.tan(th); cs = Math.cos(th); den = 2 * cs * cs * (d * tn - hy);
      if (den < 0.3) continue;
      v = Math.sqrt(C.G * d * d / den);
      var T = d / (v * cs), vyEnd = v * Math.sin(th) - C.G * T, desc = Math.atan2(-vyEnd, v * cs);
      if (desc >= 0.76) { ok = true; break; }
    }
    if (!ok && v === 0) { th = 1.2; tn = Math.tan(th); cs = Math.cos(th); den = 2 * cs * cs * Math.max(0.3, d * tn - hy); v = Math.sqrt(C.G * d * d / den); }
    var hx = d > 1e-4 ? dx / d : 0, hz = d > 1e-4 ? dz / d : 1;
    out.set(hx * v * cs, v * Math.sin(th), hz * v * cs); return out;
  };

  S.isThree = function (pos, h) { return Math.hypot(pos.x - h.x, pos.z - h.z) >= C.R3 - 0.15 || Math.abs(pos.x) >= C.CORNER_X; };

  // A flat-ish pass that arrives at `target` (Vector3, chest height) with horizontal speed `ps`.
  S.passVel = function (from, target, ps, out) {
    var dx = target.x - from.x, dz = target.z - from.z, d = Math.max(0.3, Math.hypot(dx, dz)), T = Math.max(0.18, d / ps);
    out.set(dx / T, (target.y - from.y + 0.5 * C.G * T * T) / T, dz / T); return out;
  };

  /*
   * Classify and assist a raw release velocity.
   * opts: { from, hoop, mates:[players], me, assist 0..1, greenWin, contest 0..1, fire, rawSpeedScale }
   * Returns { vel, kind: 'shot'|'pass'|'toss', quality: 'green'|'good'|'off'|null, target }
   */
  S.resolve = function (raw, o) {
    var sp = raw.length(), res = { vel: raw.clone(), kind: 'toss', quality: null, target: null };
    if (sp < 2.2) return res;
    var hv = Math.hypot(raw.x, raw.z), pitch = Math.atan2(raw.y, Math.max(hv, 1e-4));
    var hdx = hv > 1e-4 ? raw.x / hv : 0, hdz = hv > 1e-4 ? raw.z / hv : 0;
    var hoop = o.hoop, from = o.from;

    // pass: flat-ish throw toward a teammate
    if (pitch < 0.42 && o.mates && o.mates.length) {
      var best = null, bestA = 0.62 + (o.passAssist || 0) * 0.25;
      for (var i = 0; i < o.mates.length; i++) {
        var m = o.mates[i], ex = m.pos.x - from.x, ez = m.pos.z - from.z, ed = Math.hypot(ex, ez); if (ed < 1) continue;
        var a = Math.abs(U.wrapAngle(Math.atan2(ex, ez) - Math.atan2(hdx, hdz)));
        if (a < bestA) { bestA = a; best = m; }
      }
      if (best) {
        _t.set(best.pos.x + best.vel.x * 0.28, best.y + best.def.height * 0.72, best.pos.z + best.vel.z * 0.28);
        var ps = U.clamp(sp * 0.9, 9, 17);
        S.passVel(from, _t, ps, res.vel);
        res.vel.lerp(raw, 0.12 * (1 - (o.passAssist || 0.6)));
        res.kind = 'pass'; res.target = best; res.quality = 'good'; return res;
      }
    }

    // shot: lofted throw toward the hoop
    var ideal = S.ideal(from, hoop, new THREE.Vector3());
    var iv = ideal.length(), ihv = Math.hypot(ideal.x, ideal.z);
    var yawErr = U.wrapAngle(Math.atan2(raw.x, raw.z) - Math.atan2(ideal.x, ideal.z));
    var ratio = sp / iv, cone = 0.55 + o.assist * 0.35;
    if (pitch > 0.4 && Math.abs(yawErr) < cone && ratio > 0.5 && ratio < 1.85) {
      var gw = o.greenWin || 1;
      var a = U.clamp(o.assist - (o.contest || 0) * 0.35 + (o.fire ? 0.5 : 0), 0.05, 1);
      var green = !o.noGreen && (o.contest || 0) < 0.65 && Math.abs(yawErr) < 0.06 * gw && Math.abs(ratio - 1) < 0.075 * gw;
      res.kind = 'shot';
      if (green || o.fire && Math.abs(yawErr) < 0.3) { res.vel.copy(ideal); res.quality = 'green'; }
      else {
        // pull yaw/pitch/speed toward ideal by `a`; what's left of the error is the miss
        var yaw = Math.atan2(raw.x, raw.z) - yawErr * a, spd = sp + (iv - sp) * a, pit = pitch + (Math.atan2(ideal.y, ihv) - pitch) * a;
        res.vel.set(Math.sin(yaw) * Math.cos(pit) * spd, Math.sin(pit) * spd, Math.cos(yaw) * Math.cos(pit) * spd);
        var err = Math.abs(yawErr) * (1 - a) / 0.2 + Math.abs(ratio - 1) * (1 - a) / 0.3;
        res.quality = err < 0.35 ? 'good' : 'off';
      }
    }
    return res;
  };
})(window.HW);
