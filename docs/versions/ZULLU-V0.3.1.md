# Zullu v0.3.1 — Conexão Desktop-to-Desktop

## Resumo Executivo
A versão 0.3.1 do Zullu foca na experiência **Electron para Electron**, permitindo que dois ou mais usuários com o aplicativo instalado em diferentes computadores Windows se conectem diretamente através de um servidor de sinalização compartilhado. Esta versão elimina a necessidade de abrir navegadores externos para entrar em salas, introduz persistência de configurações e suporta navegação híbrida (local/remota) dentro do próprio app desktop.

## Arquitetura

### Modo Híbrido (Cliente-Servidor)
O `electron.cjs` agora opera em dois modos transparentes:
1. **Modo Local**: Inicia um servidor de sinalização embutido em `127.0.0.1` para uso standalone ou testes.
2. **Modo Remoto**: Quando um servidor externo é configurado, o Electron navega internamente (`win.loadURL`) para a origem remota, mantendo todas as APIs nativas (captura de tela, notificações, persistência) funcionais via IPC seguro.

### Persistência de Configurações
- Utiliza `electron-store` para salvar preferências entre sessões.
- Dados persistidos: URL do último servidor, nome do usuário, perfil de qualidade e FPS.
- Sincronização bidirecional: alterações na UI atualizam o store; reinicialização restaura a UI.

### Segurança e Isolamento
- `contextIsolation: true` e `nodeIntegration: false` mantidos.
- Preload expõe apenas métodos específicos (`connectRemote`, `setConfig`, etc.).
- Validação de origem (`isTrusted`) em todos os handlers IPC para impedir injeção de comandos via páginas remotas comprometidas.
- Navegação restrita (`will-navigate`) apenas às origens autorizadas (local ou remota configurada).

## Funcionalidades Implementadas
1. **Conexão Desktop-to-Desktop**: Apps em máquinas diferentes conectam-se ao mesmo servidor e compartilham telas P2P.
2. **Persistência Automática**: Servidor e nome lembrados automaticamente; sem reconfiguração a cada uso.
3. **Navegação Interna**: Entrada em salas remotas ocorre dentro da janela do Zullu, sem abrir Chrome/Edge.
4. **Captura Nativa Remota**: `desktopCapturer` funciona mesmo quando o frontend é servido por um servidor remoto.
5. **Compatibilidade Web Total**: Usuários via navegador continuam funcionando normalmente (fallback para localStorage).
6. **Reconexão Transparente**: Se o app recarregar após conectar a um remoto, as preferências são restauradas.
7. **Build Portátil Windows**: Executável único `.exe` que não requer instalação nem Node.js no destino.

## Arquivos Alterados
| Arquivo | Mudança Principal |
| :--- | :--- |
| `package.json` | Versão 0.3.1; dependência `electron-store@8` adicionada. |
| `electron.cjs` | Reescrito com suporte a modo remoto, store e validação de origem dinâmica. |
| `preload.cjs` | Novas APIs: `getConfig`, `setConfig`, `connectRemote`, `disconnectRemote`. |
| `public/app.js` | Função `connect()` integrada com IPC; inicialização assíncrona carrega prefs. |
| `public/index.html` | Rodapé atualizado para v0.3.1. |

## Testes Executados
### Automatizados
- ✅ `npm test`: 2/2 passando (sinalização multiponto, aprovação, remoção, limites).
- ✅ Validação sintática (`node -c`) em todos os arquivos JS/CJS modificados.

### Manuais (Pendentes de Ambiente)
- ⚠️ **Dois PCs Reais**: A validação completa de fluxo P2P entre duas máquinas Windows distintas requer teste manual fora deste sandbox.
- ⚠️ **Persistência Cross-Restart**: Verificar se o `electron-store` mantém dados após fechar e reabrir o app portátil.
- ⚠️ **Servidor Remoto Real**: Testar conexão contra um servidor Zullu hospedado em VPS ou outra máquina da rede.

## Limitações Conhecidas
- **Build Timeout**: O empacotamento NSIS pode levar vários minutos; em ambientes automatizados, o processo pode ser reportado como "em andamento" mesmo após gerar o executável.
- **Ícone Padrão**: O build usa ícone genérico do Electron pois nenhum ícone customizado foi configurado no `package.json`.
- **Code Signing**: O executável não é assinado digitalmente; o Windows SmartScreen pode exibir aviso ao executar.
- **Áudio do Sistema**: Continua experimental e dependente de flags do Chromium/Electron.
- **TURN**: Suporte preparado mas não testado em ambiente NAT restrito nesta release.

## Procedimento de Instalação
1. Copie o arquivo `Zullu 0.3.1.exe` (ou a pasta `win-unpacked`) para o computador de destino.
2. Execute o arquivo. Nenhuma instalação ou privilégio administrativo é necessário para o modo portátil.
3. O app iniciará no lobby local por padrão.

## Como Conectar Dois Computadores

### Passo 1: Preparar o Servidor
Em uma das máquinas (ou em um VPS acessível):
```powershell
# Opção A: Usar o executável como servidor (se distribuído com CLI)
# Opção B: Clonar repo e rodar
git clone <repo> && cd zullu
npm install
npm run server
# Anote o IP/endereço público e porta (padrão 3210)
```

### Passo 2: Configurar Cliente A
1. Abra o Zullu no PC A.
2. Expanda "Configurações avançadas".
3. Digite o endereço do servidor (ex: `http://192.168.1.10:3210`).
4. Insira seu nome e clique em **Criar sala**.
5. Copie o código de 6 letras gerado.

### Passo 3: Configurar Cliente B
1. Abra o Zullu no PC B.
2. Configure o **mesmo** endereço de servidor.
3. Insira seu nome, selecione a aba **Entrar**.
4. Digite o código recebido e clique em **Entrar na sala**.

### Passo 4: Colaborar
- O PC A receberá notificação e poderá aprovar a entrada do B.
- Ambos podem clicar em "Compartilhar minha tela" simultaneamente.
- As configurações de servidor serão salvas automaticamente para a próxima vez.

## Diagnóstico de Conexão
| Sintoma | Causa Provável | Solução |
| :--- | :--- | :--- |
| "Falha ao conectar" | URL inválida ou firewall bloqueando | Verificar endereço, porta e regras de firewall/rede |
| Sala não encontrada | Servidores diferentes ou código errado | Confirmar que ambos usam exatamente a mesma URL base |
| Tela preta no peer | Codec incompatível ou NAT simétrico | Tentar trocar qualidade; considerar TURN se P2P falhar consistentemente |
| Config não salva | Permissão de escrita no diretório do app | Executar de pasta com permissão de escrita (não Program Files sem admin) |

## Instruções de Distribuição
1. Gere o build: `npm run dist:win`
2. O arquivo `dist/Zullu 0.3.1.exe` é autocontido (~180MB).
3. Distribua via USB, rede local ou link direto.
4. Instrua os usuários a configurarem o mesmo servidor de sinalização.
5. Para atualizações futuras, basta substituir o executável; as configurações são mantidas no `%APPDATA%/zullu-config.json`.

## Commit de Referência
`feat(zullu): desktop-to-desktop connections v0.3.1`