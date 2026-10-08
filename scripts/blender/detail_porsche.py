"""Author the 1987 930 around the existing cabin bindings; run on the integration blend once."""
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from export_cabin import box, material, node, plane, position

ROOT = Path(__file__).resolve().parents[2]
C = json.loads((ROOT / 'assets/models/porsche/cabin.json').read_text())
TAU = math.tau
SEGMENTS = 40
GROUPS = {}
GROUP = 'Body'


def register(obj):
    GROUPS.setdefault((GROUP, obj.parent.name if obj.parent else None), []).append(obj)
    return obj


def finish(obj, smooth=True):
    if obj.type == 'MESH':
        for face in obj.data.polygons:
            face.use_smooth = smooth
    return register(obj)


def mesh(name, points, faces, mat, parent=None, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata([position(p) for p in points], [], faces)
    data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return finish(obj, smooth)


def rounded(name, size, loc, mat, radius=0.008, parent=None, rotation=0):
    obj = box(name, size, loc, mat, parent)
    obj.rotation_euler.x = rotation
    bevel = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
    bevel.width = radius
    bevel.segments = 2
    bevel.affect = 'EDGES'
    obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return finish(obj)


def tube(name, points, radius, mat, parent=None, closed=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, v in zip(spline.points, points):
        p.co = (*position(v), 1)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    return register(obj)


def lathe(name, loc, profile, mat, axis='z', parent=None, segments=SEGMENTS):
    points = []
    for radius, depth in profile:
        for i in range(segments):
            a = TAU * i / segments
            if axis == 'x':
                p = (depth, radius * math.sin(a), radius * math.cos(a))
            elif axis == 'y':
                p = (radius * math.cos(a), depth, radius * math.sin(a))
            else:
                p = (radius * math.cos(a), radius * math.sin(a), depth)
            points.append(tuple(loc[k] + p[k] for k in range(3)))
    faces = []
    for row in range(len(profile) - 1):
        for i in range(segments):
            a = row * segments + i
            b = row * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    return mesh(name, points, faces, mat, parent)


def ring(name, loc, radius, thickness, mat, axis='z', parent=None):
    profile = [(radius + thickness * math.cos(TAU * i / 6), thickness * math.sin(TAU * i / 6)) for i in range(7)]
    return lathe(name, loc, profile, mat, axis, parent)


def sweep(name, profile, x0, x1, mat):
    points = [(x, y, z) for x in (x0, x1) for z, y in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    obj = mesh(name, points, faces, mat, smooth=False)
    bevel = obj.modifiers.new('Upholstered profile edges', 'BEVEL')
    bevel.width = 0.008
    bevel.segments = 2
    obj.modifiers.new('Profile normals', 'WEIGHTED_NORMAL')
    return obj


def grid(name, rows, mat):
    n = len(rows[0])
    faces = [(r*n+i, r*n+i+1, (r+1)*n+i+1, (r+1)*n+i) for r in range(len(rows)-1) for i in range(n-1)]
    return mesh(name, [p for row in rows for p in row], faces, mat)


def surface_material(name, color, roughness, metal=0):
    mat = material(name, color, roughness)
    # Palette entries are sRGB; Principled's numeric sockets use linear RGB.
    shader = mat.node_tree.nodes.get('Principled BSDF')
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    shader.inputs['Base Color'].default_value = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb) + (1,)
    shader.inputs['Metallic'].default_value = metal
    return mat


def grain(mat, strength):
    import numpy as np
    rng = np.random.default_rng(930)
    values = rng.random((256, 256))
    dx = np.roll(values, 1, axis=0) - np.roll(values, -1, axis=0)
    dy = np.roll(values, 1, axis=1) - np.roll(values, -1, axis=1)
    rgba = np.ones((256, 256, 4), dtype=np.float32)
    rgba[:, :, 0] = 0.5 + dx * strength
    rgba[:, :, 1] = 0.5 + dy * strength
    rgba[:, :, 2] = 1
    image = bpy.data.images.new(mat.name + ' fine grain', width=256, height=256)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    tree = mat.node_tree
    tex = tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    normal = tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = 0.3
    tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
    tree.links.new(normal.outputs['Normal'], tree.nodes.get('Principled BSDF').inputs['Normal'])


def prepare():
    if bpy.context.scene.get('detail_revision'):
        raise RuntimeError('This blend is already authored. Edit it directly and use export_cabin.py --export-only.')
    required = ['driver_eye', 'mirror_camera', 'steering_wheel', 'gear_lever', 'instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface'] + ['radar_led_' + str(i) for i in range(6)]
    keep = set()
    for name in required:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError('Open the existing integration blend first: missing ' + name)
        while obj:
            keep.add(obj)
            obj = obj.parent
    for obj in list(bpy.data.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    return {name: bpy.data.objects[name] for name in required}


BINDINGS = prepare()
PAINT = surface_material('930 • seafoam enamel', C['paint'], 0.26, 0.25)
PAINT.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = 0.4
LEATHER = surface_material('930 • grey leather', C['trim']['face'], 0.72)
DASH = surface_material('930 • charcoal dash leather', '#252829', 0.74)
RUBBER = surface_material('930 • rubber seals and tyres', '#171a1c', 0.84)
BLACK = surface_material('930 • satin black hardware', '#242629', 0.43)
CARPET = surface_material('930 • charcoal carpet', '#373c3e', 1)
LINER = surface_material('930 • ivory headliner', '#c8c6ba', 0.92)
CHROME = surface_material('930 • brushed alloy', '#b5bdc0', 0.26, 0.9)
RED = surface_material('930 • tail lens and belt releases', '#ac1822', 0.28)
AMBER = surface_material('930 • amber indicators', '#e97d14', 0.26)
LENS = surface_material('930 • headlamp prismatic glass', '#dbe4dd', 0.17, 0.25)
GLASS = surface_material('930 • lightly tinted glazing', '#b4d1c8', 0.13)
GLASS.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.045
GLASS.blend_method = 'BLEND'
GLASS.use_screen_refraction = True
for mat in (LEATHER, DASH, CARPET, LINER):
    grain(mat, 0.14 if mat != CARPET else 0.25)


def cabin():
    global GROUP
    GROUP = 'Interior shell'
    rounded('Carpeted floor', (1.38, 0.06, 2.10), (0, 0.18, 0.07), CARPET, 0.035)
    rounded('Carpeted pedal bulkhead', (1.31, 0.43, 0.075), (0, 0.425, -0.95), CARPET, 0.025)
    rounded('Transmission tunnel', (0.25, 0.19, 1.38), (0.015, 0.285, -0.02), CARPET, 0.065)
    for side in (-1, 1):
        x = side * 0.36
        rounded('Bound floor mat', (0.48, 0.018, 0.62), (x, 0.224, -0.26), RUBBER, 0.03)
        for j in range(13):
            tube('Mat ribs', [(x-0.2, 0.235, -0.52+j*0.04), (x+0.2, 0.235, -0.52+j*0.04)], 0.002, CARPET)
        rounded('Inner sill', (0.075, 0.11, 1.48), (side*0.68, 0.275, -0.03), CARPET, 0.018)
        rounded('Sill protector', (0.085, 0.012, 0.96), (side*0.72, 0.325, -0.06), RUBBER, 0.006)
    GROUP = 'Dashboard'
    sweep('Passenger padded dashboard', C['dash'], -0.055, 0.70, DASH)
    sweep('Lower instrument shelf', [(-0.98,0.85),(-0.77,0.85),(-0.72,0.74),(-0.62,0.735),(-0.62,0.61),(-0.98,0.51)], -0.70, -0.055, DASH)
    sweep('Sculpted instrument hood', C['hood']['profile'], -0.69, -0.01, DASH)
    rounded('Lower dash bolster', (1.36, 0.055, 0.07), (0,0.62,-0.60), DASH, 0.025)
    rounded('Switch fascia', (1.08,0.089,0.018), (-0.13,0.7,-0.618), BLACK, 0.006)
    rounded('Glove compartment', (0.36,0.14,0.02), (0.495,0.716,-0.612), DASH,0.012)
    rounded('Glove compartment latch', (0.044,0.018,0.017), (0.49,0.773,-0.593), CHROME,0.004)
    frame = bpy.data.objects['instrument_frame']
    for px, py, radius in ((150,636,50),(300,628,62),(470,622,84),(644,628,72),(800,636,52)):
        b = C['clusterBounds']
        loc = ((px-b['x']-b['w']/2)*C['face']['scale'], -(py-b['y']-b['h']/2)*C['face']['scale'], 0.008)
        ring('Deep instrument pod', loc, radius*C['face']['scale']*1.10, 0.0045, BLACK, parent=frame)
        ring('Instrument bezel lip', (loc[0],loc[1],0.012), radius*C['face']['scale']*1.10, 0.0011, CHROME, parent=frame)
    for x,y,w,h in ((-0.625,0.7,0.08,0.07),(0.11,0.806,0.20,0.048),(0.635,0.80,0.075,0.045)):
        rounded('Recessed vent', (w+0.009,h+0.009,0.009),(x,y,-0.603),BLACK,0.006)
        for k in range(4):
            rounded('Vent louvre',(w-0.008,0.0025,0.012),(x,y+(k-1.5)*h/5,-0.594),DASH,0.001)
        for k in (-1,1):
            rounded('Vent vertical divider',(0.003,h-0.006,0.012),(x+k*w/6,y,-0.59),BLACK,0.001)
    for x,y in C['switches']:
        lathe('Pull switch',(x,y,-0.584),[(0,0),(0.012,0),(0.012,0.014),(0.009,0.018),(0,0.018)],BLACK,segments=24)
        ring('Switch collar',(x,y,-0.60),0.014,0.0015,CHROME)
    rounded('Radio chassis',(0.195,0.061,0.014),(0.08,0.7,-0.609),BLACK,0.004)
    for i in range(6):
        rounded('Radio preset key',(0.008,0.009,0.009),(0.137+(i%3)*0.011,0.691+(i//3)*0.019,-0.593),DASH,0.001)
    rounded('Cassette slot',(0.075,0.006,0.008),(0.084,0.662,-0.598),RUBBER,0.001)
    for j in range(3):
        rounded('Heater slider track',(0.125,0.004,0.01),(-0.105,0.699+j*0.016,-0.595),RUBBER,0.001)
        rounded('Heater slider tab',(0.012,0.008,0.012),(-0.13+j*0.033,0.699+j*0.016,-0.584),RED if j==0 else DASH,0.002)
    for x in (-0.52,0.5):
        rounded('Demister recess',(0.27,0.008,0.045),(x,0.863,-0.934),BLACK,0.012)
        for k in range(10):
            rounded('Demister fin',(0.003,0.004,0.037),(x+(k-4.5)*0.024,0.87,-0.934),DASH,0.001)
    GROUP = 'Console'
    sweep('Tapered centre console',[(-0.64,0.60),(-0.48,0.60),(-0.29,0.27),(-0.62,0.24)],-0.10,0.16,LEATHER)
    rounded('Climate panel',(0.218,0.15,0.018),(0.03,0.51,-0.425),BLACK,0.008,rotation=-0.48)
    for x in (-0.035,0.095):
        lathe('Climate rotary control',(x,0.52,-0.39),[(0,0),(0.023,0),(0.023,0.017),(0.018,0.023),(0,0.023)],BLACK,segments=32)
        rounded('Rotary index',(0.002,0.01,0.002),(x,0.534,-0.366),LINER,0.0008)
    rounded('Console pocket',(0.18,0.07,0.025),(0.03,0.372,-0.319),RUBBER,0.008)
    rounded('Handbrake base',(0.065,0.04,0.27),(-0.083,0.36,0.23),BLACK,0.018)
    tube('Handbrake lever',[(-0.083,0.38,0.34),(-0.083,0.46,0.14)],0.013,DASH)
    lathe('Handbrake button',(-0.083,0.46,0.135),[(0.007,0),(0.007,0.012)],CHROME,segments=16)
    for x in (-0.145,0.17):
        rounded('Seat belt receiver',(0.035,0.065,0.055),(x,0.405,0.26),BLACK,0.008)
        rounded('Belt release',(0.027,0.015,0.045),(x,0.438,0.26),RED,0.004)
    for i in range(3):
        x=-0.51+i*0.115
        tube('Pedal stalk',[(x,0.24,-0.76),(x,0.38,-0.72)],0.009,BLACK)
        rounded('Floor hinged pedal',(0.063,0.10 if i<2 else 0.16,0.025),(x,0.36,-0.694),RUBBER,0.01,rotation=0.26)
        for k in range(4):
            rounded('Pedal grip',(0.05,0.004,0.008),(x,0.332+k*0.017,-0.674),DASH,0.001)
    GROUP = 'Animated controls'
    spin = BINDINGS['steering_wheel']
    ring('Leather wrapped steering rim',(0,0,0),0.19,0.019,DASH,parent=spin)
    ring('Wheel inner stitching',(0,0,0.014),0.179,0.0012,LEATHER,parent=spin)
    for y in (-0.069,0.058):
        rounded('Four spoke crossbar',(0.328,0.019,0.025),(0,y,0),BLACK,0.008,spin)
    for side in (-1,1):
        tube('Spoke return',[(side*0.14,-0.076,0),(side*0.10,-0.036,0),(side*0.1,0.052,0)],0.012,BLACK,spin)
    rounded('Horn pad',(0.218,0.088,0.055),(0,-0.006,0.018),DASH,0.022,spin)
    rounded('Horn inset',(0.185,0.064,0.007),(0,-0.006,0.049),BLACK,0.013,spin)
    tube('Turn indicator stalk',[(-0.42,0.72,-0.46),(-0.565,0.745,-0.45)],0.007,BLACK)
    rounded('Indicator grip',(0.038,0.021,0.026),(-0.56,0.745,-0.45),BLACK,0.006)
    tube('Wiper stalk',[(-0.29,0.72,-0.46),(-0.19,0.747,-0.45)],0.006,BLACK)
    lever = BINDINGS['gear_lever']
    lathe('Leather shift gaiter',(0,0,0),[(0.068,0),(0.071,0.023),(0.057,0.064),(0.05,0.084),(0.055,0.11),(0.037,0.143),(0.035,0.17),(0.02,0.21)],LEATHER,'y',lever,32)
    lathe('Shift stem',(0,0,0),[(0.013,0.19),(0.012,0.30)],BLACK,'y',lever,24)
    lathe('Shift knob',(0,0.30,0),[(0,-0.022),(0.02,-0.015),(0.025,0),(0.021,0.019),(0,0.027)],DASH,'y',lever,32)
    for x in (-0.008,0.008):
        tube('Shift gate engraving',[(x,0.327,-0.011),(x,0.327,0.011)],0.0009,LINER,lever)
    tube('Shift gate bridge',[(-0.008,0.327,0),(0.008,0.327,0)],0.0009,LINER,lever)


def seats_and_doors():
    global GROUP
    GROUP = 'Seats and upholstery'
    for x in (-0.36,0.36):
        rounded('Seat plinth',(0.46,0.07,0.47),(x,0.27,0.12),BLACK,0.02)
        for dx in (-0.17,0.17):
            rounded('Seat rail',(0.023,0.024,0.58),(x+dx,0.24,0.10),CHROME,0.004)
        rounded('Seat cushion core',(0.43,0.12,0.49),(x,0.345,0.075),LEATHER,0.05)
        for dx in (-0.205,0.205):
            rounded('Cushion side bolster',(0.108,0.17,0.51),(x+dx,0.385,0.09),LEATHER,0.047)
            tube('Cushion piping',[(x+dx,0.447,-0.105),(x+dx,0.470,0.04),(x+dx,0.449,0.29)],0.0012,LEATHER)
        for j in range(5):
            rounded('Cushion centre pleat',(0.303,0.038,0.073),(x,0.414,-0.09+j*0.077),LEATHER,0.015)
        # The headrest grows from the backrest silhouette, as on the period seats.
        rows=[]
        for y,z,half,depth in ((0.39,0.36,0.205,0.064),(0.48,0.38,0.25,0.072),(0.71,0.44,0.244,0.072),(0.91,0.49,0.186,0.065),(1.035,0.51,0.137,0.06),(1.075,0.51,0.105,0.025),(1.093,0.51,0.001,0.001)):
            rows.append([(x+half*math.cos(TAU*i/40),y,z+depth*math.sin(TAU*i/40)) for i in range(41)])
        grid('Integrated headrest seat shell',rows,LEATHER)
        for j in range(5):
            rounded('Backrest pleat',(0.29,0.067,0.043),(x,0.51+j*0.071,0.307+j*0.02),LEATHER,0.017,rotation=-0.24)
        for side in (-1,1):
            rounded('Sport backrest bolster',(0.09,0.39,0.13),(x+side*0.19,0.67,0.375),LEATHER,0.04,rotation=-0.23)
            tube('Seatback edge piping',[(x+side*0.216,0.48,0.34),(x+side*0.222,0.72,0.42),(x+side*0.17,0.93,0.47),(x+side*0.105,1.07,0.50)],0.0012,LEATHER)
        rounded('Seat release handle',(0.025,0.053,0.035),(x+(-0.19 if x<0 else 0.19),0.90,0.484),BLACK,0.006)
        rounded('Rear seat cushion',(0.46,0.10,0.36),(x,0.31,0.89),LEATHER,0.045)
        rounded('Rear folding backrest',(0.47,0.34,0.075),(x,0.50,1.092),LEATHER,0.035,rotation=-0.20)
        for k in range(5):
            rounded('Rear seat pleat',(0.058,0.27,0.018),(x+(k-2)*0.07,0.5,1.037),LEATHER,0.01,rotation=-0.20)
        rounded('Rear lap belt buckle',(0.043,0.028,0.047),(x-0.16,0.379,0.87),BLACK,0.005)
    GROUP = 'Doors and rear trim'
    for side in (-1,1):
        x=side*0.698
        rounded('Door card',(0.047,0.51,1.31),(x,0.584,-0.11),LEATHER,0.02)
        rounded('Door upper bolster',(0.068,0.074,1.35),(x-side*0.01,0.855,-0.125),DASH,0.022)
        rounded('Door carpet kick panel',(0.021,0.17,1.23),(x-side*0.029,0.37,-0.12),CARPET,0.02)
        for j in range(6):
            z=-0.56+j*0.145
            tube('Door pleat seam',[(x-side*0.027,0.80,z),(x-side*0.031,0.67,z+0.03),(x-side*0.028,0.58,z+0.045)],0.0017,DASH)
        rounded('Armrest',(0.112,0.058,0.64),(x-side*0.061,0.555,-0.03),LEATHER,0.023)
        tube('Upright door pull',[(x-side*0.088,0.566,-0.16),(x-side*0.11,0.60,-0.22),(x-side*0.066,0.76,-0.29)],0.022,LEATHER)
        rounded('Door pocket',(0.105,0.12,0.58),(x-side*0.053,0.43,0.095),LEATHER,0.014)
        rounded('Door pocket opening',(0.064,0.01,0.48),(x-side*0.078,0.492,0.095),RUBBER,0.009)
        rounded('Door release escutcheon',(0.017,0.055,0.105),(x-side*0.03,0.64,-0.55),BLACK,0.01)
        rounded('Door release paddle',(0.028,0.014,0.064),(x-side*0.043,0.645,-0.549),CHROME,0.006)
        for z in (-0.39,-0.33):
            rounded('Window rocker',(0.016,0.032,0.021),(x-side*0.037,0.778,z),BLACK,0.004)
        lathe('Door woofer',(x-side*0.034,0.435,-0.49),[(0,0),(0.066,0),(0.07,-side*0.008),(0.065,-side*0.014),(0,-side*0.014)],BLACK,'x',segments=40)
        for radius in (0.018,0.035,0.052):
            ring('Speaker grille concentric',(x-side*0.05,0.435,-0.49),radius,0.001,CARPET,'x')
        ring('Door tweeter',(x-side*0.032,0.75,0.20),0.033,0.005,BLACK,'x')
        rounded('Rear quarter trim',(0.045,0.43,0.56),(side*0.675,0.62,0.82),LEATHER,0.028)
        tube('Shoulder belt webbing',[(side*0.659,1.066,0.47),(side*0.64,0.68,0.51),(side*0.63,0.30,0.44)],0.012,BLACK)
        rounded('Belt upper guide',(0.045,0.055,0.029),(side*0.658,1.061,0.476),BLACK,0.008)
    rounded('Rear carpeted bulkhead',(1.31,0.57,0.10),(0,0.485,1.17),CARPET,0.025)
    rounded('Parcel shelf',(1.28,0.07,0.35),(0,0.766,1.14),CARPET,0.04)
    for x in (-0.39,0.39):
        rounded('Rear speaker grille',(0.19,0.016,0.10),(x,0.808,1.11),BLACK,0.034)
        for j in range(8):
            tube('Rear grille slot',[(x-0.065,0.818,1.075+j*0.01),(x+0.065,0.818,1.075+j*0.01)],0.0015,CARPET)


def roof_and_glazing():
    global GROUP
    GROUP = 'Roof and window frames'
    w=C['windshield']
    front=[(-w['baseHalf'],w['baseY'],w['baseZ']),(-w['topHalf'],w['topY'],w['topZ']),(w['topHalf'],w['topY'],w['topZ']),(w['baseHalf'],w['baseY'],w['baseZ'])]
    tube('Windshield rubber surround',front,0.014,RUBBER,closed=True)
    tube('Windshield outer trim',[(x*1.015,y+0.005,z-0.004) for x,y,z in front],0.007,PAINT,closed=True)
    for side in (-1,1):
        a=(side*0.69,0.889,-0.90)
        b=(side*0.591,1.214,-0.398)
        c=(side*0.606,1.211,0.34)
        d=(side*0.708,0.889,0.45)
        points=[a,b,c,d]
        tube('Door window surround',points,0.018,BLACK,closed=True)
        tube('Painted A pillar',[(side*0.695,0.873,-0.972),(side*0.6,1.235,-0.423)],0.026,PAINT)
        tube('Inner A pillar',[(side*0.671,0.863,-0.948),(side*0.577,1.205,-0.404)],0.023,DASH)
        tube('Door quarterlight divider',[(side*0.674,0.90,-0.64),(side*0.60,1.174,-0.454)],0.009,BLACK)
        mesh('Door glass',points,[(0,1,2,3)],GLASS,smooth=False)
        quarter=[(side*0.71,0.895,0.50),(side*0.609,1.205,0.405),(side*0.633,1.095,0.82),(side*0.691,0.915,1.16)]
        tube('Quarter window gasket',quarter,0.017,RUBBER,closed=True)
        mesh('Rear quarter glass',quarter,[(0,1,2,3)],GLASS,smooth=False)
        tube('B pillar',[(side*0.713,0.88,0.479),(side*0.609,1.22,0.372)],0.028,BLACK)
        tube('Inner B pillar',[(side*0.688,0.88,0.478),(side*0.589,1.208,0.372)],0.023,LINER)
        tube('Roof rain gutter',[(side*0.615,1.245,-0.415),(side*0.632,1.26,-0.1),(side*0.626,1.237,0.37),(side*0.653,1.11,0.86),(side*0.708,0.906,1.28)],0.009,BLACK)
        pillar=[(side*0.609,1.211,0.34),(side*0.58,1.239,0.575),(side*0.656,0.891,1.344),(side*0.72,0.883,1.30),(side*0.691,0.915,1.16),(side*0.633,1.095,0.82)]
        mesh('Wide C pillar',pillar,[(0,1,2,3,4,5)],PAINT)
        mesh('C pillar upholstery',[(x-side*0.016,y-0.013,z-0.006) for x,y,z in pillar],[(0,1,2,3,4,5)],LINER)
        tube('Rear inner quarter surround',[(side*0.60,1.194,0.43),(side*0.63,1.09,0.80),(side*0.68,0.887,1.13)],0.023,LINER)
        rounded('Sun visor',(0.39,0.026,0.14),(side*0.33,1.204,-0.32),LINER,0.035)
        tube('Visor hinge',[(side*0.48,1.215,-0.375),(side*0.57,1.214,-0.375)],0.005,CHROME)
        rounded('Roof grab handle',(0.02,0.022,0.17),(side*0.582,1.186,0.10),LINER,0.008)
    rows=[]
    for j in range(25):
        t=j/24
        z=-0.435+t*1.04
        center=1.25+0.06*math.sin(math.pi*t)**0.7
        width=0.60+0.02*math.sin(math.pi*t)
        rows.append([(width*(i/16*2-1),center-0.035*(i/16*2-1)**2,z) for i in range(17)])
    grid('Crowned steel roof',rows,PAINT)
    grid('Perforated headlining',[[(x,y-0.031,z) for x,y,z in row] for row in rows],LINER)
    for z in (-0.15,0.42):
        tube('Headliner transverse seams',[(-0.58,1.24,z),(0,1.274,z),(0.58,1.24,z)],0.002,LINER)
    tube('Sunroof panel gap',[(-0.39,1.292,-0.13),(0.39,1.292,-0.13),(0.39,1.29,0.35),(-0.39,1.29,0.35)],0.0018,RUBBER,closed=True)
    rounded('Dome lamp housing',(0.10,0.017,0.052),(0,1.253,0.45),CHROME,0.013)
    rounded('Dome lamp lens',(0.078,0.019,0.036),(0,1.241,0.45),LENS,0.012)
    rear=[(-0.58,1.239,0.575),(0.58,1.239,0.575),(0.656,0.891,1.344),(-0.656,0.891,1.344)]
    mesh('Curved rear window',rear,[(0,1,2,3)],GLASS,smooth=False)
    tube('Rear window rubber seal',rear,0.016,RUBBER,closed=True)
    for j in range(1,13):
        t=j/13
        y=1.239*(1-t)+0.891*t
        z=0.575*(1-t)+1.344*t
        half=0.57+0.07*t
        tube('Heated rear window filament',[(-half,y+0.001,z),(half,y+0.001,z)],0.00065,CHROME)
    r=C['mirror']
    rounded('Mirror housing',(0.255,0.086,0.032),(r['x'],r['y'],r['z']-0.019),BLACK,0.016)
    tube('Mirror mounting arm',[(0,1.191,-0.552),(0,1.18,-0.523),(0,1.163,-0.523)],0.008,BLACK)
    rounded('Radar detector',(0.123,0.035,0.072),(-0.5,1.177,-0.34),BLACK,0.007)
    for i in range(8):
        rounded('Radar vent',(0.0015,0.016,0.002),(-0.546+i*0.005,1.18,-0.302),DASH,0.0005)


def exterior():
    global GROUP
    GROUP = 'Exterior body'
    sections=[(-2.35,0.735,0.69),(-2.2,0.812,0.795),(-1.95,0.85,0.848),(-1.55,0.873,0.875),(-1.1,0.81,0.885),(-0.94,0.78,0.887),(0.1,0.786,0.891),(0.40,0.842,0.894),(0.722,0.8875,0.89),(1.12,0.887,0.873),(1.51,0.847,0.754),(1.90,0.749,0.60)]
    def interpolate(z,index):
        for i,(a,b) in enumerate(zip(sections,sections[1:])):
            if a[0]<=z<=b[0]:
                t=(z-a[0])/(b[0]-a[0])
                before=sections[max(0,i-1)]
                after=sections[min(len(sections)-1,i+2)]
                m0=(b[index]-before[index])/(b[0]-before[0])*(b[0]-a[0])
                m1=(after[index]-a[index])/(after[0]-a[0])*(b[0]-a[0])
                return (2*t**3-3*t*t+1)*a[index]+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*b[index]+(t**3-t*t)*m1
        return sections[-1][index]
    def skin_x(z,y):
        bottom=0.225
        for axle in (-1.55,0.722):
            if abs(z-axle)<0.364:
                bottom=max(bottom,0.312+math.sqrt(0.364**2-(z-axle)**2))
        t=max(0,min(1,(interpolate(z,2)-y)/(interpolate(z,2)-bottom)))
        return interpolate(z,1)-0.065+0.09*math.sin(math.pi*t*0.75)-0.036*t+0.002
    for side in (-1,1):
        rows=[]
        for j in range(181):
            z=-2.35+j*4.25/180
            width=interpolate(z,1)
            top=interpolate(z,2)
            bottom=0.225
            for axle in (-1.55,0.722):
                dz=z-axle
                if abs(dz)<0.364:
                    bottom=max(bottom,0.312+math.sqrt(0.364**2-dz**2))
            row=[]
            for k in range(9):
                t=k/8
                x=width-0.065+0.09*math.sin(math.pi*t*0.75)-0.036*t
                y=top*(1-t)+bottom*t
                row.append((side*x,y,z))
            rows.append(row)
        grid('Continuous flared side skin',rows,PAINT)
        for axle in (-1.55,0.722):
            points=[]
            for j in range(49):
                a=math.pi*j/48
                z=axle-0.364*math.cos(a)
                points.append((side*(interpolate(z,1)-0.032),0.312+0.364*math.sin(a),z))
            tube('Rolled wheel arch lip',points,0.008,PAINT)
        rounded('Rocker panel',(0.09,0.11,1.45),(side*0.756,0.237,-0.41),PAINT,0.026)
        rounded('Rocker rubber strip',(0.036,0.034,1.49),(side*0.787,0.302,-0.40),RUBBER,0.011)
        seam=[(-0.908,0.882),(-0.952,0.80),(-0.958,0.73),(-0.945,0.54),(-0.917,0.32),(-0.86,0.287),(0.17,0.287),(0.29,0.315),(0.36,0.41),(0.40,0.62),(0.438,0.887)]
        tube('Door shut line',[(side*skin_x(z,y),y,z) for z,y in seam],0.0018,RUBBER)
        rounded('Exterior handle recess',(0.012,0.041,0.153),(side*skin_x(0.272,0.785),0.785,0.272),RUBBER,0.017)
        rounded('Exterior door handle',(0.036,0.019,0.121),(side*(skin_x(0.26,0.788)+0.016),0.788,0.26),BLACK,0.008)
        lathe('Door lock',(side*0.802,0.783,0.333),[(0.009,0),(0.009,side*0.003)],CHROME,'x',segments=20)
        rounded('Flag mirror pedestal',(0.055,0.072,0.09),(side*0.756,0.907,-0.75),PAINT,0.018)
        rounded('Flag mirror shell',(0.163,0.105,0.082),(side*0.821,0.968,-0.747),PAINT,0.027)
        rounded('Flag mirror gasket',(0.141,0.079,0.006),(side*0.828,0.968,-0.70),RUBBER,0.016)
        rounded('Flag mirror reflective face',(0.123,0.063,0.002),(side*0.828,0.969,-0.696),CHROME,0.012)
        mesh('Rear arch stone guard',[(side*0.800,0.30,0.23),(side*0.85,0.60,0.38),(side*0.879,0.67,0.50),(side*0.856,0.62,0.43),(side*0.804,0.31,0.39)],[(0,1,2,3,4)],RUBBER)
    # Bonnet and deck are separate from the wheel-arch skin and the open cabin.
    for front in (True,False):
        rows=[]
        start,end=(-2.35,-0.966) if front else (1.345,1.90)
        for j in range(41):
            z=start+(end-start)*j/40
            width=interpolate(z,1)
            shoulder=interpolate(z,2)
            t=j/40
            center=0.52+0.335*t**0.65 if front else shoulder-0.015
            rows.append([((width-0.065)*(i/32*2-1),center+(shoulder-center)*math.sin(abs(i/32*2-1)*math.pi/2)**12,z) for i in range(33)])
        grid('Compound bonnet and raised fenders' if front else 'Rear engine deck',rows,PAINT)
    for side in (-1,1):
        rows=[]
        for j in range(25):
            z=0.43+j*0.915/24
            outer=interpolate(z,1)-0.065
            inner=0.705-0.05*j/24
            y=interpolate(z,2)
            rows.append([(side*(inner+(outer-inner)*k/6),y+0.008*math.sin(k/6*math.pi),z) for k in range(7)])
        grid('Rear haunch shoulder',rows,PAINT)
    for z,top in ((-2.35,0.52),(1.9,0.595)):
        rounded('Rounded body end closure',(1.40,top-0.30,0.095),(0,(top+0.30)/2,z),PAINT,0.042)
    for end,center,sign in ((-2.35,0.52,-1),(1.9,0.585,1)):
        apron=[]
        for j in range(9):
            t=j/8
            width=interpolate(end,1)-0.065+0.09*math.sin(math.pi*t*0.75)-0.036*t
            shoulder=interpolate(end,2)*(1-t)+0.225*t
            middle=center*(1-t)+0.225*t
            apron.append([(width*(i/32*2-1),middle+(shoulder-middle)*math.sin(abs(i/32*2-1)*math.pi/2)**12,end+sign*0.04*math.sin(t*math.pi)*(1-(i/32*2-1)**2)) for i in range(33)])
        grid('Continuous rounded apron',apron,PAINT)
    for side in (-1,1):
        tube('Bonnet panel gap',[(side*0.45,0.50,-2.29),(side*0.48,0.63,-2.13),(side*0.51,0.704,-1.90),(side*0.55,0.78,-1.54),(side*0.59,0.819,-0.97)],0.002,RUBBER)
    rounded('Front valance',(1.47,0.16,0.15),(0,0.31,-2.25),PAINT,0.055)
    rounded('Front impact bumper',(1.55,0.10,0.16),(0,0.456,-2.315),PAINT,0.043)
    rounded('Front rubber bumper strip',(1.51,0.042,0.035),(0,0.461,-2.402),RUBBER,0.013)
    rounded('Front chin spoiler',(1.46,0.071,0.11),(0,0.224,-2.225),RUBBER,0.035)
    rounded('Central cooling opening',(0.52,0.055,0.015),(0,0.31,-2.331),BLACK,0.012)
    for side in (-1,1):
        rounded('Front amber indicator',(0.205,0.061,0.025),(side*0.603,0.458,-2.405),AMBER,0.008)
        rounded('Recessed fog lamp',(0.19,0.061,0.022),(side*0.53,0.323,-2.336),BLACK,0.012)
        rounded('Fog lamp lens',(0.153,0.045,0.009),(side*0.53,0.323,-2.351),LENS,0.005)
        for j in range(10):
            rounded('Indicator lens prism',(0.0015,0.052,0.002),(side*0.603+(j-4.5)*0.018,0.458,-2.42),AMBER,0.0005)
        for z in (-2.10,1.69):
            for j in range(8):
                rounded('Impact bumper accordion',(0.052,0.115,0.012),(side*(0.834 if z<0 else 0.798),0.452,z+(j-3.5)*0.017),RUBBER,0.004)
        mount=node('Headlamp assembly',(side*0.597,0.686,-2.40),pitch=math.radians(19))
        lathe('Sculpted headlamp bucket',(0,0,0),[(0.104,0),(0.111,0.025),(0.112,0.08),(0.108,0.14),(0.09,0.22),(0.04,0.30)],PAINT,parent=mount)
        ring('Painted headlamp ring',(0,0,0),0.104,0.013,PAINT,parent=mount)
        ring('Headlamp chrome lip',(0,0,-0.009),0.091,0.003,CHROME,parent=mount)
        lathe('Convex headlamp lens',(0,0,-0.011),[(0.09,0),(0.078,-0.009),(0.05,-0.018),(0,-0.022)],LENS,parent=mount)
        for k in range(-6,7):
            x=k*0.012
            y=math.sqrt(max(0,0.084**2-x*x))
            tube('Headlamp vertical fluting',[(x,-y,-0.017),(x,0,-0.033),(x,y,-0.017)],0.001,CHROME,mount)
    rounded('Rear impact bumper',(1.52,0.115,0.20),(0,0.445,1.83),PAINT,0.042)
    rounded('Rear bumper strip',(1.5,0.035,0.034),(0,0.477,1.937),RUBBER,0.01)
    rounded('Rear lower apron',(1.39,0.11,0.11),(0,0.298,1.826),PAINT,0.032)
    rounded('Rear reflector panel',(1.31,0.087,0.037),(0,0.596,1.897),RED,0.013)
    for side in (-1,1):
        rounded('Rear bumper overrider',(0.115,0.17,0.11),(side*0.37,0.414,1.946),RUBBER,0.022)
        rounded('Rear amber lens',(0.15,0.084,0.014),(side*0.654,0.596,1.904),AMBER,0.01)
        rounded('Reverse lamp',(0.065,0.054,0.016),(side*0.489,0.589,1.922),LENS,0.006)
        for j in range(14):
            rounded('Tail lens prism',(0.0016,0.072,0.002),(side*0.54+(j-6.5)*0.012,0.596,1.920),RED,0.0005)
    rounded('Rear plate recess',(0.286,0.126,0.012),(0,0.423,1.965),BLACK,0.01)
    lathe('Exhaust outlet',(-0.54,0.255,1.92),[(0.033,-0.12),(0.033,0.10),(0.027,0.11),(0.024,-0.015)],CHROME,segments=40)
    lathe('Dark exhaust bore',(-0.54,0.255,1.91),[(0,-0.01),(0.025,-0.01)],BLACK,segments=32)
    GROUP = 'Turbo spoiler'
    sweep('Tea tray pedestal',[(1.05,0.83),(1.23,0.91),(1.73,0.89),(1.65,0.69),(1.42,0.78)],-0.63,0.63,PAINT)
    rounded('Tea tray rubber edge',(1.42,0.075,0.70),(0,0.928,1.435),RUBBER,0.075)
    rounded('Spoiler painted upper insert',(1.22,0.018,0.55),(0,0.969,1.414),PAINT,0.059)
    rounded('Intercooler grille recess',(0.94,0.022,0.42),(0,0.982,1.385),BLACK,0.035)
    for j in range(16):
        rounded('Intercooler grille slat',(0.876,0.012,0.011),(0,0.997,1.195+j*0.025),DASH,0.004)
    for x in (-0.29,0,0.29):
        rounded('Grille longitudinal rib',(0.011,0.016,0.383),(x,1.003,1.384),RUBBER,0.003)
    GROUP = 'Exterior hardware'
    for wiper in C['wipers']:
        a,b=wiper['pivot'],wiper['tip']
        tube('Windshield wiper arm',[a,b],0.0045,BLACK)
        tube('Wiper rubber blade',[(b[0]-0.1,b[1]+0.005,b[2]),(b[0]+0.14,b[1]+0.005,b[2])],0.005,RUBBER)
    tube('Aerial mast',[(0.706,0.892,-0.913),(0.70,1.41,-0.89)],0.002,BLACK)
    tube('Fuel flap seam',[(-0.70,0.827,-1.13),(-0.61,0.821,-1.13),(-0.60,0.804,-1.28),(-0.70,0.811,-1.28)],0.0015,RUBBER,closed=True)
    rounded('Undertray',(1.24,0.035,3.65),(0,0.181,-0.14),BLACK,0.08)


def wheels():
    global GROUP
    GROUP = 'Fuchs wheels'
    for z,width in ((-1.55,0.205),(0.722,0.245)):
        for side in (-1,1):
            x=side*(0.753 if z<0 else 0.763)
            outer=side*width/2
            profile=[(0.215,-width/2),(0.275,-width/2),(0.307,-width*0.36),(0.318,-width*0.22),(0.318,width*0.22),(0.307,width*0.36),(0.275,width/2),(0.215,width/2)]
            lathe('Rounded tyre carcass',(x,0.318,z),profile,RUBBER,'x')
            for r in (0.228,0.281,0.295):
                ring('Tyre sidewall moulding',(x+outer*1.005,0.318,z),r,0.0015,RUBBER,'x')
            for j in range(40):
                a=TAU*j/40
                pts=[]
                for k in range(5):
                    offset=(k/4-0.5)*width*0.63
                    angle=a+abs(k/4-0.5)*0.06
                    pts.append((x+offset,0.318+0.3185*math.sin(angle),z+0.3185*math.cos(angle)))
                tube('Tread siping',pts,0.0011,BLACK)
            face=x+outer
            lathe('Anodised wheel lip',(face,0.318,z),[(0.187,-side*0.023),(0.207,-side*0.020),(0.210,0),(0.203,side*0.005),(0.183,side*0.008)],CHROME,'x')
            lathe('Black wheel barrel',(face,0.318,z),[(0.183,-side*0.038),(0.183,-side*0.006)],BLACK,'x')
            lathe('Brake disc',(face-side*0.038,0.318,z),[(0.05,0),(0.149,0),(0.149,-side*0.012),(0.05,-side*0.012)],CHROME,'x')
            rounded('Brake caliper',(0.034,0.095,0.041),(face-side*0.022,0.318,z-0.132),BLACK,0.011)
            lathe('Wheel centre hub',(face,0.318,z),[(0,-side*0.015),(0.072,-side*0.015),(0.069,side*0.008),(0.03,side*0.018),(0,side*0.018)],BLACK,'x')
            for spoke in range(5):
                a=TAU*spoke/5+math.pi/2
                # Broad petals narrow at the centre and spread into the rim.
                outline=[(0.048,-0.029),(0.115,-0.037),(0.183,-0.034),(0.183,0.034),(0.115,0.037),(0.048,0.029)]
                points=[]
                for depth in (-0.013,0.004):
                    for radial,tangent in outline:
                        points.append((face+side*depth,0.318+radial*math.sin(a)+tangent*math.cos(a),z+radial*math.cos(a)-tangent*math.sin(a)))
                n=len(outline)
                faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(k,(k+1)%n,(k+1)%n+n,k+n) for k in range(n)]
                petal=mesh('Five spoke Fuchs petal',points,faces,BLACK)
                mod=petal.modifiers.new('Forged spoke edge','BEVEL')
                mod.width=0.004
                mod.segments=2
                angle=a+0.27
                lathe('Wheel nut',(face+side*0.01,0.318+0.045*math.sin(angle),z+0.045*math.cos(angle)),[(0.008,0),(0.008,side*0.013),(0,side*0.013)],CHROME,'x',segments=6)
            ring('Hub cap lip',(face+side*0.02,0.318,z),0.027,0.0014,CHROME,'x')


def consolidate():
    # Material batches retain separate moving parents; surfaces and anchors are never joined.
    for (group,parent_name),objects in GROUPS.items():
        batches={}
        for obj in objects:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.convert(target='MESH')
            if not obj.data.uv_layers:
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=0.015)
                bpy.ops.object.mode_set(mode='OBJECT')
            batches.setdefault(obj.data.materials[0].name,[]).append(obj)
        collection=bpy.data.collections.get(group) or bpy.data.collections.new(group)
        if collection.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(collection)
        for mat,parts in batches.items():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in parts:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=parts[0]

            if len(parts) > 1:
                bpy.ops.object.join()
            obj=parts[0]
            obj.name=group+' • '+mat.split(' • ')[-1]
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            for owner in list(obj.users_collection):
                owner.objects.unlink(obj)
            collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene['vehicle']='1987 Porsche 911 Turbo (930), LHD coupe'
    bpy.context.scene['source']='Reference-informed original geometry; see assets/models/porsche/references.json'
    bpy.context.scene['detail_revision']=1
    bpy.context.scene.world.color=(0.18,0.18,0.18)
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.clip_end=100
            area.spaces.active.region_3d.view_distance=6
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/models/porsche/cabin.blend'))
    triangles=sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH')
    print('PORSCHE_DETAIL_SAVED',len(bpy.data.objects),'objects;',triangles,'polygons')


cabin()
seats_and_doors()
roof_and_glazing()
exterior()
wheels()
consolidate()
