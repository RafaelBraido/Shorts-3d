# Study It

Envie PDFs ou prints do conteúdo. O Study It resume e monta uma prova de múltipla escolha
(5, 10, 15 ou 20 questões) em 4 níveis: **Fácil, Médio, Difícil e Desafio**. Achou fácil demais?
No resultado, um clique em **Mais difícil** gera uma prova nova, sem repetir questões.

## Como funciona

- PDFs e imagens são lidos **no navegador** (texto do PDF via `pdfjs-dist`; prints são redimensionados e
  comprimidos; páginas de PDF escaneado viram imagem). Só o conteúdo vai para o servidor, o que evita o limite de 4,5 MB
  de corpo das funções da Vercel.
- `/api/summarize` gera o resumo, `/api/quiz` a prova e `/api/review` corrige o **modo escrita** (você escreve de memória e recebe acertos, lacunas e erros), tudo com o Gemini (saída estruturada em JSON).
- Alternativas são embaralhadas no cliente; as perguntas já feitas são enviadas para a IA não repetir.

## IA e custo (zero)

Usa o **Gemini pela API gratuita do Google AI Studio**. Não precisa de cartão nem de conta paga: só de uma chave grátis.
O plano gratuito tem limite diário por modelo (e o Google pode mudar esses limites). Se o modelo principal estourar o limite,
o app tenta o modelo reserva (`GEMINI_FALLBACK_MODELS`); se os dois estourarem, mostra um aviso e volta no dia seguinte.
No plano grátis, o Google pode usar o conteúdo enviado para melhorar os produtos dele.

O material enviado é limitado a cerca de 30 a 40 mil tokens (100 mil caracteres de texto + até 8 imagens).

### Como conseguir a chave
1. Entre em https://aistudio.google.com/apikey com a sua conta Google.
2. Clique em **Create API key** e copie a chave.
3. Na Vercel: projeto → **Settings → Environment Variables** → nome `GEMINI_API_KEY`, valor = a chave, ambientes: todos.
4. Faça um **Redeploy** para a chave valer.

## Biblioteca e modo escrita

- Cada resumo é salvo **no navegador** (localStorage, até 20 matérias). Sem conta, sem banco, sem custo; não sincroniza entre aparelhos.
- **Escrever sem arquivo**: escolha um tema, escreva o que lembra e receba a correção. Pode comparar com uma ou mais matérias salvas;
  sem nenhuma marcada, a IA corrige pelo que ela sabe do tema (e pode errar).

## Rodar localmente

```bash
cp .env.example .env.local   # preencha GEMINI_API_KEY
npm install
npm run dev
```

Sem chave? Use `STUDY_IT_MOCK=1 npm run dev` para ver a interface com dados de exemplo.

## Deploy na Vercel

1. Importe este repositório na Vercel (projeto `study-it`, framework Next.js). Não use o projeto `mare-diario`, que é outro app.
2. Adicione `GEMINI_API_KEY` (veja acima) e faça o deploy.

## Design

Papel frio, tinta azul-marinho e marca-texto amarelo, que também marca os termos-chave do resumo.
Tipografia: Bricolage Grotesque (títulos) e Instrument Sans (texto). Modo escuro automático.
