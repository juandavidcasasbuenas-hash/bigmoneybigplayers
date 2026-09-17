"""Leave compact, editable .blend files containing just their working asset."""
import bpy, sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]/'assets/blender'
only=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
files=[p for p in root.glob('*.blend') if p.stem in ['club-body','juan','jack','clive','doug','nat','tian','humfrey','diego','dealer'] and (not only or p.stem in only or (p.stem=='club-body' and 'body' in only))]
for path in files:
 bpy.ops.wm.open_mainfile(filepath=str(path))
 for ob in list(bpy.data.objects):
  if not (ob.get('character_id') or ob.get('asset_source') or ob.get('rig_version')):bpy.data.objects.remove(ob,do_unlink=True)
 for ob in bpy.data.objects:ob.hide_set(False);ob.hide_render=False
 bpy.data.orphans_purge(do_recursive=True)
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':
    space=area.spaces.active;space.shading.type='MATERIAL'
    space.region_3d.view_distance=4.5 if path.stem=='club-body' else 2.2
    space.region_3d.view_location=Vector((0,0,1.0 if path.stem=='club-body' else 0))
    space.region_3d.view_rotation=Vector((1.0,-3.5,.4)).to_track_quat('Z','Y')
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(path))
print('Editable Blender sources prepared')
