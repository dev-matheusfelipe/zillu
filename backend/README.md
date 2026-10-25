# Zillu API — preparação para Vercel (v0.5.0-alpha)

Este diretório é **somente o backend** de salas. Não contém o Electron. O repositório do usuário deve ser configurado na Vercel com **Root Directory** `backend` depois de copiar este conteúdo para essa pasta no repositório.

## Pré-requisitos

1. Criar banco Upstash Redis e guardar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` nas variáveis de ambiente da Vercel.
2. Importar o repositório GitHub na Vercel, **Root Directory** `backend`, runtime Node, e configurar as variáveis acima.
3. Configurar `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` para emissão de tokens SFU. O SFU funciona em LiveKit Cloud ou servidor próprio, nunca dentro da Vercel.
4. `POST /api/health` retorna `{"ok":true}` quando Redis estiver configurado.

O cliente Electron atual **ainda não foi alterado para utilizar essa API**. Para acesso automático a partir do aplicativo é necessário configurar `ZULLU_API_URL` na compilação do cliente e disponibilizar a interface local, não carregar HTML remoto por `win.loadURL`. Sem essas alterações, esta API não torna a conexão por código automática.

## Limitações importantes

**Protótipo, não pronto para produção pública.** A API usa leituras/escritas simples no Redis, sem transações atômicas para associação e remoção de membros; operações simultâneas podem gerar condições de corrida. Long polling de eventos usa até 8 s, consumo de requisições proporcional aos participantes. Faltam limites de requisição distribuídos, tratamento de sessão expirada, autenticação persistente forte, limpeza/revogação de tokens LiveKit e controle de sessões em reconexões. A aprovação da sala ainda existe, mas não substitui uma auditoria de segurança.

Não publicar credenciais no GitHub. Somente `.env.example` é adequado para versionamento.
