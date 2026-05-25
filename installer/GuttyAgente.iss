; =====================================================================
;  GuttyAgente — instalador stub (Inno Setup 6.1+)
;
;  Stub de ~3 MB. Em runtime:
;    1. Mostra wizard padrao Windows
;    2. Baixa agente-payload.zip de GitHub Releases (~175 MB) com
;       progress bar real via DownloadTemporaryFile() (WinHTTP nativo)
;    3. Extrai pra %LOCALAPPDATA%\GuttyAgente\ via Shell.Application
;    4. Cria atalho Menu Iniciar + (opcional) Desktop
;    5. Registra autostart em HKCU\...\Run
;    6. Inicia GuttyAgente.exe --tray
;
;  SEM PLUGIN EXTERNO. Usa o downloader nativo do Inno Setup 6.1+.
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

#ifndef PAYLOAD_URL
  #define PAYLOAD_URL "https://github.com/rczervinski/gutty-agente/releases/latest/download/agente-payload.zip"
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

CloseApplications=force
RestartApplications=no
MinVersion=10.0

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked
Name: "autostart";   Description: "Iniciar o {#MyAppName} com o Windows"; GroupDescription: "Inicializacao:"; Flags: checkedonce

[Files]
; Stub nao traz binarios — tudo vem via download em runtime.
Source: "LICENSE-placeholder.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}";              Filename: "{app}\{#MyAppExeName}"; Parameters: "--tray"
Name: "{group}\Desinstalar {#MyAppName}";  Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}";        Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "{#MyAppShortName}"; \
  ValueData: """{app}\{#MyAppExeName}"" --tray"; \
  Flags: uninsdeletevalue; Tasks: autostart

[Run]
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
//  Downloader nativo (Inno Setup 6.1+ via WinHTTP — sem plugin externo)
// =====================================================================

var
  DownloadPage: TDownloadWizardPage;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(
    'Baixando o Gutty Agente',
    'Aguarde enquanto o pacote completo e baixado do servidor da Gutty (~175 MB).',
    @OnDownloadProgress);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = wpReady then begin
    DownloadPage.Clear;
    // SHA-256 vazio = nao valida hash. Pra ativar, passar o digest aqui.
    DownloadPage.Add('{#PAYLOAD_URL}', 'agente-payload.zip', '');
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
        Result := True;
      except
        if DownloadPage.AbortedByUser then
          MsgBox('Download cancelado.', mbInformation, MB_OK)
        else
          MsgBox('Falha no download: ' + GetExceptionMessage + #13#10 +
                 'Verifique sua conexao e tente novamente.', mbCriticalError, MB_OK);
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end else
    Result := True;
end;

// =====================================================================
//  Extracao do zip baixado via Shell.Application (sem 7zip externo)
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

  // Flags: 16 = sim a tudo; 4 = sem progress dialog; 1024 = sem UI de confirmacao
  Target.CopyHere(Source.Items, 16 or 4 or 1024);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ZipPath: string;
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    ZipPath := ExpandConstant('{tmp}\agente-payload.zip');
    if not FileExists(ZipPath) then
      RaiseException('Pacote nao foi baixado. Verifique sua conexao e tente novamente.');

    WizardForm.StatusLabel.Caption := 'Extraindo pacote do Gutty Agente...';

    try
      ExtractZipUsingShell(ZipPath, ExpandConstant('{app}'));
    except
      RaiseException('Falha ao extrair pacote: ' + GetExceptionMessage);
    end;

    // Se o zip tinha uma subpasta raiz (GuttyAgente\), achata.
    if DirExists(ExpandConstant('{app}\GuttyAgente')) and
       not FileExists(ExpandConstant('{app}\GuttyAgente.exe')) then
    begin
      WizardForm.StatusLabel.Caption := 'Organizando arquivos...';
      Exec(ExpandConstant('{cmd}'),
           '/c move /Y "' + ExpandConstant('{app}\GuttyAgente\*') + '" "' + ExpandConstant('{app}') + '"',
           '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      RemoveDir(ExpandConstant('{app}\GuttyAgente'));
    end;

    DeleteFile(ZipPath);
  end;
end;
