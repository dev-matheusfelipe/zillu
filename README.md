# Zullu v0.4.0

Leia [README-V0.4.0.md](README-V0.4.0.md) para instalação, SFU e limitações.

# Zullu — MVP 0.1.0

Aplicativo Windows em Electron para compartilhar uma tela ou janela com até cinco espectadores. Os espectadores podem usar Chrome ou Edge pelo navegador, sem instalar o aplicativo. Projeto separado da rede social Zullu.

## Teste agora no mesmo computador

1. Instale o **Node.js LTS** em https://nodejs.org (recomendado: versão 24).
2. Extraia este ZIP para uma pasta, por exemplo `D:\Rizzer\Zullu-Screen`.
3. Abra **INICIAR-ZULLU.bat**. Na primeira execução, a instalação precisa de internet. A janela é um aplicativo Electron real; não é uma imagem ou simulação.
4. Digite seu nome. Clique em **Escolher tela e criar sala** e selecione uma tela ou janela.
5. Expanda **Conexão com o servidor** e copie o endereço local mostrado no campo. O aplicativo usa uma porta local livre, que pode mudar a cada abertura.
6. Abra esse endereço no Chrome/Edge do mesmo PC. Digite outro nome, clique em **Assistir** e informe o código de seis caracteres.
7. Volte ao aplicativo e clique em **Permitir**. A tela deve aparecer no navegador.

Evite compartilhar a própria janela do Zullu: isso cria o efeito de espelho infinito. Escolha outra janela para o primeiro teste.

## Amigos em outras casas: servidor e endereço público

O servidor incluído é funcional, mas este pacote **não inclui hospedagem pública nem TURN contratado**. O código só funciona se todos usarem o mesmo servidor. Para um teste temporário:

1. Abra **SERVIDOR.bat**. Ele inicia o servidor Node em `http://localhost:3210`, sem depender de Electron nem de instalar pacotes npm.
2. Publique a porta 3210 por um túnel HTTPS de sua preferência. Exemplo com o `cloudflared` já instalado:

   ```powershell
   cloudflared tunnel --url http://localhost:3210
   ```

3. O túnel mostrará um endereço HTTPS temporário. Mantenha o servidor e o túnel abertos.
4. No aplicativo, **antes de criar a sala**, expanda **Conexão com o servidor** e coloque esse endereço HTTPS. Se já criou uma sala, encerre e crie novamente no servidor público.
5. Crie a sala, envie **o endereço HTTPS e o código** aos amigos. Eles abrem o endereço, escolhem **Assistir**, digitam seus nomes e o código. Autorize cada entrada.
6. Para voltar ao teste local, substitua o endereço remoto pelo endereço local da execução atual do aplicativo. Você também pode transmitir diretamente pelo Chrome/Edge no endereço HTTPS, sem Electron.

Apenas enviar o código sem disponibilizar um servidor não conecta computadores pela internet. O túnel carrega a página e a sinalização, não retransmite o vídeo. Este pacote não instala nem inicia túneis automaticamente.

## Redes que bloqueiam WebRTC: TURN

STUN público está configurado por padrão. Conexões diretas podem falhar com CGNAT, firewall ou redes corporativas; para maior cobertura, configure um serviço TURN. Defina `ICE_SERVERS_JSON` **na janela do servidor antes de iniciá-lo**:

```powershell
$env:ICE_SERVERS_JSON='[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:SEU_HOST:3478?transport=udp","turns:SEU_HOST:5349?transport=tcp"],"username":"USUARIO_TEMPORARIO","credential":"SENHA_TEMPORARIA"}]'
node server.cjs
```

Esses campos são exemplos: substitua por um TURN real. As credenciais são entregues aos clientes, como necessário no WebRTC; use credenciais temporárias de teste. Produção exige emissão de credenciais com expiração, autenticação e limites de uso. Não salve senhas no código nem compartilhe arquivos de configuração com segredos.

## Controles e desempenho

- **Econômica (padrão):** até 1280×720, 15 FPS e teto de 1,5 Mbps por espectador.
- **Equilibrada:** até 1920×1080, 24 FPS e teto de 3 Mbps por espectador.
- **Movimento:** até 1280×720, 30 FPS e teto de 2,5 Mbps por espectador.
- A resolução real depende da fonte, encoder e conexão. Os valores são limites solicitados, não desempenho garantido.
- Transmissão P2P: upload e esforço de codificação crescem com cada espectador. Cinco espectadores a 1,5 Mbps podem consumir cerca de 7,5 Mbps, mais overhead. Comece com uma pessoa.
- Electron mantém aceleração de hardware padrão. Uso real de CPU/GPU depende do PC e precisa ser medido no Windows.
- Pausar desativa o vídeo enviado; retomar reativa. Encerrar fecha conexões e para a captura.
- Vídeo sem microfone e sem áudio do sistema nesta versão. Sem gravação, controle remoto ou transferência de arquivos.

## Gerar executável Windows

Em um Windows x64 com Node.js instalado, abra **GERAR-EXE.bat**. O Electron Builder gera o executável portátil na pasta `dist`.

O ZIP entregue contém o projeto completo, **não um EXE já compilado**. A compilação do executável não foi executada neste ambiente Linux. O executável gerado não tem assinatura digital e pode exibir aviso do Windows. Não é necessário compilá-lo para testar usando INICIAR-ZULLU.bat.

## Desenvolvimento

```powershell
npm ci
npm start
npm test
npm run server
npm run dist:win
```

Servidor: Node.js nativo, sem dependências de produção. Sinalização por HTTP long polling (eventos entregues assim que chegam; o prazo de 20 s é só o timeout da requisição ociosa). Mídia por WebRTC, sem passar pelo servidor de salas. O servidor mantém salas em memória: reiniciar encerra todas. Sem banco de dados. Sessões sem atividade expiram em aproximadamente 65–75 segundos.

Docker opcional: `docker build -t zullu-screen .` e `docker run --rm -p 3210:3210 zullu-screen`. Forneça HTTPS via proxy/túnel externo. Somente abrir uma porta HTTP na rede não habilita captura de tela em navegadores remotos; é necessário HTTPS.

## Validação realizada

Testes automatizados em Node 24: criação de sala, código, autenticação da sessão, aprovação obrigatória, proibição de aprovação pelo espectador, entrega de sinais, limite de cinco participantes, remoção, encerramento e isolamento entre salas. Sintaxe dos scripts verificada.

Não foram validados neste ambiente: execução em Windows, captura real de tela, reprodução WebRTC entre dispositivos, uso de GPU/CPU, TURN real e compilação do EXE. Faça o teste local antes de convidar amigos.

## Limites de segurança do MVP

Código aleatório de seis caracteres, tokens de sessão de 192 bits e aprovação individual pelo transmissor. O nome informado pelo visitante não comprova sua identidade. Vídeo é protegido pelo transporte WebRTC; espectadores podem gravar a tela por ferramentas externas. CORS permite o aplicativo desktop acessar um servidor separado, e a API exige tokens nas ações autenticadas. O serviço é para testes entre pessoas de confiança, não para hospedagem pública permanente sem autenticação, limites por IP/ação e TURN temporário. Proxy reverso deve tratar rate limiting de produção; o limite básico usa o IP da conexão e não confia em X-Forwarded-For.
