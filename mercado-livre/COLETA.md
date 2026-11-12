# Coleta de preços — Mercado Livre (e demais lojas)

Gatilho: o usuário diz "analisa o mercado" (ou similar). Precisa de uma sessão do Claude Code rodando na máquina dele, com a extensão Claude in Chrome ativa (sessões na nuvem não alcançam o Chrome).

## Passos
1. Leia `config.json`.
2. Para cada produto × loja: abra uma aba NOVA no Chrome, vá na URL da loja (modelo em `lojas`), role até carregar ~`anuncios_por_loja` anúncios e leia os preços (R$, número). Ignore patrocinados duplicados e itens que não são o produto (ex.: escova manual no papa-bolinhas).
3. Calcule por produto × loja: `minimo`, `mediana`, `maximo` (use faixa robusta; se o mínimo/máximo for outlier, ajuste e explique em `observacao`) e `anuncios` (quantos lidos).
4. Gere `precos.csv` com as colunas, nesta ordem:
   `produto,loja,minimo,mediana,maximo,anuncios,observacao,link`
   (`link` = URL da busca usada; preço com ponto decimal.)
5. Atualize o dashboard: suba o CSV como arquivo (Artifact `publish` com `asset: true`) e atualize o dataset `precos` (`source.url`, `updated.at`, descrição com a data da leitura) via `ArtifactData`. A data "lidos em ..." no texto da página também precisa ser atualizada.
6. Resuma o que mudou em relação à leitura anterior (maiores altas/quedas de mediana).

## Regras
- Sem login, sem compras, sem formulários. Captcha ou bloqueio: pare e avise qual loja falhou.
- Um produto/loja que falhar fica de fora; não invente números.
- Preços de anúncio de revenda ≠ custo de atacado; deixe isso claro no resumo.
