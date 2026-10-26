# Publicação Zillu API 0.6.2

Publicação autorizada pelo usuário e concluída em 26/10/2026.

- Repositório: https://github.com/dev-matheusfelipe/zillu
- Branch: main.
- Commit de código publicado: `0191a0a819a0bf6a1f52e88661528ca469240a41`.
- Projeto Vercel: zillu-backend, na equipe matheusfbasilio-gmailcoms-projects.
- Deployment verificado: `dpl_2ioJSJMPnVGRWHPrxnW8j7eTbU8Z`, produção, READY, associado ao commit acima.
- API: https://zillu-backend.vercel.app
- Health: HTTP 200, apiVersion 0.6.2, mediaMode sfu.

O push para main acionou a integração Git da Vercel. Foram mantidos o domínio, o projeto e as variáveis de ambiente existentes. Não foi necessário criar projeto, alterar segredos ou configurar outro banco.

## Verificação efetiva em produção

O script `scripts/validate-production-api.cjs --production` criou uma sala temporária própria e confirmou:

1. Doze pessoas no total aceitas; a décima terceira recusada com 409.
2. Participante pendente sem acesso a token SFU.
3. Promoção para admin e aprovação de entrada por admin.
4. Admin impedido de remover dono/outro admin, promover cargos ou encerrar a sala.
5. Token de aprovado com TTL 120 segundos e sem grant roomAdmin.
6. Participante removido impedido de obter novo token.
7. Saída do dono preservando a sala e tornando admin o sucessor.
8. Transferência explícita, com perda da permissão de encerramento pelo dono anterior.
9. Encerramento explícito e recebimento do evento ended pelos participantes restantes.

A sala de teste foi encerrada; os testes não modificaram salas preexistentes. Tokens não foram gravados no relatório nem exibidos no console. Resultado em `zillu-production-validation.json`.

O script exige `--production` de forma explícita para evitar que uma execução casual crie sessões na API publicada. As sessões temporárias restantes expiram pelo TTL normal.

## Limites desta publicação

Foi validada a API publicada, Redis e autorização para SFU. Não foi reproduzida mídia entre computadores nesta rodada, nem uma chamada real Discord/TeamSpeak. O isolamento de áudio por processo foi validado localmente na revisão de correções; não depende de segredos no executável.

O código mais recente de desktop/helper também foi enviado ao GitHub. Não foi gerado outro executável neste pedido; os pacotes desktop anteriores não passam a conter automaticamente o helper novo. Para desenvolvimento, executar npm start; uma distribuição atualizada requer um novo dist:win quando solicitado.
