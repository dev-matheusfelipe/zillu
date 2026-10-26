# Zillu API v0.6.3

Backend Node para Vercel, com Upstash Redis e autorização LiveKit. O gateway Electron usa `https://zillu-backend.vercel.app`; nenhuma credencial de infraestrutura vai ao renderer ou ao executável.

## Preparação para deploy

A API 0.6.3 foi publicada com autorização em 26/10/2026; ver [relatório de publicação](../docs/versions/ZILLU-V0.6.3-PUBLICACAO.md). Configurar o projeto Vercel com **Root Directory `backend`** e Node >=20. As variáveis continuam sendo `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. `ZULLU_ALLOWED_ORIGIN` é opcional e mantém o nome histórico; não inserir segredos no frontend.

Publicar todos os arquivos deste diretório, incluindo `lib/room-service.cjs`, `lib/transaction.cjs`, `lib/livekit.cjs` e a versão atual de `lib/redis.cjs`. Manter o rewrite de `vercel.json`. O Redis precisa aceitar `EVAL`, `SET ... KEEPTTL` e comandos de listas. As mutações são atômicas via Lua/CAS sobre todos os registros observados, incluindo notificações e fila de revogação.

Após deploy autorizado, `POST /api/health` deve informar `apiVersion: "0.6.3"`. Validar em preview antes da produção: criar, solicitar entrada, aprovar, promover, aprovar por admin, tentar ações proibidas, transferir, sair e encerrar explicitamente. Admin usa `approve`/`remove`; owner acrescenta `promote`, `demote`, `transfer` e `end-room`, sempre com Bearer token. Não enviar papel como forma de autorização.

A mudança da semântica de `leave` exige o backend novo. O cliente 0.6.3 só libera cargos e encerramento explícito quando a API informa suporte e bloqueia a ação comum de saída do dono em API antiga. Distribuir o novo desktop após validar o backend. Durante a transição, encerrar sessões antigas ou aguardar o término das requisições antigas para não misturar handlers legados sem CAS com a nova versão. Estruturas antigas recebem `admins`, `denied` e `revision` de forma compatível na primeira operação.

## Ciclo de vida

Owner sai sem encerrar: primeiro admin aprovado assume; sem admin, primeiro membro aprovado na ordem de entrada. O dono anterior vira member após uma transferência explícita. O último aprovado saindo encerra a sala e dispensa pedidos pendentes. Aprovação ou promoção exige pertinência à sala e todas as permissões são recalculadas no backend.

Sessões/associações têm TTL de uma hora; atividades de usuários aprovados renovam o TTL da sala. Clientes pendentes não renovam a sala. Após 90 segundos sem heartbeat, outro usuário aprovado pode detectar e remover a sessão inativa e eleger sucessor. Reservas de código encerrado duram uma hora, evitando reutilização enquanto restam comandos de mídia.

## Remoção no LiveKit

Tokens de entrada expiram em 120 segundos. A remoção persiste a proibição daquele ID na sala e enfileira `RemoveParticipant` com cutoff de revogação, sem permitir nova emissão para uma sessão removida. Sair e solicitar entrada de novo pela interface cria uma sessão/ID novos e exige aprovação novamente. Encerrar revoga identidades antes de `DeleteRoom`. Falhas ficam em fila no Redis para repetição por novas operações/events, sem reverter a remoção na API.

Use **LiveKit Cloud com revogação de tokens** quando for necessário impedir reentrada com token emitido anteriormente. Segundo a documentação oficial, remoção no self-hosted não invalida tokens já emitidos; o TTL curto reduz essa janela, mas não substitui revogação. A API não garante revogação imediata em caso de indisponibilidade do RoomService nem em servidor próprio. A fila depende de novas requisições para repetir falhas; sem atividade, um agendador operacional seria necessário para repetição independente. Não configurar um cron apontando à API pública sem autenticação própria.

Referências: [tokens e revogação LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/), [documentação de versão](../docs/versions/ZILLU-V0.6.3.md).

## Testes

`npm test` neste diretório executa as unidades e os testes de concorrência do serviço. A integração Redis real é opcional no comando comum: para executá-la, iniciar uma instância **descartável de testes** e definir `ZILLU_TEST_REDIS_PORT` com sua porta TCP em localhost. O teste cria um adaptador REST local e usa o RedisStore real, incluindo EVAL; não usa credenciais do Redis de produção.

Exemplo PowerShell: `$env:ZILLU_TEST_REDIS_PORT="16387"`, depois `npm test`. Não apontar os testes para o Redis de produção. Os registros de teste possuem TTL e a instância descartável deve ser encerrada ao terminar.
