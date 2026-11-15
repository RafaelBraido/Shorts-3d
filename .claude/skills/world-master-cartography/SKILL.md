---
name: world-master-cartography
description: Cartografia digital de nível editorial, Mundo e Brasil, 100% com dados abertos do GitHub e Python local (sem API paga, sem chave, sem Google/OpenStreetMap/Mapbox). Baixa fronteiras, estados, municípios, rios, lagos, áreas urbanas, batimetria, cidades, aeroportos e fusos em GeoJSON/CSV, reprojeta, calcula áreas reais e gera mapas interativos (Plotly/Folium sem tiles, globo 3D) e PNG/SVG em 300 DPI. Use para qualquer mapa, contorno, área, comparação de tamanho ou análise geográfica, e para trocar contornos desenhados à mão por contornos reais nos vídeos 3D do repositório.
---

# world-master-cartography

Responda em português do Brasil. Toda a base vem de repositórios abertos do GitHub e é processada localmente.

## 1. Regras de rede (obrigatórias)

- **Permitido:** `raw.githubusercontent.com`, `media.githubusercontent.com` (arquivos Git LFS), `github.com` (releases) e as bibliotecas Python locais.
- **Proibido:** APIs pagas, pedir `API_KEY`, e qualquer requisição ao Google Maps, OpenStreetMap (Nominatim, Overpass, tiles) e Mapbox. Não carregue basemaps de servidores: o fundo do mapa é desenhado com vetores.
- `scripts/geo_fetch.py` aplica isso: só aceita os hosts acima e levanta erro nos outros.
- A imagem de satélite e o relevo dos vídeos (Sentinel-2 e Terrarium, na AWS) pertencem a outro pipeline (`saopaulo/scripts/build_mid.py`); esta skill cobre só dados vetoriais.

## 2. Fontes validadas (testadas de verdade em 2026-11-15)

URL = `https://raw.githubusercontent.com/<usuario>/<repositorio>/<branch>/<caminho>`.

### Mundo
| Repositório (branch) | Arquivo testado | Tamanho | O que é |
|---|---|---|---|
| `martynafford/natural-earth-geojson` (master) | `10m/cultural/ne_10m_admin_0_countries.json` | 24,6 MB | países |
| idem | `10m/cultural/ne_10m_admin_1_states_provinces.json` | 63 MB | estados e províncias |
| idem | `10m/cultural/ne_10m_urban_areas.json` | 53 MB | áreas urbanas |
| idem | `10m/physical/ne_10m_rivers_lake_centerlines.json` | 11,9 MB | rios e lagos |
| idem | `10m/physical/ne_10m_lakes.json` | 6,6 MB | lagos |
| idem | `10m/physical/ne_10m_bathymetry_J_1000.json` | 4,9 MB | batimetria (isóbata de 1.000 m) |
| `nvkelso/natural-earth-vector` (master) | `geojson/ne_10m_admin_0_countries.geojson` (13 MB), `…admin_1_states_provinces.geojson` (41 MB), `…coastline.geojson` (10 MB), `…rivers_lake_centerlines.geojson` (7 MB), `…time_zones.geojson` (3,5 MB), `…urban_areas.geojson` (28 MB), `…bathymetry_J_1000.geojson` (2,5 MB), `…glaciated_areas.geojson` (5,9 MB), `…ports.geojson` (0,3 MB), `…roads.geojson` (50 MB) | — | mesmo Natural Earth, em arquivos menores (cultural + físico) |
| `wmgeolab/geoBoundaries` (main) | `releaseData/gbOpen/<ISO3>/ADM0\|ADM1\|ADM2/geoBoundaries-<ISO3>-ADM<n>.geojson` (testados: BRA ADM1 4,3 MB e ADM2 76 MB; PRT ADM0 17 MB e ADM1 28 MB; USA ADM1 13 MB) | — | limites administrativos de todos os países. **Os arquivos estão no Git LFS:** o `raw` devolve um ponteiro de 132 bytes; `fetch()` troca sozinho para `media.githubusercontent.com` (ver §4). Portugal ADM0 = 92.220 km² |
| `datasets/geo-countries` (main) | `data/countries.geojson` | 14,6 MB | países com ISO-A2/A3 |

### Cidades e população
| Repositório | Arquivo | Tamanho | O que é |
|---|---|---|---|
| `dr5hn/countries-states-cities-database` (master) | `json/countries.json`, `json/states.json` | 0,5 e 6,6 MB | países e estados (cidades não testadas) |
| `datasets/world-cities` (main) | `data/world-cities.csv` | 1,3 MB | cidades (país, subregião, GeoNames) **sem coordenadas** |
| `lmfmaier/cities-json` (master) | `cities500.json` | 27 MB | cidades com mais de 500 habitantes e coordenadas |

### Infraestrutura e fusos
| Repositório | Arquivo | Tamanho | O que é |
|---|---|---|---|
| `jpatokal/openflights` (master) | `data/airports.dat`, `data/routes.dat` | 1,1 e 2,4 MB | aeroportos e rotas |
| `datasets/airport-codes` (main) | `data/airport-codes.csv` | 8,8 MB | IATA, ICAO, tipo, elevação |
| `evansiroky/timezone-boundary-builder` | release `timezones.geojson.zip` em `https://github.com/evansiroky/timezone-boundary-builder/releases/latest/download/` | 52 MB | polígonos reais de fusos (zip) |

### Brasil
| Repositório | Arquivo | Tamanho | O que é |
|---|---|---|---|
| `tbrugz/geodata-br` (master) | `geojson/geojs-<cod UF>-mun.json` (`35` = SP; `100` = Brasil) | 1,9 MB (SP) a 22,5 MB | municípios; `id` = código IBGE |
| `fititnt/gis-dataset-brasil` (master) | `mesorregiao/geojson/mesorregiao.json`, `microrregiao/geojson/microrregiao.json` | 6,3 e 11 MB | meso e microrregiões do IBGE |
| `kelvins/municipios-brasileiros` (main) | `csv/municipios.csv` | 0,4 MB | 5.570 municípios: `codigo_ibge, nome, latitude, longitude, capital, codigo_uf, siafi_id, ddd, fuso_horario` |

### Reprovados neste ambiente (não use)
- `ipeaGIT/geobr`: o pacote instala e importa, mas `geobr.read_*` dá `ConnectionError` (os dados ficam em `ipea.gov.br` e em `api.github.com`, inacessíveis). Use `tbrugz/geodata-br`, `fititnt/gis-dataset-brasil` e `wmgeolab/geoBoundaries` (BRA).
- `topojson/world-atlas`: o repositório não guarda dados (só o código de build); o TopoJSON sai do pacote npm, fora das regras de rede. Use GeoJSON.

### Não testado (não prometa)
Cadeias de montanhas, rodovias de outros países e bairros: não confirmei arquivos para eles.

### Pacotes Python (verificados)
`geopandas`, `shapely`, `pyproj`, `plotly`, `folium`, `matplotlib`, `pyogrio`, `scipy` importam. `geobr` importa, mas sem dados (ver acima).

## 3. Padrões de qualidade (aplique todos)

1. **Resolução máxima:** `10m` do Natural Earth ou malha completa (`geoBoundaries`, `geodata-br`). Nunca `110m`/`50m` quando há zoom.
2. **Projeção correta, nunca graus brutos (EPSG:4326) em mapa estático:** mundo `EPSG:8857` (Equal Earth) ou `ESRI:54030` (Robinson); Brasil `EPSG:5880`; países ou regiões, UTM ou Albers local. **Áreas só em projeção de área igual.**
3. **Camadas com hierarquia visual:** (1) fundo suave, claro editorial ou escuro cartográfico; (2) países e estados, com fronteira internacional firme e divisão estadual fina e semitransparente; (3) físico: rios, lagos, áreas urbanas, batimetria; (4) dados temáticos, pontos proporcionais e arcos de grande círculo para voos e conexões.
4. **Interativo (HTML autocontido):** Plotly (`go.Choropleth`/`go.Scattergeo`, `fitbounds="locations"` ou globo `projection_type="orthographic"`) ou Folium com `tiles=None`. Tooltips com nome, código, dado e coordenadas. Tudo vetorial, offline.
5. **Estático em 300 DPI** (`bbox_inches="tight"`): título, subtítulo, legenda, graticule sutil, fonte dos dados no rodapé e rótulos sem sobreposição.
6. **Cache** em `./data/geo/{world,brazil,themes}/` (ignorado pelo Git). Use `fetch(url, kind)`; não baixe duas vezes.
7. **Honestidade:** diga fonte, ano e escala de cada contorno. Contorno desenhado à mão é "aproximado".

## 4. Receitas

```python
# scripts/geo_fetch.py
from geo_fetch import fetch, outline_latlon, area_km2
import geopandas as gpd
RAW = "https://raw.githubusercontent.com"

paises = gpd.read_file(fetch(f"{RAW}/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json"))
br = gpd.read_file(fetch(f"{RAW}/wmgeolab/geoBoundaries/main/releaseData/gbOpen/BRA/ADM1/geoBoundaries-BRA-ADM1.geojson", "brazil"))  # LFS: tratado dentro do fetch
print(paises[paises.ADM0_A3 == "BRA"].to_crs(8857).area.sum() / 1e6)          # km² reais

# globo 3D interativo (offline, sem tiles)
import plotly.graph_objects as go
fig = go.Figure(go.Choropleth(locations=paises.ADM0_A3, z=paises.POP_EST, geojson=paises.__geo_interface__, featureidkey="properties.ADM0_A3"))
fig.update_geos(projection_type="orthographic", showocean=True, oceancolor="#dfe8f1"); fig.write_html("globo.html")

# arco de grande círculo (voo): Scattergeo com mode="lines" e lat/lon dos dois aeroportos (openflights)

# estático, 300 DPI
import matplotlib.pyplot as plt
ax = br.to_crs(5880).plot(figsize=(8, 8), edgecolor="#333", linewidth=.3, color="#f2efe6"); ax.set_axis_off()
plt.savefig("brasil.png", dpi=300, bbox_inches="tight")
```

Git LFS: o `geo_fetch.fetch` baixa por `raw.githubusercontent.com`, detecta o ponteiro (arquivo de ~130 bytes que começa com `version https://git-lfs`) e refaz o download por `media.githubusercontent.com/media/...`. O caminho `github.com/<repo>/raw/...` devolve 403 neste ambiente.

## 5. Uso nos vídeos 3D deste repositório

Os vídeos (`alasca/`, `brasil/`, `louisiana/`, `saopaulo/`, `jerusalem/`, `piramides/`) desenham contornos em `assets/geo.json` como `[[lat, lon], ...]`. Para trocar um desenhado à mão por um oficial:

1. `outline_latlon(arquivo, campo, valor, tol=0.05)` devolve o **maior polígono**, ou seja, só a parte continental (Portugal sem as ilhas, EUA sem Alasca e Havaí). Para o país inteiro, some todos os polígonos no `geopandas`.
2. Grave no `geo.json` do vídeo e **atualize o rodapé** ("contorno aproximado" → "Natural Earth 10m" ou "geoBoundaries").
3. Calcule a área com `area_km2` ou com o `geopandas` (projeção de área igual) e use esse número no roteiro; não use área de memória.
4. Mantenha menos de ~400 pontos por contorno (aumente `tol`); com `tol=0.02` o Brasil tem ~1.800.

## 6. Fluxo

1. Entenda o pedido: região, tema, interativo ou estático, para vídeo ou não.
2. Escolha a fonte na tabela de validadas; fora dela, diga que não foi testada.
3. Baixe com cache, reprojete, calcule, componha em camadas.
4. Abra o resultado e confira rótulos, escala e fonte. Diga o que **não** foi possível verificar.
