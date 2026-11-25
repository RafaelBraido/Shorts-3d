# Maré · diário de emoções

Diário de humor, sono, energia e eventos do dia. Depois de ~3 semanas (21 registros) mostra o que costuma andar junto com os dias melhores e piores. **Tudo fica no navegador** (localStorage): sem conta, sem servidor, sem análise de uso.

Site 100% estático (HTML + CSS + JS em módulos, sem build) feito para a Vercel.

## Deploy na Vercel
Importe o repositório em vercel.com/new. Framework: **Other**, sem build command, sem output directory (raiz). O `vercel.json` já define os cabeçalhos de segurança.

## Privacidade
- CSP `connect-src 'none'`, `default-src 'none'`: o site não consegue fazer requisições externas.
- Fontes (Literata, Geist) e ícones (Lucide) são servidos localmente; nenhum CDN.
- Exportar/importar JSON, exportar CSV e "apagar tudo" na aba Dados.

## Como os padrões são calculados (`js/stats.js`)
- Correlação de Pearson com intervalo de confiança de Fisher (sono × humor, energia × humor).
- Eventos: média do humor nos dias com × sem o evento (teste t de Welch), no mesmo dia e no dia seguinte; mínimo de 4 dias em cada grupo.
- Dia da semana: melhor × pior dia.
- Cada achado é rotulado (indício forte, moderado, fraco ou possível pista). São ligações, não causas; com muitas comparações, parte aparece por acaso, e a interface avisa isso.

## Desenvolvimento
```
npm test        # testes da estatística (node:test)
npm run dev     # servidor local em :4173
```
