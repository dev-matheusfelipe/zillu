# Zillu v0.5.2 — Prévia local de compartilhamento

- `renderStreams()` agora inclui a captura local (`myStream`) junto às tracks remotas. Antes só renderizava `remoteStreams`; por isso a grade permanecia vazia mesmo com `publishTrack()` concluído.
- Prévia local fica silenciada para impedir retorno de áudio, identificada como “Você · Prévia local”.
- Modos Grade e Foco exibem a captura local. Alternar telas preserva a seleção quando possível; encerrar/limpar remove a prévia.
- Mensagem e estados de pausa atualizados no layout.
- Ajuste de legibilidade do título da sala (font-size, line-height, letter-spacing).
- Rodapé e package.json atualizados para v0.5.2.

## Validação

- Sintaxe JavaScript e testes Node do projeto.
- Teste de mídia real exige execução do Electron no Windows e dois participantes para comprovar recepção.

## Uso

`npm install`; `npm test`; `npm start`.
