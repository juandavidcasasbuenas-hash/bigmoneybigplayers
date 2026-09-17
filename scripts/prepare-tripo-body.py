"""Build tailored continuous poker bodies matching the Tripo cast references.

The heads use the supplied/generated Tripo meshes. Bodies deliberately reuse the
proven Quaternius CC0 weighted surface: the raw Juan generation fused hands and
microphone into its shirt. Blender tailoring/materials match each reference while
preserving continuous shoulders, exact contact bones, hands and shoe attachments.

Blender --background --python scripts/prepare-tripo-body.py -- --character jack clive
Omit --character to rebuild Juan only. Existing files for unselected IDs are untouched.
"""
import argparse, bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
CONFIG={c['id']:c for c in json.loads((ROOT/'assets/blender/characters.json').read_text())}
CONFIG['dealer']={'id':'dealer','name':'Monty','skin':'#d5ac80'}
LOOKS={
 'juan':dict(kind='shirt',cloth='#354158',pants='#292b2d'),
 'jack':dict(kind='shirt',cloth='#244750',pants='#292b2e'),
 'clive':dict(kind='shirt',cloth='#f1eeea',pants='#303238'),
 'doug':dict(kind='hoodie',cloth='#96999d',pants='#303236',inner='#237dbb'),
 'nat':dict(kind='suit',cloth='#35405c',pants='#35405c',inner='#f0e9dd'),
 'tian':dict(kind='tee',cloth='#56647d',pants='#364e6a'),
 'humfrey':dict(kind='shirt',cloth='#95b5df',pants='#303034'),
 'diego':dict(kind='suit',cloth='#71747c',pants='#71747c',inner='#f0edeb'),
 'dealer':dict(kind='vest',cloth='#712c3d',pants='#2b2a2f',inner='#ede5d7'),
}
parser=argparse.ArgumentParser();parser.add_argument('--character',nargs='+',choices=list(LOOKS),default=['juan']);parser.add_argument('--no-render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
def V(p):return Vector((p[0],-p[2],p[1]))
def G(p):return Vector((p.x,p.z,-p.y))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4

def rgb(h):return tuple(linear(int(h[i:i+2],16)/255) for i in [1,3,5])
def material(name,colour,rough=.88,metal=0):
    colour=rgb(colour) if isinstance(colour,str) else colour
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*colour,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*colour,1);return m

def source_navy():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/tripo/juan-decimated.blend'))
    ref=bpy.data.objects['Juan_source'];mat=ref.data.materials[0]
    image=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Color' in n.image.name)
    pixels=list(image.pixels);width,height=image.size[:];uvs=ref.data.uv_layers.active.data;swatches=[]
    for poly in ref.data.polygons:
        p=G(poly.center)
        if not (.00<p.x<.09 and -.23<p.y<-.04 and .0<p.z<.11):continue
        uv=sum((uvs[i].uv for i in poly.loop_indices),Vector((0,0)))/len(poly.loop_indices)
        x=min(width-1,max(0,int(uv.x*width)));y=min(height-1,max(0,int(uv.y*height)));i=(y*width+x)*4;c=pixels[i:i+3]
        if c[2]>c[0]*1.06 and c[2]>c[1]*.96:swatches.append(c)
    assert swatches,'Source navy cloth region was not found'
    return tuple(linear(sorted(c[k] for c in swatches)[len(swatches)//2]) for k in range(3))

for cid in args.character:
    c=CONFIG[cid];look=LOOKS[cid];kind=look['kind'];navy=source_navy() if cid=='juan' else rgb(look['cloth'])
    for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
    with bpy.data.libraries.load(str(ROOT/'assets/blender/club-body.blend'),link=False) as (available,loaded):loaded.objects=list(available.objects)
    arm=next(o for o in loaded.objects if o and o.type=='ARMATURE');body=next(o for o in loaded.objects if o and o.name.startswith('Tailored_body'))
    inherited=[]
    for ob in loaded.objects:
        if not ob:continue
        retain=(kind=='suit' and ob.name.startswith(('Lapel','Jacket_seam','Brass_button'))) or (kind=='hoodie' and ob.name.startswith('Hood_')) or (kind=='vest' and ob.name.startswith('Dealer_bow'))
        if ob in [arm,body] or retain:
            bpy.context.collection.objects.link(ob)
            if retain:inherited.append(ob)
        else:bpy.data.objects.remove(ob,do_unlink=True)
    arm.name=cid+'_contact_skeleton';arm.data.pose_position='REST';body.name=cid+'_continuous_body';body.parent=arm
    # The source crop ended 0.10 units above the contact ankle. Extend only the
    # lower trouser cloth into the separate shoe; preserve all bones and weights.
    for vertex in body.data.vertices:
        t=max(0,min(1,(-.22-vertex.co.z)/.11))
        vertex.co.z-=.095*t*t*(3-2*t)
    # Explicit seam loops prevent whole-triangle material assignment from making
    # ragged hems/cuffs. BMesh interpolates the existing skin weights at each cut.
    bm=bmesh.new();bm.from_mesh(body.data)
    planes=[((0,0,1.015),(0,0,1)),((0,0,1.78),(0,0,1))]
    cuts=[.18,1.30]+([.74] if kind=='tee' else [.36] if kind=='vest' else [])
    for x in cuts:
        for sign in [-1,1]:planes.append(((sign*x,0,0),(1,0,0)))
    for point,normal in planes:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=point,plane_no=normal)
    bm.to_mesh(body.data);bm.free();body.data.update()
    for poly in body.data.polygons:
        p=G(poly.center)
        poly.material_index=2 if p.y>1.78 and abs(p.x)<.18 else 1 if p.y<1.015 else 3 if abs(p.x)>1.30 else 0
    shirt=material(cid+'_cloth',navy);pants=material(cid+'_trousers',look['pants'],.93);skin=material(cid+'_skin',c['skin'],.82)
    inner=material(cid+'_inner',look.get('inner',look['cloth']));edge=material(cid+'_edge',tuple(v*.87 for v in navy))
    cream=material(cid+'_cotton','#ede7de');buttons=material(cid+'_buttons','#d8d7d1' if cid in ['clive','humfrey'] else '#26292e',.52)
    for i,m in enumerate(list(body.data.materials)):
        body.data.materials[i]=pants if m.name=='Trousers' else skin if m.name=='Skin' else inner if m.name=='Cuff' and kind=='suit' else shirt
    if kind in ['tee','vest']:
        slot=len(body.data.materials);body.data.materials.append(skin if kind=='tee' else inner)
        for poly in body.data.polygons:
            p=G(poly.center)
            if p.y>1.35 and abs(p.x)>(.74 if kind=='tee' else .36):poly.material_index=slot
    for poly in body.data.polygons:poly.use_smooth=True
    body['asset_source']='Quaternius CC0 continuous skinned body; Blender tailoring matches character reference'
    body['source_reference']='assets/tripo/references/'+cid+'.png' if cid!='juan' else 'assets/tripo/source/juan-original.glb'
    body['rig_version']='contact-v1';arm['rig_version']='contact-v1';exports=[body,arm,*inherited]
    for ob in inherited:
        for i,m in enumerate(list(ob.data.materials)):
            ob.data.materials[i]=inner if ob.name.startswith('Shirt_front') else cream if ob.name.startswith('Hood_drawstring') else buttons if ob.name.startswith(('Brass_button','Dealer_bow')) else edge if ob.name.startswith('Jacket_seam') else shirt

    # Fitted details stay under the same torso transform as the continuous skin.
    bvh=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons])
    def front(x,y,fallback=.2,offset=.012):
        hit=bvh.ray_cast(Vector((x,-4,y)),Vector((0,1,0)),8)[0]
        return -hit.y+offset if hit else fallback
    def bind(ob,bone='spine_03'):
        g=ob.vertex_groups.new(name=bone);g.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        ob.parent=arm;m=ob.modifiers.new('Contact pose skin','ARMATURE');m.object=arm;exports.append(ob)
        for poly in ob.data.polygons:poly.use_smooth=True
    def panel(name,points,mat,thickness=.016):
        points=[(x,y,front(x,y,z,.023)) for x,y,z in points]
        mesh=bpy.data.meshes.new(cid+'_'+name);mesh.from_pydata([V(p) for p in points],[],[tuple(range(len(points)))]);mesh.update()
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=5,use_grid_fill=True)
        for v in bm.verts:
            p=G(v.co);v.co=V((p.x,p.y,front(p.x,p.y,p.z,.023)))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        ob=bpy.data.objects.new(cid+'_'+name,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(mat)
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        m=ob.modifiers.new('Fabric thickness','SOLIDIFY');m.thickness=thickness;bpy.ops.object.modifier_apply(modifier=m.name)
        m=ob.modifiers.new('Soft fabric edges','BEVEL');m.width=.008;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
        bind(ob);return ob
    def tube(name,points,radius,mat,bone='spine_03',fitted=True,offset=.026):
        curve=bpy.data.curves.new(cid+'_'+name,'CURVE');curve.dimensions='3D';curve.resolution_u=4;curve.bevel_depth=radius;curve.bevel_resolution=2
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
        for b,(x,y,z) in zip(spline.bezier_points,points):b.co=V((x,y,front(x,y,z,offset) if fitted else z));b.handle_left_type='AUTO';b.handle_right_type='AUTO'
        ob=bpy.data.objects.new(cid+'_'+name,curve);bpy.context.collection.objects.link(ob);curve.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');bind(ob,bone)
    def bead(name,p,scale,mat):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=V(p));ob=bpy.context.object;ob.name=cid+'_'+name;ob.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(mat);bind(ob);return ob

    if kind in ['shirt','suit','vest']:
        collar=inner if kind in ['suit','vest'] else material(cid+'_collar',tuple(v*.91 for v in navy))
        for sign in [-1,1]:
            points=[(sign*x,y,z) for x,y,z in [(.035,1.79,.20),(.18,1.83,.17),(.30,1.69,.275),(.15,1.625,.307),(.09,1.735,.29)]]
            if sign>0:points.reverse()
            panel('collar_'+str(sign),points,collar,.022)
        if kind!='suit':
            for i,y in enumerate([1.13,1.30,1.45] if kind=='vest' else [1.17,1.355,1.54]):bead('shirt_button_'+str(i),(0,y,front(0,y,.33,.013)),(.017,.020,.010),buttons)
    if kind=='suit':
        panel('open_shirt',[(-.16,1.79,.2),(.16,1.79,.2),(.11,1.54,.3),(0,1.24,.3),(-.11,1.54,.3)],inner,.012)
        for sign in [-1,1]:
            panel('pocket_'+str(sign),[(sign*.14,1.25,.3),(sign*.28,1.25,.3),(sign*.275,1.19,.3),(sign*.14,1.19,.3)],edge,.016)
        if cid=='nat':
            gold=material(cid+'_lapel_pin','#c6ae6b',.38,.35)
            tube('lapel_pin',[(.24,1.615,.3),(.28,1.59,.3)],.009,gold,offset=.06)
    if kind=='hoodie':
        panel('blue_tee_inset',[(-.14,1.80,.2),(.14,1.80,.2),(0,1.55,.3)],inner,.014)
        zipper=material(cid+'_zipper','#656a72',.5,.25)
        tube('zipper',[(0,y,.3) for y in [1.035,1.22,1.40,1.57]],.007,zipper)
        bead('zip_pull',(0,1.535,front(0,1.535,.3,.045)),(.012,.031,.012),zipper)
        for sign in [-1,1]:tube('pocket_seam_'+str(sign),[(sign*.05,1.09,.3),(sign*.26,1.09,.3),(sign*.26,1.25,.3),(sign*.08,1.27,.3)],.006,edge)
    if kind=='tee':
        tube('crew_neck',[(.21*math.sin(i/24*math.tau),1.78,-.02+.17*math.cos(i/24*math.tau)) for i in range(25)],.024,edge,fitted=False)
        # A fitted band masks the material transition without cutting the arm skin.
        for sign,side in [(-1,'r'),(1,'l')]:
            verts=[];faces=[];n=32
            for x in [sign*.721,sign*.751]:
                for i in range(n):
                    a=i/n*math.tau;direction=V((0,math.cos(a),math.sin(a)));origin=V((x,1.70,.055));hit,normal,_,_=bvh.ray_cast(origin,direction,.35)
                    verts.append((hit+normal*.008) if hit else origin+direction*.12)
            for i in range(n):
                f=(i,(i+1)%n,(i+1)%n+n,i+n);faces.append(f if sign>0 else tuple(reversed(f)))
            mesh=bpy.data.meshes.new(cid+'_sleeve_band');mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(cid+'_sleeve_band_'+side,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(edge);bind(ob,'upperarm_'+side)
    if kind=='vest':
        panel('cream_shirt_v',[(-.17,1.79,.2),(.17,1.79,.2),(.10,1.62,.3),(0,1.51,.3),(-.10,1.62,.3)],inner,.012)
        for sign in [-1,1]:tube('waistcoat_pocket_'+str(sign),[(sign*.16,1.19,.3),(sign*.33,1.19,.3)],.011,edge)
    if cid in ['clive','humfrey']:
        belt=material(cid+'_belt','#252527',.86);metal=material(cid+'_buckle','#a6a7a5',.38,.6)
        tube('belt',[(x,1.065,.3) for x in [-.33,-.16,0,.16,.33]],.027,belt)
        for x in [-.045,.045]:tube('buckle_side',[(x,1.038,.3),(x,1.09,.3)],.007,metal,offset=.06)
        for y in [1.038,1.09]:tube('buckle_edge',[(-.045,y,.3),(.045,y,.3)],.007,metal,offset=.06)

    # Validate the continuous skin and its original contact skeleton remain bound.
    assert len(body.data.vertices)>14000
    assert all(v.groups for v in body.data.vertices),'Unweighted body vertex'
    assert all(math.isfinite(value) for v in body.data.vertices for value in v.co)
    assert any(m.type=='ARMATURE' and m.object==arm for m in body.modifiers)
    for ob in exports:
        if ob.type=='MESH':
            assert all(v.groups for v in ob.data.vertices),ob.name+' has unweighted vertices'
            assert any(m.type=='ARMATURE' and m.object==arm for m in ob.modifiers),ob.name+' lost its skin modifier'
    body['validation']='Continuous shared skin preserved; weighted vertices and exact contact skeleton checked'
    bpy.data.orphans_purge(do_recursive=True);bpy.context.preferences.filepaths.save_version=0
    output=ROOT/'public/models/tripo'/f'{cid}-body.glb';blend=ROOT/'assets/tripo'/f'{cid}-body.blend';output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.object.select_all(action='DESELECT')
    for ob in exports:ob.select_set(True)
    bpy.context.view_layer.objects.active=body
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_skins=True,export_animations=False,export_extras=True,export_yup=True,export_materials='EXPORT')
    print('BODY_READY',cid,sum(len(o.data.vertices) for o in exports if o.type=='MESH'),sum(len(o.data.polygons) for o in exports if o.type=='MESH'),output.stat().st_size,flush=True)
    if args.no_render:continue
    for loc,energy,size in [((-3,-5,5),650,5),((4,-2,3),350,4),((0,4,4),450,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,.8))-light.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=900;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.world.color=(.18,.18,.18);scene.view_settings.view_transform='AgX'
    for name,loc in [('front',(0,-6,2.5)),('angle',(3,-5,2.5))]:
        bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.9;scene.camera=cam;scene.render.filepath=str(ROOT/'artifacts/tripo'/f'body-{cid}-{name}.png');bpy.ops.render.render(write_still=True)
