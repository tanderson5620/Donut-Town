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
    if (/[?&]quick/.test(location.search)) { UI.st = { team: 0, picks: ['alan', 'carl'], ctrl: 'alan', diff: 'normal', qlen: UI.st.qlen || 60 }; UI.matchup(); }
    requestAnimationFrame(loop);
  }
  var idleT = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; if (HW.dtOverride) dt = HW.dtOverride;
    UI.readInput();
    if (In.pauseDown && (G.phase === 'play' || G.phase === 'tip' || G.phase === 'scored')) { UI.prevPhase = G.phase; G.phase = 'paused'; UI.screen = 'paused'; }
    else if (In.pauseDown && UI.screen === 'paused') { UI.screen = null; G.phase = UI.prevPhase; }
    if (!UI.screen || UI.screen === 'results') G.update(dt, In); else G.update(0, In);
    if (G.phase === 'over' && G.phaseT <= 0 && UI.screen !== 'results') UI.screen = 'results';
    g.fillStyle = '#05050c'; g.fillRect(0, 0, X.W, X.H);
    if (G.players.length && G.phase !== 'menu') { X.drawScene(g, G.t, UI.screen === 'paused' ? 0 : dt, G.players, G.ball, G.hoopFx); if (!(G.pu && G.pu.t > 0.12 && G.pu.t < G.PU.dur - 0.15)) UI.drawHUD(g); }   // the power-up close-up gets the whole screen
    else { idleT += dt; X.camX = Math.sin(idleT * 0.15) * X.camMax(); X.drawScene(g, idleT, dt, [], null, [0, 0]); }
    if (UI.screen) UI.drawMenu(g, dt);
    var inMenu = !!UI.screen; if (inMenu !== UI.wasMenu) { document.body.classList.toggle('inmenu', inMenu); UI.wasMenu = inMenu; }
    UI.endFrame();
    requestAnimationFrame(loop);
  }
  window.addEventListener('DOMContentLoaded', boot);
})(window.HW);
