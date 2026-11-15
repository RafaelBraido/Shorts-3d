"""Globo cinematográfico no Blender (Cycles). Só nós nativos: albedo 8K, relevo 10K (Bump), oceano espelhado, nuvens,
atmosfera (Layer Weight + ColorRamp + Transparent), Sol baixo e estrelas procedurais. Sem addons, sem pacotes.

  blender -b -P cinema/render.py -- --out cinema/out/teste_frame.png --device OPTIX --samples 128
  blender -b -P cinema/render.py -- --track brasil/out/cam_track.json --out cinema/out/frames/f_ --device OPTIX   # animação (câmera do vídeo)
"""
import bpy, sys, os, math, json, argparse
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", default="cinema/out/teste_frame.png"); ap.add_argument("--device", default="OPTIX", choices=["OPTIX", "CUDA", "CPU"])
ap.add_argument("--samples", type=int, default=128); ap.add_argument("--width", type=int, default=1080); ap.add_argument("--height", type=int, default=1920)
ap.add_argument("--lat", type=float, default=-8.0); ap.add_argument("--lon", type=float, default=-55.0); ap.add_argument("--dist", type=float, default=9.0)
ap.add_argument("--tilt", type=float, default=28.0); ap.add_argument("--sun-el", type=float, default=14.0); ap.add_argument("--track", default="")
a = ap.parse_args(argv)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = lambda *p: os.path.join(ROOT, *p)
R = 6.371; DEG = math.pi / 180
T = lambda x, y, z: Vector((x, -z, y))                                # eixo three (Y para cima) -> Blender (Z para cima)
def ll(lat, lon, r=1.0): la, lo = lat * DEG, lon * DEG; return T(r * math.cos(la) * math.sin(lo), r * math.sin(la), r * math.cos(la) * math.cos(lo))

bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = a.width, a.height, 100
sc.render.fps = 30; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB"; sc.render.image_settings.color_depth = "16"
try: sc.view_settings.view_transform = "AgX"
except Exception: sc.view_settings.view_transform = "Filmic"
sc.view_settings.exposure = 0.35

# ---- Cycles: GPU NVIDIA (OptiX), OIDN, filtro Blackman-Harris 1.5
sc.render.engine = "CYCLES"; cy = sc.cycles; cy.samples = a.samples; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.01
cy.pixel_filter_type = "BLACKMAN_HARRIS"; cy.filter_width = 1.5
HAS_OIDN = getattr(bpy.app.build_options, 'openimagedenoise', False)
cy.use_denoising = bool(HAS_OIDN)
if not HAS_OIDN: print('AVISO: este Blender foi compilado sem OpenImageDenoise; renderizando sem denoiser (use o Blender 4.2 oficial)')
try: cy.denoiser = "OPENIMAGEDENOISE"; cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"; cy.denoising_prefilter = "ACCURATE"
except Exception as e: print("AVISO denoiser:", e)
dev = "CPU"
if a.device != "CPU":
    cp = bpy.context.preferences.addons["cycles"].preferences
    try:
        cp.compute_device_type = a.device; cp.get_devices(); gpus = [d for d in cp.devices if d.type != "CPU"]
        for d in cp.devices: d.use = d.type != "CPU"
        print("GPUs:", [d.name for d in gpus])
        if gpus: cy.device = "GPU"; dev = a.device
        else: print("AVISO: nenhuma GPU encontrada, usando CPU")
    except Exception as e: print("AVISO GPU:", e)
print("DISPOSITIVO:", dev, "| Blender", bpy.app.version_string)

def img(name, cs="sRGB"):
    p = P("data", "textures", name)
    if not os.path.exists(p): raise SystemExit(f"falta {p}; rode: blender -b -P cinema/fetch_data.py")
    i = bpy.data.images.load(p); i.colorspace_settings.name = cs; return i

# ---- Terra: albedo + relevo (Bump) + oceano espelhado; coordenadas lat/lon a partir da posição do objeto (equiretangular)
bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=R); g = bpy.context.active_object; g.name = "Terra"; bpy.ops.object.shade_smooth()
m = bpy.data.materials.new("Terra"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new
def L(o, i): nt.links.new(o, i)
def math_(op, x, y=None):
    n = N("ShaderNodeMath"); n.operation = op
    for k, v in enumerate((x, y)):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[k].default_value = v
        else: L(v, n.inputs[k])
    return n.outputs[0]
def uv_node():
    tc = N("ShaderNodeTexCoord"); sp = N("ShaderNodeSeparateXYZ"); L(tc.outputs["Object"], sp.inputs[0])
    lon = math_("DEGREES", math_("ARCTAN2", sp.outputs["X"], math_("MULTIPLY", sp.outputs["Y"], -1.0)))
    lat = math_("DEGREES", math_("ARCSINE", math_("DIVIDE", sp.outputs["Z"], R)))
    c = N("ShaderNodeCombineXYZ"); L(math_("DIVIDE", math_("ADD", lon, 180.0), 360.0), c.inputs[0]); L(math_("DIVIDE", math_("ADD", lat, 90.0), 180.0), c.inputs[1]); return c.outputs[0]
UV = uv_node()
def tex(name, cs="sRGB"): t = N("ShaderNodeTexImage"); t.image = img(name, cs); t.extension = "REPEAT"; t.interpolation = "Cubic"; L(UV, t.inputs[0]); return t
alb, bmp, ocn = tex("Albedo.jpg"), tex("Bump.jpg", "Non-Color"), tex("Ocean.png", "Non-Color")
bump = N("ShaderNodeBump"); bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.035; L(bmp.outputs["Color"], bump.inputs["Height"])
bs = N("ShaderNodeBsdfPrincipled"); L(alb.outputs["Color"], bs.inputs["Base Color"]); L(bump.outputs["Normal"], bs.inputs["Normal"])
rough = N("ShaderNodeMapRange"); rough.inputs["To Min"].default_value = 0.88; rough.inputs["To Max"].default_value = 0.12; L(ocn.outputs["Color"], rough.inputs["Value"]); L(rough.outputs["Result"], bs.inputs["Roughness"])
try: bs.inputs["Specular IOR Level"].default_value = 0.6
except Exception: pass
o = N("ShaderNodeOutputMaterial"); L(bs.outputs["BSDF"], o.inputs["Surface"]); g.data.materials.append(m)

# ---- Nuvens
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=R * 1.006); cl = bpy.context.active_object; cl.name = "Nuvens"; bpy.ops.object.shade_smooth()
cm = bpy.data.materials.new("Nuvens"); cm.use_nodes = True; nt = cm.node_tree; nt.nodes.clear(); N = nt.nodes.new
UV = uv_node(); ct = tex("Clouds.png", "Non-Color")
dif = N("ShaderNodeBsdfDiffuse"); dif.inputs["Color"].default_value = (0.95, 0.97, 1, 1); tr = N("ShaderNodeBsdfTransparent"); mx = N("ShaderNodeMixShader")
cr = N("ShaderNodeMapRange"); cr.inputs["From Min"].default_value = 0.08; cr.inputs["From Max"].default_value = 0.85; L(ct.outputs["Color"], cr.inputs["Value"])
L(cr.outputs["Result"], mx.inputs[0]); L(tr.outputs["BSDF"], mx.inputs[1]); L(dif.outputs["BSDF"], mx.inputs[2]); o = N("ShaderNodeOutputMaterial"); L(mx.outputs["Shader"], o.inputs["Surface"]); cl.data.materials.append(cm)
cl.visible_shadow = True

# ---- Atmosfera: Layer Weight (Fresnel) + ColorRamp azulado + Transparent
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=R * 1.045); at = bpy.context.active_object; at.name = "Atmosfera"; bpy.ops.object.shade_smooth()
am = bpy.data.materials.new("Atmosfera"); am.use_nodes = True; nt = am.node_tree; nt.nodes.clear(); N = nt.nodes.new
lw = N("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.3
ramp = N("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.24, 0.52, 1.0, 1); L(lw.outputs["Facing"], ramp.inputs["Fac"])
em = N("ShaderNodeEmission"); em.inputs["Strength"].default_value = 3.2; L(ramp.outputs["Color"], em.inputs["Color"])
fac = math_("POWER", lw.outputs["Facing"], 2.2); tr = N("ShaderNodeBsdfTransparent"); mx = N("ShaderNodeMixShader"); L(fac, mx.inputs[0]); L(tr.outputs["BSDF"], mx.inputs[1]); L(em.outputs["Emission"], mx.inputs[2])
o = N("ShaderNodeOutputMaterial"); L(mx.outputs["Shader"], o.inputs["Surface"]); at.data.materials.append(am); at.visible_shadow = False

# ---- Sol baixo (sombras longas no relevo) + estrelas procedurais
target = ll(a.lat, a.lon)                                              # ponto de interesse (normal da esfera)
up = target.normalized(); east = Vector((0, 0, 1)).cross(up).normalized() if abs(up.z) < 0.99 else Vector((1, 0, 0)); north = up.cross(east).normalized()
sun_dir = (up * math.sin(a.sun_el * DEG) + east * math.cos(a.sun_el * DEG) * -1).normalized()   # vem do oeste, baixo no horizonte
bpy.ops.object.light_add(type="SUN"); sun = bpy.context.active_object; sun.data.energy = 5.5; sun.data.angle = 0.004
sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("Espaco"); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear(); N = nt.nodes.new
tc = N("ShaderNodeTexCoord"); vo = N("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 420; L(tc.outputs["Generated"], vo.inputs["Vector"])
cr = N("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (1, 1, 1, 1); cr.color_ramp.elements[1].position = 0.03; cr.color_ramp.elements[1].color = (0, 0, 0, 1)
L(vo.outputs["Distance"], cr.inputs["Fac"]); bg = N("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 1.4; L(cr.outputs["Color"], bg.inputs["Color"])
o = N("ShaderNodeOutputWorld"); L(bg.outputs["Background"], o.inputs["Surface"])

# ---- Câmera
cd = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_fit = "VERTICAL"; cd.sensor_height = 24.0; cd.lens = 12.0 / math.tan(math.radians(20)); cd.clip_start = 0.01; cd.clip_end = 300
if a.track:
    tr_ = json.load(open(a.track))["frames"]; from mathutils import Matrix
    Rx = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))); sc.frame_start, sc.frame_end = 0, len(tr_) - 1
    for f, fr in enumerate(tr_):
        mt = Matrix([fr["m"][0:4], fr["m"][4:8], fr["m"][8:12], fr["m"][12:16]]).transposed(); cam.matrix_world = Rx @ mt; cd.shift_y = fr["shift"] / 1920.0
        cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f); cd.keyframe_insert("shift_y", frame=f)
    animate = True
else:
    cam.location = up * (R + a.dist * math.cos(a.tilt * DEG)) - north * (a.dist * math.sin(a.tilt * DEG)); animate = False
    bpy.ops.object.empty_add(location=target * R); tgt = bpy.context.active_object; tc_ = cam.constraints.new("TRACK_TO"); tc_.target = tgt; tc_.track_axis = "TRACK_NEGATIVE_Z"; tc_.up_axis = "UP_Y"

os.makedirs(os.path.dirname(P(a.out)) or ".", exist_ok=True); sc.render.filepath = P(a.out)
if animate: bpy.ops.render.render(animation=True)
else: bpy.ops.render.render(write_still=True)
print("PRONTO:", sc.render.filepath, "| dispositivo:", dev, "| amostras:", a.samples)
