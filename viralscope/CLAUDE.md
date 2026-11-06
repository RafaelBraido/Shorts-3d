# viralscope: instruções para o Claude

Projeto Python (`viralscope/`) que analisa vídeos curtos com sinais medidos no arquivo.

## Comandos
- Instalar: `pip install -e ".[test]"` (precisa de `ffmpeg`; OpenCV fica em `<5` por causa do detector de rosto)
- Testes: `pytest` (~50 s; gera vídeos sintéticos com ffmpeg)
- Rodar: `viralscope analyze video.mp4 --format higgsfield`

## Mapa do código
`frames.py` (imagem) · `video.py` (cortes, fluxo óptico, por segundo) · `audio.py` (EBU R128, ritmo de fala) ·
`text.py` (gancho, roteiro) · `scoring.py` (canais, regiões, nota, correções) · `report.py` (texto, Higgsfield, HTML) ·
`calibrate.py` + `history.py` (aprendizado do canal) · `profiles.py` (priors por plataforma).

## Regras
- Todo sinal novo precisa ser medido de verdade e entrar na tabela `measured` com tipo medido/proxy/heurística. Nada de valor fixo exibido como medição.
- Toda mudança de pontuação precisa de teste sintético. Não escreva R², "treinado com milhares de vídeos" ou "prevê views/atividade cerebral" sem dado real que sustente.
- Não chamar a API da Higgsfield, não usar login deles, não copiar código GPL (o `bsisduck/video-analyzer-skill` é GPL-3.0).
- Português do Brasil em textos para o usuário.
- A skill está em `skills/viralscope/SKILL.md`; mantenha-a alinhada com o CLI.
