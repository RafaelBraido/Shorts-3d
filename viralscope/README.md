# viralscope

Analisador **local** (sem login, sem API paga) de **gancho, imagem, áudio, fala e retenção** de vídeos curtos: YouTube Shorts, Reels e TikTok.
Você passa o vídeo e recebe nota 0–100, resumo no formato do **Virality Predictor da Higgsfield** (nota geral, pico do gancho, sustentação, Visual / Auditory / Language / Attention / Default Mode), uma curva segundo a segundo, os quadros dos 3 primeiros segundos e uma lista de correções priorizada, com o trecho exato.

> **Honestidade primeiro.** A nota mede a *qualidade de atenção do material* com sinais **medidos no arquivo**. Ela **não prevê visualizações** e **não mede atividade cerebral**; as "regiões" usam os nomes da Higgsfield, mas são proxies de sinais do vídeo. Os pesos são priors, não foram treinados com dados reais. Para uma **probabilidade do seu canal**, use `viralscope calibrate` com seus vídeos e métricas reais. Não usa a API da Higgsfield nem contorna o login dela. Veja [`docs/ANALISE.md`](docs/ANALISE.md).

## Instalação

Python 3.9+ e `ffmpeg`.

```bash
pip install -e .                 # numpy + opencv-python-headless (<5, traz o detector de rosto)
pip install -e ".[transcribe]"   # opcional: Whisper para transcrever sozinho
```

## Uso

```bash
viralscope analyze video.mp4                          # texto em português + relatório HTML em ./viralscope_reports
viralscope analyze video.mp4 --format higgsfield      # mesmo resumo do Virality Predictor
viralscope analyze video.mp4 --transcript legenda.srt # gancho falado e palavras/s reais
viralscope analyze video.mp4 --transcribe --json
viralscope analyze video.mp4 --platform tiktok        # shorts (padrão) | tiktok | reels
viralscope compare a.mp4 b.mp4                        # lado a lado
viralscope batch pasta/ --csv ranking.csv             # ranqueia todos os vídeos de um canal
viralscope image thumb.png                            # thumbnail/capa
viralscope hook "Você está errando isso há 8 meses e ninguém te conta?"
viralscope hooks ganchos.txt                          # ranqueia vários ganchos (um por linha, ou 'a|b|c')
viralscope script roteiro.txt                         # gancho, ritmo estimado, frases longas, muletas, CTA
viralscope calibrate meus_videos.csv --out model.json # CSV: video,target  (retenção %, views 7d...)
viralscope analyze video.mp4 --model model.json       # adiciona probabilidade calibrada
```

Exemplo (`--format higgsfield`):

```
Overall score: 80/100
Peak hook: 78% at 2s
Sustain: 100%
Visual: 55%
Auditory: 94%
Language: 85%
Attention: 75%
Default Mode: 0% (lower is better)
Strongest region: Auditory

Open report: file:///.../video.viralscope.html
```

## O que é medido e o que é heurística

| Sinal | Como | Tipo |
|---|---|---|
| Cortes (hora e taxa) | distância de histograma HSV + diferença de pixels em cor, limiar adaptativo | medido |
| Movimento | fluxo óptico (Farneback), em larguras de quadro por segundo | medido |
| Nitidez, exposição, contraste, cor, saturação | Laplaciano, luma, desvio, Hasler-Süsstrunk | medido |
| Foco / saliência | resíduo espectral (Hou & Zhang) em numpy | medido |
| Posição do ponto de interesse | distância até terços/centro | heurística |
| Rosto | Haar cascade (frontal) | medido (limitado) |
| Texto na tela e zona coberta pela interface | morfologia (sem OCR) | proxy |
| Início preto / fade | luma + desvio nos primeiros quadros | medido |
| Loudness, pico, LRA | EBU R128 via ffmpeg | medido |
| Silêncio, clipping, primeiro som, primeira sílaba, ataques | sinal de áudio | medido |
| Ritmo de fala sem transcrição | picos do envelope da banda de voz | proxy |
| Palavras/s | transcrição com tempos (`--transcript`/`--transcribe`) | medido |
| Gancho falado | léxico de 10 mecanismos PT/EN, com penalidades | heurística |
| Loop | semelhança fim-início (imagem e som) | medido |
| Como tudo vira nota, alvos e pesos | `scoring.py`, `profiles.py` | heurística (editável) |

O relatório HTML marca cada linha como **medido**, **proxy** ou **heurística**.

## Como a nota é calculada

Por segundo: `Visual` (movimento, cortes, qualidade de imagem, cor, sujeito), `Auditory` (volume, ataques, voz), `Language` (ritmo de fala), `Attention` (quebras de padrão: cortes, picos de movimento, ataques de áudio, mudança de cena) → engajamento. `Default Mode` = risco de divagação (trechos de baixa estimulação; menor é melhor). Nota geral = gancho 30% (dinâmica 0–3 s, primeiro quadro, entrada do som, gancho falado), corpo 20%, sustentação 12%, sem divagação 10%, imagem 8%, formato 7%, loop 5%, legendas 4%, áudio técnico 4%. Pesos em `DEFAULT_WEIGHTS`; passe os seus com `--weights`.

## Aprende com o seu canal

```bash
viralscope learn video.mp4 --target 12345   # registra a métrica real (retenção %, views 7d...)
viralscope learn --import meus.csv          # vários de uma vez (video,target)
viralscope learn --status
```

Cada registro reajusta o modelo do canal (`./.viralscope/`, ou `$VIRALSCOPE_HOME`) e `analyze` passa a mostrar a probabilidade calibrada sozinho. Abaixo de 20 vídeos nada é prometido; depois disso a AUC leave-one-out mostra se o modelo presta, e ele diz o que mais separa os seus bons vídeos dos ruins.

## Skill do Claude

`skills/viralscope/SKILL.md` + `CLAUDE.md` + `.claude-plugin/`. No Claude Code: `/plugin marketplace add RafaelBraido/viralscope` e `/plugin install viralscope@viralscope`. No Claude.ai: envie a pasta `skills/viralscope` como skill.

## Calibração (o caminho para uma probabilidade real)

`calibrate` ajusta uma regressão logística (L2) dos componentes da nota para "ficou acima da mediana do seu canal" (ou outro `--threshold`) e informa a **AUC em leave-one-out**. Recusa com menos de 20 vídeos e avisa se a AUC < 0,6. Sem isso, qualquer porcentagem seria inventada.

## Testes

```bash
pip install -e ".[test]"
pytest
```

55 testes: unidades de imagem/áudio/texto, vídeos sintéticos (cortes exatos, início preto, sem áudio, horizontal, borrado, escuro, legenda dentro/fora da zona segura, fala sintética de 3/5,5/7 sílabas/s), CLI, calibração (recupera sinal, ruído dá AUC ≈ 0,5, recusa n pequeno) e um benchmark sintético de ordenação. **Eles validam que o código mede o que diz medir; não validam previsão de viralização.**

## Limites

- Não prevê views; tema, distribuição, canal e horário ficam de fora.
- Ainda não foi testado com vídeos reais.
- Ritmo de fala foi validado só com fala sintética; música rítmica pode contar como "sílabas".
- Sem OCR; Haar não vê perfil, desenho ou 3D.

## Licença

MIT.
