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
