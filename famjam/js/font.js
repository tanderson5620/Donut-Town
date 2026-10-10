/* font.js - HW.Font: chunky arcade bitmap font (pixel glyphs in code), two-tone fill, 1 px black outline, drop shadow.
   Glyphs are 1-px skeletons on a 7-row grid, made bold (every pixel also lights its right neighbour, so verticals are 2 px)
   and tall (rows 2 and 4 doubled -> 9 rows). Rendered strings are cached as canvases per text/scheme/scale and drawn 1:1. */
window.HW = window.HW || {};
(function (HW) {
  var F = HW.Font = {};
  // '#' = ink. 7 rows (expanded to 9) or 9 rows (used as is). Names starting with '!' are already bold (no emboldening).
  var SRC = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#', '#', '#', '#', '#', '#', '#'],
    J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    '!M': ['########', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '##.##.##'],
    '!N': ['##..##', '###.##', '######', '##.###', '##..##', '##..##', '##..##'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#...#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    '!W': ['##.##.##', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '########'],
    '!X': ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
    5: ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
    6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    '.': ['.', '.', '.', '.', '.', '.', '.', '#', '#'],
    ',': ['..', '..', '..', '..', '..', '..', '.#', '.#', '#.'],
    ':': ['.', '.', '#', '#', '.', '.', '#', '#', '.'],
    ';': ['.', '.', '#', '#', '.', '.', '#', '#', '#'],
    '!': ['#', '#', '#', '#', '#', '.', '#'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    "'": ['#', '#', '.', '.', '.', '.', '.'],
    '!"': ['##.##', '##.##', '.....', '.....', '.....', '.....', '.....'],
    '-': ['....', '....', '....', '####', '....', '....', '....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '!%': ['##...##', '##..##.', '....##.', '...##..', '..##...', '.##..##', '##...##'],
    '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
    ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
    '!#': ['.##.##.', '#######', '.##.##.', '.##.##.', '.##.##.', '#######', '.##.##.'],
    '!&': ['.####..', '##..##.', '.####..', '####.##', '##.###.', '##..##.', '.###.##'],
    '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
    '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
    '=': ['....', '....', '####', '....', '####', '....', '....'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....']
  };
  var ROWS = 9, GL = {}, SPACE = 3, GAP = 1;
  Object.keys(SRC).forEach(function (k) {
    var bold = k.charAt(0) !== '!' || k.length === 1, ch = k.length > 1 && k.charAt(0) === '!' ? k.charAt(1) : k, src = SRC[k];
    var rows = src.length === 7 ? [src[0], src[1], src[2], src[2], src[3], src[4], src[4], src[5], src[6]] : src;
    var w = rows[0].length + (bold ? 1 : 0), bits = [];
    rows.forEach(function (r) { var o = []; for (var x = 0; x < w; x++) o.push(r.charAt(x) === '#' || (bold && x > 0 && r.charAt(x - 1) === '#')); bits.push(o); });
    GL[ch] = { w: w, bits: bits };
  });
  F.ROWS = ROWS;

  /* ---------- colour schemes: one colour per font row, bright on top, darker below ---------- */
  function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; var n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function css(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function toHex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  var shades = {};
  F.shade = function (c, k) { var key = c + k; if (shades[key]) return shades[key]; var a = hex(c); return shades[key] = toHex(k > 0 ? mix(a, [255, 255, 255], k) : mix(a, [0, 0, 0], -k)); };
  function ramp(top, mid, bot) { var a = hex(top), b = hex(mid), c = hex(bot), o = []; for (var i = 0; i < ROWS; i++) o.push(css(i < 4 ? mix(a, b, i / 4) : mix(b, c, (i - 4) / 4))); return o; }
  var SCH = F.SCHEMES = {
    yellow: ['#ffffb0', '#fff64a', '#fff23a', '#ffec20', '#ffd400', '#ffbf00', '#f7a800', '#ee9500', '#d97c00'],
    white: ['#ffffff', '#ffffff', '#ffffff', '#f6f6fa', '#e2e4ee', '#cdd0e0', '#bfc3d6', '#b2b6cc', '#9ea2bc'],
    fire: ['#ffffd0', '#fff36a', '#ffd23f', '#ffb020', '#ff9010', '#ff6a10', '#f04a10', '#d83010', '#b02008'],
    red: ramp('#ffb0a0', '#ff3b30', '#b81008'),
    cyan: ramp('#d8fbff', '#3fd8ff', '#1680c0'),
    green: ramp('#d8ffd0', '#5cff7a', '#119a3a'),
    orange: ramp('#ffe0a0', '#ff8a1f', '#c04800'),
    blue: ramp('#d0e4ff', '#4a90ff', '#1a46b8'),
    gray: ramp('#f0f0f8', '#a8acc4', '#6a6e88'),
    black: ramp('#3a3a48', '#16161e', '#000000')
  };
  F.scheme = function (o) {
    if (o.scheme && SCH[o.scheme]) return SCH[o.scheme];
    var c = o.color || '#ffffff'; if (SCH[c]) return SCH[c];
    var k = 'c' + c; if (!SCH[k]) SCH[k] = ramp(F.shade(c, 0.6), c, F.shade(c, -0.35));
    return SCH[k];
  };

  /* ---------- layout + render ---------- */
  function glyph(ch) { return GL[ch] || (ch === ' ' ? null : GL['?']); }
  F.measure = function (text, sx) {   // fill width in screen px
    text = String(text).toUpperCase(); var w = 0;
    for (var i = 0; i < text.length; i++) { var gph = glyph(text.charAt(i)); w += (gph ? gph.w : SPACE) + (i < text.length - 1 ? GAP : 0); }
    return w * sx;
  };
  function opts(o) {
    o = o || {}; var s = o.scale || 1;
    return { sx: o.sx || s, sy: o.sy || s, ol: o.outline === undefined ? 1 : o.outline, olc: o.outlineColor || '#000', sh: o.shadow === undefined ? 1 : o.shadow, shc: o.shadowColor || '#000', cols: F.scheme(o) };
  }
  var cache = {}, count = 0;
  F.canvas = function (text, o) {
    text = String(text).toUpperCase();
    var p = opts(o), key = text + '|' + p.sx + ',' + p.sy + ',' + p.ol + p.olc + p.sh + p.shc + p.cols[0] + p.cols[8];
    var c = cache[key]; if (c) return c;
    if (++count > 500) { cache = {}; count = 0; }
    var pad = p.ol, fw = F.measure(text, p.sx), fh = ROWS * p.sy;
    c = document.createElement('canvas'); c.width = Math.max(1, fw + pad * 2 + p.sh); c.height = fh + pad * 2 + p.sh;
    var g = c.getContext('2d', { willReadFrequently: true }), list = [], x = 0;   // read back for the flames: keep it on the CPU
    for (var i = 0; i < text.length; i++) { var gph = glyph(text.charAt(i)); if (gph) list.push([gph, x]); x += ((gph ? gph.w : SPACE) + GAP) * p.sx; }
    function pass(dx, dy, grow, col) {
      list.forEach(function (e) {
        var gph = e[0], bits = gph.bits;
        for (var r = 0; r < ROWS; r++) {
          if (!col) g.fillStyle = p.cols[r];
          for (var q = 0; q < gph.w; q++) if (bits[r][q]) {
            var run = 1; while (q + run < gph.w && bits[r][q + run]) run++;   // whole run of lit pixels in one rect
            g.fillRect(pad + e[1] + q * p.sx + dx - grow, pad + r * p.sy + dy - grow, run * p.sx + grow * 2, p.sy + grow * 2); q += run - 1;
          }
        }
      });
    }
    if (p.sh) { g.fillStyle = p.shc; pass(p.sh, p.sh, p.ol, true); }
    if (p.ol) { g.fillStyle = p.olc; pass(0, 0, p.ol, true); }
    pass(0, 0, 0, false);
    c.fillW = fw; c.pad = pad; cache[key] = c; return c;
  };
  F.width = function (text, o) { return F.canvas(text, o).width; };
  F.height = function (o) { var p = opts(o); return ROWS * p.sy + p.ol * 2 + p.sh; };
  // draw at integer pixels; align left|center|right, valign top|middle|bottom (default center/middle)
  F.draw = function (g, text, x, y, o) {
    o = o || {}; var c = F.canvas(text, o), al = o.align || 'center', va = o.valign || 'middle';
    var dx = al === 'left' ? -c.pad : al === 'right' ? -(c.width - c.pad - (o.shadow === undefined ? 1 : o.shadow)) : -c.width / 2;
    var dy = va === 'top' ? -c.pad : va === 'bottom' ? -(c.height) : -c.height / 2;
    g.drawImage(c, Math.round(x + dx), Math.round(y + dy));
    return c.width;
  };
})(window.HW);
