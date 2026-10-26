# Zillu v0.5.4 — persistência de sala (backend)

Correção no backend Vercel (`backend/api/index.js`): ao receber o long polling `/api/events`, renova a TTL de 3600 segundos da sessão e do índice do participante. **Somente o proprietário** renova a TTL da sala e da reserva de código enquanto estiver ativo. A renovação usa `EXPIRE`, nunca recria sala excluída. Retorna HTTP 410 quando a sessão ainda aponta para sala já expirada.

Deploy: copiar `backend/api/index.js` para o repositório GitHub e realizar commit/push na branch que alimenta a Vercel. Verificar deploy Production Ready. O pacote Electron não precisa ser recompilado para este patch de TTL. O código de sala que já expirou não é recuperável, crie uma sala nova.

Limitações: o backend ainda tem concorrência nas operações de sala e precisa de testes reais entre dois clientes; se um dos amigos usa um EXE antigo em modo servidor local, este patch não resolve a incompatibilidade de endereços.
