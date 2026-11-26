# Study It

Envie PDFs ou prints do conteúdo. O Study It resume e monta uma prova de múltipla escolha
(5, 10, 15 ou 20 questões) em 4 níveis: **Fácil, Médio, Difícil e Desafio**. Achou fácil demais?
No resultado, um clique em **Mais difícil** gera uma prova nova, sem repetir questões.

## Como funciona

- PDFs e imagens são lidos **no navegador** (texto do PDF via `pdfjs-dist`; prints são redimensionados e
  comprimidos; páginas de PDF escaneado viram imagem). Só o conteúdo vai para o servidor, o que evita o limite de 4,5 MB
  de corpo das funções da Vercel.
- `/api/summarize` gera o resumo, `/api/quiz` a prova e `/api/review` corrige o **modo escrita** (você escreve de memória e recebe acertos, lacunas e erros), tudo com Claude Haiku 5.5 (saída estruturada em JSON).
- Alternativas são embaralhadas no cliente; as perguntas já feitas são enviadas para a IA não repetir.

## IA e custo

Usa o **Claude Haiku 5.5 (esforço médio)** pelo [Vercel AI Gateway](https://vercel.com/docs/ai-gateway): **não precisa de chave da Anthropic**.
Preço do modelo: US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída. O material enviado é limitado a cerca
de 30 a 40 mil tokens (100 mil caracteres de texto + até 8 imagens), então um resumo e uma prova custam centavos.
Defina um orçamento máximo em Vercel → AI Gateway para nunca passar do que quiser gastar.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha AI_GATEWAY_API_KEY
npm install
npm run dev
```

Sem chave? Use `STUDY_IT_MOCK=1 npm run dev` para ver a interface com dados de exemplo.

## Deploy na Vercel

1. Importe este repositório na Vercel (projeto `study-it`, framework Next.js). Não use o projeto `mare-diario`, que é outro app.
2. Ative o AI Gateway no projeto (Vercel → AI Gateway).
3. Faça o deploy. Nenhuma variável de ambiente é necessária.

## Design

Papel frio, tinta azul-marinho e marca-texto amarelo, que também marca os termos-chave do resumo.
Tipografia: Bricolage Grotesque (títulos) e Instrument Sans (texto). Modo escuro automático.
