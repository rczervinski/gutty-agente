# Gutty Agente

Aplicacao Electron que roda permanente no PC do cliente (icone na bandeja
do sistema). Conecta dispositivos locais ao Gutty Web:

- **TEF** — pagamentos por cartao via CliSiTef oficial (Software Express). Pronto.
- **Impressoras** — cupom, etiquetas, NFC-e. Em desenvolvimento.
- **Balancas** — Toledo, Filizola, Urano. Em desenvolvimento.

## Distribuicao

- O cliente baixa apenas um **stub Inno Setup de ~4 MB** (`GuttyAgenteSetup.exe`).
- O stub baixa o **payload completo (~185 MB)** de GitHub Releases na hora
  da instalacao, com progress bar real.
- Instala em `%LOCALAPPDATA%\GuttyAgente\` (user-level, sem UAC obrigatorio).
- Cria atalho Menu Iniciar e configura autostart no Windows (HKCU\Run).
- Inicia minimizado na bandeja (icone Gutty ao lado do relogio).

## Pre-requisitos do build (uma vez)

```powershell
# Node.js 20+
node --version

# Inno Setup 6 + Inno Download Plugin
choco install innosetup innosetup-idp -y

# Agente CliSiTef oficial da Software Express:
# baixe o ZIP do portal SE e coloque em:
#   assets/payload/agenteCliSiTef-1.0.0.16.r1-Simulado-Win64.zip
# (NAO commitado — distribuicao pertence a SE)
```

## Desenvolvimento local (sem subir release)

Tres modos, do mais rapido pro mais completo:

### Modo A — UI rapida (dev)

```powershell
npm run dev
```

Sobe o Electron direto, ~5s pra reabrir apos editar. Bom pra mexer em
sidebar/abas/telas. **Nao testa elevacao UAC** porque o `process.execPath`
aponta pro electron.exe do node_modules.

### Modo B — Executavel real (sem stub)

```powershell
npm run pack:payload                                  # ~90s
.\bin\GuttyAgente-win32-x64\GuttyAgente.exe           # roda direto
```

Testa o `.exe` empacotado (auto-elevacao UAC funciona porque execPath e
o GuttyAgente.exe real). Pula o stub Inno. Bom pra iterar no main process
e na instalacao TEF.

### Modo C — Fluxo cliente completo (stub Inno + payload local)

```powershell
npm run test:installer        # builda payload + stub apontando pra file://
                              # e abre o setup
# ou, se nao mexeu no payload:
npm run test:installer:fast   # reusa payload, so refaz stub (~5s)
```

O stub baixa o payload do disco local (instantaneo), instala em
`%LOCALAPPDATA%\GuttyAgente\`, cria atalhos, configura autostart,
lanca o app. **Mesmo fluxo que o cliente final ve.**

### Loop de reset entre testes

```powershell
# Desinstala GuttyAgente
%LOCALAPPDATA%\GuttyAgente\unins000.exe
# ou: Apps e Recursos do Windows -> Gutty Agente -> Desinstalar

# Desinstala servico TEF (admin)
cd ..\caixa
.\scripts\reset-tef.bat
```

Quando estiver tudo passando, ai sim:

```powershell
npm run pack           # builda payload + stub apontando pro GitHub
npm run deploy:release # mostra como subir os 2 arquivos no release
```

## Build

```powershell
npm install
npm run pack:payload       # bin/agente-payload.zip (~185 MB)
npm run pack:installer     # bin/GuttyAgenteSetup.exe (~4 MB)
# ou:
npm run pack               # ambos
npm run deploy:release     # mostra instrucoes de upload
```

## Publicar release

Via gh CLI:

```powershell
gh release create latest bin/GuttyAgenteSetup.exe bin/agente-payload.zip `
  --title "Gutty Agente latest" --notes "Release automatico"

# Atualizacoes:
gh release upload latest bin/GuttyAgenteSetup.exe bin/agente-payload.zip --clobber
```

Ou via web em <https://github.com/rczervinski/gutty-agente/releases> — arraste
os 2 arquivos pro release `latest`, marque "Set as latest release", publish.

Apos publicar, o PDV em `caixa.gutty.app.br` resolve a URL automaticamente
via `/api/tef/installer/download` (302 pro asset).

## Estrutura

```
gutty-agente/
├── installer/                  (Inno Setup stub)
├── electron/                   (main process)
├── renderer/                   (UI React + Tailwind)
├── assets/payload/             (agente CliSiTef ZIP — NAO commitado)
├── pack.js                     (gera bin/agente-payload.zip)
├── deploy-to-public.js
└── package.json
```

## Env vars do PDV (todas opcionais)

| Variavel                       | Default          | Pra que serve                       |
|--------------------------------|------------------|-------------------------------------|
| `TEF_INSTALLER_URL`            | (vazio)          | Override total                      |
| `TEF_INSTALLER_GH_OWNER`       | `rczervinski`    |                                     |
| `TEF_INSTALLER_GH_REPO`        | `gutty-agente`   |                                     |
| `TEF_INSTALLER_GH_TAG`         | `latest`         | Fixar versao                        |
| `TEF_INSTALLER_DEFAULT_TYPE`   | `exe`            | `exe` ou `zip`                      |
| `TEF_INSTALLER_VERSION`        | (vazio)          | Aparece no tooltip do botao         |
| `TEF_INSTALLER_SIZE_MB`        | (vazio)          | Aparece ao lado do label            |
