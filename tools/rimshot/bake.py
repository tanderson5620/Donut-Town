"""Bake Rimshot's high-detail assets with Blender (bpy) from rim_src.json (written by export_src.js).

  python bake.py rim_src.json out_dir

Steps:
  1. body + hands are fused with a voxel remesh into one seamless high-res sculpt, then veins and
     muscle grooves are displaced into it;
  2. a ~30k-triangle game mesh is decimated from it, UV-unwrapped, and gets skin weights transferred
     from the source mesh;
  3. head and clothes keep their runtime geometry/UVs; subdivided copies get wrinkles, folds and
     gathers for their normal maps;
  4. Cycles bakes tangent-space normal maps (high -> low) and ambient occlusion for every part;
  5. the game body mesh is written to body.bin + body.json for embedding.
Coordinates stay in three.js root space (Y up), metres.
"""
import bpy, json, math, os, sys, time
import numpy as np

SRC, OUT = sys.argv[-2], sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
D = json.load(open(SRC))
BONES = D['bones']
BI = {b['name']: i for i, b in enumerate(BONES)}
BP = {b['name']: np.array(b['pos']) for b in BONES}
scene = bpy.context.scene

# ---------------------------------------------------------------- helpers
def link(ob): scene.collection.objects.link(ob); return ob

def activate(*obs, active=None):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]

def mk(name, m, uv=True, groups=True):
    v = np.array(m['pos'], np.float32).reshape(-1, 3)
    f = np.array(m['index'], np.int32).reshape(-1, 3)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(v)); me.vertices.foreach_set('co', v.ravel())
    me.loops.add(f.size); me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f)); me.polygons.foreach_set('loop_start', np.arange(0, f.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(f), 3, np.int32))
    if uv and 'uv' in m:
        uvs = np.array(m['uv'], np.float32).reshape(-1, 2)[f.ravel()]
        me.uv_layers.new(name='UVMap').data.foreach_set('uv', uvs.ravel())
    me.update(); me.validate()
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    ob = link(bpy.data.objects.new(name, me))
    if groups:
        si = np.array(m['si']).reshape(-1, 4); sw = np.array(m['sw']).reshape(-1, 4)
        vgs = {}
        for vi in range(len(v)):
            for k in range(4):
                if sw[vi, k] > 1e-4:
                    b = int(si[vi, k])
                    if b not in vgs: vgs[b] = ob.vertex_groups.new(name=BONES[b]['name'])
                    vgs[b].add([vi], float(sw[vi, k]), 'ADD')
    return ob

def dup(ob, name):
    n = ob.copy(); n.data = ob.data.copy(); n.name = name; return link(n)

def apply_mod(ob, typ, **kw):
    m = ob.modifiers.new('m', typ)
    for k, val in kw.items(): setattr(m, k, val)
    activate(ob); bpy.ops.object.modifier_apply(modifier=m.name)

def verts_normals(ob):
    me = ob.data; n = len(me.vertices)
    V = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', V)
    N = np.empty(n * 3, np.float32); me.vertices.foreach_get('normal', N)
    return V.reshape(-1, 3).astype(np.float64), N.reshape(-1, 3).astype(np.float64)

def set_verts(ob, V):
    ob.data.vertices.foreach_set('co', V.astype(np.float32).ravel()); ob.data.update()

g1 = lambda x: np.exp(-x * x)
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi
def vnoise(x, y, seed=0):  # cheap smooth value noise for fold variation
    return (np.sin(x * 1.7 + seed) * np.cos(y * 1.3 - seed * 0.7) + np.sin(x * 0.9 - y * 1.1 + seed * 2.1)) * 0.25 + 0.5

def limb_coords(V, A, B, side):
    d = B - A; L = np.linalg.norm(d); d = d / L
    f = np.array([0, 0, 1.0]) - d * d[2]; f /= np.linalg.norm(f)
    lat = np.cross(d, f)
    if side and lat[0] * side < 0: lat = -lat
    rel = V - A; along = rel @ d
    rad = rel - np.outer(along, d)
    r = np.linalg.norm(rad, axis=1) + 1e-9
    return along / L, np.arctan2(rad @ lat, rad @ f), r, rad / r[:, None]

# ---------------------------------------------------------------- 1. seamless high-res body
log('building sources')
body_src = mk('body_src', D['meshes']['body'])
hands_src = mk('hands_src', D['meshes']['hands'], uv=False)
src = dup(body_src, 'weights_src'); h2 = dup(hands_src, 'h2')
activate(src, h2, active=src); bpy.ops.object.join()
hi = dup(body_src, 'body_hi'); h3 = dup(hands_src, 'h3')
activate(hi, h3, active=hi); bpy.ops.object.join()
hi.vertex_groups.clear()
activate(hi); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-5)  # weld the UV-seam columns so every tube is closed
bpy.ops.mesh.fill_holes(sides=0)  # close open tube ends (neck) so the voxel remesh keeps them solid
bpy.ops.object.mode_set(mode='OBJECT')
log('voxel remesh')
apply_mod(hi, 'REMESH', mode='VOXEL', voxel_size=0.0022, use_smooth_shade=True)
apply_mod(hi, 'LAPLACIANSMOOTH', lambda_factor=0.4, iterations=2, use_volume_preserve=True)
log('hi faces', len(hi.data.polygons))

V, N = verts_normals(hi)
disp = np.zeros(len(V))
def vein(A, B, side, th_fn, t0, t1, amp, width, rmax):
    t, th, r, rd = limb_coords(V, A, B, side)
    ok = (t > t0 - 0.05) & (t < t1 + 0.05) & (r < rmax) & (np.einsum('ij,ij->i', rd, N) > 0.4)
    d = np.abs(wrap(th - th_fn(t))) * r
    fade = smooth(t0, t0 + 0.08, t) * smooth(t1, t1 - 0.08, t)
    return np.where(ok, amp * g1(d / width) * fade, 0)
for s in (-1, 1):
    sh, el, hd = BP[f'sh{s}'], BP[f'el{s}'], BP[f'hand{s}']
    tip = hd + np.array([0, -0.1, 0])
    # forearm veins and muscle separations
    disp += vein(el, hd, s, lambda t: -0.55 - 0.45 * t + 0.12 * np.sin(t * 9), 0.15, 0.95, 0.0012, 0.0024, 0.06)
    disp += vein(el, hd, s, lambda t: 0.35 + 0.25 * np.sin(t * 6), 0.35, 0.92, 0.0009, 0.002, 0.06)
    disp += vein(el, hd, s, lambda t: -1.2 + 0.2 * t, 0.05, 0.6, -0.0007, 0.004, 0.06)          # flexor groove
    # upper arm: cephalic + basilic veins, deltoid/biceps and biceps/triceps grooves
    disp += vein(sh, el, s, lambda t: 1.0 - 0.35 * t + 0.05 * np.sin(t * 11), 0.35, 1.0, 0.0011, 0.0024, 0.08)
    disp += vein(sh, el, s, lambda t: -1.35 + 0.1 * np.sin(t * 7), 0.5, 1.0, 0.0008, 0.0022, 0.08)
    disp += vein(sh, el, s, lambda t: 0.55 + 0.9 * (t - 0.25), 0.18, 0.45, -0.0012, 0.005, 0.09)  # deltoid insertion
    disp += vein(sh, el, s, lambda t: np.full_like(t, 1.75), 0.35, 0.85, -0.0009, 0.005, 0.08)    # lateral groove
    disp += vein(sh, el, s, lambda t: np.full_like(t, -1.6), 0.35, 0.85, -0.0008, 0.005, 0.08)
    # back of the hand
    disp += vein(hd, tip, s, lambda t: np.pi / 2 + 0.3 * (t - 0.2) * s, 0.05, 0.55, 0.0007, 0.0018, 0.03)
    disp += vein(hd, tip, s, lambda t: np.pi / 2 - 0.35 * (t - 0.1) * s, 0.05, 0.5, 0.0006, 0.0018, 0.03)
    # calves: gastrocnemius split and tibia line
    th_, kn, ft = BP[f'th{s}'], BP[f'kn{s}'], BP[f'ft{s}']
    disp += vein(kn, ft, s, lambda t: np.full_like(t, np.pi), 0.15, 0.45, -0.0012, 0.006, 0.08)
    disp += vein(th_, kn, s, lambda t: np.full_like(t, -0.55), 0.6, 0.95, -0.001, 0.006, 0.12)     # quad teardrop edge
# collarbones, sternum notch and trap edge (visible above the jersey)
y, x, z = V[:, 1], V[:, 0], V[:, 2]
front = (N[:, 2] > 0.3)
disp += np.where(front, 0.0012 * g1((y - 1.586) / 0.006) * g1((np.abs(x) - 0.075) / 0.045), 0)
disp += np.where(front, -0.0015 * g1(x / 0.012) * g1((y - 1.6) / 0.012), 0)
disp += 0.00012 * np.sin(V[:, 0] * 900) * np.sin(V[:, 1] * 870) * np.sin(V[:, 2] * 910)          # skin grain
V += N * disp[:, None]
set_verts(hi, V)

# ---------------------------------------------------------------- 2. game body mesh
log('decimate')
lo = dup(hi, 'body_lo')
BODY_TRIS = int(os.environ.get('BODY_TRIS', 18000))  # game body budget (Quest 2)
apply_mod(lo, 'DECIMATE', ratio=BODY_TRIS / (2 * len(lo.data.polygons)))
apply_mod(lo, 'TRIANGULATE')
log('lo tris', len(lo.data.polygons))
activate(lo); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
dt = lo.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = src
dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
activate(lo); bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
log('weights transferred:', len(lo.vertex_groups), 'groups')

# ---------------------------------------------------------------- 3. head + clothes detail copies
head_lo = mk('head_lo', D['meshes']['head'], groups=False)
head_hi = dup(head_lo, 'head_hi'); apply_mod(head_hi, 'SUBSURF', subdivision_type='SIMPLE', levels=2, render_levels=2)
V, N = verts_normals(head_hi)
hc = BP['head'] + np.array([0, 0.083, 0.012]); rad = np.array([0.08, 0.109, 0.099])
dirn = (V - hc) / rad; dirn /= np.linalg.norm(dirn, axis=1)[:, None]
nx, ny, nz = dirn[:, 0], dirn[:, 1], dirn[:, 2]; ax = np.abs(nx); fr = smooth(0.1, 0.5, nz)
d = np.zeros(len(V))
for k, yy in enumerate((0.43, 0.48, 0.535)):                                                 # forehead lines
    d -= 0.00035 * g1((ny - yy - 0.01 * np.sin(nx * 9 + k)) / 0.008) * smooth(0.5, 0.2, ax) * fr
nl = 0.17 + (0.31 - 0.17) * smooth(-0.27, -0.56, ny)                                          # nasolabial folds
d -= 0.0011 * g1((ax - nl) / 0.025) * smooth(-0.22, -0.3, ny) * smooth(-0.62, -0.52, ny) * fr
d += 0.0005 * g1((ax - nl + 0.03) / 0.03) * smooth(-0.22, -0.3, ny) * smooth(-0.62, -0.52, ny) * fr
d -= 0.0005 * g1((ax - 0.4) / 0.11) * g1((ny + 0.04) / 0.015) * fr                           # under-eye line
d += 0.0004 * g1((ax - 0.4) / 0.1) * g1((ny + 0.0) / 0.025) * fr
d -= 0.0004 * g1((ax - 0.4) / 0.11) * g1((ny - 0.215) / 0.01) * fr                           # eyelid crease
lips = np.maximum(g1((ny + 0.452) / 0.03), g1((ny + 0.535) / 0.034)) * smooth(0.25, 0.15, ax) * fr
d += 0.00018 * np.sin(nx * 260) * lips                                                         # lip lines
d += 0.0003 * g1((ax - 0.045) / 0.012) * g1((ny + 0.39) / 0.035) * fr                         # philtrum ridges
d -= 0.0005 * g1(nx / 0.04) * g1((ny + 0.7) / 0.03) * fr                                      # chin crease
V += N * d[:, None]; set_verts(head_hi, V)

def cloth_hi(name, lv, fold_fn):
    ob = dup(bpy.data.objects[name], name.replace('_lo', '_hi'))
    apply_mod(ob, 'SUBSURF', subdivision_type='SIMPLE', levels=lv, render_levels=lv)
    V, N = verts_normals(ob); V += N * fold_fn(V)[:, None]; set_verts(ob, V); return ob
for nm in ('jersey', 'shorts', 'sleeve'): mk(nm + '_lo', D['meshes'][nm], groups=False)
def jersey_folds(V):
    x, y, z = V.T; th = np.arctan2(x, z)
    tuck = smooth(1.1, 0.97, y)                                   # bunched where it tucks into the shorts
    f = 0.0028 * tuck * np.sin(th * 15 + 3 * vnoise(th * 3, y * 20))
    f += 0.0016 * np.sin(th * 4 + y * 9) * vnoise(th * 2, y * 7, 3)
    ap = g1((np.abs(x) - 0.13) / 0.035) * smooth(1.2, 1.32, y) * smooth(1.42, 1.36, y)    # armpit drag lines
    f += 0.0018 * ap * np.sin((y + np.abs(x) * 0.8) * 160)
    f += 0.0002 * np.sin(x * 2200) * np.sin(y * 2200)            # knit
    return f
def shorts_folds(V):
    x, y, z = V.T; th = np.arctan2(x, z)
    f = 0.0016 * smooth(1.07, 1.1, y) * np.sin(th * 46)          # elastic gathers in the waistband
    for s in (-1, 1):
        t, th2, r, _ = limb_coords(V, BP[f'th{s}'], BP[f'kn{s}'], s)
        m = (np.sign(x) == s) & (y < 0.98)
        f += np.where(m, 0.0045 * smooth(0.05, 0.6, t) * np.sin(th2 * 5 + 2.5 * vnoise(th2 * 2, t * 6, s)), 0)
    f += 0.0025 * g1(x / 0.05) * g1((y - 0.9) / 0.03) * np.sin(x * 120)   # crotch pull
    return f
def sleeve_folds(V):
    e = BP['el-1']; dd = np.linalg.norm(V - e, axis=1)
    return 0.0009 * g1(dd / 0.05) * np.sin(V[:, 1] * 420) * (V[:, 2] - e[2] > 0)
jersey_hi = cloth_hi('jersey_lo', 2, jersey_folds)
shorts_hi = cloth_hi('shorts_lo', 2, shorts_folds)
sleeve_hi = cloth_hi('sleeve_lo', 2, sleeve_folds)

# ---------------------------------------------------------------- 4. bakes
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
world = bpy.data.worlds.new('w'); scene.world = world; world.light_settings.distance = 0.12
bk = scene.render.bake; bk.margin = 8; bk.use_clear = True

def target_image(ob, name, w, h, color):
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.generated_color = color; img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(name + '_m'); mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    mat.node_tree.nodes.active = node
    ob.data.materials.clear(); ob.data.materials.append(mat)
    return img

def save(img, name):
    img.filepath_raw = os.path.join(OUT, name + '.png'); img.file_format = 'PNG'; img.save()

HIS = [hi, head_hi, jersey_hi, shorts_hi, sleeve_hi]
LOS = [(lo, 'body', 2048, 2048, 1024), (head_lo, 'head', 2048, 1024, 1024), (bpy.data.objects['jersey_lo'], 'jersey', 1024, 1024, 512),
       (bpy.data.objects['shorts_lo'], 'shorts', 1024, 1024, 512), (bpy.data.objects['sleeve_lo'], 'sleeve', 512, 512, 256)]
for (ob, name, w, h, aw), high in zip(LOS, HIS):
    log('bake normal', name)
    img = target_image(ob, name + '_nrm', w, h, (0.5, 0.5, 1, 1))
    scene.cycles.samples = 4
    bk.use_selected_to_active = True; bk.cage_extrusion = 0.006; bk.max_ray_distance = 0.02 if name in ('body', 'head') else 0.009
    activate(high, ob, active=ob)
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    save(img, name + '_nrm')
for o in HIS: o.hide_render = True
for o in (body_src, hands_src, src): o.hide_render = True
for ob, name, w, h, aw in LOS:
    log('bake ao', name)
    for c in ('jersey_lo', 'shorts_lo', 'sleeve_lo'):  # clothes extend past their alpha-cut holes, so don't let them shadow the skin
        bpy.data.objects[c].hide_render = name == 'body' and c != name
    img = target_image(ob, name + '_ao', aw, aw * h // w, (1, 1, 1, 1))
    scene.cycles.samples = 48; bk.use_selected_to_active = False
    activate(ob)
    bpy.ops.object.bake(type='AO')
    save(img, name + '_ao')

# ---------------------------------------------------------------- 5. export the game body mesh
log('export body')
me = lo.data
nv, nl = len(me.vertices), len(me.loops)
lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv)
uv = np.empty(nl * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
cn = np.array([c.vector[:] for c in me.corner_normals], np.float32)
co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
W = np.zeros((nv, len(BONES)), np.float32)
gname = {g.index: g.name for g in lo.vertex_groups}
for v in me.vertices:
    for ge in v.groups: W[v.index, BI[gname[ge.group]]] += ge.weight
key, out_index, rows = {}, [], []
for li in range(nl):
    k = (lv[li], round(float(uv[li, 0]), 5), round(float(uv[li, 1]), 5))
    if k not in key: key[k] = len(rows); rows.append(li)
    out_index.append(key[k])
rows = np.array(rows); vi = lv[rows]
pos = co[vi]; nrm = cn[rows]; nrm /= np.linalg.norm(nrm, axis=1)[:, None]; uvo = uv[rows]
order = np.argsort(-W[vi], axis=1)[:, :4]
wt = np.take_along_axis(W[vi], order, axis=1); wt[wt < 1e-3] = 0
wt /= np.maximum(wt.sum(1, keepdims=True), 1e-6)
wq = np.round(wt * 255).astype(np.int32); wq[:, 0] += 255 - wq.sum(1)
n = len(rows)
parts = [('position', pos.astype(np.float32)), ('normal', np.round(nrm * 127).astype(np.int8)), ('uv', np.round(np.clip(uvo, 0, 1) * 65535).astype(np.uint16)),
         ('skinIndex', order.astype(np.uint8)), ('skinWeight', wq.astype(np.uint8)),
         ('index', np.array(out_index, np.uint16 if n < 65536 else np.uint32))]
meta, blob = {'count': n}, bytearray()
for name, arr in parts:
    while len(blob) % 4: blob.append(0)
    meta[name] = [len(blob), int(arr.size), str(arr.dtype)]
    blob += arr.tobytes()
open(os.path.join(OUT, 'body.bin'), 'wb').write(bytes(blob))
json.dump(meta, open(os.path.join(OUT, 'body.json'), 'w'))
log('done:', n, 'verts,', len(out_index) // 3, 'tris,', len(blob), 'bytes')
