# =====================================================================
#  build-installer.ps1
#  Compila o stub GuttyAgenteSetup.exe via Inno Setup.
#
#  Pre-requisito (instalar uma vez):
#    Inno Setup 6.1 ou mais novo: choco install innosetup -y
#                                  ou: https://jrsoftware.org/isdl.php
#
#  Nao precisa de plugin externo — usamos CreateDownloadPage() nativo
#  do Inno Setup 6.1+ (WinHTTP embutido).
#
#  Uso:
#    powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
#
#  Saida: ..\bin\GuttyAgenteSetup.exe (~3-5 MB)
# =====================================================================

$ErrorActionPreference = 'Stop'

# Localiza iscc.exe (Inno Setup Compiler).
$iscc = $null
foreach ($p in @(
  'C:\Program Files (x86)\Inno Setup 6\iscc.exe',
  'C:\Program Files\Inno Setup 6\iscc.exe'
)) {
  if (Test-Path $p) { $iscc = $p; break }
}

if (-not $iscc) {
  # Tenta no PATH.
  $cmd = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if ($cmd) { $iscc = $cmd.Source }
}

if (-not $iscc) {
  Write-Host ""
  Write-Host "ERRO: Inno Setup 6 nao encontrado." -ForegroundColor Red
  Write-Host ""
  Write-Host "Instale com Chocolatey:"
  Write-Host "  choco install innosetup -y"
  Write-Host ""
  Write-Host "Ou baixe de:"
  Write-Host "  https://jrsoftware.org/isdl.php"
  Write-Host ""
  exit 1
}

# Compila
$here    = Split-Path $MyInvocation.MyCommand.Definition -Parent
$issFile = Join-Path $here 'GuttyAgente.iss'

if (-not (Test-Path $issFile)) {
  Write-Host "ERRO: $issFile nao existe." -ForegroundColor Red
  exit 1
}

Write-Host "Compilando $issFile..." -ForegroundColor Cyan

$payloadUrl = $env:GUTTY_PAYLOAD_URL
if ($payloadUrl) {
  Write-Host "  Payload URL override: $payloadUrl" -ForegroundColor DarkGray
  & $iscc "/DPAYLOAD_URL=$payloadUrl" $issFile
} else {
  & $iscc $issFile
}

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "iscc falhou (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}

$out = Join-Path (Split-Path $here -Parent) 'bin\GuttyAgenteSetup.exe'
if (Test-Path $out) {
  $sizeMb = [Math]::Round((Get-Item $out).Length / 1MB, 2)
  Write-Host ""
  Write-Host "OK -> $out ($sizeMb MB)" -ForegroundColor Green
  Write-Host ""
  Write-Host "Proximos passos:"
  Write-Host "  1) Subir bin\agente-payload.zip pro GitHub Releases (tag 'latest')"
  Write-Host "  2) Subir bin\GuttyAgenteSetup.exe pro mesmo release"
  Write-Host "  3) PDV ja resolve a URL via /api/tef/installer/info"
} else {
  Write-Host "AVISO: iscc terminou mas nao achei o arquivo de saida em $out" -ForegroundColor Yellow
}
