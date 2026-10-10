/* audio.js - everything is synthesized with WebAudio; no sound files */
window.HW = window.HW || {};
(function (HW) {
  var A = HW.Audio = { ctx: null, master: null, vol: 1, voice: false };
  var noiseBuf = null, last = {};

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      A.ctx = new AC(); A.master = A.ctx.createGain(); A.master.gain.value = 0.5 * A.vol; A.master.connect(A.ctx.destination);
      var n = A.ctx.sampleRate, b = A.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    } catch (e) { A.ctx = null; }
  };
  A.setVolume = function (v) { A.vol = v; if (A.master) A.master.gain.value = 0.5 * v; };

  function throttle(k, ms) { var t = performance.now(); if (last[k] && t - last[k] < ms) return false; last[k] = t; return true; }

  function tone(f, dur, type, vol, slideTo, delay) {
    if (!A.ctx) return;
    var t0 = A.ctx.currentTime + (delay || 0), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, freq, q, delay, type) {
    if (!A.ctx) return;
    var t0 = A.ctx.currentTime + (delay || 0), s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type || 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(A.master); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  A.tone = tone; A.noise = noise;

  A.bounce = function (v) { if (!throttle('b', 60)) return; v = Math.min(1, v / 7); tone(95 + v * 40, 0.12, 'sine', 0.12 + v * 0.35, 55); noise(0.05, 0.05 + v * 0.1, 400, 1); };
  A.swish = function () { noise(0.45, 0.28, 3800, 0.7, 0, 'highpass'); noise(0.3, 0.12, 1800, 0.8); };
  A.rim = function (v) { if (!throttle('r', 70)) return; v = Math.min(1, (v || 4) / 8); tone(520, 0.4, 'triangle', 0.1 + 0.2 * v, 480); tone(1040, 0.3, 'sine', 0.06 + 0.1 * v, 990); noise(0.06, 0.1, 2200, 2); };
  A.board = function () { if (!throttle('bd', 80)) return; tone(160, 0.2, 'square', 0.12, 120); noise(0.1, 0.18, 700, 1); };
  A.buzzer = function () { tone(220, 0.9, 'sawtooth', 0.22); tone(233, 0.9, 'sawtooth', 0.18); };
  A.whistle = function () { tone(2400, 0.18, 'sine', 0.12, 2700); tone(2700, 0.3, 'sine', 0.12, 2400, 0.18); };
  A.beep = function (hi) { tone(hi ? 880 : 440, hi ? 0.35 : 0.15, 'square', 0.12); };
  A.click = function () { tone(1200, 0.05, 'square', 0.06); };
  A.hover = function () { if (throttle('h', 50)) tone(900, 0.03, 'sine', 0.04); };
  A.shove = function () { noise(0.14, 0.3, 300, 0.8); tone(80, 0.15, 'sine', 0.25, 50); };
  A.steal = function () { noise(0.1, 0.22, 1500, 2); tone(700, 0.08, 'triangle', 0.1, 1200); };
  A.thud = function () { noise(0.25, 0.35, 160, 0.7); tone(60, 0.3, 'sine', 0.4, 40); };
  A.cheer = function (big) {
    var n = big ? 1.3 : 0.7;
    noise(n, 0.18 * (big ? 1.5 : 1), 700, 0.5); noise(n, 0.12, 1400, 0.6, 0.05);
    if (big) { tone(330, 0.3, 'triangle', 0.05, 440, 0.1); tone(440, 0.4, 'triangle', 0.05, 660, 0.3); }
  };
  A.groan = function () { noise(0.8, 0.12, 300, 0.5); tone(160, 0.7, 'sawtooth', 0.04, 90); };
  A.dunk = function () { tone(70, 0.5, 'sine', 0.5, 30); noise(0.3, 0.3, 200, 0.6); A.cheer(true); };
  A.shatter = function () { noise(0.7, 0.35, 5000, 0.4, 0, 'highpass'); noise(0.5, 0.25, 2500, 1); };
  A.fire = function () { noise(0.8, 0.2, 500, 0.5, 0, 'lowpass'); tone(110, 0.6, 'sawtooth', 0.12, 330); tone(220, 0.6, 'sawtooth', 0.08, 660, 0.1); };
  A.turbo = function () { if (throttle('t', 200)) noise(0.12, 0.05, 2500, 1); };
  A.jump = function () { tone(260, 0.1, 'sine', 0.08, 420); };
  A.whoosh = function (v) { if (!throttle('w', 100)) return; noise(0.15, Math.min(0.2, 0.04 + v * 0.01), 1200, 0.6); };

  // Optional announcer voice (browser speech synthesis); text callouts are always shown.
  A.say = function (text) {
    if (!A.voice || !window.speechSynthesis) return;
    try { var u = new SpeechSynthesisUtterance(text.replace(/[!]/g, '')); u.rate = 1.15; u.pitch = 0.8; u.volume = Math.min(1, A.vol); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* unsupported */ }
  };
})(window.HW);
