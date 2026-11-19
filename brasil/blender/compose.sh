#!/usr/bin/env bash
# Junta o fundo do Blender + a camada transparente (rótulos/legenda/cartões) + o áudio -> out/brasil_blender.mp4
# Rode na pasta brasil/ depois do render do Blender. Precisa de ffmpeg.
set -e
ffmpeg -y -framerate 30 -i out/blender_bg/f_%04d.png -framerate 30 -i out/overlay/f_%05d.png -i blender/audio.m4a \
  -filter_complex "[0:v][1:v]overlay=format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 16 -c:a copy -movflags +faststart -shortest out/brasil_blender.mp4
