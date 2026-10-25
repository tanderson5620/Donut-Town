/* voice.js - talk to each other in online games: phones, the Quest (the VR page runs this same code), computers, and anything
   else whose browser can use a microphone over WebRTC. VOICE in the lobby or the pause menu turns it on; MUTE turns your mic off
   and keeps you listening; no microphone (or it isn't allowed) and you still hear everyone. It runs over the game's own PeerJS
   connections, in a star: each guest's phone calls the host's with its mic, and the host's phone sends each guest everyone
   else's voices mixed into one (its own mic among them), so nobody has to call everybody. The host passes the voices on even
   with its own VOICE off. Whoever's talking gets a mic over their head on the court and lights up in the lobby. Leaving the
   room turns it all off, mic included. */
window.HW = window.HW || {};
(function (HW) {
  var Au = HW.Audio;
  var V = HW.Voice = { on: false, mute: false, mic: false, asking: false, err: '', talk: [], can: !!window.RTCPeerConnection };
  var ctx = null, mic = null, micSrc = null, micGain = null, micAn = null, out = null;
  var call = null, callPeer = null, playEl = null, dialT = 0, sentTo = null, sentV = -1;   // a guest: its call to the host, the mix coming back
  var legs = {};   // the host: one per guest on voice, by peer id: { call, el, src, an, dest, lbl }
  var heard = {}, lastTalk = '', duckOn = null;
  var TALK = 0.012, HOLD = 600, DUCK = 0.55;   // how loud counts as talking, how long a name stays lit after, the game's sound under voices
  function now() { return performance.now(); }
  function Net() { return HW.Net; }
  V.state = function () { return !V.on ? 0 : V.mic && !V.mute ? 2 : 1; };   // (0 off, 1 listening, 2 talking too)
  function audioCtx() { try { if (Au && Au.init) Au.init(); } catch (e) { } ctx = Au && Au.ctx; if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume(); return ctx; }
  function el() { var a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; document.body.appendChild(a); return a; }
  function play(a) { try { var p = a.play(); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
  function kill(a) { if (!a) return; try { a.pause(); a.srcObject = null; if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { } }
  function cut(n) { if (n) try { n.disconnect(); } catch (e) { } }
  function level(an) {
    if (!an) return 0; var b = an._b || (an._b = new Float32Array(an.fftSize)), s = 0;
    if (an.getFloatTimeDomainData) an.getFloatTimeDomainData(b); else return 0;
    for (var i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length);
  }
  function analyser() { var an = ctx.createAnalyser(); an.fftSize = 512; return an; }

  // VOICE: on asks for the microphone (and, a guest, calls the host); off hangs up and lets go of the mic
  V.toggle = function () {
    if (V.on) { V.on = false; stopMic(); hangUp(); rewire(); changed(); return; }
    if (!audioCtx()) { V.err = 'NO SOUND ON THIS BROWSER'; return; }
    V.on = true; V.mute = false; V.err = ''; rewire(); changed();
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { V.err = 'NO MIC ON THIS BROWSER: LISTENING ONLY'; return; }
    V.asking = true;
    md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(function (s) {
      V.asking = false;
      if (!V.on) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      mic = s; micSrc = ctx.createMediaStreamSource(s); micGain = ctx.createGain(); micSrc.connect(micGain); micAn = analyser(); V.mic = true;
      rewire(); changed();
    }, function () { V.asking = false; if (V.on) { V.err = 'NO MIC ALLOWED: LISTENING ONLY'; changed(); } });
  };
  V.toggleMute = function () { if (!V.on || !V.mic) return; V.mute = !V.mute; if (micGain) micGain.gain.value = V.mute ? 0 : 1; changed(); };
  function stopMic() { if (mic) mic.getTracks().forEach(function (t) { t.stop(); }); cut(micSrc); cut(micGain); mic = micSrc = micGain = micAn = null; V.mic = false; V.mute = false; V.asking = false; }
  function hangUp() { if (call) { var c = call; call = null; try { c.close(); } catch (e) { } } callPeer = null; kill(playEl); playEl = null; }
  function changed() { var N = Net(); if (N && N.voiceChanged) N.voiceChanged(); sentV = V.state(); }
  V.sent = function () { sentV = V.state(); };

  // the wiring. A guest: its mic (or nothing, listening only) into what it sends the host. The host: every guest hears the
  // host's mic and every other guest, and the host hears the guests (out loud only with its own VOICE on)
  function rewire() {
    var N = Net(); if (!ctx) return;
    if (micGain) { cut(micGain); micGain.connect(micAn); }
    if (N && N.mode === 'guest') { if (!out) out = ctx.createMediaStreamDestination(); if (micGain) micGain.connect(out); return; }
    var ids = Object.keys(legs);
    ids.forEach(function (id) { var l = legs[id]; cut(l.src); if (l.el) l.el.muted = !V.on; });
    ids.forEach(function (id) {
      var l = legs[id];
      if (l.src) { l.src.connect(l.an); ids.forEach(function (o) { if (o !== id) l.src.connect(legs[o].dest); }); }
      if (micGain) micGain.connect(l.dest);
    });
  }
  // the host: a guest calls in with their mic; the answer carries what that guest hears
  V.incoming = function (c) {
    if (!audioCtx()) { try { c.close(); } catch (e) { } return; }
    var id = c.peer; if (legs[id]) drop(id);
    var l = legs[id] = { call: c, dest: ctx.createMediaStreamDestination(), el: null, src: null, an: analyser(), lbl: null };
    c.on('stream', function (s) {
      if (legs[id] !== l || l.src) return;
      // (Chrome only lets a call's sound into the mixer while it's also playing in an audio element: muted, it still counts)
      l.el = el(); l.el.srcObject = s; l.el.muted = !V.on; play(l.el); l.src = ctx.createMediaStreamSource(s); rewire();
    });
    c.on('close', function () { if (legs[id] === l) drop(id); });
    c.on('error', function () { if (legs[id] === l) drop(id); });
    try { c.answer(l.dest.stream); } catch (e) { drop(id); return; }
    rewire();
  };
  function drop(id) { var l = legs[id]; if (!l) return; delete legs[id]; try { l.call.close(); } catch (e) { } kill(l.el); cut(l.src); cut(l.dest); rewire(); }
  // a guest: call the host (again if the line dropped)
  function dial(link) {
    if (!audioCtx()) return; rewire();
    var c; try { c = call = link.peer.call(link.hostId, out.stream); } catch (e) { call = null; return; }
    if (!c) { call = null; return; } callPeer = link.peer;
    c.on('stream', function (s) { if (call !== c) return; if (!playEl) playEl = el(); playEl.srcObject = s; play(playEl); });
    c.on('close', function () { if (call === c) { call = null; kill(playEl); playEl = null; } });
    c.on('error', function () { if (call === c) { call = null; kill(playEl); playEl = null; } });
  }
  // leaving the room: everything off, mic too
  V.drop = function () {
    hangUp(); Object.keys(legs).forEach(drop); stopMic(); V.on = false; V.err = ''; V.talk = []; heard = {}; lastTalk = ''; sentTo = null; sentV = -1; duck();
  };
  // who's talking (the host listens to everyone, so it tells the others)
  function talkers(N) {
    var t = now(), lv = [['P1', V.mic && !V.mute ? level(micAn) : 0]];
    Object.keys(legs).forEach(function (id) { var l = legs[id]; if (l.lbl && l.src) lv.push([l.lbl, level(l.an)]); });
    lv.forEach(function (a) { if (a[1] > TALK) heard[a[0]] = t; });
    var w = Object.keys(heard).filter(function (k) { return t - heard[k] < HOLD; }).sort(), key = w.join(',');
    V.talk = w; if (key !== lastTalk) { lastTalk = key; if (N.voiceTalk) N.voiceTalk(w); }
  }
  V.debug = function () { return { call: !!call, el: playEl, legs: Object.keys(legs).map(function (id) { return legs[id]; }), out: out, ctx: ctx }; };   // (for testing)
  V.heard = function (w) { V.talk = Array.isArray(w) ? w.slice(0, 4) : []; };   // (a guest: the host's list)
  // with voices on, the game's own sound comes down so they carry
  function duck() {
    var d = V.on; if (d === duckOn || !Au || !Au.master) return; duckOn = d;
    try { Au.master.gain.value = 0.5 * (Au.vol == null ? 1 : Au.vol) * (d ? DUCK : 1); } catch (e) { }
  }
  setInterval(function () {
    var N = Net(), link = N && N.mode && N.voiceLink ? N.voiceLink() : null;
    if (!link) { if (call || V.on || Object.keys(legs).length) V.drop(); return; }
    duck();
    if (N.mode === 'guest') {
      var ok = link.host && link.host.open && link.peer && !link.peer.destroyed;
      if (ok && (sentTo !== link.host || sentV !== V.state())) { sentTo = link.host; changed(); }
      if (V.on && ok && (!call || callPeer !== link.peer) && now() > dialT) { dialT = now() + 4000; dial(link); }
      if (!V.on && call) hangUp();
    } else {
      var live = {}; link.conns.forEach(function (k) { if (k.c && k.c.peer) live[k.c.peer] = k.lbl; });
      Object.keys(legs).forEach(function (id) { if (!(id in live)) drop(id); else legs[id].lbl = live[id]; });   // (a guest who left: hang up)
      talkers(N);
    }
  }, 150);

  /* ---------- the look: a little pixel microphone, the VOICE / MUTE buttons, the mic over a talker's head ---------- */
  V.icon = function (g, x, y, s, col, off) {   // centred on x, y; s: pixel size
    x = Math.round(x - 3 * s); y = Math.round(y - 5 * s);
    g.fillStyle = '#000'; g.fillRect(x + s, y - s, 4 * s, 7 * s); g.fillRect(x - s, y + 3 * s, 8 * s, 5 * s); g.fillRect(x + 2 * s, y + 7 * s, 2 * s, 4 * s); g.fillRect(x, y + 10 * s, 6 * s, 2 * s);
    g.fillStyle = col; g.fillRect(x + 2 * s, y, 2 * s, 5 * s); g.fillRect(x + 2 * s - s, y + s, s, 3 * s); g.fillRect(x + 4 * s, y + s, s, 3 * s);
    g.fillRect(x, y + 4 * s, s, 2 * s); g.fillRect(x + 5 * s, y + 4 * s, s, 2 * s); g.fillRect(x + s, y + 6 * s, 4 * s, s); g.fillRect(x + 2.5 * s, y + 7 * s, s, 3 * s); g.fillRect(x + s, y + 10 * s, 4 * s, s);
    if (off) { g.strokeStyle = '#000'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + 7 * s, y + 11 * s); g.stroke(); g.strokeStyle = '#ff4b3a'; g.lineWidth = 1.4 * s; g.stroke(); }
  };
  V.status = function () {
    if (!V.on) return ''; if (V.asking) return 'ASKING FOR YOUR MIC...'; if (V.err) return V.err;
    return V.mute ? 'MIC OFF: STILL LISTENING' : 'VOICE ON: TALK!';
  };
  // the buttons (ui.js lobby and pause menu): VOICE, and MUTE while it's on. Returns how wide they came out
  V.buttons = function (g, x, y, w, h, size) {
    var k = HW.JamUI.kit; if (!k || !V.can) return 0;
    var Fo = HW.Font, mw = V.on && V.mic ? Math.round(w * 0.42) : 0, vw = w - (mw ? mw + 4 : 0), ic = h > 30 ? 2 : 1, vl = V.on ? 'VOICE ON' : 'VOICE OFF', ml = V.mute ? 'UNMUTE' : 'MUTE';
    var fit = function (t, bw, s) { return s > 1 && Fo.measure(t, s) + 10 > bw ? 1 : s; };   // (a bigger size only where it fits)
    k.button(g, 'voice', x, y, vw, h, vl, { on: V.on, color: '#1fb04c', size: fit(vl, vw - 14 * ic, size || 1), fn: V.toggle });
    V.icon(g, x + 6 + 4 * ic, y + h / 2, ic, V.on ? '#ffffff' : '#9aa0c8', !V.on);
    if (mw) k.button(g, 'mute', x + vw + 4, y, mw, h, ml, { on: !V.mute, color: '#e0a21a', size: fit(ml, mw, size || 1), fn: V.toggleMute });
    return w;
  };
  // in the game, over the court: a mic over whoever's talking
  V.drawGame = function (g) {
    if (!V.talk.length || !HW.Net || !HW.Net.playing()) return;
    var X = HW.GFX, G = HW.Jam;
    G.players.forEach(function (p) {
      if (!p.lbl || V.talk.indexOf(p.lbl) < 0) return;
      var c = X.proj(p.x, p.y + (p.def.height || 1.8) + 0.75, p.z), s = Math.max(1, Math.round(c.s / 40)), b = Math.floor(now() / 160) % 2;
      V.icon(g, c.x, c.y, s, b ? '#7dff9a' : '#ffffff');
      g.fillStyle = '#7dff9a'; for (var i = 1; i <= 2; i++) { g.fillRect(Math.round(c.x + (4 + 2 * i) * s), Math.round(c.y - (2 + i) * s), s, (4 + 2 * i) * s); g.fillRect(Math.round(c.x - (5 + 2 * i) * s), Math.round(c.y - (2 + i) * s), s, (4 + 2 * i) * s); }
    });
  };
})(window.HW);
