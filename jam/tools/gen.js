// Sprite factory runner: renders every player's animation frames and big heads into jam/sprites and jam/faces.
// Usage (from the repo root, Playwright installed):  THREE_JS=/path/to/three.min.js node jam/tools/gen.js [ids...]
// THREE_JS is optional; without it the page loads three.js r128 from the CDN.
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE', e.message));
  if (process.env.THREE_JS) await page.route('**/three.min.js', r => r.fulfill({ path: process.env.THREE_JS, contentType: 'text/javascript' }));
  await page.goto(`http://localhost:${srv.address().port}/jam/tools/gen.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 }); await page.evaluate(() => window.ready);
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(() => Object.keys(HW.PLAYERS));
  const png = (u, f) => fs.writeFileSync(f, Buffer.from(u.split(',')[1], 'base64'));
  for (const id of ids) {
    const t0 = Date.now(), r = await page.evaluate(id => window.genPlayer(id), id);
    png(r.png, path.join(OUT, 'sprites', id + '.png')); fs.writeFileSync(path.join(OUT, 'sprites', id + '.json'), JSON.stringify(r.meta));
    if (!fs.existsSync(path.join(OUT, 'faces', id + '_front.png')) || process.env.REDO_FACES) png(await page.evaluate(id => window.genHead(id, false), id), path.join(OUT, 'faces', id + '_front.png'));
    png(await page.evaluate(id => window.genHead(id, true), id), path.join(OUT, 'faces', id + '_back.png'));
    console.log(id, r.meta.count, 'frames', Date.now() - t0, 'ms');
  }
  await browser.close(); srv.close();
})();
