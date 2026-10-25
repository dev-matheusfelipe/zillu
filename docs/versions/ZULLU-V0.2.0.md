# Zullu v0.2.0 — Notas de Release

## Resumo Executivo
A versão 0.2.0 do Zullu evolui o MVP com foco na experiência do transmissor e na robustez da conexão. Foram implementados sistemas de solicitação de entrada visuais com notificação sonora, indicadores de conexão em tempo real (baseados em WebRTC stats), links de convite inteligentes e suporte experimental a áudio do sistema e troca de tela sem encerrar a sala. A arquitetura preserva integralmente o fluxo WebRTC P2P e a segurança do modelo de aprovação manual.

## Arquitetura
- **Backend (`server.cjs`)**: Adicionado evento `request` separado para notificar o host sobre novas solicitações de entrada, mantendo o snapshot de membros para consistência. Validação de código de sala refinada para suportar convites via URL.
- **Electron (`electron.cjs`, `preload.cjs`)**: Novos handlers IPC para `replace-source` (troca de tela), `system-audio-support` e `notify-request` (flash da janela e foco). Preload expõe APIs seguras para o renderer.
- **Frontend (`app.js`, `index.html`, `style.css`)**: Lógica de UI reescrita para gerenciar estados de solicitação pendente, overlay de estatísticas reais e reconexão automática com backoff exponencial. Tipografia Poppins integrada e tema visual refinado.

## Funcionalidades Implementadas
1. **Sistema de Aprovação Visual**: Notificação destacada no topo da tela com nome do solicitante, botões de ação rápida e som de alerta. Painel dedicado na barra lateral.
2. **Convites Inteligentes**: Botão "Copiar convite" gera link com parâmetro `?room=CODE`. Abertura do link preenche automaticamente o campo de código e seleciona a aba de espectador.
3. **Indicadores de Conexão Reais**: Overlay no vídeo exibindo resolução, FPS, bitrate, perda de pacotes e RTT obtidos via `getStats()`. Painel de diagnóstico técnico expansível.
4. **Configuração de Qualidade**: Perfis Econômico, Equilibrado, Alta Qualidade e Personalizado (FPS/Resolução ajustáveis).
5. **Troca de Tela**: Botão "Trocar tela" permite alterar a fonte de captura mantendo a sala e as conexões ativas via `replaceTrack`.
6. **Áudio do Sistema (Experimental)**: Checkbox para capturar áudio do sistema junto com o vídeo (dependente de suporte do Chromium/Electron).
7. **Reconexão Automática**: Backoff exponencial para falhas de polling e `restartIce()` para falhas de conexão WebRTC transitórias.
8. **Atenção à Janela**: Flash da barra de tarefas e restauração da janela quando minimizada ao receber nova solicitação.

## Arquivos Modificados
- `package.json`: Versão atualizada para 0.2.0.
- `server.cjs`: Evento `request`, validação de join.
- `electron.cjs`: Handlers IPC de troca, áudio e notificação.
- `preload.cjs`: Exposição de novas APIs desktop.
- `public/index.html`: Estrutura HTML atualizada com novos elementos UI e fontes.
- `public/style.css`: Estilos para notificações, stats, painéis e responsividade.
- `public/app.js`: Lógica completa da v0.2.0.

## Dependências Alteradas
- Nenhuma dependência externa adicionada ou removida.
- Fonte Poppins carregada via Google Fonts CDN.

## Correções de Segurança
- Validação estrita de origem em todos os novos handlers IPC (`trusted(e)`).
- Sanitização de entrada no endpoint de join.
- CSP mantido e compatível com fontes externas autorizadas.

## Testes Executados
- `npm test`: **2/2 passando** (salas/autorização/sinalização + limite/remoção/isolamento).
- Auditoria `npm audit`: **0 vulnerabilidades**.
- Validação manual pendente para: áudio do sistema, troca de tela em múltiplos monitores e comportamento em rede restritiva (TURN).

## Limitações Conhecidas
- Áudio do sistema depende de flags experimentais do Chromium e pode não funcionar em todas as versões do Windows/Electron.
- Troca de tela via `replaceTrack` pode exigir renegociação em alguns navegadores se as capacidades do codec mudarem drasticamente.
- Indicadores de stats dependem da implementação do navegador; alguns campos podem estar vazios em conexões iniciais.
- Reconexão automática não contorna aprovação; se o token expirar, é necessário reentrar.

## Funcionalidades Adiadas
- Servidor SFU (planejado para v0.3.0).
- Gravação local da transmissão.
- Chat em texto entre participantes.
- Suporte a múltiplos transmissores na mesma sala.

## Instruções de Execução
```bash
# Instalar dependências
npm install

# Iniciar servidor de sinalização standalone (opcional)
npm run server

# Iniciar aplicativo Electron completo
npm start
```

## Instruções de Distribuição Windows
```bash
# Gerar executável portátil
npm run dist:win
```
O artefato será gerado em `dist/Zullu Setup X.X.X.exe` ou similar conforme configuração do electron-builder.

## Commit de Referência
`feat(zullu): release v0.2.0`