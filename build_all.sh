#!/bin/bash
# reconstrói os 3 vídeos: voz -> linha do tempo -> áudio -> render (4 workers, 1,5x) -> mp4 1080x1920
D=/tmp/claude-0/-home-user-Shorts-3d/a1ba6d42-6b77-5c65-8bf6-bcbe5010edf8/scratchpad/dl/vits-piper-pt_BR-faber-medium
build() { proj=$1; port=$2; outname=$3
  cd /home/user/Shorts-3d/$proj
  curl -s -o /dev/null -m 3 localhost:$port/src/index.html || (setsid npx -y http-server . -p $port -c-1 -s >/tmp/srv$port.log 2>&1 &); sleep 4
  rm -rf out/voice out/frames; mkdir -p out/voice out/frames
  python3 scripts/tts.py $D out/voice >/dev/null 2>&1 && python3 scripts/make_timeline.py | tail -1 && python3 scripts/make_audio.py
  for w in 0 1 2 3; do node scripts/render.mjs $w 4 > out/r$w.log 2>&1 & done; wait
  n=$(ls out/frames | wc -l); echo "$proj quadros $n"
  ffmpeg -y -loglevel error -framerate 30 -i out/frames/f_%05d.jpg -i out/audio.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -vf scale=1080:1920:flags=lanczos -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k -shortest out/$outname && echo "$proj PRONTO $(ls -la out/$outname | awk '{print $5}')"
}
build corrida21 8133 corrida_21km_v2.mp4
build quarteto 8132 quarteto_5km_v2.mp4
build corrida 8131 percurso_ponta_grossa_v3.mp4
echo TUDO_PRONTO
