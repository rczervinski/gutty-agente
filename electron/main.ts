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
import type { AmbienteApi, InstalacaoResultado, PairConfig, ProgressoInstalacao } from './shared-types';
import { buscarConfigPosLogin, consumirToken, login } from './install/api';
import { isAdmin } from './install/orquestrador';
import { instalarComElevacao, processarFlagInstalacaoElevada } from './install/elevate';
import { verificarStatusTef } from './install/status';
import { apagarSessao, carregarSessao, salvarSessao, type SessaoGutty } from './session';
import type { SessaoSnapshot } from './shared-types';
import { criarTray, tudoQueremSair } from './tray';

// =====================================================================
// Modo "helper elevado": se foi invocado com --install-tef <cfg>,
// roda a instalacao e sai. NAO cria janela nem tray.
// (Esse processo e o que sobe via UAC quando o user clica em Instalar.)
// =====================================================================
const ehHelperElevado = processarFlagInstalacaoElevada();

const VERSAO_APP = '1.0.0';

let mainWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------
// Single instance — pulado quando rodando como helper elevado, porque
// o app principal (user) ja tem o lock.
// ---------------------------------------------------------------------
const gotLock = ehHelperElevado ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else if (!ehHelperElevado) {
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
  // Modo helper elevado: nao cria UI, deixa o elevate.ts cuidar.
  if (ehHelperElevado) return;

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

  // Mutex global pra evitar 2 instalacoes simultaneas. Bug grave: o user
  // clicando "Instalar" 2x (UAC demorou, ansiedade) fazia 2 helpers UAC
  // subirem, o segundo detectava install do primeiro e apagava a DLL
  // recem-extraida.
  let instalacaoEmCurso = false;
  async function runInstall(
    config: PairConfig,
    tenantId: string,
    resetAntes: boolean
  ): Promise<InstalacaoResultado> {
    if (instalacaoEmCurso) {
      return {
        ok: false,
        erro: 'Ja existe uma instalacao em andamento. Aguarde concluir.',
      };
    }
    instalacaoEmCurso = true;
    try {
      const emit = (p: ProgressoInstalacao): void => {
        mainWindow?.webContents.send('gutty:progresso', p);
      };
      return await instalarComElevacao(config, tenantId, emit, isAdmin(), resetAntes);
    } finally {
      instalacaoEmCurso = false;
    }
  }

  ipcMain.handle('gutty:instalar', async (_e, config: PairConfig, tenantId: string) => {
    return runInstall(config, tenantId, false);
  });

  // --- Sessao persistente ---
  function snapshot(s: SessaoGutty | null): SessaoSnapshot | null {
    if (!s) return null;
    return {
      ambiente: s.ambiente,
      tenantId: s.tenantId,
      nome: s.nome,
      configTef: s.configTef,
    };
  }

  ipcMain.handle('gutty:sessaoAtual', () => snapshot(carregarSessao()));

  ipcMain.handle('gutty:sessaoLogout', () => {
    apagarSessao();
  });

  ipcMain.handle(
    'gutty:sessaoLoginToken',
    async (_e, token: string, ambiente: AmbienteApi): Promise<SessaoSnapshot | null> => {
      const r = await consumirToken(token, ambiente);
      if (!r.ok) return null;
      const sessao: SessaoGutty = {
        ambiente,
        tenantId: r.tenantId,
        // No fluxo de token, nao temos JWT — so config. Marcamos com
        // string vazia pra indicar "sessao via token, sem refetch".
        authCookie: '',
        configTef: r.config,
        salvaEm: new Date().toISOString(),
      };
      salvarSessao(sessao);
      return snapshot(sessao);
    }
  );

  ipcMain.handle(
    'gutty:sessaoLoginGutty',
    async (_e, nome: string, senha: string, ambiente: AmbienteApi) => {
      const l = await login(nome, senha, ambiente);
      if (!l.ok) return { ok: false, erro: l.erro };
      const c = await buscarConfigPosLogin(l.token, ambiente);
      if (!c.ok) return { ok: false, erro: c.erro };
      const sessao: SessaoGutty = {
        ambiente,
        tenantId: c.tenantId,
        authCookie: l.token,
        nome,
        configTef: c.config,
        salvaEm: new Date().toISOString(),
      };
      salvarSessao(sessao);
      return { ok: true, sessao: snapshot(sessao)! };
    }
  );

  ipcMain.handle('gutty:sessaoRecarregarConfig', async (): Promise<SessaoSnapshot | null> => {
    const atual = carregarSessao();
    if (!atual || !atual.authCookie) return snapshot(atual);
    const c = await buscarConfigPosLogin(atual.authCookie, atual.ambiente);
    if (!c.ok) return snapshot(atual);
    const novo: SessaoGutty = {
      ...atual,
      tenantId: c.tenantId,
      configTef: c.config,
      salvaEm: new Date().toISOString(),
    };
    salvarSessao(novo);
    return snapshot(novo);
  });

  // --- Diagnostico TEF ---
  ipcMain.handle('gutty:tefStatus', async () => verificarStatusTef());

  ipcMain.handle(
    'gutty:tefReinstalar',
    async (_e, config: PairConfig, tenantId: string) => {
      return runInstall(config, tenantId, true);
    }
  );

  ipcMain.handle('gutty:tefDiagnostico', async (): Promise<string> => {
    // Importacao tardia pra evitar carregar tudo no boot
    const { coletarDiagnostico } = await import('./install/diagnostico');
    const { verificarStatusTef } = await import('./install/status');
    const status = await verificarStatusTef();
    const diag = await coletarDiagnostico();
    const linhas: string[] = [
      '=== GUTTY AGENTE — DIAGNOSTICO TEF ===',
      `gerado em: ${new Date().toISOString()}`,
      '',
      '--- STATUS ---',
      `tudoOk: ${status.tudoOk}`,
      `pastaInstalada: ${status.detalhes.pastaInstalada}`,
      `servicoExiste: ${status.detalhes.servicoExiste}`,
      `servicoRodando: ${status.detalhes.servicoRodando}`,
      `processosAtivos: ${status.detalhes.processosAtivos}`,
      `httpsResponde: ${status.detalhes.httpsResponde}`,
      `dllInicializada: ${status.detalhes.dllInicializada}`,
      `versaoAgente: ${status.detalhes.versaoAgente ?? '?'}`,
      `versaoClisitef: ${status.detalhes.versaoClisitef ?? '?'}`,
      '',
      '--- PROBLEMAS ---',
      ...status.problemas.map((p) => `  - ${p}`),
      '',
      '--- PORTA 443 ---',
      `ocupada: ${diag.porta443.ocupada}`,
      `processo: ${diag.porta443.processo ?? '(nenhum)'}`,
      `pid: ${diag.porta443.pid ?? '-'}`,
      `ehAgenteNosso: ${diag.porta443.ehNosso}`,
      '',
      '--- SERVICO (sc qc) ---',
      diag.servicoConfig ?? '(nao disponivel)',
      '',
      '--- LOG DO AGENTE (ultimas linhas) ---',
      diag.logTrecho ?? '(nao encontrado)',
      '',
      '--- LOG NSSM (stdout/stderr do servico) ---',
      // O diagnostico devolve o resumo com nssm — extrai usando regex
      /(?:^|\n)Log NSSM[^]*?(?=\n\nEventos recentes:|$)/.exec(diag.resumo)?.[0]?.trim() ??
        '(nao encontrado)',
      '',
      '--- EVENT LOG ---',
      diag.eventosRecentes ?? '(sem eventos relacionados)',
    ];
    return linhas.join('\n');
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
