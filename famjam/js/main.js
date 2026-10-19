/* main.js - boot, scaling, main loop */
window.HW = window.HW || {};
(function (HW) {
  var X = HW.GFX, G = HW.Jam, UI = HW.JamUI, In = HW.In;
  HW.TOUCH = 'ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  HW.DIFFICULTY = HW.DIFFICULTY || {};
  var cv, g, last = 0;

  function fit() {
    var W = window.innerWidth, H = window.innerHeight; X.setWidth(X.H * W / H); cv.width = X.W; cv.height = X.H; g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
    var s = Math.min(W / X.W, H / X.H);
    cv.style.width = Math.floor(X.W * s) + 'px'; cv.style.height = Math.floor(X.H * s) + 'px';
  }
  function boot() {
    cv = document.getElementById('game'); cv.width = X.W; cv.height = X.H; g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
    fit(); window.addEventListener('resize', fit);
    X.init(); UI.initInput(cv);
    try { document.fonts.load('16px "Press Start 2P"').then(function () { X.rebuild(); }); } catch (e) { }
    Object.keys(HW.PLAYERS).forEach(function (id) { X.loadFace(id); });
    G.phase = 'menu'; UI.screen = 'title';
    var room = /[?&]room=(\d{4})/.exec(location.search);   // an invite link: straight into that room
    if (room && HW.Net) { UI.code = room[1]; UI.screen = 'join'; HW.Net.join(room[1]); }
    else if (/[?&]quick/.test(location.search)) { UI.st = { team: 0, picks: ['alan', 'carl'], ctrl: 'alan', diff: 'normal', qlen: UI.st.qlen || 60 }; UI.matchup(); }
    requestAnimationFrame(loop);
    // a moment after it's up: the play totals, who's online and the owner's phone notification (?nostats leaves them off, for testing)
    if (!/[?&]nostats/.test(location.search)) setTimeout(function () { if (HW.Count) HW.Count.load(); if (HW.Presence) HW.Presence.start(); if (HW.Notify) HW.Notify.start(); }, 1500);
  }
  var idleT = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; if (HW.dtOverride) dt = HW.dtOverride;
    UI.readInput();
    if (UI.presTick) UI.presTick();   // (who's online: what this phone is doing, when it changes)
    var Net = HW.Net, live = Net && Net.playing();
    // online the game never stops for one phone's menu: II just opens it over the game
    if (live) { if (In.pauseDown && (!UI.screen || UI.screen === 'paused')) UI.screen = UI.screen ? null : 'paused'; }
    else if (In.pauseDown && (G.phase === 'play' || G.phase === 'tip' || G.phase === 'scored' || G.phase === 'inbound')) { UI.prevPhase = G.phase; G.phase = 'paused'; UI.screen = 'paused'; }
    else if (In.pauseDown && UI.screen === 'paused') { UI.screen = null; G.phase = UI.prevPhase; }
    if (live && Net.mode === 'guest') Net.guestFrame();   // a guest doesn't run the game: it shows the host's
    else {
      // (every game records the sounds and effects it makes: online the guests are sent them, and the highlight reel keeps the effects)
      if (Net) { Net.pre(); Net.rec = true; }
      if (!UI.screen || UI.screen === 'results' || live) G.update(dt, In); else G.update(0, In);
      if (Net) { Net.rec = false; if (HW.Replay && G.players.length && G.phase !== 'menu' && Net.snap) HW.Replay.frame(G.t, function () { return Net.snap(G.t); }, Net.ev); Net.post(); }
    }
    if (G.phase === 'over' && G.phaseT <= 0 && UI.screen !== 'results') { UI.screen = 'results'; UI.resAt = UI.t; if (HW.Replay) HW.Replay.stop(); }
    g.fillStyle = '#05050c'; g.fillRect(0, 0, X.W, X.H);
    var vz = G.show && G.show.kind === 'win' && G.show.t > G.WIN.hud;   // Gator's victory twerk: just him and the WIN! callout
    // (not under the stats screen: it covers the court, and its highlight reel draws its own)
    if (UI.screen !== 'results' && G.players.length && G.phase !== 'menu') { X.drawScene(g, G.t, UI.screen === 'paused' ? 0 : dt, G.players, G.ball, G.hoopFx); if (!(G.pu && G.pu.t > 0.12 && G.pu.t < (G.pu.dur || G.PU.dur) - 0.15) && !G.cine && !vz) UI.drawHUD(g); else if (vz || G.cine && G.cine.kind === 'chase') UI.drawCallouts(g); }   // the power-up close-up gets the whole screen
    else if (UI.screen !== 'results') { idleT += dt; X.camX = Math.sin(idleT * 0.15) * X.camMax(); X.drawScene(g, idleT, dt, [], null, [0, 0]); }
    // the end of the game fades out to the final scoreboard (slowly after Gator's victory twerk), which fades in
    var fo = G.vic ? G.WIN.fade : 0.45; if (G.phase === 'over' && UI.screen !== 'results' && G.phaseT < fo) { g.fillStyle = 'rgba(0,0,0,' + Math.min(1, 1 - G.phaseT / fo) + ')'; g.fillRect(0, 0, X.W, X.H); }
    if (UI.screen) UI.drawMenu(g, dt);
    var inMenu = !!UI.screen; if (inMenu !== UI.wasMenu) { document.body.classList.toggle('inmenu', inMenu); UI.wasMenu = inMenu; }
    // the music: on the menus the menu songs; the NBA theme from the PLAY press (the matchup screen, loading) through the tip-off until
    // the ball's in play; the NBA on TNT theme from the end of the 1st, 2nd and 3rd quarters until the next one's ball is in play; from
    // the final buzzer through the stats the post-game song (Gator's when his team won)
    var mz = UI.screen === 'matchup' || G.phase === 'tip' && G.q === 1 ? 'intro' : G.phase === 'break' && G.q < 4 || G.phase === 'tip' && G.q > 1 && G.q <= 4 ? 'tnt'
      : G.phase === 'menu' ? 'menu' : G.phase === 'over' ? (G.vic ? 'gator' : 'post') : null;
    // (the crowd ducks under Gator's song in his power-up twerk and his victory twerk, and under the two themes)
    if (HW.Audio.ambient) HW.Audio.ambient(G.players.length && G.phase !== 'menu' && UI.screen !== 'paused' ? (0.18 + Math.min(0.25, X.hype * 0.08)) * (G.show && (G.show.kind === 'pu' || G.show.kind === 'win') ? 0.4 : mz === 'intro' || mz === 'tnt' ? 0.5 : 1) : 0);
    if (HW.Audio.music) HW.Audio.music(mz);
    UI.endFrame();
    requestAnimationFrame(loop);
  }
  window.addEventListener('DOMContentLoaded', boot);
})(window.HW);
