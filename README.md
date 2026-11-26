# Maré · diário de emoções

Diário do dia com carinhas, nota de 1 a 5, sono, energia, o que rolou e um mini resumo (até 280 caracteres). Depois de ~3 semanas (21 registros) mostra o que costuma andar junto com os dias bons e ruins. **Tudo fica no navegador** (localStorage): sem conta, sem servidor, sem análise de uso.

Site 100% estático (HTML + CSS + JS em módulos, sem build) feito para a Vercel.

## Deploy na Vercel
Importe o repositório em vercel.com/new. Framework: **Other**, sem build command, sem output directory (raiz). O `vercel.json` já define os cabeçalhos de segurança.

## Salvamento automático
Na tela Hoje não há botão de salvar: cada mudança (nota, sono, energia, eventos, resumo) é gravada sozinha cerca de meio segundo depois, e o dia pode ser ajustado quantas vezes quiser ao longo do dia. Se você sair da tela ou trancar o diário antes disso, a gravação pendente é feita na hora. Se o site ficar aberto na virada da meia-noite, ele passa para o dia novo ao voltar para a aba.

## Senha
Na primeira abertura o site pede para criar uma senha (mínimo de 6 caracteres). A senha **não fica no código nem no GitHub**: ela vira uma chave (PBKDF2-SHA-256, 600 mil iterações) e os registros são cifrados com AES-GCM de 256 bits antes de ir para o localStorage (`js/vault.js`, `js/store.js`). Sem a senha não há como abrir; se for esquecida, a única saída é apagar tudo e começar de novo. O diário tranca sozinho após 10 min parado ou 5 min com a aba escondida, e há "Bloquear agora" e "Trocar senha" na aba Dados. Os backups exportados (JSON/CSV) não são criptografados.

## Privacidade
- CSP `connect-src 'none'`, `default-src 'none'`: o site não consegue fazer requisições externas.
- Fontes (Literata, Geist) e ícones (Lucide) são servidos localmente; nenhum CDN.
- Exportar/importar JSON, exportar CSV e "apagar tudo" na aba Dados.

## Como os padrões são calculados (`js/stats.js`)
- Correlação de Pearson com intervalo de confiança de Fisher (sono × humor, energia × humor).
- Eventos: média do humor nos dias com × sem o evento (teste t de Welch), no mesmo dia e no dia seguinte; mínimo de 4 dias em cada grupo.
- Dia da semana: melhor × pior dia.
- Cada achado é rotulado (indício forte, moderado, fraco ou possível pista). São ligações, não causas; com muitas comparações, parte aparece por acaso, e a interface avisa isso.

## Fundo de ondas (WebGL)
`js/tide.js` desenha ondas com um shader próprio (WebGL puro, sem biblioteca) atrás do site inteiro. A cor e a altura seguem o humor mais recente (ou a carinha escolhida em Hoje). Renderiza em resolução reduzida, pausa com a aba escondida, fica parado com "menos movimento" e simplesmente não aparece se o navegador não tiver WebGL.

## Desenvolvimento
```
npm test        # testes da estatística (node:test)
npm run dev     # servidor local em :4173
```
