"""Generate the integration cabin or export an edited blend using the same GLB contract."""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--layout', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--export-only', action='store_true')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def position(point):
    return (point[0], -point[2], point[1])


def material(name, color, roughness=0.7):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    return result


def node(name, point, parent=None, pitch=0):
    result = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(result)
    result.parent = parent
    result.location = position(point)
    result.rotation_euler.x = pitch
    return result


def box(name, dimensions, point, surface, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    result = bpy.context.object
    result.name = name
    result.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result.parent = parent
    result.location = position(point)
    result.data.materials.append(surface)
    return result


def plane(name, width, height, point, surface, parent=None):
    vertices = [position(p) for p in ((-width / 2, -height / 2, 0), (width / 2, -height / 2, 0), (width / 2, height / 2, 0), (-width / 2, height / 2, 0))]
    return polygon(name, vertices, point, surface, parent)


def polygon(name, vertices, point, surface, parent=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, coord in zip(uv.data, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop.uv = coord
    result = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(result)
    result.parent = parent
    result.location = position(point)
    mesh.materials.append(surface)
    return result


def beam(name, start, end, width, surface):
    a, b = Vector(position(start)), Vector(position(end))
    result = box(name, (width, width, (b - a).length), (0, 0, 0), surface)
    result.location = (a + b) / 2
    result.rotation_euler = (b - a).to_track_quat('Y', 'Z').to_euler()
    return result


def generate(c):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    trim = c['trim']
    leather = material('leather', trim['face'])
    dark = material('panel', trim['panel'])
    carpet = material('carpet', '#1a1a1c', 1)
    roof = material('headliner', trim['top'], 1)
    paint = material('paint', c['paint'], 0.38)
    black = material('runtime_surface', '#070708', 0.5)
    w = c['windshield']
    box('headliner', (c['halfWidth'] * 2, 0.02, c['rearZ'] - w['topZ']), (0, c['roof'] + 0.01, (c['rearZ'] + w['topZ']) / 2), roof)
    box('floor', (c['halfWidth'] * 2, 0.02, c['rearZ'] - w['baseZ']), (0, c['floor'], (c['rearZ'] + w['baseZ']) / 2), carpet)
    for side in (-1, 1):
        x = side * c['halfWidth']
        box('door_' + str(side), (0.07, c['belt'] - c['floor'], c['bPillarZ'] - c['doorFrontZ']), (x + side * 0.035, (c['belt'] + c['floor']) / 2, (c['bPillarZ'] + c['doorFrontZ']) / 2), leather)
        beam('a_pillar_' + str(side), (side * w['baseHalf'], w['baseY'], w['baseZ']), (side * w['topHalf'], w['topY'], w['topZ']), c['pillar']['width'], dark)
        beam('b_pillar_' + str(side), (x, c['belt'], c['bPillarZ']), (x, c['roof'], c['bPillarZ']), 0.06, roof)
        beam('roof_edge_' + str(side), (side * w['topHalf'], w['topY'], w['topZ']), (x, c['roof'], c['bPillarZ']), 0.04, dark)
    s = c['seat']
    for i, x in enumerate((c['eye'][0], s['x'])):
        box('seat_cushion_' + str(i), (0.5, 0.13, 0.5), (x, s['cushionY'], s['backZ'] - 0.25), leather)
        back = box('seat_back_' + str(i), (0.5, 0.62, 0.13), (x, s['cushionY'] + 0.31, s['backZ'] + 0.06), leather)
        back.rotation_euler.x = -math.radians(s['backTiltDeg'])
        box('rear_seat_' + str(i), (0.5, 0.25, 0.4), (x, c['floor'] + 0.125, c['rearZ'] - 0.25), leather)
    box('rear_shelf', (c['halfWidth'] * 2, 0.05, 0.25), (0, c['belt'], c['rearZ']), carpet)
    beam('rear_header', (-c['halfWidth'], c['roof'], c['rearZ']), (c['halfWidth'], c['roof'], c['rearZ']), 0.05, roof)
    box('dashboard', (c['halfWidth'] * 2, 0.25, 0.3), (0, 0.64, -0.81), leather)
    box('dashboard_top', (c['halfWidth'] * 2, 0.04, 0.3), (0, 0.79, -0.81), leather)
    console = c['console']
    box('console', (console['w'], console['top'] - console['bottom'], console['back'] - console['front']), (console['x'], (console['top'] + console['bottom']) / 2, (console['front'] + console['back']) / 2), leather)
    tunnel = c['tunnel']
    box('tunnel', (tunnel['w'], tunnel['h'], tunnel['back'] - tunnel['front']), (console['x'], c['floor'] + tunnel['h'] / 2, (tunnel['back'] + tunnel['front']) / 2), carpet)
    f = c['face']
    frame = node('instrument_frame', (f['x'], f['y'], f['z']), pitch=-math.radians(f['tiltDeg']))
    bounds = c['clusterBounds']
    plane('instrument_surface', bounds['w'] * f['scale'], bounds['h'] * f['scale'], (0, 0, 0), black, frame)
    r = c['radio']
    plane('trip_surface', r['display']['w'], r['display']['h'], (r['x'] + r['display']['x'], r['y'], c['fascia']['z'] + 0.02), black)
    wheel = c['wheel']
    mount = node('wheel_mount', (wheel['x'], wheel['y'], wheel['z']), pitch=-math.radians(wheel['tiltDeg']))
    spin = node('steering_wheel', (0, 0, 0), mount)
    bpy.ops.mesh.primitive_torus_add(major_radius=wheel['radius'], minor_radius=wheel['tube'], major_segments=64, minor_segments=12)
    rim = bpy.context.object
    rim.name = 'wheel_rim'
    rim.parent = spin
    rim.rotation_euler.x = math.pi / 2
    rim.data.materials.append(dark)
    box('wheel_spokes', (wheel['radius'] * 2, 0.035, 0.025), (0, 0, 0), dark, spin)
    box('wheel_hub', (c['pad']['w'], c['pad']['h'], c['pad']['depth']), (0, c['pad']['dy'], 0), dark, spin)
    shift = c['shifter']
    lever = node('gear_lever', (shift['x'], shift['y'], shift['z']))
    box('lever', (0.014, shift['length'], 0.014), (0, shift['length'] / 2, 0), dark, lever)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=shift['knob'])
    knob = bpy.context.object
    knob.name = 'gear_knob'
    knob.parent = lever
    knob.location = position((0, shift['length'], 0))
    knob.data.materials.append(dark)
    r = c['mirror']
    box('mirror_housing', (r['w'] + r['bezel'] * 2, r['h'] + r['bezel'] * 2, 0.03), (r['x'], r['y'], r['z'] - 0.02), dark)
    plane('mirror_surface', r['w'], r['h'], (r['x'], r['y'], r['z']), black)
    mirror = node('mirror_camera', (r['x'], r['y'], r['z']))
    mirror.rotation_euler.z = math.pi
    node('driver_eye', c['eye'])
    vertices = [position(p) for p in ((-w['baseHalf'], w['baseY'], w['baseZ']), (w['baseHalf'], w['baseY'], w['baseZ']), (w['topHalf'], w['topY'], w['topZ']), (-w['topHalf'], w['topY'], w['topZ']))]
    polygon('windshield_surface', vertices, (0, 0, 0), black)
    r = c['radar']
    detector = node('radar_mount', (r['x'], c['visor']['y'] - r['h'] / 2 - 0.012, c['visor']['z'] + 0.01))
    box('radar_body', (r['w'], r['h'], r['d']), (0, 0, 0), dark, detector)
    for i in range(r['leds']):
        box('radar_led_' + str(i), (0.006, 0.006, 0.002), (r['ledX'] + (i - (r['leds'] - 1) / 2) * r['ledGap'] + r['w'] * 0.12, r['ledY'], r['d'] / 2 + 0.001), dark, detector)
    box('bonnet', (1.24, 0.08, 1.3), (0, 0.68, -1.63), paint)
    for side in (-1, 1):
        box('fender_' + str(side), (c['fenders']['width'], c['fenders']['height'], c['fenders']['length']), (side * c['fenders']['x'], c['fenders']['y'], c['fenders']['z']), paint)
    bpy.context.scene.unit_settings.system = 'METRIC'


def export_asset(output):
    # Batch only static meshes in a temporary export selection; keep the editable source intact.
    protected = {'instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface'}
    protected.update('radar_led_' + str(i) for i in range(6))
    moving = {'steering_wheel', 'gear_lever'}
    originals = list(bpy.context.scene.objects)
    copies = []
    batches = {}
    retained = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    try:
        for obj in originals:
            parent = obj.parent
            animated = False
            while parent:
                animated = animated or parent.name in moving
                parent = parent.parent
            if obj.type != 'MESH' or obj.name in protected or animated:
                retained.append(obj)
                continue
            clone = obj.copy()
            clone.data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),
                                                       preserve_all_data_layers=True, depsgraph=depsgraph)
            clone.modifiers.clear()
            bpy.context.collection.objects.link(clone)
            world = obj.matrix_world.copy()
            clone.parent = None
            clone.matrix_world = world
            copies.append(clone)
            key = tuple(mat.name for mat in clone.data.materials)
            batches.setdefault(key, []).append(clone)
        merged = []
        for materials, parts in batches.items():
            bpy.ops.object.select_all(action='DESELECT')
            for part in parts:
                part.select_set(True)
            bpy.context.view_layer.objects.active = parts[0]
            if len(parts) > 1:
                bpy.ops.object.join()
            obj = parts[0]
            obj.name = 'static_' + materials[0]
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            merged.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in retained + merged:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
                                  use_selection=True, export_cameras=False, export_lights=False)
    finally:
        for obj in copies:
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except ReferenceError:
                pass  # Joining has already removed this temporary object.


if __name__ == '__main__':
    args = arguments()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not args.export_only:
        if output.with_suffix('.blend').exists():
            raise RuntimeError('Refusing to replace an existing blend. Open it and pass --export-only.')
        generate(json.loads(Path(args.layout).read_text()))
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
    export_asset(output)
    print('CABIN_EXPORT_OK', output)
