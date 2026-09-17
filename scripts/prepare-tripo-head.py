"""Preserve Juan's Tripo sculpt/UVs, add non-destructive cartoon facial shape keys."""
import bpy,bmesh,math,json
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/models/tripo';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/tripo/juan-decimated.blend'))
o=bpy.data.objects['Juan_source'];o.name='Face'
bpy.context.view_layer.objects.active=o
bm=bmesh.new();bm.from_mesh(o.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,.098),plane_no=(0,0,1),clear_inner=True)
# Neck seam sits inside the live body's collar.
boundary=[e for e in bm.edges if e.is_boundary and all(v.co.z<.100 for v in e.verts)]
if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
# UV seams retain their per-corner coordinates, while coincident geometry is
# welded so subdivision and vertex normals agree across those seams.
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00003)
bm.to_mesh(o.data);bm.free()
if 'custom_normal' in o.data.attributes:
 o.data.attributes.remove(o.data.attributes['custom_normal'])
for edge in o.data.edges:edge.use_edge_sharp=False

# Decimation left large triangles between the brows and forehead. Their smooth
# vertex normals still produced broad triangular highlights under game lighting.
# A temporary Catmull-Clark surface supplies curvature only to the frontal face;
# hair and the outside silhouette keep their existing geometry/budget.
reference=o.copy();reference.data=o.data.copy()
bpy.context.collection.objects.link(reference)
bpy.context.view_layer.objects.active=reference
sub=reference.modifiers.new('Smooth facial reference','SUBSURF')
sub.levels=1;sub.render_levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
smooth_surface=BVHTree.FromObject(reference,bpy.context.evaluated_depsgraph_get())
def facial_region(p):
 return -.155<p.x<.12 and -.18<p.y<-.055 and .185<p.z<.395
bm=bmesh.new();bm.from_mesh(o.data)
facial_edges=[edge for edge in bm.edges if all(facial_region(v.co) for v in edge.verts)]
bmesh.ops.subdivide_edges(bm,edges=facial_edges,cuts=1,smooth=0,use_grid_fill=True)
for v in bm.verts:
 if facial_region(v.co):
  nearest,_,_,distance=smooth_surface.find_nearest(v.co)
  # Restrict movement to the local surface, never another nearby facial feature.
  if nearest is not None and distance<.006:v.co=nearest
bm.to_mesh(o.data);bm.free()
bpy.data.objects.remove(reference,do_unlink=True)
bpy.context.view_layer.objects.active=o
source=[v.co.copy() for v in o.data.vertices]
center=Vector((-.065,.065,.29));scale=2.7
for v in o.data.vertices:v.co=(v.co-center)*scale
# All key deformation is authored on the actual supplied sculpt and UV topology.
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def g(x,y,sx,sy):return math.exp(-(x/sx)**2-(y/sy)**2)
eyes=[Vector((-.069,-.110,.245)),Vector((.042,-.078,.246))]
o.shape_key_add(name='Basis')
for name in ['Blink','Smile','JawOpen','BrowUp','Frown','LookLeft','LookRight','LookDown']:
 key=o.shape_key_add(name=name);key.value=0
 for v,s,kv in zip(o.data.vertices,source,key.data):
  p=s.copy();front=1-smooth(-.055,.035,p.y)
  if name=='Blink':
   # Recess the generated protruding pupils beneath the closing lids, without
   # pulling forehead/brow loops down or stretching their texture.
   for eye in eyes:
    dx=p.x-eye.x;dz=p.z-eye.z
    w=math.exp(-(dx/.051)**4-(dz/.035)**4)*(1-smooth(eye.y+.020,eye.y+.050,p.y))
    p.y+=.034*w
  elif name in ['LookLeft','LookRight','LookDown']:
   for eye in eyes:
    dx=p.x-eye.x;dy=p.z-eye.z;w=g(dx,dy,.027,.029)*(1-smooth(eye.y+.010,eye.y+.040,p.y))
    if name=='LookDown':p.z-=.007*w
    else:
     shift=.007*w*(-1 if name=='LookLeft' else 1);p.x+=shift;p.y+=shift*.31
  elif name=='JawOpen':
   x=p.x+.014;z=p.z-.158
   lip=(1-smooth(.001,.014,z))*g(x,z,.065,.047)*front
   lower=(1-smooth(.13,.17,p.z))*g(p.x+.035,p.z-.14,.11,.05)*front
   p.z-=.022*max(lip,lower*.62);p.y+=.003*lip
  elif name=='Smile':
   w=(g(p.x+.063,p.z-.158,.027,.019)+g(p.x-.023,p.z-.166,.027,.019))*front
   p.z+=.009*w;p.x+=math.copysign(.003*w,p.x+.020)
  elif name=='BrowUp':
   w=(g(p.x+.074,p.z-.314,.062,.021)+g(p.x-.038,p.z-.321,.059,.021))*front
   p.z+=.011*w
  elif name=='Frown':
   w=(g(p.x+.064,p.z-.158,.029,.023)+g(p.x-.023,p.z-.165,.028,.023))*front;p.z-=.007*w
  kv.co=(p-center)*scale
for p in o.data.polygons:p.use_smooth=True
# The generated normal map is retained at a gentler strength so decimation
# does not amplify small tangent changes into shiny facets on cartoon skin.
for mat in o.data.materials:
 bs=mat.node_tree.nodes.get('Principled BSDF')
 for socket,value in [('Roughness',.8),('Metallic',0)]:
  for link in list(bs.inputs[socket].links):mat.node_tree.links.remove(link)
  bs.inputs[socket].default_value=value
 for node in mat.node_tree.nodes:
  if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.3
# Generated topology has arbitrary loops: folding those loops crushes the brows.
# Author two real surface-following eyelids per eye instead. Their rest pose is
# collapsed at the rim; Blink expands them to meet over the supplied white eye.
tree=BVHTree.FromObject(o,bpy.context.evaluated_depsgraph_get())
def front(x,z,offset=.024):
 cx,cz,coef=min(eye_fits,key=lambda item:abs(item[0]-x))
 dx=x-cx;dz=z-cz
 y=float(np.dot(coef,[1,dx,dz,dx*dx,dz*dz,dx*dz]))-offset/scale
 return (Vector((x,y,z))-center)*scale
skin=bpy.data.materials.new('Juan_eyelid_skin');skin.use_nodes=True
bs=skin.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.67,.39,.18,1);bs.inputs['Roughness'].default_value=.82
# Sample the actual diffuse complexion at a clear point on the forehead.
texture=next(im for im in bpy.data.images if im.name.startswith('Color_'));tw,th=texture.size;pixels=list(texture.pixels)
pt=(Vector((-.034,-.4,.356))-center)*scale
hit,normal,idx,_=tree.ray_cast(pt,Vector((0,1,0)),3)
if idx is not None:
 poly=o.data.polygons[idx];uv=sum((o.data.uv_layers.active.data[i].uv for i in poly.loop_indices),Vector((0,0)))/len(poly.loop_indices)
 off=(min(th-1,max(0,int(uv.y*th)))*tw+min(tw-1,max(0,int(uv.x*tw))))*4
 # Imported image pixels are sRGB data; material values are scene-linear.
 col=pixels[off:off+3];linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in col]
 bs.inputs['Base Color'].default_value=(*linear,1)
# Fit the smooth white surface, excluding dark pupil protrusions. This keeps
# closed lids smooth instead of reproducing two raised bumps under the skin.
eye_fits=[]
uvdata=o.data.uv_layers.active.data
for cx,cz in [(-.069,.245),(.042,.246)]:
 rows=[];depths=[]
 for li,loop in enumerate(o.data.loops):
  p=source[loop.vertex_index];dx=p.x-cx;dz=p.z-cz
  if (dx/.050)**2+(dz/.050)**2>1.15 or p.y>-.035:continue
  u,v=uvdata[li].uv;off=(min(th-1,max(0,int(v*th)))*tw+min(tw-1,max(0,int(u*tw))))*4;col=pixels[off:off+3]
  if min(col)<.68 or max(col)-min(col)>.12:continue
  rows.append([1,dx,dz,dx*dx,dz*dz,dx*dz]);depths.append(p.y)
 coef=np.linalg.lstsq(np.array(rows),np.array(depths),rcond=None)[0];eye_fits.append((cx,cz,coef))
objects=[o]
for side,(cx,cz,rx,ry) in enumerate([(-.069,.245,.055,.053),(.042,.246,.052,.053)]):
 for upper in [True,False]:
  basis=[];closed=[];faces=[];nx=48;ny=16
  for row in range(ny+1):
   t=row/ny
   for i in range(nx+1):
    u=-1+2*i/nx;x=cx+rx*u;height=ry*math.sqrt(max(0,1-u*u));edge=cz+height*(1 if upper else -1)
    basis.append(front(x,edge));closed.append(front(x,edge*(1-t)+cz*t))
  for row in range(ny):
   for i in range(nx):
    a=row*(nx+1)+i;face=(a,a+1,a+nx+2,a+nx+1)
    faces.append(tuple(reversed(face)) if upper else face)
  mesh=bpy.data.meshes.new('Eyelid');mesh.from_pydata(basis,[],faces);mesh.update();lid=bpy.data.objects.new(('Upper' if upper else 'Lower')+'_lid_'+('L' if side==0 else 'R'),mesh);bpy.context.collection.objects.link(lid);mesh.materials.append(skin)
  for poly in mesh.polygons:poly.use_smooth=True
  lid.shape_key_add(name='Basis');key=lid.shape_key_add(name='Blink');key.value=0
  for v,p in zip(key.data,closed):v.co=p
  lid['character_id']='juan';lid['facial_rig']='sculpt-morphs-v1';objects.append(lid)
# The meeting edge reads as a closed eyelid, rather than a blank eye-shaped pad.
crease_mat=bpy.data.materials.new('Eyelid_crease');crease_mat.use_nodes=True;crease_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.14,.063,.026,1);crease_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
for side,(cx,cz) in enumerate([(-.069,.245),(.042,.246)]):
 verts=[];target=[];faces=[]
 for i in range(25):
  u=-1+2*i/24;x=cx+.044*u;z=cz+.003*u*u
  for sign in [-1,1]:
   p=front(x,z+sign*.0007,.029);target.append(p);q=p.copy();q.y+=.065;verts.append(q)
 for i in range(24):a=i*2;faces.append((a,a+2,a+3,a+1))
 mesh=bpy.data.meshes.new('Closed_lid_line');mesh.from_pydata(verts,[],faces);mesh.update();line=bpy.data.objects.new('Closed_lid_line_'+str(side),mesh);bpy.context.collection.objects.link(line);mesh.materials.append(crease_mat);line.shape_key_add(name='Basis');k=line.shape_key_add(name='Blink');k.value=0
 for v,p in zip(k.data,target):v.co=p
 line['character_id']='juan';line['blink_reveal']=.86;objects.append(line)
o['character_id']='juan';o['model_pipeline']='Tripo H3.1 / Blender prepared';o['source_triangles']=1490702;o['facial_rig']='sculpt-morphs-v1';o['source_file']='juan-original.glb'
triangle_count=0
for obj in objects:
 obj.data.calc_loop_triangles();triangle_count+=len(obj.data.loop_triangles)
assert triangle_count<=45000, f'Juan head exceeds geometry budget: {triangle_count}'
o['surface_refinement']='Local face subdivision projected to Catmull-Clark reference'
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'juan-head.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=True,export_morph_normal=True,export_extras=True,export_yup=True,export_image_format='AUTO')
for ob in list(bpy.context.scene.objects):
 if ob not in objects:bpy.data.objects.remove(ob,do_unlink=True)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/tripo/juan-head.blend'))
print('HEAD_READY',len(o.data.polygons),len(o.data.vertices),list(o.data.shape_keys.key_blocks.keys()))
# Diagnostic renders include real extreme morph poses, not just the rest mesh.
for pos,energy,size in [((-2,-4,4),450,4),((3,-1,1.5),230,3),((0,3,3),300,3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.1,-3.1,.12));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.50;s=bpy.context.scene;s.camera=cam;s.render.engine='CYCLES';s.cycles.samples=24;s.render.resolution_x=700;s.render.resolution_y=800;s.render.resolution_percentage=100;s.world.color=(.18,.18,.18);s.view_settings.view_transform='AgX'
for pose,values in [('rest',{}),('blink',{'Blink':1}),('speech',{'JawOpen':.85,'BrowUp':.3}),('laugh',{'Smile':1,'JawOpen':.3})]:
 for obj in objects:
  for name in obj.data.shape_keys.key_blocks.keys():obj.data.shape_keys.key_blocks[name].value=values.get(name,0)
 s.render.filepath=str(ROOT/'artifacts/tripo'/('head-'+pose+'.png'));bpy.ops.render.render(write_still=True)
