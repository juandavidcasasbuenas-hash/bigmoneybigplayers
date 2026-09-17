"""Prepare an untouched-orientation-independent Tripo input for game rigging."""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/tripo/source/juan-original.glb'))
o=next(o for o in bpy.context.scene.objects if o.type=='MESH');o.name='Juan_source'
bpy.context.view_layer.objects.active=o;o.matrix_world=Matrix.Rotation(-math.pi/2,4,'Z')@o.matrix_world
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
original=len(o.data.polygons)
m=o.modifiers.new('Browser geometry budget','DECIMATE');m.ratio=60000/original;m.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=m.name)
for p in o.data.polygons:p.use_smooth=True
print('BUDGET',original,len(o.data.polygons),len(o.data.vertices))
print('BOUNDS',[(i,min(v.co[i] for v in o.data.vertices),max(v.co[i] for v in o.data.vertices)) for i in range(3)])
for z in [-.45,-.35,-.25,-.15,-.05,.05,.10,.15,.25,.35,.45]:
 vs=[v.co for v in o.data.vertices if abs(v.co.z-z)<.008]
 if vs:print('SLICE',z,len(vs),[(i,round(min(p[i] for p in vs),4),round(max(p[i] for p in vs),4)) for i in [0,1]])
# Inspection only: mesh islands after welding UV seam duplicates.
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
seen=set();islands=[]
for v in bm.verts:
 if v in seen:continue
 stack=[v];seen.add(v);group=[]
 while stack:
  w=stack.pop();group.append(w)
  for e in w.link_edges:
   u=e.other_vert(w)
   if u not in seen:seen.add(u);stack.append(u)
 if len(group)>10:islands.append({'count':len(group),'bounds':[(round(min(v.co[i] for v in group),4),round(max(v.co[i] for v in group),4)) for i in range(3)]})
print('ISLANDS',json.dumps(sorted(islands,key=lambda p:-p['count'])[:30]));bm.free()
for image in bpy.data.images:
 if image.type=='IMAGE':image.pack()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/tripo/juan-decimated.blend'))
# A correctly oriented full-body diagnostic.
target=Vector((0,0,0))
for loc,energy,size in [((-2,-4,4),450,4),((3,-1,1.5),230,3),((0,3,3),300,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.render.resolution_x=850;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.world.color=(.19,.19,.19);s.view_settings.view_transform='AgX'
for name,axis in [('front',(0,-3,.1)),('angle',(1.5,-3,.2))]:
 bpy.ops.object.camera_add(location=axis);cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.2;s.camera=cam;s.render.filepath=str(ROOT/'artifacts/tripo'/('decimated-'+name+'.png'));bpy.ops.render.render(write_still=True)
