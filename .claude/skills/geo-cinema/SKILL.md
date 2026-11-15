---
name: geo-cinema
description: Globo 3D cinematográfico e vídeos de mapa no Blender 4.2 (Cycles, RTX/OptiX) com dados brutos do GitHub, sem instalar nada e sem API. Use para renderizar o planeta (albedo 8K, relevo 10K, atmosfera, sol baixo), preparar áudio procedural e voz nativa do Windows nos Shorts de mapa deste repositório.
---

# geo-cinema (regras enxutas)

## Proibido
- Instalar qualquer coisa (`pip`, `npm`, `apt`, `winget`, `brew`, venv, addons/plugins). Só o Python embutido do Blender 4.2, bibliotecas do sistema e arquivos brutos em `./data/`.
- Chaves de API, serviços pagos, Google Maps, OpenStreetMap, Mapbox. Não pedir para o usuário gravar a própria voz.

## Onde está cada coisa
- `cinema/fetch_data.py`: baixa do GitHub para `./data/` (stdlib): albedo 8192x4096, relevo 10800x5400, nuvens, máscara de oceano (`franky-adl/threejs-earth`) e Natural Earth 10m (`martynafford/natural-earth-geojson`). Rode: `blender -b -P cinema/fetch_data.py`.
- `cinema/render.py`: cena e render. Só nós nativos: Bump do relevo, oceano espelhado, nuvens, atmosfera (Layer Weight + ColorRamp + Transparent), Sol baixo, estrelas procedurais. Cycles com OptiX, OIDN (se o Blender tiver), filtro Blackman-Harris 1.5.
- `cinema/audio_teste.py`: trilha procedural (numpy + wave). `cinema/voz_sapi.ps1`: voz pt-BR do Windows (`System.Speech`), com `Rate` e pausas na pontuação.

## Comandos (no computador do usuário, com o Blender 4.2 já instalado)
```
blender -b -P cinema/fetch_data.py
blender -b -P cinema/render.py -- --out cinema/out/teste_frame.png --device OPTIX --samples 128
blender -b -P cinema/render.py -- --track brasil/out/cam_track.json --out cinema/out/frames/f_ --device OPTIX   # animação com a câmera do vídeo
```
Saída padrão 1080x1920 (vertical, Shorts). Para 1920x1080 use `--width 1920 --height 1080`.

## Limites (não prometa o que não foi testado)
- A sessão de nuvem não alcança o computador do usuário: o Blender 4.2, a RTX, o OIDN e as vozes do Windows **não foram testados aqui** (a nuvem tem Blender 4.0.2, só CPU).
- Não existe textura 16K por GitHub raw achada e validada: o melhor é albedo 8K e relevo 10K.
- Se não houver voz pt-BR no Windows, gerar o vídeo só com legenda e trilha procedural, deixando a faixa de voz limpa.
- Dado/textura: citar a fonte (NASA, Natural Earth) no rodapé do vídeo.
