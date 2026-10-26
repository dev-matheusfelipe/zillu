# Correções da 0.6.2 — painel, 12 pessoas e áudio isolado

Alterações no projeto em 26/10/2026. Não foi gerado um novo instalador/portátil nesta revisão.

## Interface e capacidade

- A ação de copiar convite usa o ícone Lucide Copy. O código permanece visível e também pode ser clicado para copiar.
- A sala aceita **12 pessoas no total**, incluindo o proprietário, no serviço compartilhado da API/local. A interface mostra /12 e o convite informa até 11 convidados.
- Pedidos de entrada ficam acima do título/lista de participantes, separados por uma borda.
- O controle do painel mostra chevron-right para recolher e chevron-left para reabrir, com tooltip e aria-expanded sincronizados.
- O menu do dono mostra Tornar administrador acima de Remover da sala. O controle deixa de desaparecer quando conectado à API antiga; nesse caso informa que a operação exige atualização da API. A verificação de autorização continua no backend.

**Produção:** a capacidade de 12 e os cargos precisam de deploy autorizado do backend atualizado na Vercel. Nada foi publicado automaticamente.

## Captura de áudio por processo

O loopback geral foi removido do caminho de captura. Não existe fallback silencioso para capturar o áudio inteiro do computador.

O usuário escolhe o aplicativo de áudio (player, navegador ou jogo), independentemente de compartilhar um monitor ou uma janela. O helper C++ usa WASAPI Application Loopback no modo IncludeTargetProcessTree para capturar somente esse processo e seus filhos. Discord, TeamSpeak e seus nomes usuais de executáveis não aparecem na lista e são recusados pelo helper. Os demais processos ficam fora do áudio capturado por construção.

Limite: áudio de chamadas em outra aba do **mesmo navegador** ou produzido dentro do mesmo processo escolhido também pertence a ele. Para separar uma chamada de navegador do filme, usar players/aplicativos ou processos distintos. Não se utiliza cancelamento de eco como suposto filtro de Discord.

Windows build 20348 ou posterior é exigido. Em sistema sem suporte ou se a ativação falhar, permanece o compartilhamento sem áudio. Microfone não é solicitado.

O helper envia PCM float32, estéreo, 48 kHz por stdout ao processo principal. O preload expõe somente métodos de aplicação e callbacks de áudio, sem shell, caminhos ou processos arbitrários. PIDs precisam estar na lista autorizada, são revalidados ao iniciar e passam por bloqueio de aplicativos de chamada. O renderer recebe o PCM por IPC e um AudioWorklet produz uma MediaStreamTrack; ela é publicada pelo LiveKit como ScreenShareAudio, sem reprodução local adicional.

Ativar/desativar áudio preserva a trilha principal de vídeo. Sair/fechar/recarregar encerra a captura auxiliar. A captura termina quando o processo escolhido encerra. A publicação de áudio mantém o bloqueio contra chamadas duplicadas da revisão anterior.

## Arquivos principais

- `native/app-audio.cpp`: enumeração de janelas/processos, filtro de chamadas, ativação WASAPI e transporte PCM. Código do projeto; usa APIs do Windows, sem NAudio ou addon de terceiros.
- `scripts/build-native-audio.cjs`: compilação com MinGW-w64 g++, estática. Usa hash para evitar recompilar quando o fonte não mudou.
- `native/bin/zillu-audio.exe`: helper gerado para desenvolvimento (ignorado pelo Git). Não é o pacote desktop final.
- `app-audio.cjs`: gerenciamento do processo auxiliar, PID autorizado, timeout de ativação e envio de dados.
- `electron.cjs`/`preload.cjs`: IPC validado pela origem/frame. O getDisplayMedia nativo passa somente vídeo; requisições de áudio geral são recusadas.
- `public/app-audio-worklet.js`: buffer limitado de PCM estéreo, com silêncio em caso de falta de dados, ligado apenas ao destino MediaStream.
- `public/app.js`/HTML/CSS/sprite: seletor de aplicativo com estilo próprio, novos controles e painel.
- `backend/lib/room-service.cjs`: limite de 12; leitura paralela dos participantes para reduzir a latência de snapshots maiores; testes HTTP e de concorrência atualizados.
- `package.json`: start/dist executam build:native; o futuro pacote copia o helper para extraResources. A versão permanece 0.6.2, conforme a revisão atual.

## Desenvolvimento e build

No Windows de desenvolvimento, ter MinGW-w64 **g++** no PATH. Executar `npm start`: ele compila o helper somente quando necessário, gera o bundle web e inicia Electron. Reiniciar o Electron é necessário porque main/preload mudaram; apenas atualizar a página não carrega o novo IPC.

Para uma futura distribuição autorizada: `npm run dist:win`. O helper entra como recurso ao lado do aplicativo, e o usuário final não precisa instalar compilador ou .NET. O binário auxiliar ainda não tem assinatura digital. Não foi adicionado runtime nativo de terceiros ao produto.

## Validação realizada

- `npm test`: 11 passaram, incluindo entrada/limite via HTTP atualizado para 12.
- `npm --prefix backend test`: 28 passaram e um teste de Redis real foi explicitamente ignorado por ausência da instância/variável nesta rodada. Inclui 11 entradas simultâneas aceitas e a 13ª pessoa recusada. O Redis/Lua em si não foi alterado por esta correção.
- `scripts/validate-corrections.cjs`: Electron real confirmou ícone de copiar, pedidos acima dos participantes, setas, ação de admin antes da remoção, seletor sem apps de chamada e captura nativa gerando uma track de áudio; desligar áudio preservou o vídeo. Zero erros JavaScript.
- `scripts/validate-application-audio.cjs`: duas fontes sintéticas simultâneas em processos separados (440 Hz e 880 Hz). Capturando o player, a potência relativa do sinal do outro processo ficou próxima de 0,00000012; o helper recusou capturar o processo de teste chamado Discord.exe. Resultado em `zillu-application-audio-isolation.json`.
- Transporte PCM pelo IPC/preload/AudioWorklet validado com sinal controlado: a trilha alimentou o medidor de áudio e ativou a borda verde, sem erros JavaScript.
- O teste de isolamento gera tons baixos e breves, compila um player de teste em TEMP e encerra seus próprios processos ao terminar. Não executa ações sobre o Discord real do usuário.
- `native/test-tone.cpp` é somente para validação e não entra no produto distribuído.

Não houve teste de chamada real entre computadores com Discord/TeamSpeak em uso, nem nova publicação na infraestrutura de produção. O teste comprova isolamento entre processos sintéticos, não separação de abas ou streams dentro de um processo.

Referências técnicas: [Microsoft Application Loopback](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/) e [AUDIOCLIENT_ACTIVATION_PARAMS](https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_activation_params).
