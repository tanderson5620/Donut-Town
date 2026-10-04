// Dump Rimshot's rest-pose source geometry (root space) + skin weights for the Blender bake.
// Usage: node export_src.js <donut-town-vr.html> <three.min.js r128> <out.json>
const [HTML, THREE_JS, OUT] = process.argv.slice(2);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(THREE_JS), contentType: 'application/javascript' }));
  await p.goto('file://' + require('path').resolve(HTML)); await p.waitForTimeout(1500);
  const data = await p.evaluate(() => {
    renderer.setAnimationLoop(null);
    const P = RIM; restPose(P); P.root.position.set(0, 0, 0); P.root.rotation.set(0, 0, 0); P.root.updateMatrixWorld(true);
    const bones = P.skeleton.bones.map(b => ({ name: b.name, parent: b.parent && b.parent.isBone ? P.skeleton.bones.indexOf(b.parent) : -1, pos: b.getWorldPosition(new THREE.Vector3()).toArray() }));
    const arr = a => Array.from(a);
    const meshes = {};
    P.root.traverse(o => { if (o.isSkinnedMesh) { const g = o.geometry; meshes[o.name] = { pos: arr(g.attributes.position.array), uv: arr(g.attributes.uv.array), index: arr(g.index.array), si: arr(g.attributes.skinIndex.array), sw: arr(g.attributes.skinWeight.array) }; } });
    // rigid hand parts -> root space, fully weighted to their hand bone
    const hp = [], hi = [], hsi = [], hsw = [];
    P.hand.forEach(hb => {
      const bi = P.skeleton.bones.indexOf(hb);
      hb.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.index ? o.geometry : o.geometry; const pos = g.attributes.position, base = hp.length / 3, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); hp.push(v.x, v.y, v.z); hsi.push(bi, 0, 0, 0); hsw.push(1, 0, 0, 0); }
        if (g.index) for (const k of g.index.array) hi.push(k + base); else for (let k = 0; k < pos.count; k++) hi.push(k + base);
      });
    });
    meshes.hands = { pos: hp, index: hi, si: hsi, sw: hsw };
    return { bones, meshes };
  });
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log(Object.entries(data.meshes).map(([k, m]) => `${k}: ${m.pos.length / 3} verts, ${m.index.length / 3} tris`).join('\n'));
  await b.close();
})();
