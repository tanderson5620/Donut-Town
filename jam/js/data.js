/* data.js - roster, teams, player types and difficulty for Hoops Jam (the 2D arcade game) */
window.HW = window.HW || {};
(function (HW) {
  HW.TYPES = {
    dunker:   { label: 'Dunker',          blurb: 'Huge hops, wild dunks',        jumpBonus: 0.30, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.45, dunkRange: 1.2 },
    shooter:  { label: '3-Point Shooter', blurb: 'Wide green window from deep',  jumpBonus: 0.0,  greenFromDeep: 2.0, turboDrain: 1.0,  turboMult: 1.45, dunkRange: 0 },
    handler:  { label: 'Ball Handler',    blurb: 'Fast, strong steals, crossovers', jumpBonus: 0.0, greenFromDeep: 1.0, turboDrain: 0.6, turboMult: 1.62, dunkRange: 0 },
    strength: { label: 'Max Strength',    blurb: 'Big shoves, huge blocks',      jumpBonus: 0.05, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.4,  dunkRange: 0.4 }
  };

  // Everyone: id, display name, team (0 Andersons, 1 Gormans), type, jersey number/color, look, stats.
  HW.PLAYERS = {
    carl:    { id: 'carl',    name: 'Carl Anderson',    first: 'Carl',    team: 0, type: 'dunker',   num: 23, color: '#e63946', skin: '#e0a68c', hair: '#8a6a50', hairStyle: 'short', photo: true, brow: '#9a6a4a', height: 1.95, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6 } },
    tyler:   { id: 'tyler',   name: 'Tyler Anderson',   first: 'Tyler',   team: 0, type: 'shooter',  num: 3,  color: '#ffb703', skin: '#e2ae94', hair: '#76634f', hairStyle: 'short', photo: true, height: 1.86, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4 } },
    alan:    { id: 'alan',    name: 'Alan Anderson',    first: 'Alan',    team: 0, type: 'handler',  num: 11, color: '#fb5607', skin: '#c98262', hair: '#c2ab82', hairStyle: 'swept', photo: true, height: 1.76, bulk: 1.12,
               // from his photo: sun-tanned freckled skin, short swept-back ash-blond/gray hair, tinted wire glasses, stocky with a belly, gray shorts, tan suede slip-ons
               freckles: true, glasses: true, belly: true, noBand: true, shorts: '#6f6b72', shoes: '#c9ad86', soles: '#ece2cf', brow: '#b5a07a', age: true,  stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3 } },
    lisa:    { id: 'lisa',    name: 'Lisa Anderson',    first: 'Lisa',    team: 0, type: 'strength', num: 34, color: '#ff006e', skin: '#e9b39a', hair: '#b49766', hairStyle: 'long',  photo: true, headScale: 1.45, height: 1.80, bulk: 1.2,  stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10 } },
    katelyn: { id: 'katelyn', name: 'Katelyn Gorman',   first: 'Katelyn', team: 1, type: 'handler',  num: 7,  color: '#06d6a0', skin: '#f1c27d', hair: '#c9a227', hairStyle: 'pony',  height: 1.70, bulk: 0.88, stats: { speed: 10, tp: 5, dunk: 3, steal: 9, block: 3, str: 3 } },
    kameron: { id: 'kameron', name: 'Kameron Gorman',   first: 'Kameron', team: 1, type: 'dunker',   num: 1,  color: '#3a86ff', skin: '#8d5524', hair: '#101010', hairStyle: 'fade',  height: 1.96, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6 } },
    kody:    { id: 'kody',    name: 'Kody Gorman',      first: 'Kody',    team: 1, type: 'strength', num: 55, color: '#8338ec', skin: '#c68642', hair: '#2b1b0e', hairStyle: 'short', height: 1.92, bulk: 1.3,  stats: { speed: 4, tp: 3, dunk: 6, steal: 5, block: 8, str: 10 } },
    kenny:   { id: 'kenny',   name: 'Kenny Gorman',     first: 'Kenny',   team: 1, type: 'strength', num: 44, color: '#118ab2', skin: '#f1c27d', hair: '#8a5a2b', hairStyle: 'short', height: 1.90, bulk: 1.25, stats: { speed: 5, tp: 4, dunk: 5, steal: 5, block: 9, str: 9 } },
    karen:   { id: 'karen',   name: 'Karen Gorman',     first: 'Karen',   team: 1, type: 'shooter',  num: 30, color: '#2ec4b6', skin: '#e0ac69', hair: '#a0522d', hairStyle: 'bun',   height: 1.76, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4 } }
  };

  // Realistic-body extras per player: eye color, headband, and anything special (Alan: from his photo)
  var LOOK = {
    carl:    { iris: '#6f8a8a' },
    tyler:   { iris: '#4f7396' },
    alan:    { iris: '#6e8794', glasses: true, plainShorts: true, noSocks: true, shoe: { base: '#c4a57e', sole: '#efe6d4', suede: true } },
    lisa:    { iris: '#4a3018' },
    katelyn: { iris: '#4a7aa0' },
    kameron: { iris: '#2e1c10', band: '#3a86ff' },
    kody:    { iris: '#3d2a18' },
    kenny:   { iris: '#556b3e', band: '#118ab2' },
    karen:   { iris: '#4f7a4a' }
  };
  Object.keys(LOOK).forEach(function (id) { HW.PLAYERS[id].look = LOOK[id]; });

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
  HW.PHRASES = {
    two: ['BUCKET!', 'COUNT IT!', 'MONEY!', 'NOTHING BUT NET!', 'IN YOUR FACE!'],
    three: ['FROM DOWNTOWN!', 'RAIN MAKER!', 'FROM THE PARKING LOT!', 'SPLASH!'],
    swish: ['SWISH!', 'NOT A TOUCH!', 'PURE BUTTER!'],
    dunk: ['KABOOM!', 'RIM WRECKER!', 'SLAM-A-LAMA!', 'HAMMER TIME!', 'THUNDER DUNK!'],
    block: ['REJECTED!', 'DENIED!', 'GET THAT OUTTA HERE!', 'NOT IN MY HOUSE!'],
    steal: ['PICKPOCKET!', 'STOLEN!', 'SWIPED!'],
    shove: ['TIMBER!', 'WHAM!', 'FLATTENED!']
  };
})(window.HW);
