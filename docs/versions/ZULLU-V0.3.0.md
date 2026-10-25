# Zullu v0.3.0 — Salas Colaborativas Multi-Stream

## Resumo Executivo
A versão 0.3.0 do Zullu evolui a arquitetura de transmissor único para um modelo de sala colaborativa onde múltiplos participantes podem compartilhar suas telas simultaneamente. O sistema agora suporta até 5 participantes ativos por sala, com gerenciamento independente de streams, layouts em grade e foco, e sinalização WebRTC multiponto. A segurança e o modelo de aprovação manual foram preservados e adaptados para o novo contexto colaborativo.

## Arquitetura

### Backend (`server.cjs`)
- **Modelo de Sala**: Substituição de `host`/`members` por `owner`/`members`/`streamers`.
- **Novas Rotas**: `start-stream` e `stop-stream` para gerenciar publicações independentes.
- **Eventos**: `room-state` (snapshot completo), `stream-started`, `stream-ended`, `participant-left`.
- **Sinalização**: Rota `signal` atualizada para suportar troca de sinais entre quaisquer participantes aprovados, não apenas host-viewer.
- **Segurança**: Validação de permissões em todas as rotas; apenas owner pode aprovar/remover; apenas aprovados podem transmitir ou sinalizar.

### Frontend (`app.js`, `index.html`, `style.css`)
- **WebRTC Multiponto**: Mapa de `RTCPeerConnection` por participante remoto (`peers` Map).
- **Gerenciamento de Streams**: Mapa `remoteStreams` para renderização independente de cada transmissão.
- **Layouts**: Alternância entre Grid (todos visíveis) e Foco (um principal + strip lateral).
- **UI Dinâmica**: Lista de participantes com estados (transmitindo/assistindo/aguardando) e ações contextuais para o proprietário.
- **Controles Independentes**: Botões para iniciar/parar minha transmissão sem afetar a sala.

### Electron (`electron.cjs`, `preload.cjs`)
- Mantida a integração com `desktopCapturer` e handlers IPC para captura de tela/janela.
- Compatível com o novo fluxo de múltiplas capturas sequenciais ou simultâneas (limitado pelo hardware).

## Funcionalidades Implementadas

1.  **Transmissões Simultâneas**: Múltiplos participantes podem publicar vídeo ao mesmo tempo na mesma sala.
2.  **Layout em Grade**: Visualização mosaico responsiva que se adapta ao número de streams ativos.
3.  **Layout Foco**: Destaque de uma transmissão principal com miniaturas dos demais em faixa lateral.
4.  **Gerenciamento de Participantes**: Owner pode aprovar entradas e remover participantes (o que encerra suas streams).
5.  **Ciclo de Vida Independente**: Encerrar uma transmissão não fecha a sala nem desconecta outros.
6.  **Sinalização P2P Robusta**: Conexões diretas par-a-par estabelecidas sob demanda após aprovação.
7.  **Qualidade Configurável**: Perfis de resolução/FPS aplicados via `getDisplayMedia` constraints e `setParameters`.
8.  **Convites Inteligentes**: Links com parâmetro `?room=` continuam funcionando para entrada rápida.
9.  **Reconexão Automática**: Backoff exponencial no polling e tratamento de falhas de conexão.
10. **Notificações Visuais/Sonoras**: Alertas para novas solicitações de entrada e início de streams.

## Testes Executados

-   `npm test`: **2/2 passando**
    -   ✔ v0.3.0: salas, aprovação, stream e sinalização multiponto
    -   ✔ v0.3.0: limite de participantes e remoção durante transmissão
-   Validação sintática de todos os arquivos JS/CSS/HTML.
-   Build Windows configurado via `npm run dist:win`.

## Limitações Conhecidas

-   **Limite de Participantes**: Hardcoded em 5 membros + 1 owner (total 6 conexões máximas na sala).
-   **Áudio do Sistema**: Continua experimental e dependente de suporte do Chromium/Electron.
-   **Stats Detalhados**: Overlay de stats simplificado nesta versão; painel de diagnóstico técnico mantém dados brutos.
-   **Resolução Original**: Opção "Fonte original" depende das capacidades reportadas pelo `getDisplayMedia`; fallback seguro aplicado se não suportado.
-   **TURN**: Suporte a TURN preparado via configuração de `iceServers`, mas não testado em ambiente restrito nesta release.

## Instruções de Execução

```powershell
# Instalar dependências
npm install

# Iniciar servidor standalone (para testes web)
npm run server

# Iniciar aplicativo Electron completo
npm start

# Gerar executável portátil Windows
npm run dist:win
```

## Próximos Passos (Roadmap)

-   Servidor SFU para reduzir carga de upload em salas com muitos espectadores.
-   Chat em texto integrado.
-   Gravação local de sessões.
-   Suporte a anotações/desenho compartilhado.
-   Otimizações avançadas de bitrate adaptativo.

## Commit de Referência
`feat(zullu): multi-stream rooms v0.3.0`