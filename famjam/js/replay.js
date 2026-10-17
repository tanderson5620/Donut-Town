/* replay.js - the game's highlights, replayed behind the final scoreboard. While a game runs, the last few seconds of it are kept:
   what's on screen 30 times a second (the same picture an online guest is sent, net.js) and the bursts, flames and blood the game
   throws up. Each big moment (a dunk, a three, a fancy layup, a block, a knockdown, an arm bar, a power-up...) marks a stretch of it
   to keep, from the run-up to just after, and the best 8 are kept. On the stats screen they play back in game order, over and over,
   drawn on copies of the players so the real game underneath isn't touched. An online guest keeps the host's pictures as they
   arrive, and the host's marks come with them, so everyone's stats screen plays the same highlights. */
window.HW = window.HW || {};
(function (HW) {
  var R = HW.Replay = { clips: [] };
  var STEP = 1 / 30, KEEP = 9, MAXC = 8, MAXLEN = 8, FADE = 0.22;
  // per kind: how good it is (the best are kept), and how long before and after the moment it's marked at to show
  var KIND = {
    dunk: [5, 3.0, 1.4], dunk3: [7, 3.2, 1.4], three: [4, 2.6, 1.3], fancy3: [5, 3.2, 1.3], cart3: [6, 3.4, 1.3], lay: [3, 2.6, 1.3], fancyLay: [4, 3.4, 1.3],
    two: [1, 2.2, 1.2], block: [4, 1.9, 1.4], reject: [5, 2.6, 1.6], knock: [3, 1.3, 1.9], hammer: [6, 1.6, 2.6], steal: [2, 1.3, 1.1], armbar: [6, 0.6, 3.1],
    powerup: [4, 0.25, 2.3], twerk: [6, 0.25, 5.3]
  };
  var buf = [], pend = [], fx = [], lastT = -1e9, done = false, play = null;
  function J() { return HW.Jam; }
  R.reset = function () { buf = []; pend = []; fx = []; R.clips = []; lastT = -1e9; done = false; play = null; };
  // every frame of the game (host or offline: after it updates; a guest: each picture as it arrives): t = game time, pic = the picture
  // or a function that makes one (only called when one is due), ev = this frame's sounds and effects as net.js encodes them
  R.frame = function (t, pic, ev) {
    if (done) return;
    if (ev) for (var i = 0; i < ev.length; i++) if (ev[i][0] === 'x') fx.push(ev[i]);   // (just the effects: the stats screen has its own music)
    if (t < lastT) lastT = t; if (t - lastT < STEP - 1e-4) return;
    buf.push({ t: t, s: typeof pic === 'function' ? pic() : pic, fx: fx }); fx = []; lastT = t;
    while (buf.length && buf[0].t < t - KEEP) buf.shift();
    for (var k = pend.length - 1; k >= 0; k--) if (t >= pend[k].t1) { cut(pend[k]); pend.splice(k, 1); }
  };
  // a highlight happened just now (called by the game; online the host's calls reach the guests too)
  R.mark = function (kind, label) {
    var K = KIND[kind]; if (done || !K || !J()) return;
    var t = J().t, h = { t0: t - K[1], t1: t + K[2], w: K[0], label: label || '' };
    // overlapping one that's still open (a block that starts the fast break it ends in): one longer highlight, better than either
    for (var i = 0; i < pend.length; i++) {
      var o = pend[i]; if (h.t0 > o.t1 || h.t1 < o.t0) continue;
      if (h.w >= o.w) o.label = h.label; o.t1 = Math.max(o.t1, h.t1); o.t0 = Math.max(Math.min(o.t0, h.t0), o.t1 - MAXLEN); o.w = Math.max(o.w, h.w) + 1; return;
    }
    pend.push(h);
  };
  function cut(h) {
    var fr = buf.filter(function (f) { return f.t >= h.t0 && f.t <= h.t1; }); if (fr.length < 12) return;
    // the same thing again (his second power-up, her third dunk) counts for less, so the reel has some of everything
    var again = R.clips.filter(function (c) { return c.label === h.label; }).length;
    R.clips.push({ t0: fr[0].t, t1: fr[fr.length - 1].t, w: h.w - 1.5 * again, label: h.label, frames: fr });
    if (R.clips.length > MAXC) {   // drop the least of them (the earliest of the least)
      var lo = 0; R.clips.forEach(function (c, i) { if (c.w < R.clips[lo].w) lo = i; }); R.clips.splice(lo, 1);
    }
    R.clips.sort(function (a, b) { return a.t0 - b.t0; });
  }
  // the stats screen is up: no more recording (a highlight still open keeps what there is of it)
  R.stop = function () { if (done) return; pend.forEach(cut); pend = []; buf = []; done = true; play = null; };
  R.ready = function () { return done && R.clips.length > 0; };
  R.now = function () { return play && R.clips.length ? R.clips[play.ci % R.clips.length] : null; };

  // the reel, over the whole screen; false if there's nothing to show. Each highlight fades in from black and out to it
  function copy(o) { var q = Object.create(Object.getPrototypeOf(o)); for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) q[k] = o[k]; return q; }
  R.draw = function (g, dt) {
    if (!R.ready() || !HW.Net || !HW.Net.apply) return false;
    var G = J(), X = HW.GFX, N = HW.Net;
    if (!play) play = { ci: 0, t: null, k: 0, ps: G.players.map(copy), ball: copy(G.ball), show: null, cam: 0, shake: 0, hype: 0, white: 0 };
    var c = R.clips[play.ci % R.clips.length];
    if (play.t === null) { play.t = c.t0; play.k = 0; play.show = null; play.white = 0; X.clearFx && X.clearFx(); fire(c.frames[0], play.ps); }
    else play.t += dt;
    if (play.t > c.t1) { play.ci = (play.ci + 1) % R.clips.length; play.t = null; return R.draw(g, 0); }
    var F = c.frames; while (play.k < F.length - 1 && F[play.k + 1].t <= play.t) { play.k++; fire(F[play.k], play.ps); }
    var a = F[play.k], b = F[play.k + 1], f = b ? Math.max(0, Math.min(1, (play.t - a.t) / (b.t - a.t))) : 0;
    // the real game's state, put back after: the copies stand in for the players and the ball
    var keep = { players: G.players, ball: G.ball, t: G.t, phase: G.phase, phaseT: G.phaseT, q: G.q, clock: G.clock, shot: G.shot, score: G.score, callouts: G.callouts, pu: G.pu, show: G.show, cine: G.cine, hoopFx: G.hoopFx, vic: G.vic, cam: X.camX, shake: X.shake, hype: X.hype, white: X.white };
    G.players = play.ps; G.ball = play.ball; G.show = play.show; X.shake = play.shake; X.hype = play.hype; X.white = play.white;
    try {
      N.apply(a.s, b && b.s, f, true);
      play.show = G.show;
      X.drawScene(g, G.t, dt, G.players, G.ball, G.hoopFx);
      play.shake = X.shake; play.hype = X.hype; play.white = X.white;
    } finally {
      for (var k in keep) if (k === 'cam') X.camX = keep.cam; else if (k === 'shake' || k === 'hype' || k === 'white') X[k] = keep[k]; else G[k] = keep[k];
    }
    var fade = Math.min(1, Math.min(play.t - c.t0, c.t1 - play.t) / FADE);
    if (fade < 1) { g.fillStyle = 'rgba(0,0,0,' + (1 - Math.max(0, fade)) + ')'; g.fillRect(0, 0, X.W, X.H); }
    return true;
  };
  function fire(fr, ps) { if (fr && fr.fx.length && HW.Net.fx) fr.fx.forEach(function (e) { HW.Net.fx(e, ps); }); }
})(window.HW);
