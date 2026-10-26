# Zillu v0.5.0 — integração desktop com API permanente (código-fonte)

- Gateway HTTP local de confiança, sem servidor de salas próprio: encaminha somente rotas `/api/<rota>` via HTTPS para `https://zillu-backend.vercel.app`.
- Frontend e preload continuam locais; nenhuma credencial LiveKit ou Redis vai para o cliente.
- O Electron não pede mais endereço de servidor aos usuários.
- A aplicação usa o token emitido pelo backend somente após entrar em uma sala aprovada.
- Link de convite anterior usava `localhost`; agora copia somente o código.
- `npm start` compila o bundle LiveKit previamente. `npm run dist:win` continua compilando antes de empacotar.

## Validação necessária antes da distribuição
- Executar `npm ci`, `npm test`, `npm run build:web`, `npm start` no Windows.
- Usar dois PCs/duas sessões, validar criação/entrada/aprovação/negação/expulsão, compartilhamento, troca de tela, encerramento e recuperação após interrupção da internet.
- Validar ingressos simultâneos, expiração de sessão, despublicação, e revogação real do acesso LiveKit ao remover usuários.
- Revisar backend para sincronização concorrente Redis, limites de requisições, revogação de tokens de mídia e persistência após falha.

O retorno `mediaMode: sfu` confirma configuração, não comprova transmissão real. Esta versão não foi validada em Windows neste ambiente.

## Dependências
O `package-lock.json` do ZIP enviado declarava v0.3.1 e não continha as dependências LiveKit/esbuild da versão atual; foi retirado deste pacote para evitar que `npm ci` reutilize um lock incompatível. No primeiro uso no Windows, execute `npm install` para recriar o lock consistente. **Depois versionar o novo lock no Git.**

## Testes neste ambiente
`node --check` de Electron, gateway e frontend: aprovados. `node --test test/cloud-gateway.test.cjs backend/test/api.test.cjs`: 4 testes aprovados. O `npm install` não foi possível neste ambiente devido ao bloqueio de DNS do registry npm. Build Electron/LiveKit e teste real com dois computadores ainda pendentes.
