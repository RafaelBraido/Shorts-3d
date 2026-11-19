# Brasil v4 no Blender (fundo 3D na sua GPU NVIDIA)

O Blender faz só o **fundo**: globo, mapa da América do Sul, atmosfera, estrelas e luz. Os rótulos, os contornos, a legenda palavra a palavra e os cartões ficam numa **camada transparente** (PNG) já gerada, e o ffmpeg junta tudo. Assim a câmera é idêntica nas duas camadas (conferi: o Monte Caburaí e o Chuí caem no mesmo pixel, nos quadros 150, 300 e 450).

Testado no Blender **4.0.2** (cloud, CPU). Você tem o 4.2: a API usada é a mesma, mas não rodei no 4.2.

## Passo a passo (na pasta `brasil/`)

1. Descompacte a camada transparente: `blender/overlay.zip` → `out/overlay/` (896 PNGs quantizados (256 cores com transparência), `f_00000.png` …).
2. Teste rápido de 1 quadro (poucos segundos na GPU):

```
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" -b -P blender\render_bg.py -- --out out\blender_bg --frames 150-150 --scale 0.5 --device OPTIX --samples 16
```

3. Render completo (896 quadros). Se `OPTIX` der erro, use `--device CUDA`:

```
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" -b -P blender\render_bg.py -- --out out\blender_bg --device OPTIX --samples 32
```

4. Junte com o ffmpeg: `bash blender/compose.sh` (ou rode o comando de dentro do arquivo no PowerShell).

Opções do script: `--engine CYCLES|EEVEE`, `--samples N`, `--scale 0.5` (metade da resolução, para rascunho), `--frames 100-200`, `--no-denoise` (só se o seu Blender não tiver denoiser).

## O que tem aqui
- `render_bg.py`: monta a cena e renderiza o fundo.
- `../out/cam_track.json`: a câmera de cada quadro (exportada do motor web).
- `overlay.zip`: a camada transparente (rótulos, contornos, legenda, cartões).
- `audio.m4a`: voz, trilha e efeitos.
- `timeline.json`: tempos das falas.

## Limites
- O fundo usa as mesmas texturas (Blue Marble + recorte da América do Sul). O ganho do Blender é luz, atmosfera e suavização, não mais detalhe de relevo.
- O motor EEVEE do Blender 4.2 mudou de nome (`BLENDER_EEVEE_NEXT`); por isso o padrão é Cycles.
- Não tem mascote nem personagem: o pacote de skills de Blender que você mandou (`paises-pack`) pede o BlenderMCP conectado a um Blender aberto, e eu não alcanço o seu computador.
