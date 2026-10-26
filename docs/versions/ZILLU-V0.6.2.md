# Zillu v0.6.2 — participantes, áudio e administração

Atualização posterior: [correções e captura nativa por aplicativo](ZILLU-V0.6.2-CORRECOES.md). Esse complemento substitui a limitação de áudio geral descrita no relatório original abaixo. O executável anterior não foi regenerado nesta revisão.

Implementação no projeto `D:\zillu`, conferida em 26/10/2026. API de produção preservada em `https://zillu-backend.vercel.app`. Não foi feito push nem deploy.

## Conferência do pedido

| Item | Implementação e evidência | Limite ou dependência |
| --- | --- | --- |
| Status por ícones | Lucide monitor-up verde, eye neutro, crown e shield-check, tooltips em português e nomes acessíveis. Nomes longos quebram linha sem serem cortados. | Validado em duas instâncias locais do Electron. |
| Menu de participantes | Menu de três pontos mostra somente ações permitidas; confirmação para remover, rebaixar, recusar entrada e transferir. | API também rejeita operações proibidas; não depende da proteção visual. |
| Minimização individual | Minimização local, faixa de restauração, grade reorganizada e foco original preservado. Nenhuma publicação é encerrada. | Testado com três fontes de vídeo de teste, inclusive todas minimizadas; trilhas permaneceram vivas. |
| Barra central | Sprite com 28 símbolos Lucide oficiais, dimensões de 20 px nos controles, estados ativos e tooltips sincronizados. Licença incluída. | Verificada em 1280×720, 1366×768, 1920×1080 e 860×680. |
| Áudio | Vídeo e áudio têm ciclo de captura/publicação separado. Sem áudio por padrão; áudio geral exige opção explícita e mostra aviso sobre Discord/outros apps. Ativar/desativar áudio mantém a trilha de vídeo. | Áudio isolado de aplicativo externo não é suportado pela API atual do Electron. Não há promessa de excluir Discord no modo geral. |
| Admins e Redis | Papéis owner/admin/member, promoção/rebaixamento, transferência, aprovação e remoção autorizados no backend. Admin não gerencia owner ou outro admin. | Exige deploy da API 0.6.2 para funcionar na produção. |
| Continuidade da sala | Sair e encerrar são ações distintas. Sair do owner elege sucessor; encerrar dispensa todos. | Testado localmente; depende da API nova em produção. |
| Concorrência | CAS em Lua compara todos os registros lidos e grava sala/sessões/eventos/fila de mídia atomicamente. | Testado com Redis real local através de adaptador REST compatível com RedisStore; não utilizou Redis de produção. |
| Revogação de mídia | Sem tokens para pendentes/removidos; token de entrada com TTL 120 s; RemoveParticipant e DeleteRoom com grants próprios e fila de repetição. | Revogação de token antigo requer LiveKit Cloud; self-hosted e falha de RoomService têm limites descritos abaixo. |
| Entrega | Versões desktop/API 0.6.2, documentação e pacote Windows preparados; commit local com a mensagem solicitada. | Não houve publicação nem deploy automático. |

## Decisões arquiteturais e arquivos

- `backend/lib/room-service.cjs`: regras de domínio e autorização compartilhadas pelo backend Vercel e pelo servidor local; nunca utiliza um papel enviado pelo frontend. IDs dos admins ficam no registro da sala no Redis.
- `backend/lib/transaction.cjs` e `backend/lib/redis.cjs`: transação Redis EVAL/CAS com repetição limitada de conflitos. Atualiza notificações e trabalhos de mídia junto ao estado. Não usa um lock em memória para coordenar instâncias Vercel.
- `backend/lib/memory.cjs`: adaptador com o mesmo contrato para desenvolvimento/testes locais. A produção usa Redis.
- `backend/api/index.js`: mantém endpoints existentes e acrescenta `promote`, `demote`, `transfer`, `end-room` e a indicação `apiVersion: 0.6.2`. Polling continua compatível com Functions.
- `backend/lib/livekit.cjs`: chamadas backend ao RoomService, revogação antes da exclusão da sala, repetição de falhas por uma fila persistida. RemoveParticipant usa roomAdmin e sala; DeleteRoom usa roomCreate, conforme o contrato oficial.
- `backend/sfu/token.cjs` e `sfu/token.cjs`: tokens limitados e grants administrativos somente no backend, sem concessão de roomAdmin/roomCreate a participantes comuns ou administradores da interface.
- `server.cjs`: servidor local usa o mesmo serviço de salas para evitar divergência de permissões/ciclo de vida; continua servindo os arquivos estáticos por lista explícita.
- `public/app.js`, `public/index.html`, `public/style.css`: ícones e menus de participantes, confirmações, minimizar/restaurar, atualização de cargos por eventos, separação de áudio/vídeo e prevenção de publicação duplicada de áudio por chamadas simultâneas. Mantidos Poppins, cores sólidas e símbolos oficiais.
- `public/icons.svg`, `public/LUCIDE-LICENSE.txt`: símbolos Lucide oficiais auto-hospedados; não utiliza emojis no lugar dos ícones da barra.
- `cloud-server.cjs`: permite servir o sprite SVG, mantendo o destino fixo da API e a validação dos caminhos.
- `electron.cjs`: captura nativa e validação de origem mantidas. Microfone não é solicitado nem autorizado automaticamente.
- `package.json`, `package-lock.json`, `backend/package.json`, rodapé e refinamentos: versão 0.6.2. O build inclui os módulos necessários ao servidor local, sem incluir arquivos de ambiente.
- `backend/test/administration.test.cjs`, `backend/test/redis-integration.test.cjs` e seu adaptador de teste: cobrem autorização, concorrência, TTL, persistência e contratos de revogação.
- `test/server.test.cjs`: o caso que antes encerrava por leave agora usa end-room; os novos testes verificam a preservação por leave.
- `scripts/validate-desktop-v062.cjs`, `scripts/validate-native-audio-v062.cjs`, `scripts/validate-desktop-audio.cjs`, `scripts/validate-packaged-v062.cjs`: validações reproduzíveis de UI, captura, áudio e pacote. Playwright fica externo às dependências de produção, via `ZILLU_PLAYWRIGHT_PATH`.

O projeto já continha mudanças locais da 0.6.1 e áudio ainda sem commit. Foram preservadas e integradas à entrega. Arquivos antigos não relacionados e `Zillu.zip` não foram substituídos. Documentos históricos mantêm as versões a que se referem.

## Política de saída, expiração e concorrência

- Ao sair, o owner deixa de participar e de transmitir; primeiro admin aprovado assume. Sem admin, assume o primeiro membro aprovado na ordem de entrada. A confirmação de saída informa essa política; a transferência explícita também está no menu.
- Transferir propriedade torna o owner anterior um member. O destinatário precisa estar aprovado na mesma sala. Apenas o owner atual pode encerrar para todos.
- Se o último aprovado sair, a sala é excluída e pedidos pendentes recebem encerramento. Não são mantidas salas órfãs permanentes.
- Sessões e associações expiram em uma hora. Somente atividade aprovada renova o TTL da sala. Pedidos/heartbeats de pendentes não a mantêm viva. Sessões inativas há mais de 90 segundos podem ser removidas pela atividade de outro aprovado, com sucessão quando necessário.
- Códigos encerrados ficam reservados por uma hora para impedir reutilização enquanto houver ações de mídia pendentes.
- Uma aprovação que começou com cargo de admin e concorre com rebaixamento precisa revalidar o snapshot; o teste confirmou que não consegue concluir usando a permissão antiga.
- O modelo antigo recebe admins/denied/revision por normalização compatível, sem renomear identificadores persistidos.

## Áudio e Discord

A captura anterior pegava a saída geral do Windows. `restrictOwnAudio` não isola Discord: apenas solicita exclusão do próprio processo de captura. A opção agora inicia desligada, com aviso explícito no modo geral. Não se utilizam echoCancellation, noiseSuppression ou autoGainControl como suposto isolamento de aplicativos.

A API pública do Electron utilizada aqui concede loopback de sistema ou áudio de WebFrameMain; ela não oferece uma fonte de áudio de processo para a janela externa selecionada. A investigação de WASAPI Application Loopback mostrou suporte a uma árvore de processos nas versões documentadas do Windows, com requisito de build 20348 ou posterior. Um helper nativo precisaria identificar o processo/árvore corretamente, transportar PCM para uma trilha WebRTC e acompanhar o encerramento de processos/janelas. Essa ponte não está presente e não foi simulada. Nenhuma dependência nativa nova foi adicionada ao produto.

O vídeo principal é capturado sem áudio. Ativar áudio faz uma captura secundária autorizada, descarta a trilha de vídeo temporária exigida pelo getDisplayMedia do Electron e utiliza somente a trilha de áudio geral. Desativar áudio libera essa trilha e sua publicação, mantendo o vídeo original. A publicação de áudio em andamento é compartilhada entre chamadas concorrentes para evitar duplicação. Minimizar mantém áudio e assinatura de mídia; foi escolhida essa política para evitar interrupções e facilitar restauração.

Referências primárias consultadas:

- [API de sessão do Electron](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).
- [Exemplo Microsoft de Application Loopback](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/).
- [RoomService do LiveKit](https://docs.livekit.io/reference/other/roomservice-api/).
- [Tokens e revogação do LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/).

## Segurança de remoção de mídia

A remoção atualiza Redis e bloqueia nova emissão para aquele ID. O cliente não pode mudar de papel enviando dados à API. Para pedir entrada novamente pela interface é criada uma nova sessão, que precisa de aprovação.

A API enfileira RemoveParticipant com cutoff explícito de revogação e TTL curto para tokens de entrada. No encerramento, revoga participantes antes de DeleteRoom. Falhas ficam no Redis e são repetidas por atividade/events; não desfazem a remoção na API. A fila expira após uma hora sem novos trabalhos. Sem requisições posteriores, não há worker independente para repetir falhas; implantação de um agendador exigiria autenticação e configuração operacional próprias.

LiveKit Cloud oferece revogação; no self-hosted, remover participantes não invalida automaticamente tokens antigos. O TTL curto limita novas conexões, mas não substitui revogação, especialmente considerando tokens renovados pelo próprio SFU. Portanto não foi declarada garantia de bloqueio imediato de tokens antigos em self-hosted ou com o RoomService indisponível. Essa parte exige validação da infraestrutura alvo; não foi testada contra o LiveKit de produção nesta revisão.

## Testes efetivamente executados

- `npm test`: **11 passaram**, zero falhas.
- `$env:ZILLU_TEST_REDIS_PORT="16387"; npm --prefix backend test`: **28 passaram**, zero falhas e zero testes ignorados, usando Redis 7.0.15 descartável local. Sem a variável, o teste real de Redis é ignorado de forma explícita.
- Total dessas suites: **39 testes aprovados**. Cobrem papéis, aprovação por admin, falsificação de papel, bloqueio de operações, remoção, transferência, saída, encerramento, TTL, concorrência, migração compatível, persistência, grants corretos e repetição de revogação.
- Duas instâncias reais do Electron com API local: criar/entrar/aprovar/promover, sincronização de admin, aprovação por admin, impossibilidade de admin gerenciar owner, saída do dono com sucessão e encerramento explícito. Sem erros JavaScript. Não fez deploy nem usou credenciais de produção.
- Minimizar/restaurar três fontes de vídeo de teste: preservou foco e trilhas vivas, inclusive quando todas ficaram minimizadas. Ícones/controles testados nas quatro dimensões listadas acima.
- Captura nativa no Windows: sem áudio por padrão; ativar/desativar áudio geral produziu/liberou a trilha de áudio e preservou o ID e o estado live do vídeo. Nenhuma tentativa de getUserMedia/microfone. Resultado em `zillu-0.6.2-native-audio-validation.json`.
- Áudio sintético no Electron: borda verde com sinal, neutra no silêncio e vermelha no mute, em grade/foco; chamadas simultâneas geraram apenas uma publicação de áudio no teste controlado.
- `npm run build:web` e `npm run dist:win`: concluídos. O pacote final foi regenerado com `npm run dist:win -- --config.compression=store` após os últimos ajustes. Artefato: `dist/Zillu-0.6.2-x64.exe`. Sem certificado de assinatura configurado.
- Conteúdo de app.asar conferido contra os arquivos atuais de frontend e backend: igualdade de bytes, versão 0.6.2 e nenhum arquivo .env. Metadados Windows: Zillu, 0.6.2.0. Inicialização do executável empacotado verificada separadamente, com símbolo, sprite e versão.

Evidências locais: `zillu-0.6.2-desktop-validation.json`, `zillu-0.6.2-native-audio-validation.json`, `zillu-0.6.2-packaged-validation.json` e `zillu-0.6.2-room.png`.

## Deploy necessário e pendências

O backend **não foi publicado**. Fazer deploy autorizado do diretório `backend` na Vercel, mantendo o rewrite e as variáveis de Redis/LiveKit já existentes. O Redis deve suportar EVAL e SET KEEPTTL. Validar primeiro em preview e conferir `POST /api/health` com apiVersion 0.6.2. Instruções completas em `backend/README.md`.

Publicar a nova API antes de distribuir o desktop para uso dos cargos e da nova política de saída. Encerrar sessões antigas ou aguardar handlers antigos terminarem para não misturar mutações legadas sem CAS com a versão nova. A interface identifica API antiga e não oferece novos cargos/encerramento; protege também a saída do owner para não prometer a semântica nova sobre o backend antigo.

Permanecem pendentes: testes entre computadores/redes diferentes, reprodução de vídeo/jogo com Discord aberto, entrega de mídia pelo SFU com a API nova publicada e tentativa real de reutilizar tokens após remoção na infraestrutura alvo. O áudio isolado por aplicativo está indisponível nesta implementação; o fallback explícito atende o caso sem suporte, mas o modo geral poderá incluir Discord.

Não houve push, deploy, configuração de segredos no executável ou modificação de serviços externos de produção.
