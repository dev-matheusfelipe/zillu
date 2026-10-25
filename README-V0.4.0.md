# Zullu v0.4.0 — Correção de captura + integração LiveKit SFU

## O que foi alterado
- Corrigido o callback do Electron 45 para usar `{video: DesktopCapturerSource}` (sem `source.mediaStream`). O handler aceita apenas requisições da janela principal na origem configurada e uma fonte previamente escolhida.
- Correção da API de permissão `display-capture`, check/request handler e validação de origem. Erros reais de captura agora aparecem na UI.
- Tokens de acesso LiveKit gerados e assinados **no servidor** e emitidos apenas após autorização na sala. Segredo LiveKit não vai ao navegador.
- Cliente LiveKit opcional: publicação da tela, inscrição nos vídeos dos participantes e limpeza de conexões ao sair.
- Layout atualizado para melhorar hierarquia, foco, grid e adaptação de telas.
- Modo P2P original preservado quando LiveKit não está configurado.

## Instalação e testes locais (Windows)
1. Extraia este ZIP em uma pasta limpa, por exemplo `D:\zullu-v0.4.0`.
2. Instale Node.js LTS e execute `npm install`. Isto atualiza `package-lock.json` após a adição das dependências LiveKit e esbuild.
3. Execute `npm run build:web` para criar `public/livekit.bundle.js` localmente (não depende de CDN).
4. Execute `npm test` e depois `npm start`.
5. Execute o teste interativo de captura, selecionando uma tela no app.
6. Para criar o executável: `npm run dist:win`. Confirme fisicamente o arquivo em `dist`.

## SFU local de desenvolvimento
1. Instale Docker Desktop.
2. Execute `docker compose -f sfu/docker-compose.dev.yml up -d`.
3. Abra um terminal PowerShell **separado** e configure para a sessão atual:

```powershell
$env:LIVEKIT_URL='ws://127.0.0.1:7880'
$env:LIVEKIT_API_KEY='devkey'
$env:LIVEKIT_API_SECRET='secret'
npm run server
```

4. Execute o cliente Electron em outra sessão. A sala passa a utilizar SFU se `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` estiverem definidos no **servidor que executa `server.cjs`**. Se não houver as 3 variáveis, opera em P2P.

**IMPORTANTE**: Docker dev não é implantação pública! Use credenciais seguras, TLS `wss://`, portas TCP/UDP abertas e configuração LiveKit de produção para acesso entre casas diferentes. Um endereço de sinalização HTTP/HTTPS e um endpoint LiveKit WS/WSS são serviços diferentes.

## Pendências e limitações
- Os testes automatizados verificaram backend, permissões e formato de tokens, mas NÃO a captura real no Windows ou a reprodução real em LiveKit.
- O modo SFU precisa de um servidor LiveKit acessível e do bundle client gerado com npm.
- A remoção manual e o encerramento voluntário da sala pelo dono chamam o RoomService LiveKit. O timeout de sessão no backend e a desconexão abrupta do proprietário ainda precisam de tratamento administrativo assíncrono e validação real. **Não exponha o modo SFU publicamente sem concluir esta revisão de segurança**.
- O P2P multiponto herdado tem limitações de renegociação de tracks, não resolvidas nesta atualização.
- O frontend remoto ainda é carregado por `win.loadURL()`: recomenda-se transferir toda UI desktop para arquivos locais assinados antes de uso em produção.
- Áudio do sistema não está ativo nesta versão.
- Este ambiente não gera ou testa executável Windows; execute o build Windows e a validação manual no PC.
- A dependência `package-lock.json` incluída é da versão anterior; regenerar com `npm install` antes de usar `npm ci`.
