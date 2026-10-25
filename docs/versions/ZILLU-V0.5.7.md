# Zillu v0.5.7 — correção de leitura do corpo HTTP

## Sintoma confirmado
`/api/create` retorna código da sala, mas `/api/diagnose-room` responde `Código inválido` e `/api/join` responde `Sala não encontrada ou encerrada`, inclusive com o código recém-criado `ACVA6W`.

## Causa corrigida
O handler transformava todo `req.body` que não fosse um objeto JavaScript já parseado em `{}`. Isso descartava o corpo JSON caso a plataforma o fornecesse como string/Buffer ou deixasse o stream disponível. A rota create não usa o campo `code`, portanto não revelava a falha; join e diagnose-room usam.

## Alterações
- `backend/lib/body.cjs`: leitura de body objeto, string, Buffer ou stream com limite de tamanho e erros explícitos.
- `backend/api/index.js`: normalização de body antes do processamento.
- `backend/test/body.test.cjs`: casos para objetos, JSON como string, stream, body perdido, JSON inválido e arrays.

## Publicação
Este patch altera SOMENTE a API da Vercel. Substitua os arquivos, faça commit/push e confirme novo deploy de Production antes de testar. Não altere o Electron e não distribua um novo .exe.

## Limitações
Os testes automatizados simulam formas de body. O comportamento real de Vercel + Redis precisa ser novamente validado criando uma sala e entrando na mesma sessão de teste.
