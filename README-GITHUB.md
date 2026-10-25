# Zillu — Código-fonte para GitHub

Esta pasta contém os fontes do Zullu v0.4.0 (aplicativo Electron, servidor Node e integração LiveKit experimental). Não inclui builds antigos, segredos ou node_modules.

## Inicialização

```powershell
npm install
npm run build:web
npm test
npm start
```

## GitHub

Se este diretório não possuir histórico Git:

```powershell
git init
git branch -M main
git remote add origin https://github.com/dev-matheusfelipe/zillu.git
git add .
git commit -m "feat: import Zullu v0.4.0 source"
git push -u origin main
```

Se `origin` já existir, use `git remote set-url origin https://github.com/dev-matheusfelipe/zillu.git`. Antes do push, confira `git status` e `git ls-files` e revise as permissões do repositório. Se a branch remota já contiver commits, integre o histórico em vez de usar `--force`.

## Implantação

O `server.cjs` atual é um servidor Node persistente e **não** pode simplesmente ser implantado como função Vercel: mantém salas e clientes em memória. Para API na Vercel, migrar estado das salas para Redis/Postgres e projetar signaling durável. LiveKit SFU precisa de serviço externo (LiveKit Cloud ou VPS). Não publicar a configuração dev de LiveKit em produção.

**Status:** código de desenvolvimento, ainda sem validação de captura Windows, SFU real ou auditoria de produção.
