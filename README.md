# FISH IT — Godot 4

Jogo 3D em primeira pessoa de pesca e tiro numa ilha tropical (estilo low-poly, inspirado no trailer *How to Fish*).

**Como abrir:** Godot 4.3+ → Importar → `project.godot` → F5.
(Funciona nos renderizadores Forward+ e Compatibility; testado em Compatibility/OpenGL.)

## Controles

| Tecla | Ação |
|---|---|
| WASD / mouse | mover / olhar |
| Shift / Espaço | correr / pular (na água: nadar para cima) |
| 1 / 2 | rifle dourado / vara de pesca |
| Botão direito (segurar) | mirar com a luneta |
| Botão esquerdo | rifle: atirar · vara: segurar para carregar o lançamento, soltar para lançar |
| R | recarregar |
| E | interagir (loja do Capitão Maré, coletar peixe abatido) |
| Tab / I | mochila, registro de peixes, varas |
| Q | cancelar lançamento · Esc: solta o mouse |

## Como pescar
1. Equipe a vara (2), segure o clique (barra de força) e solte para lançar em **água funda**.
2. Aguarde: os peixes são reais e nadam até a boia, beliscam e mordem.
3. Quando a boia afundar e aparecer **! FISGUE !**, clique.
4. Minigame: **segure** o clique para recolher, **solte** quando o peixe puxar — se a tensão chegar ao máximo a linha arrebenta; se o progresso zerar, ele escapa.
5. Venda os peixes na cabana vermelha (E), compre varas melhores e munição, suba de nível.

Também dá para **atirar nos peixes** (ficam boiando; E para coletar, valem 60%) e em alvos (boias e garrafas).

## Arquitetura

```
project.godot            inputs corretos, autoloads, camadas de física
scenes/                  Main, World, Player, HUD, FishManager
scripts/
  main.gd                liga mundo, jogador, HUD e peixes
  world.gd               céu, sol, terreno, oceano, ilhas, construções, vegetação, alvos
  player.gd              movimento, nado, câmera, equipamentos, interação
  autoload/game_state.gd moedas, XP/nível, inventário, varas, munição, registro, save (user://)
  autoload/audio_manager.gd  todos os sons sintetizados por código (sem arquivos de áudio)
  equipment/rifle.gd     rifle: mira, recuo, ferrolho, recarga, raycast real, tracer, impactos
  equipment/fishing_rod.gd   máquina de estados da pesca + minigame de tensão
  equipment/bobber.gd    boia balística / flutuante
  fish/fish_database.gd  10 espécies (raridade, peso, preço, comportamento)
  fish/fish_model.gd     modelo 3D procedural de cada espécie
  fish/fish.gd           IA do peixe (nada, foge, cardume, belisca, morde, fisgado, morto)
  fish/fish_manager.gd   população ao redor do jogador
  ui/hud.gd              HUD, luneta, barras, cartão de captura, mochila e loja
  world/                 terrain.gd, props.gd, fx.gd, target.gd, interactable.gd, flicker_light.gd
shaders/                 ocean.gdshader, sky.gdshader, fish.gdshader
tests/                   playtest.gd + PlayTest.tscn (jogador automático)
```

## Teste automatizado
`godot --path . res://tests/PlayTest.tscn` joga a cena real (atira, lança, espera mordida, fisga, recolhe, abre mochila e loja) e grava screenshots em `/tmp/shots`.
