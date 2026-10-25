# Zillu v0.5.5 — Verificação da persistência de salas

## Diagnóstico
O teste remoto `connect → create → connect → join` retornou 404 imediatamente após criar sala. O cliente LiveKit não é a causa deste erro.

## Mudanças
- `RedisStore.set` verifica explicitamente o resultado `OK` do Redis, rejeitando escritas não confirmadas com HTTP 503.
- `/api/create` faz leitura de volta de `z:room:<código>` e confirma código e proprietário antes de anunciar criação ao cliente.
- `/api/join` tenta reler uma sala ausente três vezes com intervalos curtos, tolerando atrasos transitórios de propagação.

## Limites
Estas mudanças tornam a falha observável e toleram atraso breve, mas **não resolvem** uma divergência persistente entre bancos Redis, credenciais, regiões, deployments ou um defeito de roteamento externo. Verifique Upstash Data Browser para a chave `z:room:<código>`.

## Implantação
Atualizar somente o backend no GitHub e aguardar produção Ready na Vercel. Testar criação e entrada imediatamente com duas sessões independentes.
