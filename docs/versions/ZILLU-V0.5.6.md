# Zillu v0.5.6 — Diagnóstico do Redis de salas

- Prioriza exclusivamente `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` para impedir seleção silenciosa de outro banco via variáveis legadas `KV_REST_API_*`.
- Nova rota autenticada `POST /api/diagnose-room` com corpo `{"code":"XXXXXX"}`: retorna `exists`, `ttl` e `store` (identificador curto baseado no hostname do Redis, sem URL ou credenciais).
- Não altera protocolo de salas, SDK LiveKit ou desktop.
- O 404 ainda precisa ser investigado em produção: a mudança não comprova que variáveis legadas eram a causa.
- O resultado `ttl=-2` sinaliza que não há a chave no Redis consultado; `ttl>0` indica o tempo de vida restante em segundos.
- Testes unitários em Node: 7/7 aprovados no ambiente de preparação; teste real na Vercel pendente.
