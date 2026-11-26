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

Só usa planos **gratuitos**, sem cartão. O site tenta, nesta ordem:
1. a **chave pessoal** de quem está usando (botão "Chave", no topo), se a pessoa colou uma;
2. o **Gemini** do site (`GEMINI_API_KEY`), que aceita imagens e textos grandes;
3. o **Groq** (`GROQ_API_KEY`), só para textos curtos;
4. o **OpenRouter** (`OPENROUTER_API_KEY`), modelos grátis.

Cada provedor só entra na fila se a chave dele estiver configurada. Se um estoura o limite do dia, o site passa para o próximo.
Todo plano grátis tem cota diária compartilhada por quem usa o site, e os limites mudam com o tempo. Para os amigos nunca ficarem
sem IA, o botão **Chave** deixa cada um usar a própria chave grátis do Gemini (o uso sai da cota dele). Ela fica só no navegador da
pessoa e passa pelo servidor apenas para pedir a resposta; não é guardada.
Por IP: no máximo 15 pedidos em 10 minutos e 40 por dia. No plano grátis do Google, o conteúdo enviado pode ser usado para melhorar os produtos dele.

O material enviado é limitado a cerca de 30 a 40 mil tokens (100 mil caracteres de texto + até 8 imagens).

### Como conseguir as chaves (grátis)
- **Gemini (obrigatória):** https://aistudio.google.com/apikey → *Create API key*.
- **Groq (opcional):** https://console.groq.com/keys → *Create API Key*.
- **OpenRouter (opcional):** https://openrouter.ai/keys → *Create Key*.

Na Vercel: projeto → **Settings → Environment Variables** → uma variável por chave (todos os ambientes) → **Redeploy**.

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
2. Adicione `GEMINI_API_KEY` (veja acima; as outras são opcionais) e faça o deploy.

## Design

Papel frio, tinta azul-marinho e marca-texto amarelo, que também marca os termos-chave do resumo.
Tipografia: Bricolage Grotesque (títulos) e Instrument Sans (texto). Modo escuro automático.
