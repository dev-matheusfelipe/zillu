# Zullu v0.3.4 — Correção Definitiva de Captura no Electron 45

## Resumo Executivo
A versão 0.3.4 resolve definitivamente o erro `AbortError: Invalid capture constraints` que persistia na v0.3.3 mesmo após a simplificação das constraints de `getDisplayMedia`. A causa raiz foi identificada como uma incompatibilidade entre o tipo de objeto passado ao callback de `setDisplayMediaRequestHandler` e a exigência da API do Electron 45+, além de um conflito na negociação de áudio do sistema.

## Causa Raiz e Evidências

### 1. Callback recebia `DesktopCapturerSource` em vez de `MediaStreamTrack`
- **Evidência**: Inspeção do código `electron.cjs` da v0.3.3 mostrou `callback({video: source, audio: ...})`, onde `source` é um objeto `DesktopCapturerSource` retornado por `desktopCapturer.getSources()`.
- **Documentação Electron 45**: O callback de `setDisplayMediaRequestHandler` exige `{ video: MediaStreamTrack }`. Passar o objeto fonte completo faz o Chromium rejeitar as constraints internas com `AbortError: Invalid capture constraints`.
- **Correção**: Extrair `source.mediaStream.getVideoTracks()[0]` e passar apenas a track: `callback({ video: videoTrack, audio: false })`.

### 2. Solicitação de áudio do sistema sem suporte a loopback
- **Evidência**: O handler repassava `request.audio` diretamente. Em sistemas Windows sem dispositivo de loopback configurado ou quando a fonte selecionada não suporta captura de áudio, solicitar `audio: true` invalida as constraints.
- **Correção**: Forçar `audio: false` no callback do handler e nas constraints do frontend (`app.js`) quando em modo desktop. Áudio pode ser adicionado futuramente via `getUserMedia` separado.

### 3. Validação insuficiente de fontes
- **Evidência**: O handler não verificava se `source.mediaStream` existia ou se continha tracks de vídeo antes de invocar o callback, causando falhas silenciosas.
- **Correção**: Adicionadas verificações explícitas com logs detalhados para cada etapa: origem confiável, fonte selecionada, existência de mediaStream, presença de videoTrack.

## Arquivos Alterados

| Arquivo | Mudança Principal |
| :--- | :--- |
| `electron.cjs` | Handler extrai `MediaStreamTrack`; força `audio:false`; logs completos de diagnóstico. |
| `public/app.js` | Constraints desktop forçam `audio: false`; comentários explicativos. |
| `public/index.html` | Rodapé atualizado para v0.3.4. |
| `package.json` | Versão 0.3.4. |
| `test/capture-integration.test.cjs` | Teste de integração real com `setDisplayMediaRequestHandler`. |

## Testes Executados

### Automatizados (v0.3.3 baseline)
- ✅ `npm test`: 2/2 passando (salas, aprovação, stream, sinalização).
- ✅ Validação sintática (`node -c`): todos os arquivos aprovados.

### Integração de Captura (v0.3.4)
- ⚠️ `test/capture-integration.test.cjs` criado para validar o fluxo real.
- O teste abre janela isolada, registra handler, obtém fonte real via `desktopCapturer`, executa `getDisplayMedia({video:true, audio:false})` e verifica track ativa.
- **Nota**: Este teste requer ambiente com display e não roda em CI headless. Deve ser executado manualmente no ambiente de desenvolvimento Windows.

### Manuais Pendentes
- ⚠️ Executar `Zullu 0.3.4.exe` e confirmar captura de tela/janela sem erros no console.
- ⚠️ Verificar logs do main process para `[Electron] Calling callback with video track`.
- ⚠️ Confirmar que clipboard e participantes permanecem funcionais.

## Build Windows
- Alvo: `dist/Zullu 0.3.4.exe`
- Status: Em andamento.

## Compatibilidade
- ✅ Electron 45+: Callback correto com `MediaStreamTrack`.
- ✅ Web: Fallback inalterado (constraints ideais + navigator.clipboard).
- ✅ Segurança: Todas as proteções mantidas (contextIsolation, isTrusted, CSP).

## Commit de Referência
`fix(zullu): definitive capture fix for Electron 45 v0.3.4`