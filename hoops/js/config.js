/* config.js - constants, teams, player roster and stat helpers (no THREE here) */
window.HW = window.HW || {};
(function (HW) {
  // Court: meters. -Z is "north" (the hoop the human's team attacks). Units: m, s.
  HW.C = {
    HALF_L: 11, HALF_W: 6.5,          // court half length / width (lines)
    BOUND_X: 7.4, BOUND_Z: 11.9,      // soft walls players/ball can't leave
    RIM_H: 3.05, RIM_R: 0.27, RIM_TUBE: 0.022,
    RIM_Z: 9.38, BOARD_Z: 9.8, BOARD_W: 1.83, BOARD_H: 1.07,
    BALL_R: 0.125, G: 9.81,
    R3: 6.4, CORNER_X: 5.8,           // three-point arc radius and corner line
    LANE_W: 3.6, LANE_L: 4.6,
    QUARTER_S: 180, OT_S: 60, SHOT_CLOCK: 24,
    EYE_ADJUST: 0.12                  // eye is this far below the top of the head
  };

  // Player archetypes. Stats are 1-10: speed, tp (3PT), dunk, steal, block, str.
  HW.TYPES = {
    dunker:   { label: 'Dunker',          blurb: 'Huge hops, wild dunks',        jumpBonus: 0.30, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.45, dunkRange: 1.2 },
    shooter:  { label: '3-Point Shooter', blurb: 'Wide green window from deep',  jumpBonus: 0.0,  greenFromDeep: 2.0, turboDrain: 1.0,  turboMult: 1.45, dunkRange: 0 },
    handler:  { label: 'Ball Handler',    blurb: 'Fast, strong steals, crossovers', jumpBonus: 0.0, greenFromDeep: 1.0, turboDrain: 0.6, turboMult: 1.62, dunkRange: 0 },
    strength: { label: 'Max Strength',    blurb: 'Big shoves, huge blocks',      jumpBonus: 0.05, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.4,  dunkRange: 0.4 }
  };

  // Everyone: id, display name, team (0 Andersons, 1 Gormans), type, jersey number/color, look, stats.
  HW.PLAYERS = {
    carl:    { id: 'carl',    name: 'Carl Anderson',    first: 'Carl',    team: 0, type: 'dunker',   num: 23, color: '#e63946', skin: '#8d5524', hair: '#1a1a1a', hairStyle: 'fade',  height: 1.95, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6 } },
    tyler:   { id: 'tyler',   name: 'Tyler Anderson',   first: 'Tyler',   team: 0, type: 'shooter',  num: 3,  color: '#ffb703', skin: '#f1c27d', hair: '#6b4423', hairStyle: 'short', height: 1.86, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4 } },
    alan:    { id: 'alan',    name: 'Alan Anderson',    first: 'Alan',    team: 0, type: 'handler',  num: 11, color: '#fb5607', skin: '#c68642', hair: '#111111', hairStyle: 'afro',  height: 1.74, bulk: 0.9,  stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3 } },
    lisa:    { id: 'lisa',    name: 'Lisa Anderson',    first: 'Lisa',    team: 0, type: 'strength', num: 34, color: '#ff006e', skin: '#e0ac69', hair: '#3b2314', hairStyle: 'pony',  height: 1.80, bulk: 1.2,  stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10 } },
    katelyn: { id: 'katelyn', name: 'Katelyn Gorman',   first: 'Katelyn', team: 1, type: 'handler',  num: 7,  color: '#06d6a0', skin: '#f1c27d', hair: '#c9a227', hairStyle: 'pony',  height: 1.70, bulk: 0.88, stats: { speed: 10, tp: 5, dunk: 3, steal: 9, block: 3, str: 3 } },
    kameron: { id: 'kameron', name: 'Kameron Gorman',   first: 'Kameron', team: 1, type: 'dunker',   num: 1,  color: '#3a86ff', skin: '#8d5524', hair: '#101010', hairStyle: 'fade',  height: 1.96, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6 } },
    kody:    { id: 'kody',    name: 'Kody Gorman',      first: 'Kody',    team: 1, type: 'strength', num: 55, color: '#8338ec', skin: '#c68642', hair: '#2b1b0e', hairStyle: 'short', height: 1.92, bulk: 1.3,  stats: { speed: 4, tp: 3, dunk: 6, steal: 5, block: 8, str: 10 } },
    kenny:   { id: 'kenny',   name: 'Kenny Gorman',     first: 'Kenny',   team: 1, type: 'strength', num: 44, color: '#118ab2', skin: '#f1c27d', hair: '#8a5a2b', hairStyle: 'short', height: 1.90, bulk: 1.25, stats: { speed: 5, tp: 4, dunk: 5, steal: 5, block: 9, str: 9 } },
    karen:   { id: 'karen',   name: 'Karen Gorman',     first: 'Karen',   team: 1, type: 'shooter',  num: 30, color: '#2ec4b6', skin: '#e0ac69', hair: '#a0522d', hairStyle: 'bun',   height: 1.76, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4 } }
  };

  HW.TEAMS = [
    { id: 0, name: 'Andersons', short: 'AND', color: '#ff8a1f', dark: '#7a3a00', roster: ['carl', 'tyler', 'alan', 'lisa'] },
    { id: 1, name: 'Gormans',   short: 'GOR', color: '#3a86ff', dark: '#10306b', roster: ['katelyn', 'kameron', 'kody', 'kenny', 'karen'] }
  ];

  HW.DIFFICULTY = {
    easy:   { label: 'Easy',   speed: 0.82, shoot: 0.80, steal: 0.45, react: 0.55, shove: 0.4, block: 0.5 },
    normal: { label: 'Normal', speed: 0.95, shoot: 1.00, steal: 0.90, react: 1.0,  shove: 0.8, block: 1.0 },
    hard:   { label: 'Hard',   speed: 1.08, shoot: 1.15, steal: 1.45, react: 1.6,  shove: 1.2, block: 1.5 }
  };

  // Derived physical numbers for a player definition.
  HW.derive = function (def) {
    var t = HW.TYPES[def.type], s = def.stats;
    return {
      run: 3.4 + 0.30 * s.speed,                        // m/s
      turboMult: t.turboMult,
      turboDrain: 34 * t.turboDrain,                    // % per second
      jump: 0.55 + 0.04 * s.dunk + t.jumpBonus,         // m
      greenWin: 1 + (s.tp - 5) * 0.05,
      shootAssist: 0.28 + 0.06 * s.tp,
      reach: def.height + 0.28
    };
  };

  HW.defaults = {
    turnMode: 'snap', snapAngle: 30, smoothSpeed: 100, vignette: true,
    seated: false, difficulty: 'normal', announcer: false, vrJump: 0.5, sfx: 1
  };
})(window.HW);
