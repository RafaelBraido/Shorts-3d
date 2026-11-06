# Análise dos preditores de viralização

Leitura feita em 6 de novembro de 2026. Cada repositório foi clonado com `git clone --depth 1` e lido no código
(ignorando `node_modules`, `package-lock.json` e, no `juanls1`, os ~1000 arquivos de dados em `data/inputs`).
Onde algo não abriu ou não existe, está dito.

## Resumo

1. O `brain_activity` da Higgsfield (Virality Predictor) **roda no servidor deles**. A CLI e as skills só enviam o vídeo e imprimem o resultado. Não há código do modelo nos dois repositórios.
2. Dos preditores abertos, **nenhum** tem um modelo validado em vídeos reais de forma que sirva para prever views de um canal: um é treinado em dados sorteados, um usa só metadados com vazamento de alvo, e os acadêmicos têm 1000 vídeos antigos e métricas pouco informativas.
3. O que há em comum: os 1–3 primeiros segundos decidem; movimento, cortes, áudio, ritmo de fala, texto na tela e formato 9:16; gancho por mecanismos (pergunta, número, mito, "você", curiosidade, dor).
4. O `viralscope` junta tudo isso, **mede de verdade** cada sinal no arquivo, devolve o relatório no formato da Higgsfield e oferece calibração com os dados do próprio canal, o único caminho honesto para uma probabilidade.

## Repositório por repositório

### 1. `123angmish/ai-virality-predictor` (MIT)
- **Entrada:** vídeo enviado ou URL (FastAPI + front Next.js).
- **Sinais:** 7 — `hook_motion_intensity`, `scene_cut_rate`, `audio_rms_energy`, `transcript_wpm`, `text_overlay_ratio`, `color_vibrancy`, `resolution_aspect`.
- **Nota:** `LinearRegression` sobre esses 7 valores (`train_model.py`), mais "fit por plataforma" com fórmulas à mão em `main.py`.
- **Dado real:** nenhum. `dataset_loader.py` sorteia os 7 sinais de distribuições uniformes e sorteia views/curtidas **separadamente**; o alvo `ViralityScore` é uma soma ponderada escrita à mão dos próprios sinais + ruído. O modelo só reaprende essa fórmula.
- **Medido de verdade:** só `hook_motion_intensity` (diferença de quadros, truncada entre 15 e 98), `scene_cut_rate`, aspecto, duração, luminosidade. **Valores fixos que nunca são medidos:** `audio_rms_energy=0.72`, `transcript_wpm=165`, `text_overlay_ratio=0.45`, `color_vibrancy=76.2`, `face_count_first_3s`, `bass_drop_detected`, `transcript_snippet`. Os resumos de cena são texto pronto. `analyze-url` devolve números fixos e só mexe em dois deles se o título tiver "secret", "hacks" etc.
- **Defeitos que confirmei no código:**
  - A leitura de quadros para em 300 (`frame_idx < min(frame_count, 300)`), mas os cortes contados são divididos pela duração **inteira**: a taxa de cortes sai subestimada em vídeos longos.
  - `resolution_aspect` entra com coeficiente **positivo** (`*15.0` no alvo; +9,6 no modelo): o modelo premia vídeo **horizontal** (1,777) sobre 9:16 (0,5625), ao contrário do que a documentação afirma.
  - O README fala em `HistGradientBoosting`, R² 0,8714, "linhas empíricas de distribuições reais"; o código treina `LinearRegression` em dados sintéticos; há três R² diferentes (README 0,8714; `model_metadata.json` 0,8824; `main.py` 0,8669). `docs/DATASET.md` admite que é benchmark sintético.
  - `transcript_wpm` entra no alvo com peso positivo sem limite: quanto mais rápido, melhor, contra o próprio alvo de 160–180.

### 2. `rediumvex/viral-hooks-skill` (MIT)
Skill do Claude Code. Entrada: roteiro/tema. Não analisa vídeo. `hooks-database.md`: 100 fórmulas em 10 gatilhos (curiosidade, contrário, autoridade, emoção, lista, pergunta, história, negação, especificidade, confissão), com plataforma sugerida. Sem nota, sem dado: é vocabulário. Regra útil: mesclar um gancho "para o dedo" (negação/especificidade/pergunta) com um de retenção (história/confissão).

### 3. `postplusai/hook-skills` (Apache-2.0)
Cinco skills (`pattern-router`, `hook-design`, `reference-decode`, `visual-hook`, `prompt-preflight-qa`). Seis mecanismos: `boldClaim`, `questionGap`, `proofFirst`, `painRecognition`, `patternInterrupt`, `socialOrIdentityStake`. Regras: produto só entra depois de curiosidade/prova; especificidade vence generalidade; **gancho visual** exige um sujeito, um conflito visível, uma ação em curso, uma evidência e um desfecho aberto. Checklist, não modelo. A "base de 1.000+ aberturas" é declarada, não publicada.

### 4. `ddaverse/shorts-reels-hook-analyzer` (sem licença)
Só um `README.md` (1 arquivo). A ferramenta é um site Next.js; **o código não está no repositório**, então a lógica é desconhecida.

### 5. `harbarex/tiktok-virality-prediction` (curso CIS-519, UPenn)
- **Entrada:** 134 quadros 240×240 por vídeo (+ opcional, áudio via MediaPipe).
- **Nota:** ViViT (transformer de vídeo) → classe viral/não viral. `label.csv`: 1000 vídeos, 500 "trending" e 500 não. Rótulo = estar na lista de trending, não métrica de desempenho.
- **Dado real:** sim, mas pequeno e de 2020; treino em mini-lotes de 40 vídeos (`dataset_size = 40`), caminhos do Google Drive do grupo. Em `vivit.py`, `forward` chama `repeat(audio_feature, ...)` antes de checar `None`, então a versão sem áudio quebra. Sem resultado reproduzível no repositório.

### 6. `juanls1/TikTok-Virality-Predictor`
- **Entrada:** vídeo + legenda + hashtags (Streamlit).
- **Sinais:** texto (XLM-RoBERTa / LSTM), áudio (MFCC, chroma, centroide… com librosa; CNN+LSTM), imagem (8–16 quadros; CNN, ViT, 3D-CNN), multimodal (CLIP).
- **Nota:** `virality = views + (1−corr_likes)·likes + (1−corr_comments)·comments + (1−corr_shares)·shares`, normalizada min–max. Na app, a média "ponderada" é `0,45·texto + 0,45·áudio + 0,10·imagem`: pesos escritos à mão, não ajustados.
- **Dado real:** 1000 vídeos do dataset Kaggle "TikTok trending dec 2020", todos já virais.
- **Problemas:** como a métrica é min–max sobre cauda pesada, quase todos os valores ficam perto de 0 e uma MSE de 0,0001 é pouco informativa; não vi comparação com um baseline que prevê a média. Os próprios notebooks relatam que imagem trava num piso e que texto tem pouca informação. Parte dos modelos treinados não está no repositório.

### 7. `bsisduck/video-analyzer-skill` (GPL-3.0)
Não pontua. Pipeline de extração: ffmpeg para quadros por faixa de duração (curto <1 min: 2 quadros/s), montagem em grades, detecção de cena (limiar 0,3, 0,1 para estático, 0,4 para ação), silêncio (`silencedetect`), Whisper; despacha subagentes. Detalhe útil: ignorar a faixa de vídeo `attached_pic` (miniatura MJPEG de downloads). **GPL-3.0:** só aprendi a ideia; nenhum código foi copiado (o `viralscope` é MIT e totalmente independente).

### 8. `MortezaEmadi/YouTube-Channel-and-Video-Performance-Analysis-…-Stacking-Ensemble-Classifier`
O nome que você tinha dava 404; o correto é esse (achado pela busca da API). Sem licença no repositório.
- **Entrada:** metadados do YouTube Data API (canal e vídeo). **Não olha o vídeo.**
- **Alvo:** `engagement_rate = (likes+comments)/views`, dividido em tercis baixo/médio/alto.
- **Features:** `view_count`, `comment_count`, `conversation_rate`, `channel_subscribers`, `time_diff`, `description_length`, `uploads_per_year`. **Vazamento de alvo:** `view_count`, `comment_count` e `conversation_rate` (derivada de comentários) entram nas features e definem o alvo; a acurácia alta não prova nada sobre prever desempenho.
- `main.py` não roda como está: importa `src.*` (a pasta é `src_modules/`) e desempacota 2 retornos de `preprocess_data`, que devolve 3 e recebe os argumentos em outra ordem.
- Útil como ideia: normalizar por tamanho de canal e olhar frequência de upload.

## Higgsfield (`higgsfield-ai/cli` e `higgsfield-ai/skills`, MIT)

Lidos: `higgsfield-generate/SKILL.md`, `references/*.md` (`media-inputs`, `model-catalog`, `troubleshooting`), `MODELS.md`, `evals/scenarios.md` (cenário 11), `INSTALL.md`, `CLAUDE.md`, `install.sh`.

- **Chamada:** `higgsfield generate create brain_activity --video ./arquivo.mp4 --wait`. Exatamente um vídeo (`--video`, caminho ou UUID); sem prompt; `--folder_id` opcional. Erro típico: `Missing required params: medias`.
- **`install.sh`:** baixa o binário `hf_<versão>_<os>_<arch>.tar.gz` das *releases* do repositório, **confere o SHA-256** contra `checksums.txt` e instala `higgsfield` (+ `higgs`, e `hf` se livre). Não há código-fonte do programa: é um binário.
- **O que o Virality Predictor devolve** (texto, não mídia): nota geral (0–100); **pico do gancho** (% e segundo); **sustentação** (%); regiões **Visual, Auditory, Language, Attention** (maior = estímulo/foco mais forte) e **Default Mode** (menor = melhor; alto sugere divagação); região mais forte; riscos; e um **link "Open report"** (`…/apps/virality-predictor?resultJobId=<id>`). Nos metadados do job ficam artefatos `.glb`/`.bin` (mapas 3D) que a skill manda **não** mostrar. Exemplo da skill: `Overall score: 44/100 · Peak hook: 49% at 1s · Sustain: 89% · Strongest region: Visual Cortex · Risk: Default Mode is high…`.
- **O que isso permite concluir:** os nomes das regiões e o rótulo "attention proxy" indicam um modelo de resposta neural prevista por região cortical. Isso é **inferência minha a partir da saída**; os pesos, o treino e a validação não são públicos.
- **O que eu não fiz:** não chamei a API, não usei o CLI e não toquei em login/token. Reproduzo só o **formato** do relatório e os **sinais que ele declara** (hook, sustain, regiões), com código próprio.

## Comparação

| | Higgsfield | 123angmish | juanls1 | harbarex | Morteza | skills de gancho |
|---|---|---|---|---|---|---|
| Olha o vídeo | sim (servidor) | parcial | sim | sim | **não** | não |
| Gancho 0–3 s | sim (pico) | movimento 0–3 s | não | não | não | sim (texto) |
| Dado real | desconhecido | **nenhum** | 1000 TikToks | 1000 TikToks | metadados | n/a |
| Valores fixos exibidos | — | **vários** | — | — | — | — |
| Roda sem login | **não** | sim | sim | sim | sim (chave API) | sim |
| Explica o que corrigir | resumo | texto pronto | não | não | não | sim |

## O que o `viralscope` junta

| Origem | O que entrou | Como ficou |
|---|---|---|
| Higgsfield | nota geral, pico do gancho, sustentação, 5 regiões, risco, link de relatório | Mesmo formato (`--format higgsfield`), mas cada região é um **proxy de sinais do arquivo**, e há relatório HTML local |
| 123angmish | movimento 0–3 s, taxa de cortes, áudio, ritmo de fala, texto na tela, cor, aspecto, luminosidade | Todos **medidos de verdade** (fluxo óptico, cortes adaptativos, EBU R128, sílabas/s pelo envelope de voz, texto por morfologia, Hasler-Süsstrunk); nada fixo |
| bsisduck | ideias de silêncio, cena, Whisper opcional, ignorar `attached_pic` | Reimplementado do zero |
| rediumvex / postplus | 10 gatilhos + 6 mecanismos; hook→produto tardio; gancho visual | Léxico PT/EN com retorno decrescente, penalidades (saudação, muleta, CTA cedo), `hooks` e `script` |
| postplus (visual) | sujeito claro, primeiro quadro | Nitidez, exposição, saliência (resíduo espectral), rosto, início preto |
| juanls1 / harbarex | multimodal; dados de TikToks reais | Calibração com **os seus** vídeos (logística + AUC leave-one-out), que recusa n < 20 |
| Morteza | normalizar por canal; evitar vazamento | A calibração usa só sinais do arquivo como entrada; o alvo é métrica do próprio canal |

## Limites (leia antes de confiar)

- A nota mede **qualidade de atenção do material**. Não prevê views: distribuição, tema, canal, horário e sorte pesam muito e não estão no arquivo.
- Pesos da nota, alvos (≈ 6 sílabas/s, −14 LUFS, faixa de duração) e limiares são **priors**, não estimados com dados. Perfis de plataforma idem.
- O ritmo de fala por envelope foi validado só em fala **sintética**; música rítmica ou ruído modulado também gera "sílabas". Use `--transcript` ou `--transcribe` para medir palavras de fato.
- Texto na tela é proxy morfológico (sem OCR). Rosto: Haar frontal; não pega perfil, desenho nem 3D. Animações 3D chapadas tendem a ter menos "nitidez" por Laplaciano.
- Não foi testado com vídeos reais seus (nenhum foi fornecido até aqui).
