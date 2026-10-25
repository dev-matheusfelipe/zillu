# Zillu v0.6.0

Implementado em 25/10/2026, no diretório `D:\zillu`.

## Implementação

Interface grafite e azul, tipografia Poppins, sem degradês ou roxo. Entrada centralizada com nome, alternância Criar sala/Entrar e código somente na entrada. A sala prioriza os vídeos, com cabeçalho compacto, convite, estado de conexão, participantes recolhíveis e controles inferiores com ícones vetoriais de traço uniforme, nomes acessíveis e tooltips em português.

Grade adaptada a uma até seis transmissões e foco real com miniaturas selecionáveis. Vídeos usam `object-fit: contain`, nomes reais, identificação da prévia local e estado de pausa. O painel mostra iniciais, proprietário, estado de transmissão e ações exclusivas do proprietário. Os pedidos têm uma única área de aprovação/recusa, com aviso temporário sem duplicação dos controles. Diagnóstico e qualidade/FPS ficam em modais; o perfil personalizado permite resolução e FPS.

O seletor mantém `desktopCapturer` e `setDisplayMediaRequestHandler`, com miniaturas reais, abas Janelas/Monitores, seleção explícita, confirmação e perfil selecionado. A troca de fonte reutiliza esse fluxo.

## Arquivos

- `public/index.html`: nova estrutura de entrada, sala, controles e modais; textos Zillu e versão 0.6.0.
- `public/style.css`: tema completo, layout com altura disponível, grades, foco, participantes, seletor e acessibilidade.
- `public/refinements.css`: pequenos ajustes complementares, substituindo as sobreposições antigas.
- `public/app.js`: nomes reais, prévia, foco/grade, estados de pausa locais/remotos, seletor com confirmação, qualidade personalizada, painel recolhível e sincronização do fullscreen. Fluxos de salas e aprovação continuam usando os endpoints existentes.
- `electron.cjs`: fullscreen nativo por IPC com validação de origem/frame e tipo do argumento, eventos de sincronização, Esc, ícone e preservação das preferências antigas.
- `preload.cjs`: bridge restrita para consultar/alterar fullscreen e observar mudanças, sem expor `ipcRenderer`.
- `server.cjs`: mesmos símbolos liberados na lista estática do servidor local e mensagem de inicialização Zillu 0.6.0; sem mudanças na lógica de salas.
- `cloud-server.cjs`: inclusão dos PNGs oficiais na lista explícita de arquivos estáticos e MIME correto. Destino da API preservado: `https://zillu-backend.vercel.app`.
- `package.json` e `package-lock.json`: versão/nome do pacote; produto Zillu, ícone Windows e artefato `Zillu-0.6.0-x64.exe`.
- `INICIAR-ZULLU.bat`: texto visível corrigido para Zillu; nome do arquivo mantido para preservar atalhos.
- `public/logo-simbolo1.png`, `public/logo-simbolo2.png`: símbolos oficiais fornecidos, sem redesenho.
- `public/zillu.ico`: ícone multirresolução derivado do símbolo azul, com transparência e proporções preservadas (16, 24, 32, 48, 64, 128 e 256 px).
- `scripts/validate-desktop-layout.cjs` e `scripts/validate-desktop-live.cjs`: validação reproduzível com Playwright externo às dependências de produção.
- `docs/versions/zillu-0.6.0-*.json`: resultados das validações; PNGs de entrada e sala como evidência visual.

## Identidade e compatibilidade

O símbolo azul acompanha o nome Zillu na entrada. O símbolo branco original aparece no cabeçalho escuro e no estado vazio. Ambos são exibidos com `object-fit: contain`. O executável e a janela utilizam o ícone derivado do azul.

Textos visíveis da interface e nome do produto passaram de Zullu para Zillu. Permanecem `zulluDesktop`, `zullu-name`, `zullu-config`, o appId `studio.rizzer.zullu.screen` e a variável de backend `ZULLU_ALLOWED_ORIGIN`, pois são identificadores de integração/persistência. Antes de inicializar o electron-store, o aplicativo procura a configuração nas pastas antigas `Zullu` e `zullu-screen` e reutiliza a pasta existente. Não há migração destrutiva. Documentos históricos mantêm os nomes das respectivas versões.

A árvore de trabalho já continha alterações em Electron, package/lock, frontend, gateway local e testes, além de documentos 0.5.x. Essas alterações foram preservadas. O commit integra os arquivos necessários à versão atual; arquivos locais não relacionados permanecem fora dele.

## Fullscreen

O botão controla `BrowserWindow.setFullScreen`, distinto de maximizar. A origem é validada com o mesmo critério seguro das operações de captura. `enter-full-screen`/`leave-full-screen` atualizam ícone, tooltip e `aria-pressed`; Esc funciona tanto no processo principal quanto no renderer. A alternativa web usa o elemento raiz para manter os controles acessíveis. Não há fullscreen separado por vídeo.

## Validação

- `npm install`: concluído; auditoria informou zero vulnerabilidades. O npm informou scripts de instalação pendentes de aprovação para esbuild/electron-winstaller; os binários presentes permitiram build e testes.
- `npm run build:web`: concluído.
- `npm test`: 11 testes passaram, zero falhas, incluindo salas, aprovação/remoção, sinalização, contrato de captura, autorização SFU, gateway e prévia local. Parte desses testes já existia localmente antes desta implementação.
- `npm run dist:win`: concluído, gerando portátil Windows x64 com nome/ícone Zillu. O pacote final foi regenerado após os últimos ajustes usando `npm run dist:win -- --config.compression=store`, apenas para acelerar o empacotamento; sem alteração no comportamento do aplicativo.
- Electron real com Playwright: entrada e grades de 1–6 telas em 1280×720, 1366×768, 1920×1080 e mínimo 860×680, sem rolagem geral e com controles acessíveis. Grades testadas com tracks sintéticas para cobrir todas as quantidades.
- Executável empacotado `dist/win-unpacked/Zillu.exe` iniciado com sucesso: versão 0.6.0, `isPackaged: true`, logotipo carregado e título Zillu.
- Foco real, troca da miniatura principal, fullscreen nativo, saída por Esc e sincronização do botão: passaram; nenhum erro JavaScript capturado.
- Seletor real: 10 janelas e 3 monitores detectados na sessão de teste, miniaturas e abas funcionais. Quantidades variam conforme o computador.
- Duas instâncias reais do Electron no mesmo Windows, usando a API publicada e o LiveKit: criação, entrada, aprovação, captura nativa, publicação, prévia local, recebimento remoto, duas transmissões simultâneas, foco, troca de fonte, pausa/retomada, transmissão preservada após fullscreen, encerramento da transmissão e encerramento da sala passaram. Nenhum deploy foi feito.

Para repetir as validações desktop, instalar Playwright em diretório separado e apontar `ZILLU_PLAYWRIGHT_PATH` para o módulo, ou disponibilizá-lo no ambiente Node. Executar os scripts a partir da raiz. O script `validate-desktop-live.cjs` cria salas reais temporárias e compartilha o primeiro monitor entre duas instâncias locais; ao terminar, encerra a sala e fecha os aplicativos.

## Limitações

- Não houve teste entre dois computadores físicos ou redes diferentes. A validação real de mídia utilizou duas instâncias no mesmo computador; não equivale à validação de NAT/rede externa.
- De três a seis streams foram verificados quanto ao layout com fontes sintéticas; o teste real utilizou duas transmissões simultâneas.
- Metadados do executável conferidos: ProductName/FileDescription Zillu e ProductVersion 0.6.0.0. O executável não tem certificado de assinatura de código configurado. O builder informou também ausência de metadado de autor.
- Poppins continua sendo obtida do Google Fonts, conforme a estrutura anterior; a fonte depende de acesso à rede na primeira carga.
- Não foram fornecidas referências adicionais de login/modal além dos símbolos e do pedido textual; o desenho seguiu as regras e a inspiração descritas.
- A prévia de captura da própria janela pode apresentar recursão visual esperada.
- Nenhum segredo foi inserido no frontend. Não houve push, publicação no GitHub ou deploy.


## Correções após revisão visual

- Removida a faixa com marca/status da tela inicial; o formulário permanece centralizado.
- Título principal da entrada alterado para `Dev.matheusFelipe`.
- Título da janela reduzido a `Zillu`. Barra de título integrada com controles nativos do Windows; sem ícone junto ao texto no topo. O ícone oficial continua no executável e na barra de tarefas.
- Substituídos os tooltips nativos de `title` por tooltips do aplicativo, com Poppins, bordas arredondadas, posicionamento dentro da janela, suporte a hover/foco e fechamento por Esc. Rótulos acessíveis preservados.
- Removidos botão e modal Conexão. Mensagens técnicas de mídia ficam internas; nenhum endpoint foi alterado.
- Cards da grade agora mantêm proporção 16:9 e tamanho igual entre si, centralizados no espaço disponível. O tamanho é recalculado ao redimensionar a janela ou recolher participantes, escolhendo a disposição que comporta todas as telas. O vídeo continua com `object-fit: contain`. O vídeo principal do modo foco também mantém 16:9.
- `npm run build:web` e os 11 testes de `npm test` passaram. A validação Electron confirmou as seis correções, proporção 16:9 para 1–6 cards nas quatro resoluções, tooltips personalizados, ausência do modal, fullscreen/Esc e zero erros JavaScript. Evidências: `zillu-0.6.0-corrections-validation.json` e capturas de entrada/sala com o mesmo prefixo.
- O Windows bloqueou a substituição de `Zillu-0.6.0-x64.exe` porque a versão anterior estava aberta. A sessão do usuário foi preservada; o builder em espera foi interrompido e o pacote corrigido foi gerado como `dist/Zillu-0.6.0-corrigido-x64.exe`, usando `npm run dist:win -- --config.compression=store --config.artifactName=Zillu-0.6.0-corrigido-x64.exe`. Mantida a versão 0.6.0. Os testes de mídia reais descritos acima pertencem à validação anterior; nesta revisão foram verificados os layouts e controles, sem novo teste de publicação entre instâncias.
