/**
 * Processo principal do Gutty Agente.
 *
 * Diferenca pra versao antiga (Gutty TEF Setup):
 *  - Roda permanente (nao e mais um wizard descartavel).
 *  - Janela com sidebar (abas: TEF, Impressoras, Balancas).
 *  - Tray icon ao lado do relogio, single instance, autostart.
 *  - Argumento --tray sobe minimizado (usado no startup do Windows).
 *  - Fechar (X) minimiza pra tray; Sair real so via menu da bandeja.
 *
 * Privilegios:
 *  - Roda como user (sem admin).
 *  - Quando o usuario pede instalar/parar servico TEF, elevamos via
 *    'runas' a partir do orquestrador.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { AmbienteApi, PairConfig, ProgressoInstalacao } from './shared-types';
import { buscarConfigPosLogin, consumirToken, login } from './install/api';
import { instalar, isAdmin } from './install/orquestrador';
import { criarTray, tudoQueremSair } from './tray';

const VERSAO_APP = '1.0.0';

let mainWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------
// Argumentos CLI
// ---------------------------------------------------------------------

function temFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getTokenFromArgs(): string | null {
  for (const a of process.argv) {
    const m = /^--token=(.+)$/.exec(a);
    if (m) return m[1];
  }
  return null;
}

const bootMinimizadoPraTray = temFlag('--tray');

// ---------------------------------------------------------------------
// Autostart (HKCU\...\Run) — espelha o que o instalador Inno fez,
// permite togglar via UI.
// ---------------------------------------------------------------------

function estaAutostart(): boolean {
  return app.getLoginItemSettings({ args: ['--tray'] }).openAtLogin;
}

function setAutostart(habilitar: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: habilitar,
    name: 'GuttyAgente',
    args: ['--tray'],
  });
}

// ---------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------

function criarJanela(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    title: 'Gutty Agente',
    autoHideMenuBar: true,
    show: !bootMinimizadoPraTray,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));

  // Fechar (X) minimiza pra tray, nao mata o processo. So sai via menu da tray.
  mainWindow.on('close', (e) => {
    if (!tudoQueremSair()) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.GUTTY_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ---------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------

app.whenReady().then(() => {
  registrarIpcHandlers();
  criarTray(() => mainWindow);

  // Sempre cria a janela. Se vier --tray, ela ja sobe oculta (show:false).
  criarJanela();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

// Diferente do instalador antigo: NAO encerramos no window-all-closed.
// Sair so via menu da tray (que setou saidaConfirmada=true antes de quit).
app.on('window-all-closed', () => {
  // No-op: tray mantem o processo vivo.
});

// ---------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------

function registrarIpcHandlers(): void {
  ipcMain.handle('gutty:versao', () => VERSAO_APP);

  ipcMain.handle('gutty:isAdmin', () => isAdmin());

  ipcMain.handle('gutty:tokenInicial', () => getTokenFromArgs());

  // --- TEF / pareamento (mantido) ---
  ipcMain.handle('gutty:parearComToken', async (_e, token: string, ambiente: AmbienteApi) => {
    return consumirToken(token, ambiente);
  });

  ipcMain.handle('gutty:login', async (_e, nome: string, senha: string, ambiente: AmbienteApi) => {
    return login(nome, senha, ambiente);
  });

  ipcMain.handle('gutty:buscarConfigPosLogin', async (_e, jwt: string, ambiente: AmbienteApi) => {
    return buscarConfigPosLogin(jwt, ambiente);
  });

  ipcMain.handle('gutty:instalar', async (_e, config: PairConfig, tenantId: string) => {
    const emit = (p: ProgressoInstalacao): void => {
      mainWindow?.webContents.send('gutty:progresso', p);
    };
    return instalar(config, tenantId, emit);
  });

  // --- Janela ---
  ipcMain.handle('gutty:minimizarPraTray', () => {
    mainWindow?.hide();
  });

  // --- Autostart ---
  ipcMain.handle('gutty:autostartEstado', () => estaAutostart());
  ipcMain.handle('gutty:autostartSet', (_e, habilitar: boolean) => {
    setAutostart(habilitar);
    return estaAutostart();
  });
}
