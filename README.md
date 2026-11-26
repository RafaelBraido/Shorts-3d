# Study It

Envie PDFs ou prints do conteúdo. O Study It resume e monta uma prova de múltipla escolha
(5, 10, 15 ou 20 questões) em 4 níveis: **Fácil, Médio, Difícil e Desafio**. Achou fácil demais?
No resultado, um clique em **Mais difícil** gera uma prova nova, sem repetir questões.

## Como funciona

- PDFs e imagens são lidos **no navegador** (texto do PDF via `pdfjs-dist`; prints são redimensionados e
  comprimidos; páginas de PDF escaneado viram imagem). Só o conteúdo vai para o servidor, o que evita o limite de 4,5 MB
  de corpo das funções da Vercel.
- `/api/summarize` gera o resumo, `/api/quiz` a prova e `/api/review` corrige o **modo escrita** (você escreve de memória e recebe acertos, lacunas e erros), tudo com Claude (saída estruturada).
- Alternativas são embaralhadas no cliente; as perguntas já feitas são enviadas para a IA não repetir.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm install
npm run dev
```

Sem chave? Use `STUDY_IT_MOCK=1 npm run dev` para ver a interface com dados de exemplo.

## Deploy na Vercel

1. Importe este repositório na Vercel.
2. Em **Settings → Environment Variables**, adicione `ANTHROPIC_API_KEY`.
3. Faça o deploy. Se o site for público, considere limites de gasto na sua conta da Anthropic:
   o app tem só um limite simples por IP.

## Design

Papel frio, tinta azul-marinho e marca-texto amarelo, que também marca os termos-chave do resumo.
Tipografia: Bricolage Grotesque (títulos) e Instrument Sans (texto). Modo escuro automático.
