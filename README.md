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

Usa só o **Gemini pelo plano gratuito do Google AI Studio**: sem cartão, sem faturamento. O plano grátis tem cota diária, e o
Google pode mudar os limites. Se o modelo principal estiver sobrecarregado ou sem cota, o app tenta os reservas
(`GEMINI_FALLBACK_MODELS`); se todos falharem, avisa e dá para tentar mais tarde. No plano grátis, o Google pode usar o conteúdo
enviado para melhorar os produtos dele.

Por IP: no máximo 15 pedidos em 10 minutos e 40 por dia. O material enviado é limitado a cerca de 30 a 40 mil tokens
(100 mil caracteres de texto + até 8 imagens).

### Como conseguir a chave (grátis)
1. Entre em https://aistudio.google.com/apikey com a sua conta Google e clique em **Create API key**.
2. Na Vercel: projeto → **Settings → Environment Variables** → `GEMINI_API_KEY` (marque como *Sensitive*) → **Redeploy**.
3. Nunca cole a chave em chats ou no código.

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

Preto e branco, no estilo Apple: cinzas neutros, botões em pílula, cartões bem arredondados e menu translúcido. Sempre claro
(sem modo escuro). O amarelo é só o **marca-texto**, que destaca o título e os termos-chave do resumo; o verde (✓) e o vermelho (✕)
aparecem só em certo e errado. Fonte do sistema (SF Pro no iPhone/Mac) com Inter como reserva. Movimento sem quique, respeitando
`prefers-reduced-motion`.
