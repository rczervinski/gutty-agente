# GuttyAgenteSetup — instalador stub

Stub Inno Setup que pesa **~3–5 MB**. Em runtime baixa o payload completo
(~185 MB) de GitHub Releases. Cliente só precisa baixar o stub.

## Por que stub?

- GitHub repo: limite 100 MB/arquivo → ZIP cheio (185 MB) era rejeitado.
- Vercel deploy: limite 100 MB → também estourava.
- GitHub Releases: limite 2 GB/asset → cabe sem problema.
- Cliente baixa rápido, sem barra de download de 185 MB no PDV.

## O que o stub faz

1. Mostra wizard padrão Windows (sem firula, idioma pt-BR).
2. Baixa `agente-payload.zip` de `releases/latest/download/agente-payload.zip`
   com progress bar real (plugin IDP).
3. Extrai pra `%LOCALAPPDATA%\GuttyAgente\`.
4. Cria atalho Menu Iniciar (opcional: Desktop).
5. Adiciona `HKCU\...\Run\GuttyAgente = "...\GuttyAgente.exe" --tray`.
6. Inicia `GuttyAgente.exe --tray` (sobe minimizado pra bandeja).
7. Painel de Controle → Apps e Recursos mostra "Gutty Agente" com uninstall.

**Sem admin.** Tudo user-level (`PrivilegesRequired=lowest`). UAC sobe
apenas dentro do app, quando o usuário pede instalar/parar serviço TEF.

## Pré-requisitos (instalar uma vez)

```powershell
# Chocolatey (recomendado)
choco install innosetup innosetup-idp -y
```

Alternativa manual:
- Inno Setup 6: <https://jrsoftware.org/isdl.php>
- Inno Download Plugin: <https://mitrich.net23.net/?/inno-download-plugin/>
  Após baixar o IDP, copie `idp.iss`, `idp.dll`, `idp_unicode.dll` pra
  `C:\Program Files (x86)\Inno Setup 6\`.

## Build

Do diretório `scripts/gutty-tef-installer-gui/`:

```powershell
npm run pack:installer
```

Que faz:

```powershell
powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
```

Saída em `bin\GuttyAgenteSetup.exe`.

### Customizar URL do payload

Por default aponta pra `releases/latest`. Pra forçar outra URL no build:

```powershell
$env:GUTTY_PAYLOAD_URL = "https://meu-cdn.com/payload.zip"
npm run pack:installer
```

## Fluxo completo de publicação

```powershell
# 1) Empacota o Electron + payload SE num zip único
npm run pack:payload

# 2) Compila o stub Inno (~4 MB)
npm run pack:installer

# 3) Sobe ambos no GitHub Releases (tag tef-installer-latest)
npm run deploy:release
```

## Testar localmente

```powershell
# Builda stub apontando pra um payload local (ex: file://...)
$env:GUTTY_PAYLOAD_URL = "file:///C:/temp/agente-payload.zip"
npm run pack:installer
.\bin\GuttyAgenteSetup.exe
```

## Desinstalação

- Apps e Recursos → Gutty Agente → Desinstalar.
- Ou: `%LOCALAPPDATA%\GuttyAgente\unins000.exe`.

Apaga arquivos, atalhos, e remove `HKCU\...\Run\GuttyAgente`. O serviço
Windows do agente CliSiTef (se instalado) precisa ser removido separado
via `scripts/reset-tef.bat` (admin).
