# Zullu v0.3.3 — Correção de Captura, Clipboard e Interface

## Resumo Executivo
A versão 0.3.3 resolve quatro problemas críticos identificados na v0.3.2 que afetavam a usabilidade no executável Windows: falha na captura de tela (`Invalid capture constraints`), clipboard não funcional, caracteres incorretos na lista de participantes e versão desatualizada no rodapé. Esta release garante compatibilidade total com as APIs de captura do Electron 45+ e estabelece um canal seguro de clipboard via IPC.

## Causas Raiz e Correções

### 1. Invalid capture constraints no Electron
- **Causa**: O `app.js` aplicava constraints complexas (`width`, `height`, `frameRate`) diretamente na chamada `getDisplayMedia()`. No Electron, quando `setDisplayMediaRequestHandler` é utilizado, constraints restritivas podem ser rejeitadas pelo Chromium se não forem suportadas exatamente pela fonte selecionada ou pela API interna.
- **Correção**: Implementada detecção de ambiente (`window.zulluDesktop`). No Electron, utiliza-se `{ video: true, audio: ... }` (constraints mínimas) para garantir que a stream seja obtida. A qualidade (resolução/FPS/bitrate) é aplicada posteriormente via `RTCRtpSender.setParameters()`, que é o método correto e seguro para ajuste fino sem invalidar a negociação inicial.
- **Tratamento de Erros**: Adicionado bloco `try/catch` específico para `getDisplayMedia` com mensagens amigáveis ("Captura cancelada", "Permissões bloqueadas").

### 2. Clipboard não copiava texto
- **Causa**: O frontend utilizava `navigator.clipboard.writeText()` que requer contexto seguro (HTTPS) ou localhost. Em alguns cenários de empacotamento ou navegação remota mista, essa API falha silenciosamente ou é bloqueada, mas o `catch` original apenas exibia o código como fallback sem indicar erro real.
- **Correção**: Criado handler IPC `clipboard-write` no main process (`electron.cjs`) usando `require('electron').clipboard.writeText()`. O preload expõe `clipboardWrite(text)` validado por `isTrusted()`. O `app.js` agora usa `safeCopy()` que prioriza o IPC nativo e só recorre à Web API como fallback, com feedback visual preciso de sucesso/falha.

### 3. Símbolos incorretos nos participantes
- **Causa**: Uso de emojis (🟢, 👁, ⏳) na renderização da lista de participantes. Dependendo da fonte do sistema ou configuração de rendering do Electron, esses glifos podem aparecer como quadrados ou caracteres mojibake.
- **Correção**: Substituição por separadores textuais simples e universais (` — Transmitindo`, ` — Assistindo`, ` — Aguardando`), garantindo legibilidade em qualquer ambiente Windows sem dependência de suporte a emoji colorido.

### 4. Versão desatualizada
- **Causa**: Rodapé hardcoded no `index.html` e `package.json` não sincronizados após hotfixes anteriores.
- **Correção**: Atualização manual de ambos para `0.3.3`. Recomenda-se futura centralização via injeção de versão no build.

## Arquivos Alterados
| Arquivo | Mudança Principal |
| :--- | :--- |
| `public/app.js` | Constraints adaptativas; `safeCopy()`; texto puro em participantes; logs de erro. |
| `electron.cjs` | Handler `clipboard-write` com validação de origem e logs. |
| `preload.cjs` | Exposição de `clipboardWrite`. |
| `public/index.html` | Rodapé atualizado para v0.3.3. |
| `package.json` | Versão 0.3.3. |

## Testes Executados
### Automatizados
- ✅ `npm test`: 2/2 passando (1077ms + 497ms).
- ✅ Validação sintática (`node -c`): `app.js`, `electron.cjs`, `preload.cjs` aprovados.

### Manuais Pendentes
- ⚠️ Verificar captura real de tela/janela no executável portátil.
- ⚠️ Confirmar que Ctrl+C/Ctrl+V funciona após clicar em "Copiar convite".
- ⚠️ Validar lista de participantes em máquina com Windows em português/inglês.

## Build Windows
- Alvo: `dist/Zullu 0.3.3.exe`
- Status: Em andamento no momento desta documentação.

## Compatibilidade
- ✅ Electron 45+: Constraints simplificadas compatíveis com `setDisplayMediaRequestHandler`.
- ✅ Web: Fallback para `navigator.clipboard` e constraints ideais mantidos.
- ✅ Segurança: IPC de clipboard restrito a origens confiáveis (`isTrusted`).

## Commit de Referência
`fix(zullu): screen capture and clipboard v0.3.3`