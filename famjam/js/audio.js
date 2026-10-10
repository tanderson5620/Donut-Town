/* audio.js - synthesized WebAudio effects plus recorded clips from sfx/ */
window.HW = window.HW || {};
(function (HW) {
  var A = HW.Audio = { ctx: null, master: null, vol: 1, voice: false };
  var noiseBuf = null, last = {};

  // iPhone: sound only unlocks inside a finished tap (touchend / click), not touchstart, and the ring/silent switch mutes web
  // audio unless the page asks for a 'playback' session (iOS 17+). So: ask for playback, unlock on every kind of tap, play a
  // silent blip to open the output, and resume whenever the context gets suspended (tab switch, phone call)
  A.init = function () {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
    if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume(); musKick(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      A.ctx = new AC(); if (A.ctx.state !== 'running') A.ctx.resume(); setTimeout(loadSfx, 0);
      var s0 = A.ctx.createBufferSource(); s0.buffer = A.ctx.createBuffer(1, 1, 22050); s0.connect(A.ctx.destination); s0.start(0); A.master = A.ctx.createGain(); A.master.gain.value = 0.5 * A.vol; A.master.connect(A.ctx.destination);
      var n = A.ctx.sampleRate, b = A.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    } catch (e) { A.ctx = null; }
    musKick();
  };
  // music, streamed by <audio> elements fed into the mix so it follows the master volume and can fade (both tracks from Epidemic
  // Sound, supplied by the owner): "Bang Bang" by Matt Large on the menus before a game, "Plenty Bands" (instrumental) by Enophi
  // from the final buzzer through the stats screen. An iPhone only lets a media element start inside a tap, so every tap (A.init)
  // starts the wanted track and primes the others once (play, then pause) so they can start on their own later, like at the buzzer
  var TRACKS = { menu: 'sfx/menu_music.mp3', post: 'sfx/post_music.mp3' }, mus = {}, musWant = null, MUS_VOL = 0.8;
  function track(n) {
    if (mus[n]) return mus[n];
    var el = new Audio(TRACKS[n]), t = mus[n] = { el: el, g: null, stop: 0, primed: false };
    el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', '');
    try { t.g = A.ctx.createGain(); t.g.gain.value = 0; A.ctx.createMediaElementSource(el).connect(t.g); t.g.connect(A.master); } catch (e) { t.g = null; }
    return t;
  }
  function musPlay(el) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () { }); return pr; }
  function musKick() {
    if (!A.ctx) return;
    Object.keys(TRACKS).forEach(function (n) {
      var t = track(n);
      if (n === musWant) {
        clearTimeout(t.stop); t.primed = true;
        if (t.g) t.g.gain.setTargetAtTime(MUS_VOL, A.ctx.currentTime, 0.12); else t.el.volume = Math.min(1, 0.5 * A.vol);
        if (t.el.paused) musPlay(t.el);
      } else if (!t.primed && t.g) {   // silent (its gain is 0) and paused again as soon as it starts
        t.primed = true; var pr = musPlay(t.el), park = function () { if (musWant !== n) { t.el.pause(); t.el.currentTime = 0; } };
        if (pr && pr.then) pr.then(park, function () { t.primed = false; }); else park();
      }
    });
  }
  A.music = function (n) {   // every frame: the track this screen wants ('menu', 'post') or null
    n = n || null; if (n === musWant) return; musWant = n;
    Object.keys(mus).forEach(function (k) {   // the others fade out and go back to the top for next time
      var t = mus[k]; if (k === n) return;
      if (t.g) t.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); else t.el.volume = 0;
      clearTimeout(t.stop); t.stop = setTimeout(function () { if (musWant !== k) { t.el.pause(); t.el.currentTime = 0; } }, 1600);
    });
    musKick();
  };
  A.musicPlaying = function () { return Object.keys(mus).filter(function (k) { return !mus[k].el.paused && (!mus[k].g || mus[k].g.gain.value > 0.05); }).join(',') || 'none'; };
  // recorded sounds (sfx/*.mp3, Kenney CC0): an announcer and real impacts, loaded once audio is unlocked; missing ones stay silent
  var SFX = ['dribble0.wav', 'dribble1.wav', 'dribble2.wav', 'dribble3.wav', 'dunk0.wav', 'dunk1.wav', 'dunk2.wav', 'dunk3.wav', 'dunk4.wav', 'catch0.wav', 'catch1.wav', 'yell0', 'yell1', 'yell2', 'yell3', 'yell4', 'yell5', 'yell6', 'steal_whoosh', 'crowd_a', 'crowd_b', 'crowd_cheer', 'go', 'ready', 'final_round', 'overtime', 'you_win', 'you_lose', 'combo', 'game_over', 'punch0', 'punch1', 'punch2', 'glass'], bufs = {}, loading = false;
  function loadSfx() {
    if (loading || !A.ctx) return; loading = true;
    SFX.forEach(function (f) {   // .mp3 unless named (the dribbles are .wav: no encoder delay, so the thump lands on the frame)
      var n = f.replace(/\.\w+$/, '');
      fetch('sfx/' + (f === n ? f + '.mp3' : f)).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
        return new Promise(function (res, rej) { var pr = A.ctx.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(function () { }); });
      }).then(function (b) { bufs[n] = b; }).catch(function () { });
    });
  }
  A.sfx = function (n, vol) {
    if (!A.ctx || !bufs[n]) return; var s = A.ctx.createBufferSource(), g = A.ctx.createGain();
    s.buffer = bufs[n]; g.gain.value = vol === undefined ? 1 : vol; s.connect(g); g.connect(A.master); s.start();
  };
  // the arena murmur under the whole game, swelling with the hype
  // two recorded arena crowds (Epidemic Sound) taking turns back to back with a 1 s crossfade, under one level control
  var amb = null, ambNext = 0, ambI = 0, XF = 1.0;
  A.ambient = function (level) {
    if (!A.ctx || !bufs.crowd_a || !bufs.crowd_b) return;
    if (!amb) { amb = A.ctx.createGain(); amb.gain.value = 0; amb.connect(A.master); ambNext = A.ctx.currentTime + 0.05; }
    amb.gain.setTargetAtTime(level, A.ctx.currentTime, 0.4);
    if (A.ctx.currentTime > ambNext - 1.5) {   // queue the next clip a little ahead so it starts on time
      var b = ambI ? bufs.crowd_b : bufs.crowd_a, s = A.ctx.createBufferSource(), g = A.ctx.createGain(), t0 = Math.max(ambNext, A.ctx.currentTime + 0.02), d = b.duration;
      s.buffer = b; s.connect(g); g.connect(amb);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + XF); g.gain.setValueAtTime(1, t0 + d - XF); g.gain.linearRampToValueAtTime(0, t0 + d);
      s.start(t0); ambNext = t0 + d - XF; ambI = 1 - ambI;
    }
  };
  // a steal swipe: the recorded whoosh (falls back to the synth one until it loads)
  A.swipe = function () { if (bufs.steal_whoosh) A.sfx('steal_whoosh', 0.8); else A.whoosh(3); };
  A.loaded = function () { return Object.keys(bufs).length; };
  // the ball hits the floor: a recorded bounce (4 takes, never the same twice running), louder for a harder bounce
  var lastDr = -1;
  A.dribble = function (v) {
    if (!bufs.dribble0) { A.bounce(v); return; }
    var i; do { i = Math.floor(Math.random() * 4); } while (i === lastDr); lastDr = i;
    A.sfx('dribble' + i, Math.min(1, 0.45 + (v || 3) * 0.08));
  };
  // a recorded take out of a numbered set, never the same one twice running
  var lastTake = {};
  function take(n, k, vol) { var i; do { i = Math.floor(Math.random() * k); } while (k > 1 && i === lastTake[n]); lastTake[n] = i; A.sfx(n + i, vol); }
  // hands on the ball: a pass or a rebound lands in someone's hands (2 recorded taps)
  A.catch = function () { if (bufs.catch0) take('catch', 2, 0.75); else A.click(); };
  // a guy powering up: an anime battle yell (7 takes), each cut so its loudest moment lands on the blast at 0.9 s
  A.yell = function () { if (bufs.yell0) take('yell', 7, 0.9); };
  A.punch = function () { A.sfx('punch' + Math.floor(Math.random() * 3), 0.9); };
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, A.init, true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { Object.keys(mus).forEach(function (k) { mus[k].el.pause(); }); } else if (A.ctx) A.init(); });
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
    if (bufs.crowd_cheer) { A.sfx('crowd_cheer', big ? 0.9 : 0.55); return; }   // the recorded roar once it's loaded
    var n = big ? 1.3 : 0.7;
    noise(n, 0.18 * (big ? 1.5 : 1), 700, 0.5); noise(n, 0.12, 1400, 0.6, 0.05);
    if (big) { tone(330, 0.3, 'triangle', 0.05, 440, 0.1); tone(440, 0.4, 'triangle', 0.05, 660, 0.3); }
  };
  A.groan = function () { noise(0.8, 0.12, 300, 0.5); tone(160, 0.7, 'sawtooth', 0.04, 90); };
  // the slam: a recorded hand-and-ball rim hit with the rim ringing after (5 takes), then the crowd
  A.dunk = function () {
    if (bufs.dunk0) take('dunk', 5, 1); else { tone(70, 0.5, 'sine', 0.5, 30); noise(0.3, 0.3, 200, 0.6); }
    A.cheer(true);
  };
  A.shatter = function () { noise(0.7, 0.35, 5000, 0.4, 0, 'highpass'); noise(0.5, 0.25, 2500, 1); };
  A.fire = function () { noise(0.8, 0.2, 500, 0.5, 0, 'lowpass'); tone(110, 0.6, 'sawtooth', 0.12, 330); tone(220, 0.6, 'sawtooth', 0.08, 660, 0.1); };
  // the power-up: a rising hum while he charges with his arms crossed, then a boom and a sizzle when they come down
  A.charge = function () { tone(70, 0.85, 'sawtooth', 0.1, 260); tone(140, 0.85, 'square', 0.04, 520); noise(0.85, 0.08, 900, 0.6); };
  A.powerup = function () { tone(55, 0.9, 'sine', 0.55, 28); noise(0.6, 0.4, 260, 0.6); noise(1.1, 0.16, 4200, 0.9, 0.05, 'highpass'); tone(330, 0.9, 'sawtooth', 0.07, 990, 0.05); tone(495, 0.9, 'triangle', 0.05, 1480, 0.05); };
  A.turbo = function () { if (throttle('t', 200)) noise(0.12, 0.05, 2500, 1); };
  A.jump = function () { tone(260, 0.1, 'sine', 0.08, 420); };
  A.whoosh = function (v) { if (!throttle('w', 100)) return; noise(0.15, Math.min(0.2, 0.04 + v * 0.01), 1200, 0.6); };

  // Optional announcer voice (browser speech synthesis); text callouts are always shown.
  A.say = function (text) {
    if (!A.voice || !window.speechSynthesis) return;
    try { var u = new SpeechSynthesisUtterance(text.replace(/[!]/g, '')); u.rate = 1.15; u.pitch = 0.8; u.volume = Math.min(1, A.vol); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* unsupported */ }
  };
})(window.HW);
