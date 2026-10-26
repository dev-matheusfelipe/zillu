# Zillu v0.5.3 — Layout desktop sem rolagem global

## Alterações
- Layout da sala ocupa a altura útil da janela no desktop com flex/grid e `min-height: 0`.
- Página principal sem scroll vertical, sem cortar controles; vídeos mantêm `object-fit: contain`.
- Vídeo único se ajusta à área disponível; várias transmissões usam rolagem apenas na grade quando necessário.
- Modo Foco ocupa a área livre, com faixa de outras transmissões.
- Controles compactos, sidebar com rolagem interna somente quando necessária.
- Cabeçalho, título, código da sala e rodapé compactados.
- Mobile mantém rolagem natural e painel de participantes com altura limitada.

## Escopo e validação
- Mudanças limitadas à apresentação (CSS) e versão. Fluxos LiveKit, autenticação, API e captura preservados.
- Testes automatizados devem ser executados via `npm test`. Validação visual final em Electron/Windows ainda necessária, especialmente ao redimensionar a janela e com múltiplas transmissões.
