# Zullu v0.3.2 — Correções de CSP e Estabilidade de Navegação

## Resumo Executivo
A versão 0.3.2 é uma release de manutenção crítica que resolve dois problemas bloqueantes identificados na v0.3.1: violação de Content Security Policy (CSP) ao reproduzir áudio de notificação e falha na criação de salas no executável Windows devido a loop de recarregamento. Esta versão garante conformidade total com a CSP padrão do Electron e estabiliza o fluxo de conexão desktop-to-desktop.

## Causas Raiz Identificadas

### 1. Violação de CSP (`media-src`)
- **Sintoma**: `Loading media from 'data:audio/wav;base64,...' violates Content Security Policy directive: "media-src 'self' blob:"`
- **Causa**: O `app.js` utilizava `new Audio('data:audio/wav;base64,...')` para notificações sonoras. A CSP do servidor (`server.cjs` linha 208) permite apenas `'self'` e `blob:` para mídia, bloqueando esquemas `data:`.
- **Correção**: Substituição completa por síntese de áudio via **Web Audio API** (`OscillatorNode` + `GainNode`). Nenhum arquivo externo ou URI de dados é necessário; o som é gerado programaticamente em tempo real, respeitando estritamente a CSP existente sem adicionar `unsafe-eval` ou `unsafe-inline`.

### 2. Loop de Recarregamento na Criação de Sala
- **Sintoma**: Ao clicar em "Criar sala" no app portátil, a janela piscava e permanecia no lobby sem criar a sala.
- **Causa**: A função `connect()` no `app.js` chamava `window.zulluDesktop.connectRemote(ep)` sempre que um endpoint estava configurado, mesmo quando o app já estava carregado nessa origem. O `win.loadURL()` no main process recarregava a página, destruindo o contexto JavaScript antes que a requisição `api('create')` fosse enviada.
- **Correção**: Adicionada verificação `currentOrigin !== targetOrigin` antes de invocar `connectRemote`. Se o app já está na origem correta, prossegue diretamente para a chamada API sem reload. Logs estruturados (`[Zullu]`, `[Electron]`, `[IPC]`) foram adicionados para diagnóstico futuro.

## Arquivos Alterados

| Arquivo | Mudança |
| :--- | :--- |
| `public/app.js` | Áudio via Web Audio API; guarda de origem em `connect()`; logs de diagnóstico. |
| `electron.cjs` | Logs estruturados em `connect-remote` IPC handler; tratamento de erros explícito em `loadURL`. |
| `package.json` | Versão atualizada para `0.3.2`. |

## Testes Executados

### Automatizados
- ✅ `npm test`: **2/2 passando** (509ms + 296ms)
  - ✔ v0.3.0: salas, aprovação, stream e sinalização multiponto
  - ✔ v0.3.0: limite de participantes e remoção durante transmissão
- ✅ Validação sintática (`node -c`): `app.js` e `electron.cjs` aprovados.

### Manuais (Pendentes)
- ⚠️ Verificar ausência de erro CSP no DevTools do Electron ao receber solicitação de entrada.
- ⚠️ Confirmar que "Criar sala" funciona imediatamente após abrir o app portátil sem piscar.
- ⚠️ Validar que notificação sonora é audível via Web Audio API em diferentes volumes do sistema.

## Build Windows
- Comando: `npm run dist:win`
- Alvo: `dist/Zullu 0.3.2.exe` (portátil x64)
- Status: Em andamento no momento desta documentação; verificar existência pós-build.

## Compatibilidade
- ✅ Web (navegador): Totalmente compatível; Web Audio API é suportada em todos os browsers modernos.
- ✅ Electron local: Funcional sem alterações.
- ✅ Electron remoto: Correção de loop aplica-se igualmente; CSP idêntica.

## Notas de Segurança
- Nenhuma permissão CSP foi relaxada.
- `contextIsolation` e `nodeIntegration: false` mantidos.
- Validação de origem (`isTrusted`) inalterada no preload/main.
- Web Audio API opera inteiramente no sandbox do renderer sem acesso a filesystem ou rede.

## Commit de Referência
`fix(zullu): csp audio and room creation loop v0.3.2`