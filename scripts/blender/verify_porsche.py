"""Verify the saved source dimensions and an independent export of the delivered Porsche."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from export_cabin import export_asset
from refine_porsche import TARGET, measure

root = Path(__file__).resolve().parents[2]
asset = root/'assets/models/porsche'
dimensions = measure()
for name, target in TARGET.items():
    assert abs(dimensions[name]-target) < 0.003, (name, dimensions[name], target)
objects = len(bpy.data.objects)
triangles = 0
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
assert triangles <= 100_000, triangles
with tempfile.TemporaryDirectory() as directory:
    output = Path(directory)/'reopened.glb'
    export_asset(output)
    original = (asset/'cabin.glb').read_bytes()
    assert original == output.read_bytes(), 'Saved source does not reproduce delivered GLB'
assert len(bpy.data.objects) == objects, 'Export changed editable source objects'
report = {'blender': bpy.app.version_string, 'sourceObjects': objects, 'sourceTriangles': triangles,
          'byteIdenticalReexport': True, 'sha256': hashlib.sha256(original).hexdigest(), 'dimensions': dimensions}
destination = Path(sys.argv[sys.argv.index('--')+1])
destination.write_text(json.dumps(report, indent=4)+'\n')
print('SOURCE_VERIFIED', json.dumps(report))
