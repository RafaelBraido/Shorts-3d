---
name: viralscope
description: Analisa um vídeo curto (Short, Reel, TikTok) ou roteiro e devolve nota 0-100, gancho dos 3 primeiros segundos, sustentação, regiões Visual/Auditory/Language/Attention/Default Mode, qualidade da imagem, áudio, legenda e correções priorizadas com o trecho exato; aprende com as métricas reais do canal. Use quando o usuário pedir para analisar, pontuar, comparar ou melhorar um vídeo curto, um gancho, um roteiro ou uma thumbnail, ou perguntar se um vídeo "vai viralizar".
---

# viralscope

Analisador local (sem login, sem API paga). Código em `viralscope/`; CLI `viralscope`.

## Antes de tudo
1. `viralscope --version`. Se não existir: `pip install git+https://github.com/RafaelBraido/viralscope` (precisa de `ffmpeg`).
2. Se o usuário não deu o caminho do vídeo, peça.

## Comandos
- Vídeo: `viralscope analyze VIDEO [--platform shorts|tiktok|reels] [--transcript arq.srt] --format higgsfield`
- Comparar: `viralscope compare A B` · Canal inteiro: `viralscope batch PASTA --csv rank.csv`
- Thumbnail: `viralscope image IMG` · Ganchos: `viralscope hooks ARQ` · Roteiro: `viralscope script ARQ`
- Aprender: depois que o vídeo tiver métrica real (retenção %, views em 7 dias), `viralscope learn VIDEO --target N`. Em lote: `viralscope learn --import arq.csv` (video,target). Estado: `viralscope learn --status`.

## Como responder
1. Rode `analyze` (use `--json` se precisar dos números) e entregue: nota geral, pico do gancho, sustentação, as cinco regiões, a região mais forte, o risco e o link do relatório HTML.
2. Liste as 3-5 correções de maior prioridade **com o intervalo de segundos** e o que mudar.
3. Se houver probabilidade calibrada, cite junto a AUC e o n. Se não houver, diga que ainda faltam vídeos com métrica real (mínimo 20).
4. Ofereça registrar a métrica real do vídeo depois de alguns dias (`learn`), porque é assim que a ferramenta melhora no canal.

## Regras de honestidade (obrigatórias)
- A nota mede a qualidade de atenção do material com sinais do arquivo. **Não prevê views.** Nunca diga "vai viralizar" nem dê porcentagem que não venha do modelo calibrado.
- As regiões usam os nomes da Higgsfield, mas são proxies; **não medem atividade cerebral**.
- Pesos e alvos são priors. Ritmo de fala sem transcrição é proxy; texto na tela é proxy (sem OCR); rosto é Haar frontal (não pega desenho/3D).
- Não chame a API da Higgsfield nem use o login deles.
