# Zillu v0.6.1

Atualização do projeto em 25/10/2026. Sem geração de executável ou build web, conforme a preferência de validar em desenvolvimento.

## Alterações

- `package.json`, raiz e pacote principal do `package-lock.json`, rodapé da interface, comentário de refinamentos e mensagem de inicialização do servidor local atualizados para 0.6.1. Documentos e evidências de versões anteriores preservados.
- Perfil, resolução e FPS usam menus próprios do aplicativo, substituindo as listas visuais nativas do Windows. Seleção destacada, bordas arredondadas, navegação por setas/Home/End, Enter/Espaço, fechamento por Esc/clique externo e rótulos acessíveis. Os elementos select internos permanecem ocultos para manter a integração com as preferências existentes.
- Novos perfis: Fluida (720p, 60 FPS, até 4,5 Mbps) e Alta fluidez (1080p, 60 FPS, até 8 Mbps). O perfil personalizado aumenta o limite de bitrate quando selecionado 60 FPS. A captura solicita a taxa escolhida via applyConstraints e o encoder recebe maxFramerate/maxBitrate correspondentes. Perfis antigos e chaves persistidas mantidos.
- Ícone de alto-falante sempre visível na barra da sala. Se não houver track de áudio ativa, abre as configurações de áudio; se houver, silencia/ativa a track real. Com áudio silenciado, ícone e borda ficam vermelhos. Não representa um microfone.
- Opção “Compartilhar áudio do computador” disponível também nas configurações, sincronizada com o seletor de fontes. A interface explica que uma transmissão iniciada sem áudio precisa trocar a fonte para incluir esse áudio.

## Validação

- `node --check public/app.js`: passou.
- `npm test`: 11 testes passaram, zero falhas.
- Electron real com Playwright: menu personalizado selecionou 1080p/60 FPS com limite de 8 Mbps; perfil personalizado selecionou 60 FPS; Esc fechou a lista; botão de áudio foi exibido sem transmissão e abriu configurações; opção de áudio sincronizou com o seletor. Nenhum erro JavaScript detectado. Preferências anteriores restauradas ao terminar o teste.
- Script reproduzível: `scripts/validate-desktop-settings.cjs`, usando Playwright externo via `ZILLU_PLAYWRIGHT_PATH`, a partir da raiz. Evidência: `zillu-0.6.1-settings.png`.

## Limitações

Os perfis solicitam até 60 FPS; a taxa efetiva depende da fonte, monitor, captura, processamento e conexão. Não foi realizada nova medição de FPS entregue por uma transmissão real nesta revisão. Áudio real de sistema e mute remoto continuam pendentes de conferência no uso real. A implementação de áudio e a restauração do símbolo no topo da revisão anterior permanecem no projeto. Nenhum deploy, publicação ou executável foi gerado.


## Build Windows solicitado posteriormente

`npm run dist:win` concluído com sucesso. Gerado `dist/Zillu-0.6.1-x64.exe` (portátil Windows x64). Bundle web reconstruído pelo script. Metadados do aplicativo conferidos: Zillu, ProductVersion 0.6.1.0; package.json dentro do app.asar com versão 0.6.1 e código dos perfis de 60 FPS/controle de áudio presente. Build sem certificado de assinatura configurado. Nenhum deploy ou publicação realizado.
