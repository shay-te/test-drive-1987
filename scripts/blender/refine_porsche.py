"""Refine the authored source against the supplied blueprint without regenerating the cabin."""
import json
import math
from pathlib import Path

import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[2]
TARGET = {'length': 4.291, 'width': 1.775, 'height': 1.310, 'wheelbase': 2.272,
          'frontTrack': 1.432, 'rearTrack': 1.492, 'frontAxle': -1.390, 'rearAxle': 0.882}
EXTERIOR = ('Exterior body', 'Exterior hardware', 'Turbo spoiler')


def world_points(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def bounds(points):
    return [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)]


def body_points():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.name.startswith('Exterior body'):
            continue
        if any('brushed alloy' in m.name for m in obj.data.materials):
            continue  # Exhaust tip is not part of the blueprint bumper-to-bumper dimension.
        points.extend(world_points(obj))
    return points


def measure():
    p = body_points()
    limits = bounds(p)
    body = [v for v in p if v.y < -0.5 or v.y > 0.95]
    width = bounds(body)[0]
    roof = [v.z for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Roof and window')
            for v in world_points(o) if abs(v.x) < 0.56]
    tyre = next(o for o in bpy.context.scene.objects if o.name.startswith('Fuchs wheels') and 'rubber' in o.name)
    wheels = []
    for front in (True, False):
        for side in (-1, 1):
            pts = [v for v in world_points(tyre) if (v.y > 0.6) == front and v.x * side > 0]
            extent = bounds(pts)
            wheels.append([(extent[0][0]+extent[0][1])/2, -(extent[1][0]+extent[1][1])/2])
    return {'length': limits[1][1]-limits[1][0], 'width': width[1]-width[0], 'height': max(roof),
            'wheelbase': wheels[2][1]-wheels[0][1], 'frontTrack': wheels[1][0]-wheels[0][0],
            'rearTrack': wheels[3][0]-wheels[2][0], 'frontAxle': wheels[0][1], 'rearAxle': wheels[2][1]}


def longitudinal(z, front, rear, height):
    stations = [(front, -2.340), (-1.55, TARGET['frontAxle']), (-0.98, -0.98),
                (0.40, 0.40), (0.722, TARGET['rearAxle']), (1.5, 1.60), (rear, 1.951)]
    arches = [(front, -2.340), (-1.92, -1.76), (-1.18, -1.02), (-0.98, -0.98),
              (0.33, 0.49), (1.12, 1.28), (1.5, 1.60), (rear, 1.951)]
    values = []
    for knots in (arches, stations):
        value = knots[-1][1] + z-rear
        for a, b in zip(knots, knots[1:]):
            if z <= b[0]:
                value = a[1] + (z-a[0])*(b[1]-a[1])/(b[0]-a[0])
                break
        values.append(value)
    t = min(1, max(0, (height-0.70)/0.19))
    t = t*t*(3-2*t)
    return values[0]*(1-t) + values[1]*t


def components(mesh):
    neighbours = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].append(b)
        neighbours[b].append(a)
    unseen = set(range(len(mesh.vertices)))
    while unseen:
        stack = [unseen.pop()]
        result = []
        while stack:
            i = stack.pop()
            result.append(i)
            for n in neighbours[i]:
                if n in unseen:
                    unseen.remove(n)
                    stack.append(n)
        yield result


def main():
    scene = bpy.context.scene
    if scene.get('detail_revision') != 1:
        raise RuntimeError('Refinement requires the authored revision 1 blend; do not regenerate or repeat it.')
    before = measure()
    limits = bounds([p for o in scene.objects if o.type == 'MESH' and o.name.startswith('Exterior body')
                     and not (o.parent and o.parent.name.startswith('Headlamp assembly'))
                     and not any('brushed alloy' in m.name for m in o.data.materials) for p in world_points(o)])
    front, rear = -limits[1][1], -limits[1][0]
    width_scale = TARGET['width'] / before['width']
    for obj in list(scene.objects):
        if obj.type != 'MESH':
            continue
        inv = obj.matrix_world.inverted()
        if obj.name.startswith(EXTERIOR):
            points = world_points(obj)
            offsets = {}
            panels = set()
            for part in components(obj.data):
                if len(part) > 200:
                    panels.update(part)
                bb = bounds([points[i] for i in part])
                if max(b[1]-b[0] for b in bb) < 0.30 and -bb[1][1] > -1 and -bb[1][0] < 0.4:
                    z, height = -(bb[1][0]+bb[1][1])/2, (bb[2][0]+bb[2][1])/2
                    delta = longitudinal(z, front, rear, height)-z
                    offsets.update((i, delta) for i in part)
            for i, (v, p) in enumerate(zip(obj.data.vertices, points)):
                z = -p.y
                p.y = -(z+offsets[i]) if i in offsets else -longitudinal(z, front, rear, p.z)
                p.x *= width_scale
                # Nest the lamps in the raised wings instead of projecting them ahead of the nose.
                if obj.parent and obj.parent.name.startswith('Headlamp assembly'):
                    p.y -= 0.15
                    p.z += 0.032
                elif obj.name == 'Exterior body • seafoam enamel' and i in panels and z < -2.05:
                    # A continuous falloff clears the lamp faces without creasing the apron.
                    falloff = min(1, max(0, (-2.05-z)/0.30))
                    p.z -= 0.11*falloff*min(1, abs(p.x)/0.67)**4*max(0, min(1, (p.z-0.30)/0.35))
                if obj.name.startswith('Exterior body') and not obj.parent and p.z < 0.36 and p.z > 0.28:
                    if 0.42 < abs(p.x) < 0.64 and z < -2.32:
                        if 'headlamp prismatic' in obj.name:
                            p.y = 2.335-(z+2.351)
                        elif 'satin black' in obj.name:
                            p.y = 2.315-(z+2.336)
                v.co = inv @ p
            if obj.name == 'Exterior body • seafoam enamel':
                mesh = bmesh.new()
                mesh.from_mesh(obj.data)
                bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.0002)
                bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
                mesh.to_mesh(obj.data)
                mesh.free()
        elif obj.name.startswith('Fuchs wheels'):
            for v, p in zip(obj.data.vertices, world_points(obj)):
                is_front = p.y > 0.6
                old_z = -1.55 if is_front else 0.722
                old_x = 0.753 if is_front else 0.763
                new_x = TARGET['frontTrack' if is_front else 'rearTrack']/2
                side = 1 if p.x > 0 else -1
                p.x += side*(new_x-old_x)
                p.y = -(TARGET['frontAxle' if is_front else 'rearAxle']+(-p.y-old_z)*0.31/0.318)
                p.z *= 0.31/0.318
                v.co = inv @ p
        elif obj.name.startswith('Roof and window'):
            # Shorten the triangular side lights; the wider C pillars carry the fastback silhouette.
            for part in components(obj.data):
                pts = [obj.matrix_world @ obj.data.vertices[i].co for i in part]
                bb = bounds(pts)
                quarter = -bb[1][1] > 0.35 and -bb[1][0] < 1.20 and bb[2][1] > 1.08 and bb[0][1]-bb[0][0] < 0.2
                for i, p in zip(part, pts):
                    z = -p.y
                    if quarter:
                        p.y = -(0.405 + (z-0.405)*0.64)
                    elif abs(p.x) > 0.62:
                        # The same landmarks occur in the trim curves and C-pillar mesh.
                        if abs(z-1.16) < 0.015 or (abs(z-0.82) < 0.015 and p.z > 1.03):
                            p.y = -(0.405 + (z-0.405)*0.64)
                    obj.data.vertices[i].co = inv @ p
        elif obj.name.startswith('Seats and upholstery') and 'grey leather' in obj.name:
            for part in components(obj.data):
                pts = [obj.matrix_world @ obj.data.vertices[i].co for i in part]
                bb = bounds(pts)
                w, d, h = [b[1]-b[0] for b in bb]
                back_pleat = 0.27 < w < 0.32 and 0.06 < h < 0.10 and d < 0.07 and bb[2][0] > 0.45
                seat_pleat = 0.27 < w < 0.32 and h < 0.045 and d < 0.09
                for i, p in zip(part, pts):
                    if back_pleat:
                        p.y = bb[1][0] + (p.y-bb[1][0])*0.38
                    if seat_pleat:
                        p.z = bb[2][0] + (p.z-bb[2][0])*0.40
                    obj.data.vertices[i].co = inv @ p

    for axle in (TARGET['frontAxle'], TARGET['rearAxle']):
        for side in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.36, depth=0.28,
                                               location=(side*0.69, -axle, 0.31), rotation=(0, math.pi/2, 0))
            liner = bpy.context.object
            liner.name = 'Wheel arch liner'
            mesh = bmesh.new()
            mesh.from_mesh(liner.data)
            bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.co.x > 0.0001], context='VERTS')
            bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f.normal.z*side > 0.5], context='FACES_ONLY')
            mesh.to_mesh(liner.data)
            mesh.free()
            liner.data.materials.append(bpy.data.materials['930 • rubber seals and tyres'])
            for face in liner.data.polygons:
                face.use_smooth = len(face.vertices) == 4

    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.name.startswith('930'):
            continue
        shader = mat.node_tree.nodes.get('Principled BSDF')
        if 'seafoam' in mat.name:
            shader.inputs['Metallic'].default_value = 0
            shader.inputs['Roughness'].default_value = 0.20
            shader.inputs['Coat Weight'].default_value = 0.85
            shader.inputs['Coat Roughness'].default_value = 0.075
        elif 'leather' in mat.name:
            shader.inputs['Roughness'].default_value = 0.56 if 'grey' in mat.name else 0.66
            shader.inputs['Coat Weight'].default_value = 0.06
            shader.inputs['Coat Roughness'].default_value = 0.45
        elif 'glazing' in mat.name:
            shader.inputs['Roughness'].default_value = 0.045
            shader.inputs['Alpha'].default_value = 0.035
            shader.inputs['Coat Weight'].default_value = 0.9
            shader.inputs['Coat Roughness'].default_value = 0.035
        for n in mat.node_tree.nodes:
            if n.type == 'NORMAL_MAP':
                n.inputs['Strength'].default_value = 0.10 if 'carpet' in mat.name else 0.065

    bpy.context.view_layer.update()
    after = measure()
    report = {'reference': 'User-supplied Porsche 911 turbo orthographic blueprint, 2026-10-08',
              'units': 'metres', 'target': TARGET, 'before': before, 'after': after,
              'scope': 'Length excludes exhaust; width excludes mirrors; height excludes aerial. Wheel tracks use tyre centrelines.',
              'silhouetteReview': 'Orthographic front, side and top renders required; printed dimensions are constraints, not proof of complete shape accuracy.'}
    (ROOT/'assets/models/porsche/blueprint-validation.json').write_text(json.dumps(report,indent=4)+'\n')
    for name in ('length','width','height','wheelbase','frontTrack','rearTrack'):
        if abs(after[name]-TARGET[name]) > 0.003:
            raise RuntimeError('Blueprint dimension outside 3 mm tolerance: '+name+' '+str(after[name]))
    scene['detail_revision'] = 2
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/models/porsche/cabin.blend'))
    print('REFINEMENT_SAVED',json.dumps(report))


if __name__ == '__main__':
    main()
