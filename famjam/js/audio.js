/* audio.js - synthesized WebAudio effects plus recorded clips from sfx/ */
window.HW = window.HW || {};
(function (HW) {
  var A = HW.Audio = { ctx: null, master: null, vol: 1, voice: false };
  var noiseBuf = null, last = {};

  // iPhone: sound only unlocks inside a finished tap (touchend / click), not touchstart, and the ring/silent switch mutes web
  // audio unless the page asks for a 'playback' session (iOS 17+). So: ask for playback, unlock on every kind of tap, play a
  // silent blip to open the output, and resume whenever the context gets suspended (tab switch, phone call)
  // bump when a sound file is replaced under the same name, so phones fetch the new one instead of a saved copy
  var SFX_V = '?v=3';
  A.init = function () {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
    if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume(); musKick(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      A.ctx = new AC(); if (A.ctx.state !== 'running') A.ctx.resume(); setTimeout(loadSfx, 0);
      var s0 = A.ctx.createBufferSource(); s0.buffer = A.ctx.createBuffer(1, 1, 22050); s0.connect(A.ctx.destination); s0.start(0); A.master = A.ctx.createGain(); A.master.gain.value = 0.5 * A.vol;
      // a soft clipper on the way out: untouched below 0.8, peaks above it rounded off toward 1.0 instead of crackling (only the loudest
      // pile-ups, like a power-up yell over the blast and the crowd, get there). The shaper sees half the signal so it covers -2..2
      var pre = A.ctx.createGain(), clip = A.ctx.createWaveShaper(), cv = new Float32Array(2049); pre.gain.value = 0.5;
      for (var k = 0; k < cv.length; k++) { var x = (k / 1024 - 1) * 2, ax = Math.abs(x); cv[k] = ax <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2)); }
      clip.curve = cv; clip.oversample = '2x'; A.master.connect(pre); pre.connect(clip); clip.connect(A.ctx.destination); A.out = clip;
      var n = A.ctx.sampleRate, b = A.ctx.createBuffer(1, n, n), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    } catch (e) { A.ctx = null; }
    musKick();
  };
  // music, streamed by <audio> elements fed into the mix so it follows the master volume and can fade (all from Epidemic Sound,
  // supplied by the owner): on the menus before a game, a coin flip each time between "Bang Bang" by Matt Large and "Talk About
  // It" (instrumental) by Ira Moon; from the final buzzer through the stats screen, "Plenty Bands" (instrumental) by Enophi - or,
  // when Gator's team wins, "spot" by Cushy (from the top of the song, sfx/gator_music.mp3: his victory twerk, then the stats under it).
  // An iPhone only lets a media element start inside a tap, so every tap (A.init)
  // starts the wanted track and primes the others once (play, then pause) so they can start on their own later, like at the buzzer
  var TRACKS = { menu: 'sfx/menu_music.mp3' + SFX_V, menu2: 'sfx/menu_music2.mp3' + SFX_V, post: 'sfx/post_music.mp3' + SFX_V, gator: 'sfx/gator_music.mp3' + SFX_V }, mus = {}, musAsk = null, musWant = null, MUS_VOL = 0.8;
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
  A.music = function (n) {   // every frame: what this screen wants ('menu', 'post', 'gator') or null
    n = n || null; if (n === musAsk) return; musAsk = n;
    if (n === 'menu' && Math.random() < 0.5) n = 'menu2';   // 50/50 which menu song, rolled each time the menus come up
    musWant = n;
    Object.keys(mus).forEach(function (k) {   // the others fade out and go back to the top for next time
      var t = mus[k]; if (k === n) return;
      if (t.g) t.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); else t.el.volume = 0;
      clearTimeout(t.stop); t.stop = setTimeout(function () { if (musWant !== k) { t.el.pause(); t.el.currentTime = 0; } }, 1600);
    });
    musKick();
  };
  A.musicPlaying = function () { return Object.keys(mus).filter(function (k) { return !mus[k].el.paused && (!mus[k].g || mus[k].g.gain.value > 0.05); }).join(',') || 'none'; };
  // recorded sounds (sfx/*.mp3, Kenney CC0): an announcer and real impacts, loaded once audio is unlocked; missing ones stay silent
  var SFX = ['dribble0.wav', 'dribble1.wav', 'dribble2.wav', 'dribble3.wav', 'dunk0.wav', 'dunk1.wav', 'dunk2.wav', 'dunk3.wav', 'dunk4.wav', 'catch0.wav', 'catch1.wav', 'net0', 'net1', 'net2', 'net3', 'net4', 'net5', 'net6', 'net7', 'net8', 'net9', 'net10', 'net11', 'yell0', 'yell1', 'yell2', 'yell3', 'yell4', 'yell5', 'yell6', 'yell_f0', 'shout0', 'shout1', 'trash0', 'trash1', 'incoming0', 'incoming1', 'incoming2', 'incoming3', 'laugh0', 'pain_f0', 'pain_f1', 'pain_f2', 'pain_f3', 'help0', 'help1', 'help2', 'help3', 'help4', 'help5', 'help6', 'help7', 'help8', 'hup0', 'hup1', 'hup2', 'hup3', 'ew0', 'ew1', 'ew2', 'wow0', 'wow1', 'wow2', 'wow3', 'wow4', 'wow5', 'baba0', 'baba1', 'baba2', 'happy0', 'happy1', 'happy2', 'land', 'hit0', 'hit1', 'hit2', 'hit3', 'scream', 'fireball0', 'fireball1', 'shove_f0', 'shove_f1', 'shove_f2', 'shove_m0', 'shove_m1', 'shove_m2', 'shove_m3', 'shove_m4', 'shove_m5', 'shove_m6', 'shove_m7', 'pass_whoosh', 'steal1.wav', 'steal2.wav', 'crowd_a', 'crowd_b', 'cheer_made', 'whistle', 'go', 'final_round', 'overtime', 'you_win', 'you_lose', 'game_over', 'glass', 'whip', 'gator_cushy'], bufs = {}, loading = false;
  function loadSfx() {
    if (loading || !A.ctx) return; loading = true;
    SFX.forEach(function (f) {   // .mp3 unless named (the dribbles are .wav: no encoder delay, so the thump lands on the frame)
      var n = f.replace(/\.\w+$/, '');
      fetch('sfx/' + (f === n ? f + '.mp3' : f) + SFX_V).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
        return new Promise(function (res, rej) { var pr = A.ctx.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(function () { }); });
      }).then(function (b) { bufs[n] = b; }).catch(function () { });
    });
  }
  A.sfx = function (n, vol, delay) {
    if (!A.ctx || !bufs[n]) return; var s = A.ctx.createBufferSource(), g = A.ctx.createGain();
    s.buffer = bufs[n]; g.gain.value = vol === undefined ? 1 : vol; s.connect(g); g.connect(A.master); s.start(A.ctx.currentTime + (delay || 0));
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
  // a steal swipe: one of the two recorded stick swishes, taking turns, each at a gain that evens out how loud they sound; falls
  // back to the synth one until they load
  var SWIPES = [['steal1', 1.45], ['steal2', 1.65]], lastSw = -1;
  A.swipe = function () {
    var ok = SWIPES.filter(function (w, i) { return bufs[w[0]] && i !== lastSw; });
    if (!ok.length) { A.whoosh(3); return; }
    var w = ok[Math.floor(Math.random() * ok.length)]; lastSw = SWIPES.indexOf(w); A.sfx(w[0], w[1]);
  };
  // a fancy pass (flip, behind the back, moonwalk...): the big recorded whoosh as the ball leaves his hand, loudest 0.2 s into its flight
  A.passWhoosh = function () { if (bufs.pass_whoosh) A.sfx('pass_whoosh', 1.2); else A.whoosh(6); };
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
  function take(n, k, vol, delay) { var i; do { i = Math.floor(Math.random() * k); } while (k > 1 && i === lastTake[n]); lastTake[n] = i; A.sfx(n + i, vol, delay); }
  // hands on the ball: a pass or a rebound lands in someone's hands (2 recorded taps)
  A.catch = function () { if (bufs.catch0) take('catch', 2, 0.75); else A.click(); };
  // powering up: a guy lets out an anime battle yell (7 takes, each cut so its loudest moment lands on the blast at 0.9 s); a woman
  // a warrior's battle scream that carries through the whole 2 s transformation
  A.yell = function (female) { if (female) A.sfx('yell_f0', 1.3); else if (bufs.yell0) take('yell', 7, 1.6); };
  // anyone powering up: a recorded fireball whoosh (2 takes) that swells into the blast, its loudest moment also at 0.88 s
  A.fireball = function () { if (bufs.fireball0) take('fireball', 2, 0.9); };
  // a jump shot drops through: the ball through the net (recorded: 3 goal-in-basket takes and 9 net rustles, never the same twice running)
  A.net = function () { if (bufs.net0) take('net', 12, 0.9); };
  // a shove: the shover lets out an attack yell (recorded: 3 women's takes, 8 men's, never the same one twice running); one at a
  // time, so a scrum doesn't turn into a choir
  A.shoveYell = function (female) {
    if (!bufs[female ? 'shove_f0' : 'shove_m0'] || !throttle('sy', 250)) return;
    if (female) take('shove_f', 3, 0.85); else take('shove_m', 8, 0.85);
  };
  // a shove or a hit that lands: a recorded punch to the face (4 takes)
  A.punch = function () { if (bufs.hit0) take('hit', 4, 0.9); else A.thud(); };
  // spoken lines (trash talk, "incoming!", "help!") take turns: one at a time, and a line that would talk over another is dropped
  var voiceUntil = 0;
  function line(n, k, vol, delay) {
    if (!A.ctx || !bufs[n + '0']) return false; var t0 = A.ctx.currentTime + (delay || 0); if (t0 < voiceUntil) return false;
    var i; do { i = Math.floor(Math.random() * k); } while (k > 1 && i === lastTake[n]); lastTake[n] = i;
    A.sfx(n + i, vol, delay); voiceUntil = t0 + bufs[n + i].duration + 0.15; return true;
  }
  // a guy who flattens someone talks trash (explicit, 2 takes): about half the time, no more than once every 6 s; always (big) after
  // the hammer block
  var trashT = -99;
  A.trash = function (big) {
    if (!A.ctx || (!big && (A.ctx.currentTime - trashT < 6 || Math.random() < 0.5))) return;
    if (line('trash', 2, 1.3, 0.45)) trashT = A.ctx.currentTime;
  };
  // a defender sees a dunker take off from way out: "incoming!" (4 takes, at most once every 10 s)
  A.incoming = function () { if (throttle('inc', 10000)) line('incoming', 4, 1.2, 0.05); };
  // a steal: now and then the thief laughs like a cartoon bad guy
  A.laugh = function () { if (Math.random() < 0.45) line('laugh', 1, 1.1, 0.15); };
  // a woman takes a hit: a short pained grunt (4 takes, one at a time)
  A.painF = function () { if (bufs.pain_f0 && throttle('pf', 300)) take('pain_f', 4, 1.0); };
  // a guy left on the floor by a hard hit calls for help (9 takes)
  A.help = function () { line('help', 9, 1.2, 0.35); };
  // a guy takes off for a dunk or jumps to block: a short video-game "hup!" (4 takes)
  A.hup = function () { if (!bufs.hup0) { A.jump(); return; } if (throttle('hup', 250)) take('hup', 4, 0.8); };
  // you badly mistime a shot and it misses: "ew!" (3 takes)
  A.ew = function () { line('ew', 3, 1.1, 0.25); };
  // a posterizer or a shattered backboard: "wow!" in awe (6 takes)
  A.wow = function () { line('wow', 6, 1.1, 0.35); };
  // a fan yells "baba booey!" after a made three (3 takes); true if it played
  A.baba = function () { return line('baba', 3, 1.2, 0.6); };
  // someone goes on fire: an excited, happy "oh!" (3 takes)
  A.happy = function () { line('happy', 3, 1.1, 0.1); };
  // a knocked-down player hits the floor: a recorded body landing on boards
  A.land = function () { if (bufs.land) A.sfx('land', 0.9); else A.thud(); };
  // a guy sent flying a long way by a hit: he screams on the way (one at a time)
  A.scream = function () { if (throttle('scr', 900)) A.sfx('scream', 1); };
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
  A.rim = function (v) { if (!throttle('r', 70)) return; v = Math.min(1, (v || 4) / 8); tone(520, 0.4, 'triangle', 0.1 + 0.2 * v, 480); tone(1040, 0.3, 'sine', 0.06 + 0.1 * v, 990); noise(0.06, 0.1, 2200, 2); };
  A.board = function () { if (!throttle('bd', 80)) return; tone(160, 0.2, 'square', 0.12, 120); noise(0.1, 0.18, 700, 1); };
  A.buzzer = function () { tone(220, 0.9, 'sawtooth', 0.22); tone(233, 0.9, 'sawtooth', 0.18); };
  A.beep = function (hi) { tone(hi ? 880 : 440, hi ? 0.35 : 0.15, 'square', 0.12); };
  A.click = function () { tone(1200, 0.05, 'square', 0.06); };
  A.chime = function () { tone(784, 0.16, 'sine', 0.16); tone(1175, 0.3, 'sine', 0.14, null, 0.12); tone(1568, 0.4, 'triangle', 0.06, null, 0.12); };   // a pop-up (someone came online, an invite)
  A.hover = function () { if (throttle('h', 50)) tone(900, 0.03, 'sine', 0.04); };
  // Lisa's smack: a bull-whip crack (Epidemic Sound, supplied by the owner; trimmed so the crack is right at the start)
  // the arm bar: a sharp crack (the elbow), a dull pop under it
  A.snap = function () { noise(0.035, 1.0, 3200, 1.4, 0, 'highpass'); noise(0.05, 0.8, 1400, 2.5, 0.01); tone(95, 0.12, 'sine', 0.45, 60, 0.015); };
  A.slap = function () { if (bufs.whip) A.sfx('whip', 1.0); else { noise(0.06, 0.75, 2800, 1.1, 0, 'highpass'); noise(0.14, 0.4, 900, 1.2); tone(150, 0.09, 'sine', 0.3, 70); } };
  A.shove = function () { noise(0.14, 0.3, 300, 0.8); tone(80, 0.15, 'sine', 0.25, 50); };
  A.steal = function () { noise(0.1, 0.22, 1500, 2); tone(700, 0.08, 'triangle', 0.1, 1200); };
  A.thud = function () { noise(0.25, 0.35, 160, 0.7); tone(60, 0.3, 'sine', 0.4, 40); };
  // a basket: the recorded arena cheer (Epidemic Sound), louder for a three or a dunk; nothing synthesized
  A.cheer = function (big) { A.sfx('cheer_made', big ? 1 : 0.8); };
  A.groan = function () { noise(0.8, 0.12, 300, 0.5); tone(160, 0.7, 'sawtooth', 0.04, 90); };
  // the slam: a recorded hand-and-ball rim hit with the rim ringing after (5 takes), then the crowd, and (woo) a beat after the slam
  // a guy's "woo-hoo!" - the dunker, or his teammate when a woman dunks
  A.dunk = function (woo) {
    if (bufs.dunk0) take('dunk', 5, 1); else { tone(70, 0.5, 'sine', 0.5, 30); noise(0.3, 0.3, 200, 0.6); }
    A.cheer(true); if (woo) A.sfx('shout0', 0.9, 0.35);
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
