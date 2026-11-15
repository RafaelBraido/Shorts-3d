---
name: geo-master-cartography
description: Cartografia digital de alta precisão sem servidores de tiles. Baixa fronteiras, estados, municípios, fusos, aeroportos e cidades em GeoJSON/CSV direto do GitHub, reprojeta (EPSG:5880 Brasil, Equal Earth mundo), calcula áreas reais e gera mapas interativos (Plotly/Folium sem tiles) ou PNG/SVG em 300 DPI. Use quando o pedido for um mapa, contorno, área, comparação de tamanho ou análise geográfica, e para trocar contornos desenhados à mão por contornos reais nos vídeos 3D.
---

# geo-master-cartography

Mapas e análises geográficas **100% locais**: só dados vetoriais baixados do GitHub e bibliotecas Python. Responda em português do Brasil.

## 1. Regras de rede (obrigatórias)

| Alvo | Regra |
|---|---|
| `raw.githubusercontent.com` / `github.com` | **Permitido**: `.geojson`, `.topojson`, `.csv`, `.json`, `.shp` |
| `nominatim.openstreetmap.org`, `overpass-api.de`, `tile.openstreetmap.org` | **Bloqueado.** Nunca faça requisição nem carregue tiles |
| `api.mapbox.com` | **Bloqueado** |
| `*.googleapis.com` | **Só sob demanda**: exige `GOOGLE_MAPS_API_KEY` com faturamento. Use apenas se o usuário pedir Places, rotas ou geocodificação em tempo real **e** fornecer a chave em `.env` (modelo em `.env.example`). Nunca coloque a chave no código ou no chat |
| Sentinel-2 (`sentinel-cogs.s3.us-west-2.amazonaws.com`) e relevo (`s3.amazonaws.com/elevation-tiles-prod/terrarium`) | Permitidos (imagem e altitude reais; ver pasta `saopaulo/scripts/build_mid.py`) |

Não raspe o Google Maps (viola os termos e envolve dados pessoais).

## 2. Fontes (status testado em 2026-11)

### Verificadas (respondem 200 neste ambiente)
| Fonte | Arquivo | Tamanho | Uso |
|---|---|---|---|
| Natural Earth Vector (`nvkelso/natural-earth-vector`) | `geojson/ne_10m_admin_0_countries.geojson` | 13 MB | fronteiras de países (usar sempre `10m`) |
| idem | `geojson/ne_10m_admin_1_states_provinces.geojson` | 41 MB | estados e províncias (ex.: Alasca) |
| idem | `geojson/ne_10m_coastline.geojson` | 10 MB | linha de costa |
| idem | `geojson/ne_10m_time_zones.geojson` | 3,5 MB | fusos horários |
| `johan/world.geo.json` | `countries.geo.json` | 0,25 MB | fronteiras leves (prévia rápida) |
| `tbrugz/geodata-br` | `geojson/geojs-<UF>-mun.json` (ex.: `35` = SP, 22,5 MB o `100-mun`) | 1,9 MB (SP) | municípios do Brasil; `id` = código IBGE |
| `dr5hn/countries-states-cities-database` | `json/countries.json` | 0,5 MB | países, estados e cidades com lat/lon |
| `jpatokal/openflights` | `data/airports.dat` | 1,1 MB | aeroportos |
| `evansiroky/timezone-boundary-builder` | README apenas | — | polígonos de fusos (baixar o release de GitHub) |
| `ipeaGIT/geobr` | só o README no `master`; dados vêm pelo pacote `geobr` | — | malhas oficiais do IBGE (testar `geobr.read_*` antes de prometer) |

### Citadas pelo usuário, mas o link veio truncado (`https://github.com`): precisam do link completo
GeoJSON Countries (fronteiras limpas), World Atlas TopoJSON (`topojson/world-atlas` não tem `countries-10m.json` no repositório: vem no pacote npm `world-atlas`), "GIS Dataset Brasil", "5.570 Municípios Brasileiros", "Airport Codes", todos os itens do Google Maps (MCP, Agent Skills, 18 ferramentas, Places/Routes). **Peça o link completo antes de usar.**

## 3. Padrões de qualidade

1. **Resolução:** use `10m` do Natural Earth ou as malhas completas do IBGE. Nunca `110m`/`50m` em arte final.
2. **Projeção:** nunca plote graus brutos (EPSG:4326). Brasil: `EPSG:5880` (SIRGAS 2000 Policônica). Mundo: `EPSG:8857` (Equal Earth) ou `ESRI:54030` (Robinson). **Áreas só em projeção de área igual** (Brasil: `EPSG:5880`; mundo: `EPSG:8857`).
3. **Mapa interativo com zoom (HTML):** Plotly (`go.Choropleth` / `go.Scattergeo`, `fitbounds="locations"`) ou Folium com `tiles=None`. Tudo vetorial, sem servidor de tiles.
4. **Imagem estática:** PNG/SVG em **300 DPI**, bordas finas, rótulos legíveis, legenda, escala, rosa dos ventos e fundo limpo.
5. **Cache:** tudo baixado vai para `./data/geo/` (ignorado pelo Git). Use `scripts/geo_fetch.py`; não baixe duas vezes.
6. **Honestidade nos dados:** diga a fonte, o ano e a escala de cada contorno. Contorno desenhado à mão é "aproximado"; dado oficial é "IBGE/Natural Earth".

## 4. Receitas

```python
# cache + download (scripts/geo_fetch.py)
from geo_fetch import fetch, area_km2, outline_latlon
gj = fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson")

import geopandas as gpd
paises = gpd.read_file(gj)                     # GeoDataFrame em EPSG:4326
br = paises[paises["ADM0_A3"] == "BRA"]
print(br.to_crs(8857).area.sum() / 1e6)        # km² reais (Equal Earth)

# interativo, sem tiles
import plotly.graph_objects as go
fig = go.Figure(go.Choropleth(locations=paises["ADM0_A3"], z=paises["POP_EST"], geojson=paises.__geo_interface__, featureidkey="properties.ADM0_A3"))
fig.update_geos(fitbounds="locations", visible=False); fig.write_html("mapa.html")

# estático em 300 DPI
import matplotlib.pyplot as plt
ax = br.to_crs(5880).plot(figsize=(8, 8), edgecolor="#333", linewidth=.4, color="#f2efe6"); ax.set_axis_off()
plt.savefig("mapa.png", dpi=300, bbox_inches="tight")
```

## 5. Uso nos vídeos 3D deste repositório

Os vídeos (`alasca/`, `brasil/`, `louisiana/`, `saopaulo/`, `jerusalem/`, `piramides/`) desenham contornos em `assets/geo.json` como listas `[lat, lon]`. Para trocar um contorno desenhado à mão por um oficial:

1. `outline_latlon(gj, campo, valor, tol=0.05)` devolve a lista `[[lat, lon], ...]` simplificada (Douglas-Peucker em graus) do **maior polígono**, ou seja, só a parte continental (Portugal sem as ilhas ≈ 88 mil km²; EUA sem Alasca e Havaí ≈ 7,9 milhões de km²). Para o país inteiro use `geopandas` e some todos os polígonos (`to_crs(8857).area.sum()`).
2. Grave no `geo.json` do vídeo e **atualize o rodapé** ("contorno aproximado" → "Natural Earth 10m" ou "IBGE").
3. Calcule a área com `area_km2` (projeção de área igual) e use esse número no roteiro; não use áreas de memória.
4. Mantenha poucos pontos (menos de ~400 por contorno) para o SVG do vídeo ficar leve: aumente `tol` até chegar nisso (com `tol=0.02` o Brasil tem ~1.800 pontos).

## 6. Fluxo de trabalho

1. Entenda o mapa pedido (região, tema, interativo ou estático, para vídeo ou não).
2. Escolha a fonte na tabela de **verificadas**; se faltar, peça o link completo.
3. Baixe com cache, reprojete, calcule, desenhe.
4. Abra o resultado e confira: rótulos legíveis, escala, fonte citada. Diga o que **não** foi possível verificar.
