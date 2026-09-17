"""Prepare textured non-Juan Tripo heads for the poker facial animation rig.

Blender --background --python scripts/prepare-tripo-cast.py -- --character diego
Landmarks use normalized source coordinates: full character height 1, feet at Z=0,
front facing Blender -Y. Saved values can be adjusted and the command rerun.
The source GLB remains untouched. Juan's separately reviewed pipeline is unchanged.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
LANDMARKS = ROOT / 'assets/tripo/head-landmarks.json'
args = argparse.ArgumentParser()
args.add_argument('--character', required=True)
args.add_argument('--no-render', action='store_true')
args.add_argument('--inspect', action='store_true', help='Also render the normalized full source')
args = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
ID = args.character
if ID == 'juan' or not ID.replace('-', '').isalnum():
    raise ValueError('Use the dedicated Juan preparation script; otherwise provide a character ID.')
SOURCE = ROOT / f'assets/tripo/source/{ID}-original.glb'
OUT = ROOT / 'public/models/tripo'
ART = ROOT / 'artifacts/tripo' / ID
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
config = json.loads(LANDMARKS.read_text()).get(ID, {}) if LANDMARKS.exists() else {}


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gaussian(x, z, rx, rz):
    return math.exp(-(x / rx) ** 2 - (z / rz) ** 2)


def bounds(obj):
    p = np.array([v.co[:] for v in obj.data.vertices])
    return p.min(axis=0), p.max(axis=0)


def material(name, color, roughness=.82):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m


def mesh_object(name, positions, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(positions, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    obj['character_id'] = ID
    obj['facial_rig'] = 'sculpt-morphs-v1'
    return obj


def base_image(obj):
    for m in obj.data.materials:
        if not m or not m.use_nodes:
            continue
        bs = m.node_tree.nodes.get('Principled BSDF')
        if bs:
            for link in bs.inputs['Base Color'].links:
                if link.from_node.type == 'TEX_IMAGE':
                    return link.from_node.image
    return next(im for im in bpy.data.images if im.type == 'IMAGE' and im.name.lower().startswith('color'))


def sample_uv(uv):
    x = min(texture_width - 1, max(0, int(uv[0] * texture_width)))
    y = min(texture_height - 1, max(0, int(uv[1] * texture_height)))
    return pixels[y, x, :3]


def vertex_colors(obj):
    uv = obj.data.uv_layers.active.data
    colors = np.zeros((len(obj.data.vertices), 3))
    count = np.zeros(len(obj.data.vertices))
    for i, loop in enumerate(obj.data.loops):
        colors[loop.vertex_index] += sample_uv(uv[i].uv)
        count[loop.vertex_index] += 1
    colors /= np.maximum(count[:, None], 1)
    return colors


def white_points(obj):
    positions = np.array([v.co[:] for v in obj.data.vertices])
    colors = vertex_colors(obj)
    white = (colors.min(axis=1) > config.get('eye_whiteness', .68)) & ((colors.max(axis=1) - colors.min(axis=1)) < .16)
    region = (positions[:, 2] > .64) & (positions[:, 2] < .92) & (np.abs(positions[:, 0]) < .24)
    return positions[white & region]


def clusters(points, radius=.012):
    cells = defaultdict(list)
    for i, p in enumerate(points):
        cells[tuple(np.floor(p / radius).astype(int))].append(i)
    seen = set()
    groups = []
    for start in range(len(points)):
        if start in seen:
            continue
        queue = deque([start])
        seen.add(start)
        group = []
        while queue:
            i = queue.popleft()
            group.append(i)
            key = np.floor(points[i] / radius).astype(int)
            for x in [-1, 0, 1]:
                for y in [-1, 0, 1]:
                    for z in [-1, 0, 1]:
                        for j in cells.get(tuple(key + [x, y, z]), []):
                            if j not in seen and np.linalg.norm(points[i] - points[j]) < radius:
                                seen.add(j)
                                queue.append(j)
        if len(group) >= 8:
            groups.append(points[group])
    return sorted(groups, key=len, reverse=True)


def detect_eyes(obj):
    whites = white_points(obj)
    groups = clusters(whites)
    report = [{'count': len(g), 'center': g.mean(axis=0).tolist(), 'size': np.ptp(g, axis=0).tolist()} for g in groups]
    print('WHITE_REGIONS', json.dumps(report))
    (ART / 'white-regions.json').write_text(json.dumps(report, indent=2))
    candidates = []
    for group in groups:
        lo, hi = np.quantile(group, .015, axis=0), np.quantile(group, .985, axis=0)
        size = hi - lo
        # Large helmet/cap patches and tiny highlights are not eye whites.
        if .035 < size[0] < .155 and .035 < size[2] < .155:
            candidates.append((group, (lo + hi) / 2, size))
    pairs = []
    for i, a in enumerate(candidates):
        for b in candidates[i + 1:]:
            dx = abs(a[1][0] - b[1][0])
            dz = abs(a[1][2] - b[1][2])
            if .05 < dx < .24 and dz < .04:
                score = len(a[0]) + len(b[0]) - dz * 20000
                pairs.append((score, a, b))
    if not pairs:
        raise ValueError('Could not confidently locate a pair of eye whites. Review white-regions.json and set eyes in head-landmarks.json.')
    _, a, b = max(pairs, key=lambda pair: pair[0])
    found = []
    for group, center, size in sorted([a, b], key=lambda item: item[1][0]):
        found.append({'center': [float(v) for v in center], 'radii': [float(size[0] * .535), float(size[2] * .535)]})
    return found


def ray_color(obj, x, z):
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    hit, normal, index, distance = tree.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)), 6)
    if hit is None:
        return None
    poly = obj.data.polygons[index]
    uv = sum((obj.data.uv_layers.active.data[i].uv for i in poly.loop_indices), Vector((0, 0))) / len(poly.loop_indices)
    return sample_uv(uv)


def setup_render():
    for position, energy, size in [((-2, -4, 4), 450, 4), ((3, -1, 1.5), 230, 3), ((0, 3, 3), 300, 3)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(.05, -3.1, .08))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.5
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.render.resolution_x = 700
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.world.color = (.18, .18, .18)
    scene.view_settings.view_transform = 'AgX'
    return scene, camera


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
for ob in bpy.context.scene.objects:
    ob.select_set(ob in meshes)
bpy.context.view_layer.objects.active = max(meshes, key=lambda ob: len(ob.data.polygons))
bpy.ops.object.join()
o = bpy.context.object
o.name = 'Face'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
low, high = bounds(o)
# Tripo frequently exports the forward direction along +X. A-pose armspan
# disambiguates the horizontal axes; the eye whites choose front versus back.
yaw = config.get('rotation_z_degrees', -90 if high[1] - low[1] > high[0] - low[0] else 0)
rotation = Matrix.Rotation(math.radians(yaw), 4, 'Z')
for vertex in o.data.vertices:
    vertex.co = rotation @ vertex.co
low, high = bounds(o)
height = high[2] - low[2]
horizontal = Vector(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, low[2]))
for vertex in o.data.vertices:
    vertex.co = (vertex.co - horizontal) / height
source_triangles = sum(len(poly.vertices) - 2 for poly in o.data.polygons)
if source_triangles > 60000:
    decimate = o.modifiers.new('Web character triangle budget', 'DECIMATE')
    decimate.ratio = 60000 / source_triangles
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
texture = base_image(o)
texture_width, texture_height = texture.size
pixels = np.empty(texture_width * texture_height * 4, dtype=np.float32)
texture.pixels.foreach_get(pixels)
pixels = pixels.reshape((texture_height, texture_width, 4))
if 'rotation_z_degrees' not in config:
    first_eyes = detect_eyes(o)
    if sum(eye['center'][1] for eye in first_eyes) > 0:
        for vertex in o.data.vertices:
            vertex.co.x *= -1
            vertex.co.y *= -1
        yaw += 180
config['rotation_z_degrees'] = yaw
config['eyes'] = config.get('eyes') or detect_eyes(o)
eyes = config['eyes']
eye_z = sum(e['center'][2] for e in eyes) / 2
eye_x = sum(e['center'][0] for e in eyes) / 2
eye_ry = sum(e['radii'][1] for e in eyes) / 2
eye_rx = sum(e['radii'][0] for e in eyes) / 2
profile = []
for z in np.linspace(.49, min(.76, eye_z - eye_ry * 1.8), 80):
    points = [v.co for v in o.data.vertices if abs(v.co.z - z) < .008]
    if len(points) >= 10:
        # A-pose upper arms share the neck's height. Locate the central cross-
        # section separated by empty space from those arms before measuring it.
        xs = sorted(p.x for p in points)
        spans = [[xs[0]]]
        for x in xs[1:]:
            if x - spans[-1][-1] > .017:
                spans.append([])
            spans[-1].append(x)
        central = min(spans, key=lambda g: abs((g[0]+g[-1])/2-eye_x))
        if len(central) >= 8 and central[0] < eye_x < central[-1]:
            profile.append((central[-1] - central[0], float(z)))
automatic_cut = min(min(profile)[1] if profile else .61, eye_z-eye_ry*3.8)
head_cut = config.get('head_cut_z', automatic_cut)
config['head_cut_z'] = head_cut
config['head_height'] = config.get('head_height', 1.04)
config['mouth'] = config.get('mouth') or [eye_x, eye_z - eye_ry * 1.92]
mouth_x, mouth_z = config['mouth']
config['brow_z'] = config.get('brow_z', eye_z + eye_ry * 1.28)
skin_samples = []
for x in [eye_x - eye_rx * .4, eye_x, eye_x + eye_rx * .4]:
    for z in [eye_z + eye_ry * 1.70, eye_z + eye_ry * 1.95]:
        sampled = ray_color(o, x, z)
        if sampled is not None and sampled[0] > sampled[1] > sampled[2] and sampled[0] - sampled[2] > .08:
            skin_samples.append(sampled)
if config.get('skin_sample'):
    sampled = ray_color(o, *config['skin_sample'])
    if sampled is not None:
        skin_samples = [sampled]
skin_srgb = np.median(skin_samples, axis=0) if skin_samples else np.array([.76, .52, .33])
config['skin_color'] = '#' + ''.join(f'{round(float(v)*255):02x}' for v in skin_srgb)
skin_linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in skin_srgb]
# Source reference-matte fragments are folded into the existing local surface.
# This preserves the original connected sculpture, UV map and material primitive;
# deleting these faces instead would leave open ears and patches of missing scalp.
helper_spec = importlib.util.spec_from_file_location('tripo_fringe_cleanup', ROOT / 'scripts/tripo-fringe-cleanup.py')
helper = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(helper)
config['fringe_cleanup'] = helper.cleanup_fringe(o, ID, vertex_colors(o), pixels, skin_srgb)
if config['fringe_cleanup']['painted_triangles']:
    texture.pixels.foreach_set(pixels.ravel())
    texture.update()
    texture.pack()
for obsolete in ['ear_fringe_triangles_recolored', 'ear_fringe_triangles_removed', 'repair_ear_fringe', 'remove_colored_fringe']:
    config.pop(obsolete, None)
print('LANDMARKS', ID, json.dumps(config))
data = json.loads(LANDMARKS.read_text()) if LANDMARKS.exists() else {'_coordinates': 'Normalized full-body height 1; feet Z=0; front -Y; Blender axes.'}
data[ID] = config
LANDMARKS.write_text(json.dumps(data, indent=2) + '\n')

if args.inspect:
    scene, camera = setup_render()
    camera.location = (.05, -3, .65)
    camera.rotation_euler = (Vector((0, 0, .5)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 1.18
    scene.render.filepath = str(ART / 'source-front.png')
    bpy.ops.render.render(write_still=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type in ['CAMERA', 'LIGHT']:
            bpy.data.objects.remove(obj, do_unlink=True)

bm = bmesh.new()
bm.from_mesh(o.data)
# glTF duplicates vertices at UV seams. Join only coincident positions so smooth
# normals cross those seams, while retaining the independent UVs on each loop.
# Preserve the source winding: recalculating all normals on its open UV islands
# can turn individual cheek/eyebrow patches inside out.
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000002)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=.000001, plane_co=(0, 0, head_cut), plane_no=(0, 0, 1), clear_inner=True)
# Keep the neck stump, not the A-pose jacket shoulders at the same elevation.
jaw_base = eye_z-eye_ry*3.12
neck_radius = config.get('neck_radius', eye_rx*1.72)
bad=[]
for face in bm.faces:
    p=face.calc_center_median()
    if p.z>=jaw_base:
        continue
    allowed=neck_radius+(eye_rx*4.5-neck_radius)*smooth(head_cut,jaw_base,p.z)
    if abs(p.x-eye_x)>allowed:
        bad.append(face)
if bad:
    bmesh.ops.delete(bm,geom=bad,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
boundary = [e for e in bm.edges if e.is_boundary and all(v.co.z < head_cut + .002 for v in e.verts)]
if boundary:
    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
bmesh.ops.triangulate(bm,faces=list(bm.faces))
bm.to_mesh(o.data)
bm.free()
source = [v.co.copy() for v in o.data.vertices]
source_colors = vertex_colors(o)
low, high = bounds(o)
center = Vector(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2))
scale = config['head_height'] / (high[2] - low[2])
def transformed(p):
    return (Vector(p) - center) * scale
for vertex in o.data.vertices:
    vertex.co = transformed(vertex.co)

o.shape_key_add(name='Basis')
face_depth = max(e['center'][1] for e in eyes)
for name in ['Blink', 'Smile', 'JawOpen', 'BrowUp', 'Frown', 'LookLeft', 'LookRight', 'LookDown']:
    key = o.shape_key_add(name=name)
    key.value = 0
    for p0, color, target in zip(source, source_colors, key.data):
        p = p0.copy()
        front = 1 - smooth(face_depth + .035, face_depth + .13, p.y)
        if name == 'Blink':
            for eye in eyes:
                cx, cy, cz = eye['center']
                rx, rz = eye['radii']
                w = math.exp(-((p.x-cx)/(rx*.92))**4 - ((p.z-cz)/(rz*.80))**4) * (1-smooth(cy+.015,cy+.045,p.y))
                if ID in ['clive', 'doug']:
                    q = ((p.x-cx)/rx)**2 + ((p.z-cz)/rz)**2
                    # The dark raised rim is a rigid frame, not an eyelid. Keep
                    # the central pupil free to recede beneath the closing lid.
                    if np.mean(color) < .35 and q > .22:
                        w = 0
                p.y += min(rx*.66,.045) * w
        elif name.startswith('Look'):
            for eye in eyes:
                cx, cy, cz = eye['center']
                rx, rz = eye['radii']
                w = gaussian(p.x-cx,p.z-cz,rx*.48,rz*.50) * (1-smooth(cy+.012,cy+.040,p.y))
                if ID in ['clive', 'doug'] and np.mean(color) < .35 and ((p.x-cx)/rx)**2 + ((p.z-cz)/rz)**2 > .22:
                    w = 0
                if name == 'LookDown':
                    p.z -= rz*.13*w
                else:
                    p.x += rx*.13*w*(-1 if name == 'LookLeft' else 1)
        elif name == 'JawOpen':
            lip = (1-smooth(.001,eye_ry*.25,p.z-mouth_z))*gaussian(p.x-mouth_x,p.z-mouth_z,eye_rx*1.35,eye_ry*.9)*front
            lower = (1-smooth(mouth_z-eye_ry*.4,mouth_z+eye_ry*.25,p.z))*gaussian(p.x-mouth_x,p.z-mouth_z,eye_rx*2,eye_ry*1.1)*front
            p.z -= eye_ry*.42*max(lip,lower*.62)
            p.y += eye_ry*.05*lip
        elif name in ['Smile', 'Frown']:
            w = sum(gaussian(p.x-mouth_x-side*eye_rx*.85,p.z-mouth_z,eye_rx*.55,eye_ry*.45) for side in [-1,1])*front
            p.z += eye_ry*(.18 if name=='Smile' else -.14)*w
            if name == 'Smile':
                p.x += math.copysign(eye_rx*.055*w,p.x-mouth_x)
        elif name == 'BrowUp':
            w = sum(gaussian(p.x-e['center'][0],p.z-config['brow_z'],e['radii'][0]*1.2,eye_ry*.4) for e in eyes)*front
            if ID in ['clive', 'doug'] and p.z < eye_z + eye_ry*.9 and np.mean(color) < .35:
                w = 0
            p.z += eye_ry*.21*w
        target.co = transformed(p)
for polygon in o.data.polygons:
    polygon.use_smooth = True
if o.data.has_custom_normals:
    # Imported split normals describe the source topology. Zero custom vectors
    # request Blender's freshly averaged normals after cutting/decimation.
    o.data.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(o.data.loops))
for m in o.data.materials:
    bs = m.node_tree.nodes.get('Principled BSDF')
    for socket, value in [('Roughness', .8), ('Metallic', 0)]:
        for link in list(bs.inputs[socket].links):
            m.node_tree.links.remove(link)
        bs.inputs[socket].default_value = value
    for node in m.node_tree.nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = .3

# Fit each original white eye's curved depth. Pupils and frame/skin pixels are
# excluded so the new closing lid does not reproduce a raised pupil-shaped bump.
uvdata = o.data.uv_layers.active.data
fits = []
for eye in eyes:
    cx, cy, cz = eye['center']
    rx, rz = eye['radii']
    rows, depths = [], []
    for i, loop in enumerate(o.data.loops):
        p = source[loop.vertex_index]
        dx, dz = p.x-cx, p.z-cz
        if (dx/rx)**2+(dz/rz)**2 > 1.20 or p.y > cy+.06:
            continue
        color = sample_uv(uvdata[i].uv)
        if min(color) < config.get('eye_whiteness', .68) or max(color)-min(color) > .16:
            continue
        rows.append([1,dx,dz,dx*dx,dz*dz,dx*dz])
        depths.append(p.y)
    if len(rows) < 20:
        raise ValueError(f'Not enough white eye samples at {eye}; revise landmarks before exporting.')
    fits.append(np.linalg.lstsq(np.array(rows), np.array(depths), rcond=None)[0])

skin = material(f'{ID}_eyelid_skin', skin_linear)
crease = material('Eyelid_crease', [v*.13 for v in skin_linear], .9)
frame_tree = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get()) if ID in ['clive', 'doug'] else None
frame_depths = {}
objects = [o]
for side, (eye, coefficients) in enumerate(zip(eyes, fits)):
    cx, cy, cz = eye['center']
    rx, rz = eye['radii']
    rx *= config.get('lid_padding', 1.045)
    rz *= config.get('lid_padding', 1.045)
    def surface(x, z, offset=.020):
        dx, dz = x-cx, z-cz
        y = float(np.dot(coefficients,[1,dx,dz,dx*dx,dz*dz,dx*dz]))-offset/scale
        point = transformed((x,y,z))
        # Eyelids pass behind spectacles, including their thick curved lower
        # rims. Restrict this to the outer eye so dark pupils remain covered.
        if frame_tree is not None and (dx/rx)**2+(dz/rz)**2 > .62:
            cache_key = (round(x,8),round(z,8))
            if cache_key not in frame_depths:
                hit, normal, index, distance = frame_tree.ray_cast(Vector((point.x,-3,point.z)),Vector((0,1,0)),6)
                depth = None
                if hit is not None:
                    poly = o.data.polygons[index]
                    uv = sum((uvdata[i].uv for i in poly.loop_indices),Vector((0,0)))/len(poly.loop_indices)
                    if np.mean(sample_uv(uv)) < .45:
                        depth = hit.y+.007
                frame_depths[cache_key] = depth
            if frame_depths[cache_key] is not None:
                point.y = max(point.y,frame_depths[cache_key])
        return point
    for upper in [True, False]:
        rest, closed, faces = [], [], []
        nx, ny = 40, 12
        for row in range(ny+1):
            t = row/ny
            for i in range(nx+1):
                u = -1+2*i/nx
                x = cx+rx*u
                edge = cz+rz*math.sqrt(max(0,1-u*u))*(1 if upper else -1)
                rest.append(surface(x,edge))
                closed.append(surface(x,edge*(1-t)+cz*t))
        for row in range(ny):
            for i in range(nx):
                a = row*(nx+1)+i
                face = (a,a+1,a+nx+2,a+nx+1)
                faces.append(tuple(reversed(face)) if upper else face)
        lid = mesh_object(('Upper' if upper else 'Lower')+'_lid_'+('L' if side==0 else 'R'),rest,faces,skin)
        lid.shape_key_add(name='Basis')
        key = lid.shape_key_add(name='Blink')
        key.value = 0
        for p, vertex in zip(closed,key.data):
            vertex.co = p
        objects.append(lid)
    rest, closed, faces = [], [], []
    for i in range(25):
        u = -1+2*i/24
        x = cx+rx*.83*u
        z = cz+rz*.055*u*u
        for sign in [-1,1]:
            p = surface(x,z+sign*.0007,.026)
            closed.append(p)
            q = p.copy()
            q.y += .065
            rest.append(q)
    for i in range(24):
        a=i*2
        faces.append((a,a+2,a+3,a+1))
    line = mesh_object('Closed_lid_line_'+str(side),rest,faces,crease)
    line.shape_key_add(name='Basis')
    key = line.shape_key_add(name='Blink')
    key.value = 0
    for p, vertex in zip(closed,key.data):
        vertex.co = p
    line['blink_reveal'] = .86
    objects.append(line)

o['character_id'] = ID
o['model_pipeline'] = 'Tripo H3.1 / Blender prepared'
o['source_file'] = f'{ID}-original.glb'
o['source_sha256'] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
o['source_triangles'] = source_triangles
o['facial_rig'] = 'sculpt-morphs-v1'
o['skin_color'] = config['skin_color']
o['fringe_cleanup'] = config['fringe_cleanup']
o['source_winding_preserved'] = True
# Browser texture budgets apply only to derived exports. Immutable originals
# retain their full-resolution maps for future editing or higher-detail builds.
for image in bpy.data.images:
    if image.type != 'IMAGE' or not image.size[0]:
        continue
    limit = 2048 if image == texture else 1024
    width, height = image.size
    if max(width, height) > limit:
        ratio = limit / max(width, height)
        image.scale(max(1, round(width*ratio)), max(1, round(height*ratio)))
        image.pack()
for ob in bpy.context.scene.objects:
    ob.select_set(ob in objects)
bpy.context.view_layer.objects.active = o
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{ID}-head.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=True,export_tangents=True,export_extras=True,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90,export_image_quality=90)
for obj in list(bpy.context.scene.objects):
    if obj not in objects:
        bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'assets/tripo/{ID}-head.blend'))
print('CAST_HEAD_READY', ID, sum(len(p.vertices)-2 for p in o.data.polygons), config['skin_color'])
if not args.no_render:
    scene, camera = setup_render()
    for pose, values in [('rest',{}),('blink',{'Blink':1}),('speech',{'JawOpen':.85,'BrowUp':.3}),('laugh',{'Smile':1,'JawOpen':.3})]:
        for obj in objects:
            for key in obj.data.shape_keys.key_blocks:
                key.value = values.get(key.name,0)
            obj.hide_render = bool(obj.get('blink_reveal') and values.get('Blink',0) < obj['blink_reveal'])
        scene.render.filepath=str(ART/f'head-{pose}.png')
        bpy.ops.render.render(write_still=True)
    for obj in objects:
        for key in obj.data.shape_keys.key_blocks:
            key.value = 0
        obj.hide_render = bool(obj.get('blink_reveal'))
    camera.location = (1.55,-2.9,.08)
    camera.rotation_euler = (-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(ART/'head-angle.png')
    bpy.ops.render.render(write_still=True)
