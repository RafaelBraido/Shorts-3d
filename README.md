# FISH IT — Godot 4

Jogo 3D em primeira pessoa de **pesca, sobrevivência e tiro** num arquipélago tropical (estilo low-poly, inspirado no trailer *How to Fish*), com **modo história completo (5 ilhas + final)**, **multiplayer cooperativo** e **versão para celular em paisagem**.

**Abrir:** Godot 4.3+ → Importar → `project.godot` → F5.

## A história
Você, de barco e bebendo, perde o controle e naufraga numa ilha. Sem recursos, armas ou barco, precisa aprender a pescar, ganhar dinheiro, comprar armas e derrotar o monstro de cada ilha, entregando uma parte dele como prova para o radar mostrar a próxima ilha — até voltar ao continente.

| Ilha | NPC | Chefe | Como avançar |
|---|---|---|---|
| 1 — O Farol | Guardião do Farol | Caranguejo‑Aranha | pescar 3 peixes → cerveja ($15) → lata vazia como isca na Baía do Caranguejo → fisgar e matar **a facadas** → carapaça → chaves do barco + Radar ($250) |
| 2 — A Floresta | Marina | Piranha Gigante + filhotes | 5 sanguessugas → isca especial → lago → pistola/escopeta/dinamite → esqueleto |
| 3 — Tropical | Turista (+ Mestre do Churrasco, opcional) | Baiacu Gigante (rola como bola) | pescar um Cavalo‑Marinho → cenoura como isca → SMG → barbatana |
| 4 — Penhascos | Vendedor Assustado | Albatroz Gigante (voa e atira) | pescar um Atum → oferenda no altar → sniper → cabeça |
| 5 — O Vulcão | Cientista (traje hazmat) | Baleia‑da‑Groenlândia → **Baleia Mutante de Magma** | 5 peixes do vulcão → Balde de Peixes → matar a baleia → carregar a carcaça ao topo e jogar na lava → fuzil/dinamite → barbatana → chaves da lancha militar → navegar ao continente |

Depois dos créditos o jogo continua no mesmo save (completar registro de peixes). Sempre há um objetivo na tela, um feixe de luz amarelo no destino e uma seta de radar/guia.

## Controles (PC)
| Tecla | Ação |
|---|---|
| WASD / mouse | mover / olhar |
| Shift / Espaço / Ctrl ou C | correr / pular (nadar) / agachar |
| 1 / 2 / 3 | arma (repetir 1 troca de arma) / vara / dinamite |
| Botão direito (segurar) | mirar (a sniper usa luneta) |
| Botão esquerdo | atirar · golpear · lançar a vara (segurar = força) · fisgar |
| R | recarregar |
| E | interagir (NPCs, itens, barco, altar, lava) |
| Tab / I | mochila, diário, registro, armas, varas |
| F2 | multiplayer |

Armas: Faca, Pistola, Escopeta, Submetralhadora, Fuzil de Assalto, Rifle Dourado (sniper) e Dinamite — compre na loja.

## Pesca
Lance em água funda → os peixes são reais e vêm até a boia → ao afundar, clique para fisgar → **segure** para recolher e **solte** quando o peixe puxar (tensão alta rompe a linha). Chefes usam iscas especiais da missão e o mesmo minigame.

## Celular (paisagem)
Controles de toque automáticos em Android/iOS: joystick flutuante, olhar por arrasto, botões ATIRAR/PESCAR, MIRA, PULAR, CORRER, ABAIXAR, RECARGA, USAR, itens 1‑3, MOCHILA e REDE. Para testar no PC: `godot --path . -- --touch`.

**Gerar o APK:** instale o Godot 4.3 + Export Templates, JDK 17 e Android SDK (Editor → Configurações do Editor → Export → Android). Depois *Projeto → Exportar → Adicionar → Android*, marque "Use Gradle Build" se preferir, e exporte. O projeto já está configurado para paisagem (sensor), renderizador **Compatibility** no mobile, menos peixes/grama/sombras no celular.

## Multiplayer cooperativo
F2 (ou botão REDE): Hospedar ou Entrar pelo IP (porta UDP 24565). Também: `-- --host`, `-- --join=IP`, `--name=Nome`. Sincronizados: jogadores (posição, olhar, item, agachar), tiros e avisos de captura. **Individuais:** peixes, chefes, missões, dinheiro e mochila (cada jogador vive a própria história).

## Arquitetura
```
project.godot            inputs, autoloads (GameState, Sfx, Net, Story), camadas de física
scenes/                  Main, World, Player, HUD, FishManager, TouchControls
scripts/autoload/        game_state (progressão/inventário/armas/save), audio_manager (sons sintetizados),
                         network (ENet), story (capítulos, diálogos, itens, objetivos)
scripts/equipment/       rifle (todas as armas), weapon_db, dynamite, fishing_rod, bobber
scripts/fish/            banco de espécies, modelo procedural, IA, gerenciador
scripts/story/           boss (6 chefes), boss_models, boss_projectile, boss_drop, npc, story_world,
                         pickups, interact_spot, quest_beacon
scripts/world/           terrain, props, fx, boat, target, interactable, remote_player
scripts/ui/              hud, touch_controls
shaders/                 ocean, sky, fish
tests/                   PlayTest, TouchTest, NetTest, StoryTest (história inteira), TourTest (screenshots)
```

## Testes automáticos
`godot --headless --path . res://tests/StoryTest.tscn` percorre os 5 capítulos e o final (82 verificações). `PlayTest`, `TouchTest`, `NetTest` e `TourTest` cobrem pesca/tiro, toque, rede e visual.
