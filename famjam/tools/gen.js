// Sprite factory runner: renders every player's animation frames and big heads into famjam/sprites and famjam/faces (indexed PNGs).
// Usage (from the repo root, Playwright installed):  THREE_JS=/path/to/three.min.js node famjam/tools/gen.js [ids...]
// THREE_JS is optional; without it the page loads three.js r128 from the CDN. Env: OUT=dir writes elsewhere (for previews),
// HEADS=1 only the heads, BODIES=1 only the sheets, REDO_FACES=1 also redoes existing front heads.
// Front heads of players with a real photo cut-out (PHOTO in gen.html: alan) are never written.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
// minimal 8-bit palette PNG encoder (PLTE + tRNS), much smaller than 32-bit canvas PNGs
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png8(r) {
  const { w, h, pal } = r, idx = Buffer.from(r.idx, 'base64'), ih = Buffer.alloc(13), raw = Buffer.alloc((w + 1) * h);
  ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 3;
  for (let y = 0; y < h; y++) idx.copy(raw, y * (w + 1) + 1, y * w, y * w + w);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('PLTE', Buffer.from(pal.flatMap(c => c.slice(0, 3)))),
    chunk('tRNS', Buffer.from(pal.map(c => c[3]))), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE', e.message));
  if (process.env.THREE_JS) await page.route('**/three.min.js', r => r.fulfill({ path: process.env.THREE_JS, contentType: 'text/javascript' }));
  await page.goto(`http://localhost:${srv.address().port}/famjam/tools/gen.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 }); await page.evaluate(() => window.ready);
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(() => Object.keys(HW.PLAYERS));
  const photo = await page.evaluate(() => window.PHOTO);
  for (const dir of ['sprites', 'faces']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const id of ids) {
    const t0 = Date.now();
    if (!process.env.HEADS) {
      const r = await page.evaluate(id => window.genPlayer(id), id);
      fs.writeFileSync(path.join(OUT, 'sprites', id + '.png'), png8(r)); fs.writeFileSync(path.join(OUT, 'sprites', id + '.json'), JSON.stringify(r.meta));
      console.log(id, r.meta.count, 'frames', r.w + 'x' + r.h, r.pal.length, 'colors');
    }
    if (!process.env.BODIES) {
      const front = path.join(OUT, 'faces', id + '_front.png');
      if (!photo[id] && (!fs.existsSync(front) || process.env.REDO_FACES)) fs.writeFileSync(front, png8(await page.evaluate(id => window.genHead(id, false), id)));
      fs.writeFileSync(path.join(OUT, 'faces', id + '_back.png'), png8(await page.evaluate(id => window.genHead(id, true), id)));
    }
    console.log(id, Date.now() - t0, 'ms');
  }
  await browser.close(); srv.close();
})();
