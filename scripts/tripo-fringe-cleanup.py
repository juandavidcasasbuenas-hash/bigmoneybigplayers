"""Repair source-matte fragments without cutting holes or changing the UV mesh.

Call cleanup_fringe(obj, character_id, vertex_rgb, pixels, skin_srgb=None) on the
normalized source (height 1, feet Z=0, front -Y), before head cutting or morphs.
vertex_rgb is Nx3 sRGB sampled from the source UV map. pixels is HxWx4 sRGB.
The caller writes the modified pixels back to the existing image. No material
slots, topology or UV coordinates are added/removed. Original GLBs stay untouched.
"""
import math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

# Tight observed regions for saturated generated reference-edge contamination.
# These are gates for a colour mask, never volumes to delete from the head.
REGIONS = {
 'diego': [
  ((-.160,.048,.785),(-.114,.140,.885)),
  ((.126,.056,.805),(.165,.120,.875)),
  ((-.193,.018,.650),(-.135,.090,.817)),
  ((.164,.019,.720),(.197,.057,.812)),
 ],
 'clive': [
  ((-.082,-.050,.946),(.058,.060,1.012)),
  ((-.095,.080,.720),(.115,.220,.965)),
  ((-.212,.010,.642),(-.135,.049,.760)),
  ((.133,.010,.642),(.213,.049,.763)),
 ],
 'jack': [
  ((-.192,.035,.752),(-.048,.222,.978)),
  ((.140,.028,.748),(.195,.155,.887)),
  ((.198,.018,.730),(.239,.067,.815)),
  ((-.234,-.012,.704),(-.182,.065,.839)),
  ((.007,.016,.932),(.136,.169,1.010)),
  ((-.022,.205,.790),(.020,.245,.878)),
 ],
 'dealer': [
  ((-.198,-.035,.674),(-.122,.022,.791)),
  ((.125,-.031,.674),(.202,.021,.792)),
  ((-.199,.045,.792),(-.159,.087,.848)),
  ((-.139,.137,.777),(-.097,.177,.811)),
  ((-.080,.001,.960),(-.050,.029,.987)),
  ((-.146,.108,.868),(-.122,.142,.900)),
  ((-.153,.032,.922),(-.128,.064,.945)),
 ],
}

# These isolated generated carrier shapes have neutral/brown flanks around their
# saturated core. Selecting colour alone would leave a recoloured raised ribbon.
PROTRUSIONS = {
 'diego': [
  ((-.175,.042,.792),(-.085,.195,.914)),
  ((.085,.042,.792),(.175,.195,.914)),
 ],
 'jack': [
  ((-.203,.024,.775),(-.045,.240,.978)),
  ((.095,.024,.775),(.203,.240,.935)),
 ],
}


def cleanup_fringe(obj, character_id, vertex_rgb, pixels, skin_srgb=None):
    mesh = obj.data
    points = np.array([v.co[:] for v in mesh.vertices], dtype=float)
    colors = np.asarray(vertex_rgb, dtype=float)
    regions = REGIONS.get(character_id, [])
    if not regions:
        return {'method':'surface-projection-v1','selected_vertices':0,'painted_triangles':0}
    gate = np.zeros(len(points), dtype=bool)
    for low, high in regions:
        gate |= ((points >= low) & (points <= high)).all(axis=1)
    r,g,b = colors.T
    red = (r>.52) & (g<.34) & (r>g*2.05) & (r-b>.25)
    yellow = (r>.64) & (g>.59) & (b<.49) & (g>b*1.65) & ((r-g)<.29)
    # Jack's false filament side faces are ochre instead of saturated yellow.
    if character_id == 'jack':
        yellow |= (r>.68) & (g>.49) & (b<.47) & ((r-g)<.28) & ((g-b)>.17)
    core = gate & (red | yellow)
    carrier = np.zeros(len(points), dtype=bool)
    for low,high in PROTRUSIONS.get(character_id,[]):
        carrier |= ((points >= low) & (points <= high)).all(axis=1)
    selected = core | carrier
    # UV seams duplicate vertices. Select every coincident counterpart so there
    # can be no split when only one of their UV samples detects contamination.
    buckets = {}
    for i,p in enumerate(points):
        buckets.setdefault(tuple(np.round(p,5)), []).append(i)
    adjacency = [set() for _ in points]
    for edge in mesh.edges:
        a,b = edge.vertices
        adjacency[a].add(b);adjacency[b].add(a)
    for indices in buckets.values():
        if any(selected[i] for i in indices):
            selected[indices] = True
    # Include one immediate fringe ring. This folds pale/grey flanks of the
    # protrusion back as well, without a broad destructive scalp-region cut.
    for i in np.flatnonzero(selected.copy()):
        for j in adjacency[i]:
            if gate[j] and np.linalg.norm(points[i]-points[j]) < .022:
                selected[j] = True
    for indices in buckets.values():
        if any(selected[i] for i in indices):
            selected[indices] = True
    indices = np.flatnonzero(selected)
    if not len(indices):
        return {'method':'surface-projection-v1','selected_vertices':0,'painted_triangles':0}

    # Nearest clean vertices describe the actual surrounding scalp/ear, with
    # local quadratic curvature so the repaired surface does not become a slab.
    residual_red = (r>.44) & (g<.45) & (r>g*1.65) & (r-b>.20)
    residual_yellow = (r>.63) & (g>.52) & (b<.49) & ((g-b)>.17) & ((r-g)<.27)
    valid = np.flatnonzero(~selected & (points[:,2]>.59) & ~(gate & (residual_red | residual_yellow)))
    kd = KDTree(len(valid))
    for i in valid:
        kd.insert(Vector(points[i]), int(i))
    kd.balance()
    goals = points.copy()
    paint = colors.copy()
    distances = []
    for i in indices:
        found = kd.find_n(Vector(points[i]), 72)
        neighbors = np.array([entry[1] for entry in found], dtype=int)
        distance = np.array([entry[2] for entry in found])
        local = points[neighbors]
        # Discard far donors on the other side of an ear fold.
        keep = distance <= max(.038, distance[0]+.035)
        local = local[keep];neighbors = neighbors[keep];distance = distance[keep]
        weights = 1 / np.maximum(distance,.003)**2
        weights /= weights.sum()
        center = np.sum(local*weights[:,None],axis=0)
        offset = local-center
        covariance = (offset*weights[:,None]).T@offset
        _,axes = np.linalg.eigh(covariance)
        normal = axes[:,0];u=axes[:,1];v=axes[:,2]
        x=offset@u;y=offset@v;z=offset@normal
        design=np.column_stack([np.ones(len(x)),x,y,x*x,y*y,x*y])
        coefficients=np.linalg.lstsq(design*np.sqrt(weights[:,None]),z*np.sqrt(weights),rcond=None)[0]
        dp=points[i]-center;px=float(dp@u);py=float(dp@v)
        # Stay within the support of donor samples rather than extrapolating a
        # quadratic far out along an isolated thin false strand.
        px=float(np.clip(px,x.min(),x.max()));py=float(np.clip(py,y.min(),y.max()))
        pz=float(np.dot(coefficients,[1,px,py,px*px,py*py,px*py]))
        pz=float(np.clip(pz,z.min()-.002,z.max()+.002))
        projected=center+u*px+v*py+normal*pz
        goals[i]=projected
        distances.append(float(np.linalg.norm(projected-points[i])))
        # Match the surrounding mapped colour, not a uniform forehead skin
        # swatch: red fragments in hair must become hair, not salmon patches.
        paint[i]=np.sum(colors[neighbors]*weights[:,None],axis=0)
    # Relax only the repaired patch while its original boundary stays pinned.
    # Per-vertex local fits can otherwise leave small folded slivers on a narrow
    # source strip, even though topology remains intact.
    for _ in range(6):
        relaxed = goals.copy()
        for i in indices:
            neighbors = list(adjacency[i])
            if neighbors:
                relaxed[i] = goals[i]*.55 + goals[neighbors].mean(axis=0)*.45
        for group in buckets.values():
            changed = [i for i in group if selected[i]]
            if changed:
                relaxed[changed] = relaxed[changed].mean(axis=0)
        goals = relaxed
    # Coincident seam vertices share the same repaired position and colour.
    for group in buckets.values():
        changed=[i for i in group if selected[i]]
        if changed:
            p=goals[changed].mean(axis=0);c=paint[changed].mean(axis=0)
            for i in changed:goals[i]=p;paint[i]=c
    # A false strip can cover its own whole local neighborhood. For the two
    # observed posterior-scalp carrier shapes, cap the repaired surface against
    # an elliptical cross-section fitted from the *other clean scalp sides* at
    # the same height. This removes the residual raised neutral-colour carrier.
    if character_id in PROTRUSIONS:
        clean = points[valid]
        cy = .015
        for i in indices:
            if not carrier[i] or points[i,2] < .785:
                continue
            band = clean[(np.abs(clean[:,2]-points[i,2])<.022) & (clean[:,1]>-.015)]
            if len(band)<24:
                continue
            # Duplicate UV seams should not over-weight a small surface patch.
            band = np.unique(np.round(band,3),axis=0)
            design=np.column_stack([band[:,0]**2,(band[:,1]-cy)**2])
            coeff=np.linalg.lstsq(design,np.ones(len(band)),rcond=None)[0]
            if min(coeff)<=0:
                continue
            radii=1/np.sqrt(coeff)
            if not np.all((radii>.07)&(radii<.30)):
                continue
            q=goals[i,0]**2*coeff[0]+(goals[i,1]-cy)**2*coeff[1]
            if q>1:
                k=1/math.sqrt(q)
                goals[i,0]*=k;goals[i,1]=cy+(goals[i,1]-cy)*k
    for i in indices:
        mesh.vertices[int(i)].co=goals[i]
    distances=np.linalg.norm(goals[indices]-points[indices],axis=1).tolist()

    height,width=pixels.shape[:2]
    uv=mesh.uv_layers.active.data
    painted=0
    for poly in mesh.polygons:
        if not any(selected[i] for i in poly.vertices):
            continue
        loops=list(poly.loop_indices)
        for j in range(1,len(loops)-1):
            tri=[loops[0],loops[j],loops[j+1]]
            vi=[mesh.loops[k].vertex_index for k in tri]
            coords=np.array([[uv[k].uv.x*width,uv[k].uv.y*height] for k in tri])
            low=np.maximum(0,np.floor(coords.min(axis=0)-1).astype(int))
            high=np.minimum([width-1,height-1],np.ceil(coords.max(axis=0)+1).astype(int))
            if (high<low).any() or np.prod(high-low)>30000:continue
            a,b,c=coords;ab=b-a;ac=c-a;det=ab[0]*ac[1]-ab[1]*ac[0]
            if abs(det)<.001:continue
            xs,ys=np.meshgrid(np.arange(low[0],high[0]+1),np.arange(low[1],high[1]+1))
            dx=xs+.5-a[0];dy=ys+.5-a[1]
            s=(dx*ac[1]-dy*ac[0])/det;t=(ab[0]*dy-ab[1]*dx)/det
            inside=(s>=-.025)&(t>=-.025)&(s+t<=1.025)
            ss=s[inside];tt=t[inside]
            col=(1-ss-tt)[:,None]*paint[vi[0]]+ss[:,None]*paint[vi[1]]+tt[:,None]*paint[vi[2]]
            pixels[ys[inside],xs[inside],:3]=np.clip(col,0,1)
            painted+=1
    mesh.update()
    return {'method':'surface-projection-v1','core_vertices':int(core.sum()),
        'selected_vertices':int(len(indices)), 'painted_triangles':painted,
        'max_displacement':max(distances,default=0),
        'mean_displacement':float(np.mean(distances)) if distances else 0,
        'topology_preserved':True,'uv_preserved':True,'materials_added':0}
