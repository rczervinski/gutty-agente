; =====================================================================
;  GuttyAgente — instalador stub (Inno Setup 6)
;
;  O cliente baixa este .exe (~3-5 MB). Em runtime ele:
;    1. Baixa agente-payload.zip de GitHub Releases (~185 MB) com progress
;    2. Extrai pra {localappdata}\GuttyAgente\
;    3. Cria atalho Menu Iniciar e (opcional) Desktop
;    4. Registra autostart em HKCU\Software\Microsoft\Windows\CurrentVersion\Run
;    5. Inicia GuttyAgente.exe --tray (sobe minimizado pra bandeja)
;
;  Sem privilegio admin (PrivilegesRequired=lowest) — instala em
;  AppData do usuario. UAC sobe apenas quando o app precisar instalar
;  servico Windows (TEF).
;
;  Dependencias do build:
;    - Inno Setup 6  (https://jrsoftware.org/isdl.php)  ou:  choco install innosetup
;    - Inno Download Plugin (IDP) 1.5+ (https://mitrich.net23.net/?/inno-download-plugin/)
;
;  Compilar:
;    iscc.exe installer\GuttyAgente.iss
;  Saida em: bin\GuttyAgenteSetup.exe
; =====================================================================

#define MyAppName        "Gutty Agente"
#define MyAppShortName   "GuttyAgente"
#define MyAppPublisher   "Gutty"
#define MyAppVersion     "1.0.0"
#define MyAppExeName     "GuttyAgente.exe"
#define MyAppURL         "https://caixa.gutty.app.br"

; URL do payload — pode ser sobrescrito via /DPAYLOAD_URL=... na linha de comando.
#ifndef PAYLOAD_URL
  #define PAYLOAD_URL "https://github.com/rczervinski/caixa-gutty/releases/latest/download/agente-payload.zip"
#endif

[Setup]
AppId={{B8B6D90A-2C5F-4A2B-B7E7-9F2C5E1D8A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} {#MyAppVersion}
VersionInfoVersion={#MyAppVersion}

; Instala em %LOCALAPPDATA%\GuttyAgente (sem admin)
DefaultDirName={localappdata}\{#MyAppShortName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

OutputDir=..\bin
OutputBaseFilename=GuttyAgenteSetup
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

WizardStyle=modern
WizardResizable=no
ShowLanguageDialog=no
DisableWelcomePage=no

UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}

SetupLogging=yes
CloseApplications=force
RestartApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked
Name: "autostart";   Description: "Iniciar o {#MyAppName} com o Windows"; GroupDescription: "Inicializacao:"; Flags: checkedonce

[Files]
; Stub nao traz binarios — tudo vem via download em runtime.
; (Inno Setup exige pelo menos 1 arquivo; o LICENSE serve de placeholder.)
Source: "LICENSE-placeholder.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}";              Filename: "{app}\{#MyAppExeName}"; Parameters: "--tray"
Name: "{group}\Desinstalar {#MyAppName}";  Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}";        Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Autostart user-level (sem admin). --tray => sobe minimizado.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#MyAppShortName}"; \
  ValueData: """{app}\{#MyAppExeName}"" --tray"; \
  Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Inicia o agente automaticamente no final da instalacao (sobe pra bandeja)
Filename: "{app}\{#MyAppExeName}"; Parameters: "--tray"; Description: "Iniciar {#MyAppName}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"
Type: files;          Name: "{app}\{#MyAppExeName}"
Type: files;          Name: "{app}\*.dll"
Type: files;          Name: "{app}\*.pak"
Type: files;          Name: "{app}\*.bin"
Type: files;          Name: "{app}\*.dat"
Type: files;          Name: "{app}\*.html"
Type: files;          Name: "{app}\*.json"

[Code]
// =====================================================================
//  Download do payload via Inno Download Plugin (IDP)
//  Doc: https://mitrich.net23.net/?/inno-download-plugin/
// =====================================================================

#include <idp.iss>

procedure InitializeWizard();
begin
  // Agenda o download. Ele baixa entre as paginas Ready e Installing.
  idpAddFile('{#PAYLOAD_URL}', ExpandConstant('{tmp}\agente-payload.zip'));

  // UI do downloader. Erros aparecem caixa de mensagem, sem parar wizard.
  idpDownloadAfter(wpReady);
end;

// =====================================================================
//  Extracao do zip baixado (usa Shell.Application.NameSpace pra
//  evitar dependencia de 7zip externo)
// =====================================================================

procedure ExtractZipUsingShell(const ZipPath, DestDir: string);
var
  Shell, Source, Target: Variant;
begin
  Shell := CreateOleObject('Shell.Application');
  Source := Shell.NameSpace(ZipPath);
  if VarIsNull(Source) or VarIsClear(Source) then
    RaiseException('Nao consegui abrir o arquivo baixado.');

  ForceDirectories(DestDir);
  Target := Shell.NameSpace(DestDir);
  if VarIsNull(Target) or VarIsClear(Target) then
    RaiseException('Nao consegui acessar a pasta de destino.');

  // 16 = nao perguntar/sobrescrever; 4 = sem progress dialog
  Target.CopyHere(Source.Items, 16 or 4 or 1024);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ZipPath: string;
begin
  if CurStep = ssInstall then
  begin
    ZipPath := ExpandConstant('{tmp}\agente-payload.zip');
    if not FileExists(ZipPath) then
      RaiseException('Pacote nao foi baixado. Verifique sua conexao e tente novamente.');

    WizardForm.StatusLabel.Caption := 'Extraindo pacote do Gutty Agente...';
    WizardForm.FilenameLabel.Caption := ZipPath;

    try
      ExtractZipUsingShell(ZipPath, ExpandConstant('{app}'));
    except
      RaiseException('Falha ao extrair pacote: ' + GetExceptionMessage);
    end;

    // Apos extracao, o conteudo do zip cai em {app}\GuttyAgente\... se
    // o zip tem uma pasta raiz. Vamos detectar e achatar se necessario.
    if DirExists(ExpandConstant('{app}\GuttyAgente')) and
       not FileExists(ExpandConstant('{app}\GuttyAgente.exe')) then
    begin
      WizardForm.StatusLabel.Caption := 'Organizando arquivos...';
      // Pseudo-flatten: movemos o conteudo da subpasta pra raiz.
      // Inno nao tem move recursivo nativo, mas em geral packagers que geram
      // a subpasta criam um zip "<nome>\..." — entao basta saber qual e.
      // Implementacao simples: usamos cmd /c move via Exec.
      Exec(ExpandConstant('{cmd}'),
           '/c move /Y "' + ExpandConstant('{app}\GuttyAgente\*') + '" "' + ExpandConstant('{app}') + '"',
           '', SW_HIDE, ewWaitUntilTerminated, GetLastError);
      RemoveDir(ExpandConstant('{app}\GuttyAgente'));
    end;

    // Limpa zip temporario
    DeleteFile(ZipPath);
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  // Aviso se nao tiver internet (verificacao basica via DNS implicita do IDP).
end;
