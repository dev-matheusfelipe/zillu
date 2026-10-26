# Zillu v0.5.1 — Correção do frontend e diagnóstico SFU

## Correções
- Removidas as referências remanescentes ao elemento `endpoint` que deixou de existir no HTML, inclusive a atribuição que provocava `Cannot set properties of null (setting 'value')`.
- Removida a função obsoleta de validação de endpoint e leitura antiga de preferência.
- Incluído diagnóstico do sucesso da publicação da tela (`publishTrack`) e da inscrição em uma trilha remota (`TrackSubscribed`).
- Se a publicação SFU falhar, a captura local é interrompida para não exibir um falso estado de transmissão.
- Adicionados testes de regressão para remoção do campo e diagnóstico de publicação.

## Validação
- `node --check public/app.js` passou.
- `npm test`: 8/8 testes passaram.

## Limitações
- Não foi possível executar uma sessão real do Electron/LiveKit ou testar em dois PCs neste ambiente.
- A conexão inicial com LiveKit foi comprovada pelos logs fornecidos pelo usuário, mas a recepção real de vídeo exige teste entre participantes.
- Nenhuma alteração foi enviada ao GitHub ou à Vercel.
