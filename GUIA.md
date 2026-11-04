# PC Remote — arquitetura e guia

App Flutter (Android Samsung, iOS, Windows, macOS) + agent Node.js no PC.
**Abas: Energia (ligar/desligar/monitorar), Arquivos (explorar, baixar, enviar) e Assistente (Ollama com texto e voz).**

## Como funciona (e por que é assim)

```
 Celular / app desktop                                PC
┌───────────────────────┐   WebSocket (ws://IP:8765)  ┌──────────────────┐
│ Flutter               │◄───────────────────────────►│ agent Node.js    │
│  PowerCubit           │  status a cada 3 s, comandos│  shutdown/sleep… │
│  ├ AgentClient (WS)   │                             └──────────────────┘
│  ├ WolService (UDP)───┼──── magic packet ─────────► placa de rede (PC desligado)
│  └ PlugClient (HTTP)──┼──── on/off ───────────────► tomada Wi-Fi (corta a energia)
└───────────────────────┘
```

* **Ligar** não pode passar pelo agent (com o PC desligado ele não existe). Quem
  envia o Wake-on-LAN é o **app**, direto por UDP na rede local.
* **Desligar/suspender/reiniciar/bloquear** vão pelo WebSocket para o agent, que executa o
  comando nativo do SO com atraso configurável (padrão 5 s) e **botão Cancelar**.
* **Estados**: Ligado (WebSocket conectado) · Em espera (agent avisou "vou suspender" e caiu) ·
  Desligado (caiu sem aviso) · Ligando/Desligando/Reiniciando (transitórios).
  Como cortar a energia não fecha o TCP, o app usa um watchdog de 9 s sem mensagens.
* **Tomada inteligente**: HTTP direto do app (funciona com PC desligado). "Desligar tudo" =
  desliga o SO pelo agent → espera cair → +10 s → corta a tomada.
  Truque: na BIOS, ative **Restore on AC Power Loss = Power On**; assim "Ligar tomada" também liga o PC
  (o app ainda manda um WoL 20 s depois por garantia).
* Segurança: token aleatório de 192 bits (timing-safe), 5 falhas = bloqueio de 60 s por IP,
  comandos em lista fixa executados sem shell. Use **só em rede confiável** (tráfego `ws://` sem TLS).
  Fora de casa: use VPN (Tailscale/WireGuard), nunca abra a porta no roteador.

## 1. Rodar o agent no PC

Requisitos: Node.js 18+.

```bash
cd agent
npm install
npm start
```

Na 1ª execução cria `agent/config.json` com o **token** e imprime IP e MAC. Anote IP + token.

* Windows autostart + firewall: `powershell -ExecutionPolicy Bypass -File agent\deploy\windows-autostart.ps1`
* Linux: `agent/deploy/pc-remote-agent.service` (systemd --user)
* Testes: `npm test` · Simular sem desligar de verdade: `PCR_DRY_RUN=1 npm start`
* Testar WoL do terminal (de outro PC da rede): `npm run wol -- AA:BB:CC:DD:EE:FF`

### Habilitar Wake-on-LAN (obrigatório para ligar o PC)

1. **BIOS/UEFI**: ative *Wake on LAN* / *Power On By PCI-E* (e *ErP/EuP* desativado).
2. **Windows**: Gerenciador de Dispositivos → placa de rede → Avançado: *Wake on Magic Packet* = Ativado;
   aba Energia: marque *Permitir que este dispositivo ative o computador*.
   Painel de Controle → Opções de energia → **desative "Inicialização rápida"** (senão não liga após desligar).
3. O PC precisa estar em **cabo Ethernet** (WoL por Wi-Fi quase nunca funciona).
4. No Linux: `sudo ethtool -s eth0 wol g`.

## 2. Gerar o app

Requisitos: Flutter 3.27+ (`flutter doctor`).

```bash
cd app
flutter create . --platforms=android,ios,windows,macos   # gera as pastas de plataforma (não sobrescreve lib/)
flutter pub get
flutter test
```

**Android (Samsung)** — edite `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>   <!-- voz do Assistente -->
<application ... android:usesCleartextTraffic="true">   <!-- ws:// e HTTP da tomada na LAN -->
```

```bash
flutter build apk --release --split-per-abi     # build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
flutter install                                 # ou copie o APK para o celular (USB debugging ligado)
```

**iOS** (precisa de Mac + Xcode): em `ios/Runner/Info.plist` adicione
`NSLocalNetworkUsageDescription` ("Encontrar e controlar seu PC na rede local") e, para HTTP da tomada,
`NSAppTransportSecurity > NSAllowsLocalNetworking = true`, `NSMicrophoneUsageDescription` e `NSSpeechRecognitionUsageDescription` (voz). Depois `flutter build ios` e instale pelo Xcode
(conta Apple gratuita vale 7 dias).

**Windows / macOS** (o mesmo código, para controlar de outro PC): `flutter build windows` / `flutter build macos`.
No macOS, habilite o entitlement `com.apple.security.network.client` em `macos/Runner/*.entitlements`.

## 3. Primeiro uso

1. Celular e PC na mesma rede Wi-Fi/roteador.
2. App → ⚙︎ Ajustes → IP do PC + token → Salvar. O MAC e o broadcast são preenchidos sozinhos
   (confira se escolheu a placa certa, a de cabo).
3. Toque no botão central: PC ligado → desliga (com confirmação); desligado → manda o WoL.

## 4. Arquivos e Assistente

**Arquivos**: só as pastas listadas em `fileRoots` no `agent/config.json` são visíveis (padrão: Downloads).
Links simbólicos que apontam para fora são bloqueados. Baixar abre a folha de compartilhar/salvar do celular;
o botão de seta envia um arquivo do celular para a pasta aberta. Tudo direto pela rede local (HTTP com Range).

**Assistente**: instale o [Ollama](https://ollama.com) no PC, rode `ollama pull llama3` e confira o nome em
`ollama list`; se usar outro modelo, ajuste `ollama.model` no `config.json` e reinicie o agent. O agent faz o proxy
em streaming, então o Ollama continua escutando só em `127.0.0.1`. Para voz, toque no microfone (pt-BR).
Modelos grandes disputam RAM/GPU com jogos: use o assistente fora do jogo ou um modelo pequeno (`llama3.2:3b`).

## Escopo e próximos passos (não implementado ainda)

| Fase | Item | Caminho recomendado |
|---|---|---|
| 3 | Espelhamento + mouse/teclado | WebRTC: `flutter_webrtc` no app; no PC `node-datachannel` + captura (ffmpeg/DXGI) + `nut.js` para input — é a parte mais pesada e consome CPU/GPU |
| 4 | Notificações / WhatsApp | sem API oficial para uso pessoal; ponte via WhatsApp Web (risco de bloqueio da conta) ou WhatsApp Business API |

Tuya/Smart Life: a assinatura da nuvem Tuya não cabe num cliente leve; use a integração Tuya do Home Assistant
(ou Tasmota/Shelly) e aponte as URLs de ligar/desligar para um webhook local.
