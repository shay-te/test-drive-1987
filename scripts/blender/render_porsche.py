"""Render the saved Porsche for the brochure and exterior/blueprint inspection."""
import bpy, sys
from mathutils import Vector
from pathlib import Path
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.eevee.use_gtao=True
scene.eevee.gtao_distance=0.16
scene.eevee.gtao_factor=1.2
scene.eevee.use_soft_shadows=True
scene.eevee.use_ssr=True
scene.eevee.taa_render_samples=48
scene.render.resolution_x=1200
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.22,0.25,0.28,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=0.5
scene.view_settings.view_transform='AgX'
# Runtime placeholders are transparent in the game; use preview glass for studio renders.
glass=bpy.data.materials.get('930 • lightly tinted glazing')
bpy.data.objects['windshield_surface'].data.materials.clear()
bpy.data.objects['windshield_surface'].data.materials.append(glass)
for name in ('instrument_surface','trip_surface','mirror_surface'):
    bpy.data.objects[name].hide_render=True
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-0.006))
ground=bpy.context.object
mat=bpy.data.materials.new('Studio floor')
mat.diffuse_color=(0.13,0.15,0.17,1)
ground.data.materials.append(mat)
for loc,power,size in (((-3,1,6),1800,5),((4,2,4),1300,4),((1,-4,5),2100,3)):
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(Vector((0,0,0.7))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object
scene.camera=cam
cam.data.lens=50
views={'front':((-4.5,5.8,2.9),(0,0,0.65)),'rear':((4,-5,2.55),(0,-0.1,0.65)),'side':((-6,0,1.9),(0,0,0.65)),'ortho-side':((-7,0,0.655),(0,0,0.655)), 'ortho-front':((0,7,0.655),(0,0,0.655)), 'ortho-top':((0,0.195,7),(0,0.195,0)), 'selection':((-6,3.6,1.9),(0,0,0.67))}
output=Path(sys.argv[sys.argv.index('--')+1])
requested=sys.argv[sys.argv.index('--')+2:]
for name,(location,target) in views.items():
    if requested and name not in requested:
        continue
    cam.location=location
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    selection = name == 'selection'
    scene.render.film_transparent = selection
    scene.render.image_settings.color_mode = 'RGBA'
    ground.hide_render = selection
    scene.render.resolution_x, scene.render.resolution_y = (1536, 512) if selection else (1200, 800)
    cam.data.type='ORTHO' if name.startswith('ortho') or selection else 'PERSP'
    cam.data.ortho_scale={'ortho-front': 2.6, 'ortho-top': 6.9, 'selection': 5.5}.get(name, 4.9)
    cam.data.lens=26 if name=='interior' else 45
    scene.render.filepath=str(output/(name+'.png'))
    bpy.ops.render.render(write_still=True)
