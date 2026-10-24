/* data.js - roster, teams, player types and difficulty for FAM JAM (the 2D arcade game) */
window.HW = window.HW || {};
(function (HW) {
  HW.TYPES = {
    dunker:   { label: 'Dunker',          blurb: 'Huge hops, wild dunks',        jumpBonus: 0.30, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.45, dunkRange: 1.2 },
    shooter:  { label: '3-Point Shooter', blurb: 'Wide green window from deep',  jumpBonus: 0.0,  greenFromDeep: 2.0, turboDrain: 0.833, turboMult: 1.45, dunkRange: 0 },   // (20% more turbo than the others: 1 / 1.2 the drain)
    handler:  { label: 'Ball Handler',    blurb: 'Fast, strong steals, crossovers', jumpBonus: 0.0, greenFromDeep: 1.0, turboDrain: 0.6, turboMult: 1.62, dunkRange: 0 },
    strength: { label: 'Max Strength',    blurb: 'Big shoves, huge blocks',      jumpBonus: 0.05, greenFromDeep: 1.0, turboDrain: 1.0,  turboMult: 1.4,  dunkRange: 0.4 },
    ram:      { label: 'Battering Ram',   blurb: 'Flattens everyone, never scores', jumpBonus: 0.05, greenFromDeep: 1.0, turboDrain: 1.0, turboMult: 1.4, dunkRange: 0 }   // (The Legend: every shot misses, no dunks; arm bars and flying body slams)
  };

  // Everyone: id, display name, team (0 Andersons, 1 Gormans), type, jersey number/color, look, stats.
  HW.PLAYERS = {
    carl:    { id: 'carl',    name: 'Carl Anderson',    first: 'Carl',    team: 0, type: 'dunker',   num: 23, color: '#e63946', skin: '#e0a68c', hair: '#8a6a50', hairStyle: 'short', photo: true, brow: '#9a6a4a', height: 1.95, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6, pass: 5 } },
    tyler:   { id: 'tyler',   name: 'Tyler Anderson',   first: 'Tyler',   team: 0, type: 'shooter',  num: 3,  color: '#ffb703', skin: '#e2ae94', hair: '#76634f', hairStyle: 'short', photo: true, height: 1.86, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4, pass: 6 } },
    alan:    { id: 'alan',    name: 'Gator Anderson',   first: 'Gator', powerup: 'twerk', cameo: 'lisa',   team: 0, type: 'handler',  num: 11, color: '#fb5607', skin: '#c98262', hair: '#c2ab82', hairStyle: 'swept', photo: true, height: 1.76, bulk: 1.12,
               // from his photo: sun-tanned freckled skin, short swept-back ash-blond/gray hair, tinted wire glasses, stocky with a belly, gray shorts, tan suede slip-ons
               freckles: true, glasses: true, belly: true, noBand: true, shorts: '#6f6b72', shoes: '#c9ad86', soles: '#ece2cf', brow: '#b5a07a', age: true,  stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3, pass: 10 } },
    bianca:  { id: 'bianca',  name: 'Bianca',           first: 'Bianca',  team: 0, type: 'handler',  num: 2,  color: '#ff8fab', skin: '#dba487', hair: '#b8935f', hairStyle: 'long',  photo: true, headScale: 1.24, brow: '#6e5040', height: 1.68, bulk: 0.86, stats: { speed: 10, tp: 5, dunk: 3, steal: 9, block: 4, str: 4, pass: 10 } },
    lisa:    { id: 'lisa',    name: 'Lisa Anderson',    first: 'Lisa',    team: 0, type: 'strength', num: 34, color: '#ff006e', skin: '#e9b39a', hair: '#b49766', hairStyle: 'long',  photo: true, headScale: 1.45, height: 1.80, bulk: 1.2,  stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10, pass: 4 } },
    katelyn: { id: 'katelyn', name: 'Katelyn Gorman',   first: 'Katelyn', team: 1, type: 'handler',  num: 7,  color: '#06d6a0', skin: '#dca592', hair: '#5c4a3e', hairStyle: 'long',  photo: true, headScale: 1.49, brow: '#5a4234', height: 1.70, bulk: 0.88, stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3, pass: 10 } },
    kameron: { id: 'kameron', name: 'Kameron Gorman',   first: 'Kameron', team: 1, type: 'dunker',   num: 1,  color: '#3a86ff', skin: '#e4a387', hair: '#3a3029', hairStyle: 'short', photo: true, brow: '#4e3a2c', height: 1.96, bulk: 1.0,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6, pass: 5 } },
    kody:    { id: 'kody',    name: 'Kody Gorman',      first: 'Kody',    team: 1, type: 'strength', num: 55, color: '#8338ec', skin: '#d8a68e', hair: '#5a4232', hairStyle: 'short', photo: true, headScale: 1.15, brow: '#4a3628', height: 1.92, bulk: 1.3,  cap: '#a8a8a8', capBack: '#1c1c1e', stats: { speed: 4, tp: 3, dunk: 6, steal: 5, block: 8, str: 10, pass: 3 } },
    kenny:   { id: 'kenny',   name: 'Uncle Kenny Gorman', first: 'Uncle Kenny',  team: 1, type: 'strength', num: 44, color: '#118ab2', skin: '#d8a587', hair: '#9e9a93', hairStyle: 'short', photo: true, brow: '#7f7268', height: 1.90, bulk: 1.25, stats: { speed: 5, tp: 4, dunk: 5, steal: 5, block: 9, str: 9, pass: 4 } },
    karen:   { id: 'karen',   name: 'Karen Gorman',     first: 'Karen',   team: 1, type: 'shooter',  num: 30, color: '#2ec4b6', skin: '#e3a690', hair: '#4d4038', hairStyle: 'short', photo: true, headScale: 1.15, brow: '#3d322b', height: 1.76, bulk: 0.9,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4, pass: 6 } },
    // the Stowells (team 2): Blair, Rox, Lindsay, Trent, Justin
    blair:   { id: 'blair',   name: 'Blair Stowell',    first: 'Blair',   team: 2, type: 'strength', num: 50, color: '#7b2cbf', skin: '#d99a7c', hair: '#d6d2ca', hairStyle: 'short', photo: true, headScale: 1.01, brow: '#9c8a7a', height: 1.86, bulk: 1.22, stats: { speed: 5, tp: 4, dunk: 5, steal: 5, block: 9, str: 9, pass: 4 } },
    rox:     { id: 'rox',     name: 'Rox Stowell',      first: 'Rox',     team: 2, type: 'shooter',  num: 21, color: '#c77dff', skin: '#d9a07c', hair: '#a8895f', hairStyle: 'long',  photo: true, headScale: 1.64, brow: '#6e5240', height: 1.68, bulk: 0.92, stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4, pass: 6 } },
    lindsay: { id: 'lindsay', name: 'Lindsay Stowell',  first: 'Lindsay', team: 2, type: 'handler',  num: 10, color: '#f15bb5', skin: '#dfa07a', hair: '#d8b878', hairStyle: 'long',  photo: true, headScale: 1.68, brow: '#7a5a40', height: 1.70, bulk: 0.88, stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3, pass: 10 } },
    trent:   { id: 'trent',   name: 'Trent Stowell',    first: 'Trent',   team: 2, type: 'dunker',   num: 33, color: '#9b5de5', skin: '#e2a283', hair: '#4a3426', hairStyle: 'short', photo: true, headScale: 0.96, brow: '#3e2c20', height: 1.90, bulk: 1.05, stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6, pass: 5 } },
    justin:  { id: 'justin',  name: 'Justin Stowell',   first: 'Justin',  team: 2, type: 'strength', num: 8,  color: '#5a189a', skin: '#d8987a', hair: '#5a4535', hairStyle: 'short', photo: true, headScale: 0.94, brow: '#4a3628', height: 1.86, bulk: 1.28, stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10, pass: 4 } },
    // Joseph George (team 3): Zach, Ramsey, Jake, Morgan
    zach:    { id: 'zach',    name: 'Zach',             first: 'Zach',    team: 3, type: 'handler',  num: 5,  color: '#2ecc40', skin: '#d9a48a', hair: '#3a2a20', hairStyle: 'short', photo: true, headScale: 1.11, brow: '#3a2a20', height: 1.80, bulk: 1.05, cap: '#46484c', stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3, pass: 10 } },
    ramsey:  { id: 'ramsey',  name: 'Ramsey',           first: 'Ramsey',  powerup: 'twerk', cameo: 'austin', team: 3, type: 'strength', num: 42, color: '#196f3d', skin: '#d4987c', hair: '#2a201c', hairStyle: 'short', photo: true, headScale: 1.2,  brow: '#2a201c', height: 1.86, bulk: 1.3,  stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10, pass: 4 } },
    jake:    { id: 'jake',    name: 'Jake',             first: 'Jake',    team: 3, type: 'dunker',   num: 24, color: '#8bc34a', skin: '#d69b80', hair: '#4a3a2e', hairStyle: 'short', photo: true, headScale: 0.94, brow: '#4a3a2e', height: 1.90, bulk: 1.22, stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6, pass: 5 } },
    morgan:  { id: 'morgan',  name: 'Morgan',           first: 'Morgan',  team: 3, type: 'shooter',  num: 14, color: '#00a86b', skin: '#d8a084', hair: '#33261e', hairStyle: 'short', photo: true, headScale: 1.0,  brow: '#33261e', height: 1.84, bulk: 0.95, stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4, pass: 6 } },
    // Flickinger (team 4): Sque, Cesar, Jahn, The Legend, Austin
    sque:    { id: 'sque',    name: 'Sque',             first: 'Sque',    team: 4, type: 'shooter',  num: 3,  color: '#ffd23f', skin: '#d9a184', hair: '#2a1e18', hairStyle: 'short', photo: true, headScale: 1.19, brow: '#2a1e18', height: 1.80, bulk: 1.0,  stats: { speed: 6, tp: 10, dunk: 3, steal: 4, block: 3, str: 4, pass: 6 } },
    cesar:   { id: 'cesar',   name: 'Cesar',            first: 'Cesar',   team: 4, type: 'dunker',   num: 32, color: '#e85d04', skin: '#c99278', hair: '#16100c', hairStyle: 'short', photo: true, headScale: 0.98, brow: '#16100c', height: 1.90, bulk: 1.1,  stats: { speed: 7, tp: 3, dunk: 10, steal: 4, block: 6, str: 6, pass: 5 } },
    jahn:    { id: 'jahn',    name: 'Jahn',             first: 'Jahn',    team: 4, type: 'handler',  num: 1,  color: '#ffaa00', skin: '#dba48a', hair: '#4a3a2e', hairStyle: 'short', photo: true, headScale: 1.03, brow: '#3a2a20', height: 1.78, bulk: 1.15, stats: { speed: 10, tp: 5, dunk: 4, steal: 9, block: 3, str: 3, pass: 10 } },
    legend:  { id: 'legend',  name: 'The Legend',       first: 'The Legend', team: 4, type: 'ram',      num: 99, color: '#d00000', skin: '#d99a86', hair: '#8a7a6a', hairStyle: 'short', photo: true, headScale: 0.93, brow: '#5a4a3a', height: 1.84, bulk: 1.2,  age: true, cap: '#d9a0dc', stats: { speed: 10, tp: 0, dunk: 0, steal: 0, block: 0, str: 10, pass: 10 } },
    austin:  { id: 'austin',  name: 'Austin',           first: 'Austin',  team: 4, type: 'strength', num: 21, color: '#f48c06', skin: '#d79c82', hair: '#2a1e16', hairStyle: 'short', photo: true, headScale: 1.05, brow: '#2a1e16', height: 1.85, bulk: 1.3,  stats: { speed: 5, tp: 3, dunk: 6, steal: 5, block: 8, str: 10, pass: 4 } }
  };

  // Realistic-body extras per player: eye color, headband, and anything special (Alan: from his photo)
  var LOOK = {
    carl:    { iris: '#6f8a8a' },
    tyler:   { iris: '#4f7396' },
    alan:    { iris: '#6e8794', glasses: true, plainShorts: true, noSocks: true, shoe: { base: '#c4a57e', sole: '#efe6d4', suede: true } },
    bianca:  { iris: '#6b4a32' },
    lisa:    { iris: '#4a3018' },
    katelyn: { iris: '#5a4234' },
    kameron: { iris: '#4e3a2c' },
    kody:    { iris: '#3d2a18' },
    kenny:   { iris: '#556b3e', glasses: true },
    karen:   { iris: '#4f7a4a' },
    blair:   { iris: '#5f7a88' },
    rox:     { iris: '#5a4a3a' },
    lindsay: { iris: '#4f6f8a' },
    trent:   { iris: '#4a3a2a' },
    justin:  { iris: '#5a4a3a' },
    zach:    { iris: '#4a3a2a' },
    ramsey:  { iris: '#4a3a2a' },
    jake:    { iris: '#5a4a3a', glasses: true },
    morgan:  { iris: '#4a3a2a' },
    sque:    { iris: '#4a3020' },
    cesar:   { iris: '#3a2a1c' },
    jahn:    { iris: '#5a4a32' },
    legend:  { iris: '#5a5a4a' },
    austin:  { iris: '#3a2a1c' }
  };
  Object.keys(LOOK).forEach(function (id) { HW.PLAYERS[id].look = LOOK[id]; });

  HW.TEAMS = [
    { id: 0, name: 'Andersons', short: 'AND', color: '#ff8a1f', dark: '#7a3a00', roster: ['carl', 'tyler', 'alan', 'lisa', 'bianca'] },
    { id: 1, name: 'Gormans',   short: 'GOR', color: '#3a86ff', dark: '#10306b', roster: ['katelyn', 'kameron', 'kody', 'kenny', 'karen'] },
    { id: 2, name: 'Stowells',  short: 'STO', color: '#b45cff', dark: '#3d0f6b', roster: ['blair', 'rox', 'lindsay', 'trent', 'justin'] },
    { id: 3, name: 'Joseph George', short: 'JG', color: '#2bb34b', dark: '#0d4a1c', roster: ['zach', 'ramsey', 'jake', 'morgan'] },
    { id: 4, name: 'Flickinger', short: 'FLK', color: '#ff7b00', dark: '#5a2400', roster: ['sque', 'cesar', 'jahn', 'legend', 'austin'] }
  ];

  // green: how often the computer's jump shots are timed green (a person's depend on when they let go)
  HW.DIFFICULTY = {
    easy:   { label: 'Easy',   speed: 0.82, shoot: 0.80, steal: 0.45, react: 0.55, shove: 0.4, block: 0.5, green: 0.40 },
    normal: { label: 'Normal', speed: 0.95, shoot: 1.00, steal: 0.90, react: 1.0,  shove: 0.8, block: 1.0, green: 0.60 },
    hard:   { label: 'Hard',   speed: 1.08, shoot: 1.15, steal: 1.45, react: 1.6,  shove: 1.2, block: 1.5, green: 0.80 }
  };

  // powered-up heads: faces/<id>_ssj.png (front) and faces/<id>_ssj_back.png (back of the head).
  // [x, y] = where the original image's top-left corner sits inside the bigger powered-up canvas, in original-image pixels
  // where each photo's mouth is (fraction of the photo across, down): the tongue on the free-throw-line dunk comes out here
  HW.MOUTH = { carl: [0.50, 0.80], tyler: [0.50, 0.76], alan: [0.52, 0.74], lisa: [0.60, 0.82], bianca: [0.46, 0.78], katelyn: [0.58, 0.83], kameron: [0.47, 0.81], kody: [0.55, 0.77], kenny: [0.50, 0.79], karen: [0.60, 0.81], blair: [0.52, 0.75], rox: [0.56, 0.72], lindsay: [0.41, 0.74], trent: [0.52, 0.78], justin: [0.50, 0.73], zach: [0.57, 0.76], ramsey: [0.42, 0.72], jake: [0.57, 0.69], morgan: [0.35, 0.49], sque: [0.59, 0.82], cesar: [0.44, 0.81], jahn: [0.48, 0.77], legend: [0.62, 0.77], austin: [0.52, 0.76] };
  // and where the mouth is on a powered-up face that's a different photo from the normal one (Carl's scowl), same units
  HW.MOUTH_SSJ = { carl: [0.59, 0.72] };
  // a face for the slow-motion dunks (another photo: Carl's yell), from the slow motion until he lands: faces/<id>_dunk.png and,
  // on fire, faces/<id>_dunk_ssj.png; pad / ssj = where his normal photo's top-left sits in each (normal-photo pixels)
  HW.DUNK_FACE = { carl: { pad: [-6, 25], ssj: [57, 181] } };
  HW.SSJ_PAD = {
    carl: [80, 198],   // his on-fire face is another photo (the scowl), lined up on his head
    tyler: [63, 176],
    alan: [57, 165],
    lisa: [21, 161],
    bianca: [58, 177],
    katelyn: [21, 141],
    kameron: [67, 171],
    kody: [67, 146],
    kenny: [56, 156],
    karen: [75, 170],
    blair: [65, 173],
    rox: [22, 163],
    lindsay: [33, 197],
    trent: [60, 170],
    justin: [60, 165],
    zach: [63, 144],
    ramsey: [53, 159],
    jake: [60, 171],
    morgan: [66, 162],
    sque: [66, 161],
    cesar: [67, 171],
    jahn: [74, 183],
    legend: [72, 129],
    austin: [54, 150]
  };
  HW.SSJ_PAD_BACK = {
    carl: [49, 78],
    tyler: [49, 75],
    alan: [46, 75],
    lisa: [47, 79],
    bianca: [51, 75],
    katelyn: [52, 76],
    kameron: [50, 68],
    kody: [48, 76],
    kenny: [48, 79],
    karen: [50, 72],
    blair: [51, 76],
    rox: [47, 77],
    lindsay: [48, 77],
    trent: [46, 76],
    justin: [48, 73],
    zach: [52, 77],
    ramsey: [50, 76],
    jake: [50, 76],
    morgan: [46, 76],
    sque: [45, 75],
    cesar: [48, 71],
    jahn: [50, 78],
    legend: [49, 73],
    austin: [50, 76]
  };

  // Derived physical numbers for a player definition.
  HW.PHRASES = {
    two: ['BUCKET!', 'COUNT IT!', 'MONEY!', 'NOTHING BUT NET!', 'IN YOUR FACE!'],
    three: ['FROM DOWNTOWN!', 'RAIN MAKER!', 'FROM THE PARKING LOT!', 'SPLASH!'],
    // a shooter's cartwheel three: his own trash talk, every time
    cart: ['FUCK YEAH!', 'SUCK IT!', "I'M HOT SHIT!", 'BUTTER THOSE BISCUITS!'],
    swish: ['SWISH!', 'NOT A TOUCH!', 'PURE BUTTER!'],
    dunk: ['KABOOM!', 'RIM WRECKER!', 'SLAM-A-LAMA!', 'HAMMER TIME!', 'THUNDER DUNK!'],
    // the Ball Handlers' layups: the plain one, the finger roll, the reverse
    lay: ['AND THE LAYUP!', 'TOO QUICK!', 'BLOW-BY!', 'OFF THE GLASS!'], roll: ['FINGER ROLL!', 'SKY HOOK HIGH!', 'UP AND IN!'], rev: ['REVERSE!', 'UNDER AND UP!', 'WRONG SIDE, RIGHT RESULT!'],
    block: ['REJECTED!', 'DENIED!', 'GET THAT SHIT OUT OF HERE!', 'NOT IN MY HOUSE!'],
    steal: ['PICKPOCKET!', 'STOLEN!', 'SWIPED!'],
    shove: ['TIMBER!', 'WHAM!', 'FLATTENED!'],
    // knockdown trash talk by who flattened whom (HW.FAMILY)
    girlBeatsGuy: ['WIMP!', 'GET UP, WIMP!', 'BEAT BY A GIRL!', 'SIT DOWN, BOY!', 'TOO WEAK!'],
    uncle: ["WHO'S YOUR UNCLE?!?!", 'SIT DOWN JUNIOR!!!', "KIDDIE TABLE'S OVER THERE!"],
    aunt: ["WHO'S YOUR AUNTIE?!?!", 'SIT DOWN JUNIOR!!!', "KIDDIE TABLE'S OVER THERE!"],
    // and the other way round: a niece or nephew flattening an uncle or aunt
    toUncle: ['SIT DOWN, UNC!', 'OK BOOMER!', 'NAP TIME, UNC!'],
    toAunt: ['SIT DOWN, AUNTIE!', 'OK BOOMER!', 'NAP TIME, AUNTIE!'],
    cousin: ['WEAKEST COUSIN I KNOW!', 'SEE YOU AT THANKSGIVING!'],
    // brother or sister on brother or sister (Alan, Karen and Rox), and the parents' generation married to them
    sibling: ["MOM ALWAYS LIKED ME BEST!", 'TELL MOM!', "STILL MOM'S FAVORITE!"],
    inlaw: ['IN-LAWS, OUT-LAWS!', 'SEE YOU AT THANKSGIVING!'],
    // anyone flattening someone who married into the family (Lisa, Kenny, Blair, Bianca, Trent)
    marriedIn: ['YOU MARRIED INTO THIS!', 'WELCOME TO THE FAMILY!']
  };

  // a player's catchphrase: it takes the place of exactly one of every `every` of their knockdown taunts, whatever the matchup
  HW.CATCHPHRASE = { kenny: { line: 'HOOCHIE MAMA!', every: 10 }, lisa: { line: 'WOOOO WEEEEEE!', every: 5 }, bianca: { line: 'NO SHOES ON THE CARPET!', every: 3 }, rox: { line: 'YOU CHICKEN SHIT!', every: 4 } };

  // grudges: when one of a pair flattens the other, he calls him out by name, every time (`hit`), and a beat later the one on the floor
  // fires back (`back`); `{me}` / `{them}` are their names. Ramsey and Austin: on as soon as Austin is in the game
  HW.RIVALS = {
    'ramsey|austin': {
      hit: ['SIT YOUR ASS DOWN, {them}!', 'EAT SHIT, {them}!', '{them}, YOU FUCKING CLOWN!', 'GET FUCKED, {them}!', 'STAY DOWN, {them}, YOU DICKHEAD!', '{them}, YOU SOFT BITCH!', 'NIGHT NIGHT, {them}, YOU PRICK!'],
      back: ['FUCK YOU, {them}!', 'CHEAP SHOT, {them}, YOU PRICK!', "THAT ALL YOU GOT, {them}?!", "{them}, YOU'RE DEAD!", 'SUCK MY ASS, {them}!']
    }
  };

  // lines that come with a 2 s taunt over normal play: the crotch chop (twice) or pointing off at the kiddie table
  HW.TAUNTS = { "WHO'S YOUR UNCLE?!?!": 'chop', "WHO'S YOUR AUNTIE?!?!": 'chop', "KIDDIE TABLE'S OVER THERE!": 'point' };

  // the family tree: Alan, Karen and Rox are brother and sisters (blood). Alan + Lisa Anderson -> Tyler, Carl (married to Bianca);
  // Karen + Kenny Gorman -> Katelyn (Katie), Kody, Kameron; Rox + Blair Stowell -> Lindsay (married to Trent), Justin.
  // gen 1 = the parents (uncles and aunts to the other families' kids), gen 2 = the kids and their husbands and wives (cousins across
  // the families); blood = born into it, the rest married in; spouse = who they're married to (always on the same team, so it never
  // meets in a knockdown - kept for the record)
  HW.FAMILY = {
    alan: { gen: 1, sex: 'm', fam: 0, blood: true, spouse: 'lisa' }, lisa: { gen: 1, sex: 'f', fam: 0, spouse: 'alan' },
    tyler: { gen: 2, sex: 'm', fam: 0, blood: true }, carl: { gen: 2, sex: 'm', fam: 0, blood: true, spouse: 'bianca' }, bianca: { gen: 2, sex: 'f', fam: 0, spouse: 'carl' },
    karen: { gen: 1, sex: 'f', fam: 1, blood: true, spouse: 'kenny' }, kenny: { gen: 1, sex: 'm', fam: 1, spouse: 'karen' },
    katelyn: { gen: 2, sex: 'f', fam: 1, blood: true }, kody: { gen: 2, sex: 'm', fam: 1, blood: true }, kameron: { gen: 2, sex: 'm', fam: 1, blood: true },
    rox: { gen: 1, sex: 'f', fam: 2, blood: true, spouse: 'blair' }, blair: { gen: 1, sex: 'm', fam: 2, spouse: 'rox' },
    lindsay: { gen: 2, sex: 'f', fam: 2, blood: true, spouse: 'trent' }, trent: { gen: 2, sex: 'm', fam: 2, spouse: 'lindsay' }, justin: { gen: 2, sex: 'm', fam: 2, blood: true },
    // Joseph George: not related to the other three families (outside: plain knockdown calls both ways)
    zach: { sex: 'm', fam: 3, outside: true }, ramsey: { sex: 'm', fam: 3, outside: true }, jake: { sex: 'm', fam: 3, outside: true }, morgan: { sex: 'm', fam: 3, outside: true },
    // Flickinger: not related to the families either
    sque: { sex: 'm', fam: 4, outside: true }, cesar: { sex: 'm', fam: 4, outside: true }, jahn: { sex: 'm', fam: 4, outside: true }, legend: { sex: 'm', fam: 4, outside: true }, austin: { sex: 'm', fam: 4, outside: true }
  };
})(window.HW);
