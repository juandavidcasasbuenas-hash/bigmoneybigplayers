"""Build the game's editable Blender characters and runtime GLBs.

Run with Blender --background --factory-startup --python scripts/build-characters.py.
Quaternius supplies the weighted body topology. The rounded cartoon heads are
modeled here from scratch, with facial shapes and fitted accessories for the cast.
Coordinates in modeling helpers are game-space (X right, Y up, Z forward).
"""
import bpy, bmesh, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/blender'
OUTPUT = ROOT / 'public/models/club'
OUTPUT.mkdir(parents=True, exist_ok=True)
CHARACTERS = json.loads((SOURCE / 'characters.json').read_text())
CHARACTERS.append(dict(id='dealer',name='Monty',skin='#d5ac80',hair='#aaa89d',shirt='#693d42',undershirt='#f3e9cf',eyes='#496858',hairStyle='swept',beard='goatee',faceWidth=1.0,faceLength=1.0,eyebrow=1.1))
ONLY = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
def V(p): return Vector((p[0],-p[2],p[1]))
def G(p): return Vector((p.x,p.z,-p.y))
def rgb(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)
def mix(a,b,t): return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def gauss(x,y,cx,cy,sx,sy):return math.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
def material(name,color,rough=.6,metal=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb(color),1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb(color),1);return m
def mesh(name,verts,faces,mat):
    d=bpy.data.meshes.new(name);d.from_pydata([V(p) for p in verts],[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
    if mat:o.data.materials.append(mat)
    for p in d.polygons:p.use_smooth=True
    return o
def active(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def apply(o,mod):
    active(o);bpy.ops.object.modifier_apply(modifier=mod.name)
def subdiv(o,n=1):
    m=o.modifiers.new('Soft sculpted surface','SUBSURF');m.levels=n;apply(o,m)
def ellipsoid(name,pos,scale,mat,segments=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=V(pos));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);active(o);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
def tube(name,points,radius,mat,radii=None):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=5;curve.bevel_depth=radius;curve.bevel_resolution=2
    s=curve.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for i,(b,p) in enumerate(zip(s.bezier_points,points)):
        b.co=V(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO';b.radius=radii[i] if radii else 1
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mat);active(o);bpy.ops.object.convert(target='MESH');return bpy.context.object
def select_export(objects,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,export_yup=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Complexion')
def rigid_weight(o,arm,bone):
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');m=o.modifiers.new('Shared character skeleton','ARMATURE');m.object=arm;o.parent=arm
def clone_subset(src,name,keep):
    o=src.copy();o.data=src.data.copy();o.name=name;bpy.context.collection.objects.link(o);o.parent=None;o.matrix_world=Matrix.Identity(4)
    for m in list(o.modifiers):o.modifiers.remove(m)
    bm=bmesh.new();bm.from_mesh(o.data)
    # glTF splits vertices at UV seams. Weld before subdivision, otherwise those
    # seams turn into real gaps at shoulders, eyelids and the trouser waistband.
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not keep(v.co)],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(o.data);bm.free()
    return o

def make_body(base,arm):
    body=clone_subset(base,'Tailored_body',lambda p:.12<p.z<1.58 and abs(p.x)<.704)
    old={b.name:b.matrix_local.copy() for b in arm.data.bones}
    lengths={b.name:b.length for b in arm.data.bones}
    bones={
      'root':((0,0,0),(0,.5,0)), 'pelvis':((0,.895,-.07),(0,1.04,-.03)),
      'spine_01':((0,1.04,-.03),(0,1.25,0)), 'spine_02':((0,1.25,0),(0,1.50,.02)),
      'spine_03':((0,1.50,.02),(0,1.78,0)), 'neck_01':((0,1.78,0),(0,1.94,0)), 'Head':((0,1.94,0),(0,2.38,0))}
    for s,side in [('l',1),('r',-1)]:
        bones.update({f'clavicle_{s}':((side*.05,1.66,.02),(side*.44,1.7,.055)),f'upperarm_{s}':((side*.44,1.7,.055),(side*.90,1.7,.055)),f'lowerarm_{s}':((side*.90,1.7,.055),(side*1.40,1.7,.055)),f'hand_{s}':((side*1.40,1.7,.055),(side*1.54,1.7,.055)),f'thigh_{s}':((side*.245,.895,-.07),(side*.245,.234527,-.07)),f'calf_{s}':((side*.245,.234527,-.07),(side*.245,-.478916,-.07)),f'foot_{s}':((side*.245,-.478916,-.07),(side*.245,-.55,.14))})
    active(arm);bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        b.use_connect=False
        if b.name in bones:b.head=V(bones[b.name][0]);b.tail=V(bones[b.name][1])
    bpy.ops.object.mode_set(mode='OBJECT')
    transforms={}
    for b in arm.data.bones:
        if b.name not in bones:continue
        width=1.7 if 'arm' in b.name or 'hand' in b.name else 1.5 if 'calf' in b.name else 1.65 if 'thigh' in b.name else 2.0
        transforms[b.name]=b.matrix_local@Matrix.Diagonal((width,b.length/lengths[b.name],width,1))@old[b.name].inverted()
    for v in body.data.vertices:
        original=v.co.copy();value=Vector();total=0
        for g in v.groups:
            n=body.vertex_groups[g.group].name
            if n in transforms:value+=transforms[n]@original*g.weight;total+=g.weight
        if total:v.co=value/total
        q=G(v.co)
        if 1.02<q.y<1.58 and abs(q.x)<.44:
            fullness=math.exp(-((q.y-1.25)/.23)**2)
            q.x*=1+.24*fullness
            q.z+=.035*fullness*smooth(-.08,.1,q.z)
            v.co=V(q)
    # The muscular base becomes clothing: relax surface detail while retaining joint loops.
    sm=body.modifiers.new('Relax garment surface','SMOOTH');sm.factor=.72;sm.iterations=4;apply(body,sm)
    mats=[material('Shirt','#344960',.85),material('Trousers','#2c3839',.9),material('Skin','#c89677',.58),material('Cuff','#e6dfcb',.8)]
    body.data.materials.clear()
    for m in mats:body.data.materials.append(m)
    for p in body.data.polygons:
        q=sum((G(body.data.vertices[i].co) for i in p.vertices),Vector())/len(p.vertices)
        p.material_index=2 if q.y>1.78 and abs(q.x)<.18 else 1 if q.y<1.015 else 3 if abs(q.x)>1.30 else 0
    subdiv(body,1);m=body.modifiers.new('Shared character skeleton','ARMATURE');m.object=arm;body.parent=arm
    garment=fit_front(body)
    extras=[]
    shirt=material('Undershirt','#e5dfce',.86);lapel=material('Lapel','#3c536d',.76);seam=material('Seam','#223441',.92);gold=material('Buttons','#b69958',.38,.45)
    # Fitted front panel and thick lapels are modeled on the garment, not painted planes.
    panel=mesh('Shirt_front',[(-.16,1.78,.16),(.16,1.78,.16),(.11,1.54,.29),(0,1.24,.31),(-.11,1.54,.29)],[(0,1,2,3,4)],shirt)
    for v in panel.data.vertices:v.co=V(garment(G(v.co),.008))
    sol=panel.modifiers.new('Cotton thickness','SOLIDIFY');sol.thickness=.018;apply(panel,sol);rigid_weight(panel,arm,'spine_03');extras.append(panel)
    for side in [-1,1]:
        pts=[(side*.17,1.79,.16),(side*.30,1.65,.245),(side*.235,1.56,.297),(side*.32,1.51,.288),(side*.075,1.245,.324),(side*.12,1.58,.295)]
        o=mesh('Lapel_left' if side<0 else 'Lapel_right',pts,[(0,1,2,3,4,5)],lapel)
        for v in o.data.vertices:v.co=V(garment(G(v.co),.018))
        m=o.modifiers.new('Lapel thickness','SOLIDIFY');m.thickness=.022;apply(o,m);m=o.modifiers.new('Soft tailored edges','BEVEL');m.width=.012;m.segments=3;apply(o,m);rigid_weight(o,arm,'spine_03');extras.append(o)
        o=tube('Jacket_seam',[tuple(garment(p,.027)) for p in [(side*.30,1.62,.263),(side*.29,1.52,.305),(side*.075,1.26,.332)]],.004,seam);rigid_weight(o,arm,'spine_03');extras.append(o)
    for y,z in [(1.24,.33),(1.075,.29)]:
        o=ellipsoid('Brass_button',tuple(garment((0,y,z),.015)),(.023,.023,.009),gold,16,10);rigid_weight(o,arm,'spine_02' if y>1.2 else 'spine_01');extras.append(o)
    o=tube('Neck_collar',[(.23*math.sin(i/16*2*math.pi),1.77,-.02+.18*math.cos(i/16*2*math.pi)) for i in range(17)],.045,material('Collar','#e5dfce',.9))
    rigid_weight(o,arm,'spine_03');extras.append(o)
    hood=material('Hood','#899798',.91)
    o=tube('Hood_collar',[(-.23,1.74,.08),(-.28,1.76,-.12),(0,1.79,-.28),(.28,1.76,-.12),(.23,1.74,.08)],.068,hood)
    rigid_weight(o,arm,'spine_03');extras.append(o)
    for side in [-1,1]:
        o=tube('Hood_drawstring',[tuple(garment((side*x,y,.3),.025)) for x,y in [(.12,1.70),(.13,1.55),(.11,1.43)]],.007,shirt)
        rigid_weight(o,arm,'spine_03');extras.append(o)
    for side in [-1,0,1]:
        o=ellipsoid('Dealer_bow',tuple(garment((side*.066,1.715,.3),.045)),(.032 if side==0 else .070,.029 if side==0 else .045,.023),material('Bow_tie','#243029',.62),20,12)
        rigid_weight(o,arm,'spine_03');extras.append(o)
    for o in [body,*extras]:o['asset_source']='Quaternius humanoid / Blender poker adaptation'
    arm['rig_version']='club-v1'
    select_export([arm,body,*extras],OUTPUT/'body.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'club-body.blend'))

def fit_surface(head):
    dg=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(head,dg)
    def ray(p,offset=0):
        direction=V(p).normalized();location,normal,_,_=tree.ray_cast(direction*3,-direction,3)

        if location is None:location,normal,_,_=tree.find_nearest(direction*.55)
        return G(location+normal*offset) if location else Vector(p)*.5
    return ray

def fit_front(head):
    tree=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
    def project(p,offset=0):
        location,normal,_,_=tree.ray_cast(V((p[0],p[1],2)),V((0,0,-1)),4)
        if location is None:location,normal,_,_=tree.find_nearest(V(p))
        return G(location+normal*offset) if location else Vector(p)
    return project

def helmet(c,mats):
    made=[];width=.54*c['faceWidth'];depth=.47;base=.22;height=.37;center=-.10
    shellmat=material('Helmet_ivory','#ebece3',.34);rim=material('Helmet_rim','#424f50',.62);ventmat=material('Vent_wells','#263338',.84)
    verts=[];faces=[];n=64;rows=24
    for j in range(rows+1):
        theta=.002+(math.pi/2-.002)*j/rows
        for i in range(n):
            phi=i/n*math.pi*2;verts.append((width*math.sin(theta)*math.sin(phi),base+height*math.cos(theta),center+depth*math.sin(theta)*math.cos(phi)))
    for j in range(rows):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    shell=mesh('Helmet_shell',verts,faces,shellmat);m=shell.modifiers.new('Real shell thickness','SOLIDIFY');m.thickness=.035;apply(shell,m);made.append(shell)
    made.append(tube('Helmet_attached_rim',[(width*math.sin(i/64*2*math.pi),base,center+depth*math.cos(i/64*2*math.pi)) for i in range(65)],.019,rim))
    # Vents are recessed dark wells, aligned to the curved shell normal and seated in its surface.
    for x in [-.28,0,.28]:
        for z in [-.26,.045]:
            y=base+height*math.sqrt(max(0,1-(x/width)**2-((z-center)/depth)**2))
            o=ellipsoid('Helmet_vent',(x,y-.004,z),(.045,.012,.103),ventmat,24,12)
            normal=V((x/width**2,(y-base)/height**2,(z-center)/depth**2)).normalized();o.rotation_euler=Vector((0,0,1)).rotation_difference(normal).to_euler();made.append(o)
    def front(x,y):return center+depth*math.sqrt(max(.02,1-(x/width)**2-((y-base)/height)**2))
    vertices=[];faces=[]
    for j in range(9):
        y=.295+j/8*.135
        for i in range(17):x=-.20+i/16*.40;vertices.append((x,y,front(x,y)+.0015))
    for j in range(8):
        for i in range(16):a=j*17+i;faces.append((a,a+1,a+18,a+17))
    made.append(mesh('Helmet_number_panel',vertices,faces,material('Helmet_label','#f7f3e9',.6)))
    bpy.ops.object.text_add();text=bpy.context.object;text.name='Helmet_number';text.data.body='1000';text.data.align_x='CENTER';text.data.align_y='CENTER';text.data.size=.112;text.data.extrude=0;text.data.materials.append(ventmat)
    active(text);bpy.ops.object.convert(target='MESH')
    bm=bmesh.new();bm.from_mesh(text.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=3,use_grid_fill=True)
    bm.to_mesh(text.data);bm.free()
    # Project every glyph vertex onto the SAME shell equation as the label panel.
    for v in text.data.vertices:
        x,y=v.co.x,v.co.y+.365;v.co=V((x,y,front(x,y)+.004))
    made.append(text)
    for side in [-1,1]:
        made.append(tube('Helmet_strap',[(side*width,.23,-.10),(side*.47,-.14,-.03),(side*.29,-.37,.18),(side*.17,-.43,.20)],.014,rim))
    made.append(tube('Helmet_chin_strap',[(-.17,-.43,.20),(0,-.465,.18),(.17,-.43,.20)],.014,rim))
    return made

# The head is purpose-built for the supplied rounded 3D cartoon reference.
# Human orbital sockets / nasolabial folds are deliberately absent.
def head_dimensions(c):
    return (.505*(1+(c['faceWidth']-1)*.65), .510*(1+(c['faceLength']-1)*.42), .405)

def head_point(c,theta,phi,offset=0):
    rx,ry,rz=head_dimensions(c)
    sp=lambda x,p:math.copysign(abs(x)**p,x)
    ring=abs(math.sin(theta))**.94
    y=.035+ry*sp(math.cos(theta),.88)
    jaw=1-.055*(1-smooth(-.47,-.09,y))
    p=Vector((rx*ring*sp(math.sin(phi),.90)*jaw,y,rz*ring*sp(math.cos(phi),.78)))
    normal=Vector((p.x/rx**2,(p.y-.035)/ry**2,p.z/rz**2)).normalized()
    return p+normal*offset

def head_front(c,x,y,offset=0):
    rx,ry,rz=head_dimensions(c)
    u=max(-.9999,min(.9999,(y-.035)/ry))
    ct=math.copysign(abs(u)**(1/.88),u)
    ring=max(.0001,1-ct*ct)**(.94/2)
    jaw=1-.055*(1-smooth(-.47,-.09,y))
    w=min(.9999,abs(x/(rx*ring*jaw)))
    return rz*ring*max(.0001,1-w**(2/.90))**(.78/2)+offset

def face_expressions(o,c,kind='surface'):
    o.shape_key_add(name='Basis')
    for name in ['Smile','JawOpen','BrowUp','Frown']:
        key=o.shape_key_add(name=name);key.value=0
        for v,kv in zip(o.data.vertices,key.data):
            p=G(v.co+o.location);x,y,z=p
            front=smooth(-.02,.17,z)
            if kind=='mouth':
                width=.134*c.get('mouthWidth',1)
                u=min(1,abs(x)/width)
                if name=='Smile':p.y+=.045*u*u;p.x*=1.07
                if name=='Frown':p.y-=.037*u*u
                if name=='JawOpen':p.y=-.286+(y+.286)*7.0-.038
                p.z=head_front(c,p.x,p.y,.013)
            else:
                if name=='Smile':
                    w=(gauss(x,y,.20,-.25,.14,.13)+gauss(x,y,-.20,-.25,.14,.13))*front
                    p.y+=.026*w;p.x+=math.copysign(.012*w,x)
                elif name=='JawOpen':
                    w=(1-smooth(-.40,-.25,y))*front
                    p.y-=.053*w
                elif name=='BrowUp':p.y+=.013*gauss(x,y,0,.27,.42,.15)*front
                elif name=='Frown':p.y-=.012*gauss(x,y,0,-.29,.3,.13)*front
            kv.co=V(p)-o.location

def rope(name,points,radius,mat,radii=None,sides=7):
    # Low-poly smooth sculpted strand. These are merged by material before export.
    verts=[];faces=[]
    for i,p in enumerate(points):
        p=Vector(p);t=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        n=t.cross(Vector((0,0,1)))
        if n.length<.01:n=t.cross(Vector((0,1,0)))
        n.normalize();b=t.cross(n).normalized();r=radius*(radii[i] if radii else 1)
        for k in range(sides):
            a=k/sides*math.pi*2;verts.append(tuple(p+r*(n*math.cos(a)+b*math.sin(a))))
    for i in range(len(points)-1):
        for k in range(sides):a=i*sides+k;b=i*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+i for i in range(sides))])
    return mesh(name,verts,faces,mat)

def combine(objects,name):
    if not objects:return
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=name;return o

def sculpt_hair(c,mats):
    style=c['hairStyle'];made=[]
    if style=='bald':return made
    def hairline(phi):
        front=(1+math.cos(phi))*.5
        end=2.12-1.22*front
        if style=='cropped':end-=.17*front
        if style=='side-part':end+=.08*math.sin(phi)*front
        if style=='swept':end-=.06*front
        if style in ['helmet','cap']:end=2.03-1.16*front
        return end
    def surface(theta,phi,extra=0):
        p=head_point(c,theta,phi,.012+extra)
        if style not in ['cropped','helmet','cap']:
            w=max(0,math.cos(theta));p.y+=.028*w;p.z-=.010*w
        return p
    verts=[];faces=[];n=64;rows=20
    for j in range(rows+1):
        for i in range(n):
            phi=i/n*math.pi*2;verts.append(tuple(surface(.004+(hairline(phi)-.004)*j/rows,phi)))
    for j in range(rows):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    cap=mesh('Hair_cap',verts,faces,mats['hair']);sol=cap.modifiers.new('Sculpted hair thickness','SOLIDIFY');sol.thickness=.018;apply(cap,sol);made.append(cap)
    if style in ['helmet','cap']:return made
    details=[];silver=[]
    if style=='curly':
        # Curled locks are distributed over the cap, embedded at both ends.
        # Tangent spirals create ringlets rather than a helmet of parallel tubes.
        # A golden-angle distribution avoids visible rows / a beaded wig.
        for row in range(650):
            theta=math.acos(1-2*(row+.5)/650)
            for i in [row]:
                phi=(row*2.3999632297)%(2*math.pi)
                if theta>hairline(phi)-.025:continue
                center=surface(theta,phi,.015)
                normal=Vector((center.x/.505**2,(center.y-.035)/.51**2,center.z/.405**2)).normalized()
                tangent=Vector((math.cos(phi),0,-math.sin(phi))).normalized();up=normal.cross(tangent).normalized()
                points=[];radii=[]
                cushion=ellipsoid('Curl_volume',tuple(center),(.037,.040,.023),mats['hair'],12,8)
                cushion.rotation_euler=V((0,0,1)).rotation_difference(V(normal)).to_euler();details.append(cushion)
                for j in range(17):
                    t=j/16;angle=t*math.pi*1.65+.65*math.sin(i*3+row)
                    r=.037*(1-.45*t)*(.85+.15*math.sin(i*7.1));lift=.022*math.sin(math.pi*t)
                    points.append(tuple(center+tangent*math.cos(angle)*r+up*math.sin(angle)*r+normal*lift))
                    radii.append(.20+.80*math.sin(math.pi*t)**.4)
                grey=abs(math.sin(phi))>.78 and theta>1.10
                mat=mats['silver'] if grey and i%3==0 else mats['hairLight'] if i%4==0 else mats['hair']
                details.append(rope('Curled_lock',points,.0165,mat,radii,7))
    elif style=='cropped':
        for i in range(42):
            phi=i/42*2*math.pi;theta=hairline(phi)*.78
            pts=[tuple(surface(theta+t*.11,phi+.026*t,.003)) for t in [0,.5,1]]
            details.append(rope('Cropped_texture',pts,.004,mats['hairLight'],[.1,1,.1],5))
    else:
        for i in range(23):
            phi=(i/23)*math.pi*2;points=[]
            for j in range(11):
                t=j/10;theta=.13+t*(hairline(phi)-.15);sweep=(.42 if style in ['swept','side-part'] else .13)*math.sin(t*math.pi)
                p=surface(theta,phi+sweep,.006)
                if style=='spiky':p.y+=.057*math.sin(math.pi*t)**2
                points.append(tuple(p))
            grey=bool(c.get('hairAccent')) and i in [0,1,22]
            details.append(rope('Swept_lock',points,.025 if style!='spiky' else .032,mats['silver'] if grey else mats['hairLight'] if i%4==0 else mats['hair'],[.15,.65,.95,1,1,1,.95,.85,.65,.4,.12],8))
            for offset in [-.008,.008]:
                groove=[tuple(Vector(p)+Vector((offset,.005,0))) for p in points]
                details.append(rope('Hair_groove',groove,.003,mats['silver'] if grey else mats['hairGroove'],[.1,.6,1,1,1,1,1,1,.6,.3,.1],5))
    # A few hair materials, not one draw call per lock.
    groups=[(mat,[o for o in details if o.data.materials[0]==mat]) for mat in [mats['hair'],mats['hairLight'],mats['hairGroove'],mats['silver']]]
    for mat,group in groups:
        if group:made.append(combine(group,'Hair_detail_'+mat.name))
    return made

def sculpt_beard(c,mats):
    style=c['beard']
    if style=='none':return
    short=style=='stubble';goatee=style=='goatee'
    end=.58 if goatee else 1.95
    verts=[];faces=[];nx=64;ny=16
    for j in range(ny+1):
        t=j/ny
        for i in range(nx+1):
            phi=-end+2*end*i/nx
            # Higher on the jaw sides; a continuous beard cups the chin.
            upper=-.205+.12*abs(math.sin(phi))+.007*math.sin(phi*41)
            if goatee:upper=-.315+.016*math.cos(phi)
            bottom=-.445+abs(math.sin(phi))*.047
            y=bottom+(upper-bottom)*t
            rx,ry,rz=head_dimensions(c);theta=math.acos(math.copysign(abs((y-.035)/ry)**(1/.88),y-.035))
            offset=(.007 if short else .021)*math.sin(math.pi*t)**.45+.002
            p=head_point(c,theta,phi,offset)
            # Skin-coloured mouth window belongs to the head, not a pasted image.
            verts.append(tuple(p))
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;inds=(a,a+1,a+nx+2,a+nx+1)
            centre=sum((Vector(verts[k]) for k in inds),Vector())/4
            if centre.z>0 and (centre.x/.173)**2+((centre.y+.286)/.065)**2<1:continue
            faces.append(inds)
    beard=mesh('Beard_sculpt',verts,faces,mats['stubble'] if short else mats['beard']);subdiv(beard,1);face_expressions(beard,c)
    # Sculpted short locks, laid directly on the jaw surface; subtle grey at temples/chin.
    details=[];greys=[]
    if not short:
        for i in range(150 if not goatee else 42):
            phi=-end+.055+(2*end-.11)*((i*.61803398875)%1)
            top=-.345 if abs(phi)<.44 else -.24+.11*abs(math.sin(phi));bottom=-.42+.035*abs(math.sin(phi))
            if goatee:top=-.345
            t0=(math.sin(i*73.156+4.2)*43758.5453)%1
            top=top*(1-t0)+bottom*t0
            bottom=top-.022-.012*((i*.718)%1)
            pts=[]
            for j in range(4):
                t=j/3;y=top*(1-t)+bottom*t
                rx,ry,rz=head_dimensions(c);theta=math.acos(math.copysign(abs((y-.035)/ry)**(1/.88),y-.035))
                pts.append(tuple(head_point(c,theta,phi+.025*math.sin(t*math.pi),.023)))
            grey=(c['id'] in ['juan','jack','doug','dealer'] and i%5==0)
            details.append(rope('Beard_lock',pts,.0011 if c['id']!='dealer' else .002,mats['beardSilver'] if grey else mats['beardLight'],[.1,.9,1,.08],5))
    # A separate sweeping moustache makes expressions legible even at table distance.
    if not short or c['id'] in ['nat','humfrey']:
        for side in [-1,1]:
            points=[]
            for j in range(7):
                t=j/6;x=side*(.015+t*.155*c.get('mouthWidth',1));y=-.223-.032*t+.015*math.sin(t*math.pi)
                points.append((x,y,head_front(c,x,y,.021)))
            details.append(rope('Moustache',points,.019 if c['id']!='dealer' else .023,mats['beard'],[.65,1,1,.9,.7,.4,.12],8))
    groups=[(mat,[o for o in details if o.data.materials[0]==mat]) for mat in [mats['beard'],mats['beardLight'],mats['beardSilver']]]
    for mat,group in groups:
        if group:
            ob=combine(group,'Facial_hair_'+mat.name);face_expressions(ob,c)

def cartoon_eye(c,side,mats):
    cx=side*.185*(1+(c['faceWidth']-1)*.3);cy=.055
    scale=1+(c.get('eyeScale',1)-1)*.35;rx=.150*scale;ry=.181*scale
    verts=[(cx,cy,head_front(c,cx,cy,.036))];faces=[];rings=10;n=48
    for j in range(1,rings+1):
        r=j/rings
        for i in range(n):
            a=i/n*math.pi*2;x=cx+rx*r*math.cos(a);y=cy+ry*r*math.sin(a)
            verts.append((x,y,head_front(c,x,y,.008+.028*math.sqrt(max(0,1-r*r)))))
    for i in range(n):faces.append((0,1+i,1+(i+1)%n))
    for j in range(rings-1):
        for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    eye=mesh('Eye_white_L' if side<0 else 'Eye_white_R',verts,faces,mats['white']);eye.shape_key_add(name='Basis');k=eye.shape_key_add(name='Blink');k.value=0
    for v,d in zip(eye.data.vertices,k.data):
        p=G(v.co);p.y=cy+(p.y-cy)*.025;p.z=head_front(c,p.x,p.y,.010);d.co=V(p)
    centerz=head_front(c,cx,cy,.036)
    pupil=ellipsoid('Pupil_L' if side<0 else 'Pupil_R',(cx,cy,centerz+.006),(.030,.037,.009),mats['pupil'],24,16)
    pupil['eye_side']=side;pupil['eye_center_y']=cy
    pupil['eye_surface']={'center':[cx,cy,centerz],'radii':[rx,ry,.028],'slope':[(head_front(c,cx+.001,cy)-head_front(c,cx-.001,cy))/.002,(head_front(c,cx,cy+.001)-head_front(c,cx,cy-.001))/.002]}
    # Thick graphic brows have gentle bevels and an attached surface, without eyelid rings.
    points=[]
    for j in range(5):
        t=j/4;x=cx+side*(-.122+t*.235);y=.302+.010*math.sin(t*math.pi)-.014*t
        points.append((x,y,head_front(c,x,y,.010)))
    brow=rope('Eyebrow_L' if side<0 else 'Eyebrow_R',points,.024*c['eyebrow'],mats['brow'],[.65,1,1,1,.5],8);brow['brow_side']=side

def make_head(c):
    before=set(bpy.data.objects)
    verts=[];faces=[];n=96;rows=48
    for j in range(rows+1):
        theta=.0001+(math.pi-.0002)*j/rows
        for i in range(n):verts.append(tuple(head_point(c,theta,i/n*math.pi*2)))
    for j in range(rows):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    skin=material(c['id']+'_skin',c['skin'],.80)
    o=mesh('Face',verts,faces,skin);face_expressions(o,c)
    colors=o.data.color_attributes.new(name='Complexion',type='FLOAT_COLOR',domain='POINT');o.data.color_attributes.active_color=colors;o.data.color_attributes.render_color_index=0
    for v,col in zip(o.data.vertices,colors.data):
        x,y,z=G(v.co);blush=(gauss(x,y,.31,-.105,.12,.11)+gauss(x,y,-.31,-.105,.12,.11))*.13*smooth(.13,.27,z)
        col.color=(*mix(rgb(c['skin']),rgb('#d47b62'),blush),1)
    attr=skin.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Complexion';skin.node_tree.links.new(attr.outputs['Color'],skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    beardcolor='#9b896f' if c['id']=='doug' else '#64503a' if c['id']=='tian' else '#77776d' if c['id']=='dealer' else c['hair']
    mats={'skin':material(c['id']+'_skin_detail',c['skin'],.8),'hair':material(c['id']+'_hair',c['hair'],.78),'hairLight':material(c['id']+'_hair_light',c['hair'],.72),'hairGroove':material(c['id']+'_hair_groove',c['hair'],.9),'silver':material(c['id']+'_silver',c.get('hairAccent','#888177'),.81),'beard':material(c['id']+'_beard',beardcolor,.9),'beardLight':material(c['id']+'_beard_light',beardcolor,.78),'beardSilver':material(c['id']+'_beard_silver','#c0b5a1' if c['id']=='doug' else '#898278',.9),'stubble':material(c['id']+'_stubble',c['skin'],.9),'white':material('Eye_white','#fffdf4',.64),'pupil':material('Cartoon_pupil','#171614',.68),'brow':material(c['id']+'_brow',c['hair'],.86)}
    # Keep stubble visibly lighter than a full beard while still native 3D geometry.
    bs=mats['stubble'].node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*mix(rgb(c['skin']),rgb(c['hair']),.32),1)
    ellipsoid('Neck',(0,-.435,-.045),(.175,.195,.165),mats['skin'],32,20)
    for side in [-1,1]:
        rx,ry,rz=head_dimensions(c);ear=ellipsoid('Ear_L' if side<0 else 'Ear_R',(side*(rx-.015),-.070,-.015),(.100*c.get('earScale',1),.143,.073),mats['skin'],32,20)
    ellipsoid('Button_nose',(0,-.133,head_front(c,0,-.133)+.004),(.057*c.get('noseWidth',1),.049,.048),mats['skin'],32,20)
    sculpt_hair(c,mats);sculpt_beard(c,mats)
    for side in [-1,1]:cartoon_eye(c,side,mats)
    # A simple curved mouth patch is completely modeled and deforms during speech.
    mouthverts=[(0,-.286,head_front(c,0,-.286,.013))];mouthfaces=[];n=48
    for i in range(n):
        a=i/n*math.pi*2;x=.134*c.get('mouthWidth',1)*math.cos(a);y=-.286+.006*math.sin(a)+.005*(abs(x)/.134)**2
        mouthverts.append((x,y,head_front(c,x,y,.013)))
    for i in range(n):mouthfaces.append((0,i+1,(i+1)%n+1))
    mouth=mesh('Mouth_cavity',mouthverts,mouthfaces,material('Mouth_inside','#39251f',.88));face_expressions(mouth,c,'mouth')
    if c.get('glasses'):
        frame=material('Glasses_frames','#252a25',.48,.08)
        for side in [-1,1]:
            cx=side*.185*(1+(c['faceWidth']-1)*.3);pts=[]
            for i in range(49):
                t=i/48*math.pi*2;x=cx+.179*math.copysign(abs(math.cos(t))**.55,math.cos(t));y=.055+.149*math.copysign(abs(math.sin(t))**.55,math.sin(t));pts.append((x,y,head_front(c,x,y,.047)))
            tube('Glasses_rim',pts,.012 if c['id']=='doug' else .015,frame)
            tube('Glasses_temple',[(side*.365,.055,.34),(side*.495,.06,.09),(side*.50,.005,-.055)],.010,frame)
        tube('Glasses_bridge',[(-.043,.09,.456),(0,.112,.461),(.043,.09,.456)],.010,frame)
    if c['hairStyle']=='helmet':helmet(c,mats)
    if c['hairStyle']=='cap':
        cap=material('Cap_felt','#354a42',.92)
        ellipsoid('Cap_crown',(0,.36,-.04),(.53,.245,.435),cap,40,24)
        ellipsoid('Cap_brim',(0,.28,.31),(.48,.026,.31),cap,40,20)
        tube('Cap_seam',[(0,.605,-.04),(0,.55,.17),(0,.43,.34),(0,.305,.40)],.004,material('Cap_stitch','#72816a',.9))
    objects=[ob for ob in bpy.data.objects if ob not in before]
    for ob in objects:ob['character_id']=c['id'];ob['model_pipeline']='Blender / rounded cartoon v2'
    select_export(objects,OUTPUT/(c['id']+'.glb'))
    for ob in bpy.context.scene.objects:ob.hide_render=ob not in objects
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(c['id']+'.blend')))
    render_portrait(c,objects)
    for ob in objects:bpy.data.objects.remove(ob,do_unlink=True)

def render_portrait(c,objects):
    bpy.ops.object.camera_add(location=V((1.5,.48,3.1)));camera=bpy.context.object;camera.rotation_euler=(V((0,.06,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.65;bpy.context.scene.camera=camera
    lights=[]
    for pos,power,size in [((-2,3,4),450,4),((3,1,1),180,3),((0,2,-3),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=V(pos));l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler();lights.append(l)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.world.color=(.14,.16,.13);scene.render.resolution_x=600;scene.render.resolution_y=680;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.view_settings.view_transform='AgX';scene.render.filepath=str(ROOT/'artifacts'/('blender-'+c['id']+'.png'));bpy.ops.render.render(write_still=True)
    for ob in [camera,*lights]:bpy.data.objects.remove(ob,do_unlink=True)

def main():
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    if not ONLY or 'body' in ONLY:
        basefile=next((SOURCE/'vendor').rglob('Superhero_Male_FullBody.gltf'))
        bpy.ops.import_scene.gltf(filepath=str(basefile))
        make_body(bpy.data.objects['SuperHero_Male'],bpy.data.objects['Armature'])
        for ob in list(bpy.data.objects):bpy.data.objects.remove(ob,do_unlink=True)
    for c in CHARACTERS:
        if ONLY and c['id'] not in ONLY:continue
        make_head(c)
    print('CHARACTER BUILD COMPLETE',OUTPUT)
main()
