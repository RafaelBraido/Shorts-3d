# Mar da Galileia 3D — Short 9:16 (1080×1920, 30 fps)

Animação em 3D sobre mapas: por que o **Mar da Galileia** tem esse nome e **3 fatos** sobre ele.
Estilo inspirado em `@historiatenta` (legenda palavra-a-palavra em caixa azul, etiquetas amarelas, cartões de dado, barra "N DE 3").

Vídeo final: `out/galileia_3d.mp4` (versão leve de 70 MB; o master CRF 15 de 197 MB não cabe no GitHub) (~62 s).

## Roteiro (fatos conferidos)
- **Nome**: *Galileia* é a região ao redor (hebraico *galil* = "círculo/distrito"); "mar" vem de *iam*, que em hebraico serve para mar **e** lago — é um lago de água doce. Em hebraico também é *Kinneret/Quinerete* (de *kinnor*, "harpa", pelo formato).
- **Fato 1**: lago de água doce mais baixo do mundo, ≈ 210 m abaixo do nível do mar.
- **Fato 2**: o rio Jordão entra pelo norte, sai pelo sul e desce até o Mar Morto (≈ −430 m, ponto mais baixo da Terra em terra firme).
- **Fato 3**: segundo os evangelhos, Jesus andou sobre as águas e acalmou uma tempestade no lago.

## Como foi feito
| Etapa | Ferramenta |
|---|---|
| Globo + relevo | **Three.js** (`src/app.js`): globo Blue Marble → remendo regional → remendo local com relevo real exagerado (5×, 20× no fato 1; a tela avisa) |
| Dados reais de elevação | Tiles *Terrarium* (AWS Open Data) → `scripts/build_maps.py` reprojeta para grade lat/lon, gera hillshade, máscara de água e malha de altura |
| Escala geográfica | Projeção lat/lon com correção de cos(lat) e distâncias por haversine (ex.: lago → Mar Morto em linha reta, calculada no código) |
| Contornos e rio | `scripts/build_geo.py` (contorno dos lagos pela máscara; Jordão = fundo do vale no DEM) |
| Voz | Piper `pt_BR-faber-medium` via sherpa-onnx (`scripts/tts.py`), offline |
| Legenda | tempos de palavra estimados a partir da duração real de cada frase (`scripts/make_timeline.py`) |
| Áudio | trilha ambiente + whoosh/pop/trovão sintetizados (`scripts/make_audio.py`) |
| Render | Playwright (Chromium) quadro a quadro → ffmpeg (`scripts/render.mjs`) |

> Nota: CesiumJS, WorldScale e Globe-ThreeJS (links do pedido) não foram usados diretamente — o ambiente não alcança servidores de tiles/Cesium Ion. O mesmo papel foi feito em Three.js puro com dados de elevação reais; as texturas são sintetizadas (hillshade + cor do Blue Marble), **não** são imagens de satélite reais.

## Reproduzir
```bash
npm i three@0.160.0 && pip install scipy scikit-image numpy pillow "sherpa-onnx==1.12.40"
# modelo de voz: https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models  (vits-piper-pt_BR-faber-medium)
python3 scripts/tts.py <pasta-do-modelo> out/voice && python3 scripts/make_timeline.py && python3 scripts/make_audio.py
PYTHONPATH=scripts python3 scripts/build_maps.py && PYTHONPATH=scripts python3 scripts/build_geo.py   # opcional (assets já incluídos)
npx http-server . -p 8123 -s &            # serve src/ e assets/
for w in 0 1 2 3; do node scripts/render.mjs $w 4 & done; wait
ffmpeg -framerate 30 -i out/frames/f_%05d.jpg -i out/audio.wav -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest out/galileia_3d.mp4
```
