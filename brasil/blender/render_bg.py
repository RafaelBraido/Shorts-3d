"""Fundo 3D do vídeo no Blender (globo + relevo falso + nuvens + atmosfera + estrelas) com a MESMA câmera do vídeo web.
A câmera vem de out/cam_track.json (exportada por scripts/dump_cam.mjs). Rótulos, legenda, cartões e contornos continuam na camada
de sobreposição (Three.js, transparente) e são unidos no ffmpeg.

Uso (Blender 4.0+):
  blender -b -P blender/render_bg.py -- --out out/blender_bg --engine CYCLES --device OPTIX --samples 32
  blender -b -P blender/render_bg.py -- --out out/test --frames 100-100 --scale 0.25 --device CPU --samples 8     # teste rápido
"""
import bpy, json, math, os, sys, argparse
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="out/blender_bg"); ap.add_argument("--engine", default="CYCLES", choices=["CYCLES", "EEVEE"])
ap.add_argument("--device", default="OPTIX", choices=["OPTIX", "CUDA", "CPU"]); ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--no-denoise", action="store_true"); ap.add_argument("--frames", default=""); ap.add_argument("--scale", type=float, default=1.0)
a = ap.parse_args(argv)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *p: os.path.join(ROOT, *p)
R = 6.371; DEG = math.pi / 180
track = json.load(open(P("out", "cam_track.json")))["frames"]; maps = json.load(open(P("assets", "maps.json")))["region"]
W, H = int(1080 * a.scale), int(1920 * a.scale)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps = 30; sc.frame_start, sc.frame_end = 0, len(track) - 1
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB"
sc.view_settings.view_transform = "Standard"

# ---- motor / GPU
if a.engine == "CYCLES":
    sc.render.engine = "CYCLES"; sc.cycles.samples = a.samples; sc.cycles.use_denoising = not a.no_denoise
    cp = bpy.context.preferences.addons["cycles"].preferences
    if a.device != "CPU":
        cp.compute_device_type = a.device; cp.get_devices()
        for d in cp.devices: d.use = (d.type != "CPU")
        sc.cycles.device = "GPU"
    else: sc.cycles.device = "CPU"
else:
    sc.render.engine = "BLENDER_EEVEE"; sc.eevee.taa_render_samples = a.samples

def T(x, y, z): return (x, -z, y)                         # three (y para cima) -> blender (z para cima)
def img(path, cs="sRGB"):
    i = bpy.data.images.load(P(*path), check_existing=True); i.colorspace_settings.name = cs; return i

# ---- globo: BM global + recorte regional (América do Sul) misturado por máscara suave, tudo em função da posição na esfera
bpy.ops.mesh.primitive_uv_sphere_add(segments=192, ring_count=96, radius=R); g = bpy.context.active_object; g.name = "Globo"
bpy.ops.object.shade_smooth()
m = bpy.data.materials.new("Terra"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
N = lambda t, **k: nt.nodes.new(t)
def link(o, i): nt.links.new(o, i)
tc = N("ShaderNodeTexCoord"); sep = N("ShaderNodeSeparateXYZ"); link(tc.outputs["Object"], sep.inputs[0])
def mth(op, a_=None, b_=None, c_=None):
    n = N("ShaderNodeMath"); n.operation = op
    for k, v in enumerate((a_, b_, c_)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[k].default_value = v
        else: link(v, n.inputs[k])
    return n.outputs[0]
negY = mth("MULTIPLY", sep.outputs["Y"], -1.0)
lon = mth("DEGREES", mth("ARCTAN2", sep.outputs["X"], negY))
lat = mth("DEGREES", mth("ARCSINE", mth("DIVIDE", sep.outputs["Z"], R)))
def comb(x, y):
    c = N("ShaderNodeCombineXYZ"); link(x, c.inputs[0]); link(y, c.inputs[1]); return c.outputs[0]
bm = N("ShaderNodeTexImage"); bm.image = img(("assets", "earth_day.jpg")); bm.extension = "REPEAT"
link(comb(mth("DIVIDE", mth("ADD", lon, 180.0), 360.0), mth("DIVIDE", mth("ADD", lat, 90.0), 180.0)), bm.inputs[0])
ru = mth("DIVIDE", mth("SUBTRACT", lon, maps["lon0"]), maps["lon1"] - maps["lon0"]); rv = mth("DIVIDE", mth("SUBTRACT", lat, maps["lat0"]), maps["lat1"] - maps["lat0"])
rg = N("ShaderNodeTexImage"); rg.image = img(("assets", "region_color.jpg")); rg.extension = "EXTEND"; link(comb(ru, rv), rg.inputs[0])
edge = mth("MINIMUM", mth("MINIMUM", ru, mth("SUBTRACT", 1.0, ru)), mth("MINIMUM", rv, mth("SUBTRACT", 1.0, rv)))
mask = mth("MULTIPLY", mth("MINIMUM", mth("MAXIMUM", mth("DIVIDE", edge, 0.18), 0.0), 1.0), 1.0)
mix = N("ShaderNodeMix"); mix.data_type = "RGBA"; link(mask, mix.inputs[0]); link(bm.outputs["Color"], mix.inputs[6]); link(rg.outputs["Color"], mix.inputs[7])
bump = N("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35; bump.inputs["Distance"].default_value = 0.02
bw = N("ShaderNodeRGBToBW"); link(rg.outputs["Color"], bw.inputs[0]); link(bw.outputs[0], bump.inputs["Height"])
bsdf = N("ShaderNodeBsdfPrincipled"); bsdf.inputs["Roughness"].default_value = 0.85
link(mix.outputs[2], bsdf.inputs["Base Color"]); link(mix.outputs[2], bsdf.inputs["Emission Color"]); bsdf.inputs["Emission Strength"].default_value = 0.30
link(bump.outputs[0], bsdf.inputs["Normal"])
out = N("ShaderNodeOutputMaterial"); link(bsdf.outputs[0], out.inputs[0]); g.data.materials.append(m)

# ---- atmosfera (halo azul nas bordas)
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=R * 1.05); at = bpy.context.active_object; at.name = "Atmosfera"; bpy.ops.object.shade_smooth()
am = bpy.data.materials.new("Atmo"); am.use_nodes = True; an = am.node_tree; an.nodes.clear()
lw = an.nodes.new("ShaderNodeLayerWeight"); lw.inputs[0].default_value = 0.35
pw = an.nodes.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 3.0; an.links.new(lw.outputs["Facing"], pw.inputs[0])
em = an.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (0.30, 0.58, 1.0, 1); em.inputs["Strength"].default_value = 3.0
tr = an.nodes.new("ShaderNodeBsdfTransparent"); mx = an.nodes.new("ShaderNodeMixShader")
an.links.new(pw.outputs[0], mx.inputs[0]); an.links.new(tr.outputs[0], mx.inputs[1]); an.links.new(em.outputs[0], mx.inputs[2])
ao = an.nodes.new("ShaderNodeOutputMaterial"); an.links.new(mx.outputs[0], ao.inputs[0]); at.data.materials.append(am)
at.visible_shadow = False; at.visible_glossy = False

# ---- luz e fundo (estrelas procedurais)
bpy.ops.object.light_add(type="SUN", location=(0, 0, 0)); sun = bpy.context.active_object
sun.data.energy = 4.0; sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
w = bpy.data.worlds.new("Espaço"); sc.world = w; w.use_nodes = True; wn = w.node_tree; wn.nodes.clear()
tcw = wn.nodes.new("ShaderNodeTexCoord"); vo = wn.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 260; vo.feature = "F1"
wn.links.new(tcw.outputs["Generated"], vo.inputs[0])
cr = wn.nodes.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (1, 1, 1, 1); cr.color_ramp.elements[1].position = 0.035; cr.color_ramp.elements[1].color = (0, 0, 0, 1)
wn.links.new(vo.outputs["Distance"], cr.inputs[0])
bg = wn.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 1.2; wn.links.new(cr.outputs[0], bg.inputs[0])
wo = wn.nodes.new("ShaderNodeOutputWorld"); wn.links.new(bg.outputs[0], wo.inputs[0])

# ---- câmera: mesma matriz do mundo (Three) convertida para o Blender; fov vertical 40°
cam_d = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.sensor_fit = "VERTICAL"; cam_d.sensor_height = 24.0; cam_d.lens = 12.0 / math.tan(math.radians(20)); cam_d.clip_start = 0.01; cam_d.clip_end = 200
Rx = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))     # (x,y,z) -> (x,-z,y)
for f, fr in enumerate(track):
    mt = Matrix([fr["m"][0:4], fr["m"][4:8], fr["m"][8:12], fr["m"][12:16]]).transposed()   # Three guarda em colunas
    cam.matrix_world = Rx @ mt; cam_d.shift_y = fr["shift"] / 1920.0
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f); cam_d.keyframe_insert("shift_y", frame=f)
    cam.rotation_mode = "XYZ"
for c in (cam.animation_data.action.fcurves if cam.animation_data else []):
    for kp in c.keyframe_points: kp.interpolation = "LINEAR"        # a suavização (ease/overshoot) já está na curva exportada

# ---- render
if a.frames:
    s, e = (int(x) for x in a.frames.split("-")); sc.frame_start, sc.frame_end = s, e
os.makedirs(P(a.out), exist_ok=True); sc.render.filepath = P(a.out, "f_")
bpy.ops.render.render(animation=True)
print("OK", sc.frame_start, sc.frame_end)
