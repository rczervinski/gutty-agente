/**
 * Bandeja do sistema (system tray) do Gutty Agente.
 *
 * Comportamento:
 *  - Clique no icone: mostra/oculta a janela principal
 *  - Clique direito: menu com Abrir / Sair
 *  - Janela "fechada" (X): minimiza pra bandeja (nao mata o processo)
 *  - Quit real apenas via menu "Sair" da bandeja
 *
 * O icone vem de renderer/assets/icon.ico (multi-size: 16,24,32,48,64,128,256).
 * Em packaging (electron-packager) ele cai em <resources>/app/renderer/assets/.
 * Em dev cai em ../renderer/assets/.
 */

import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

let tray: Tray | null = null;
let saidaConfirmada = false;

export function tudoQueremSair(): boolean {
  return saidaConfirmada;
}

/**
 * Resolve o caminho do icone. Tenta varios candidatos pra cobrir dev e
 * packaged. Prefere .ico (Windows lida nativo, multi-size pra DPI).
 */
function resolverIcone(): Electron.NativeImage {
  const candidatos = [
    join(__dirname, '..', 'renderer', 'assets', 'icon.ico'),
    join(__dirname, '..', 'renderer', 'assets', 'icon-32.png'),
    join(__dirname, '..', '..', 'renderer', 'assets', 'icon.ico'),
    join(__dirname, '..', '..', 'renderer', 'assets', 'icon-32.png'),
    join(process.resourcesPath ?? '', 'renderer', 'assets', 'icon.ico'),
    join(process.resourcesPath ?? '', 'app', 'renderer', 'assets', 'icon.ico'),
  ];

  for (const p of candidatos) {
    if (p && existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }

  console.warn('[tray] icone nao encontrado:', candidatos);
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVQ4y2NgGAWjYBSMglEwCkbBKBgFo2AUjILBDgAGagABaqj0pAAAAABJRU5ErkJggg==',
      'base64'
    )
  );
}

export function criarTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;

  const icone = resolverIcone();
  tray = new Tray(icone);
  tray.setToolTip('Gutty Agente');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Gutty Agente',
      click: () => {
        const w = getMainWindow();
        if (w) {
          if (w.isMinimized()) w.restore();
          w.show();
          w.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        saidaConfirmada = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);

  tray.on('click', () => {
    const w = getMainWindow();
    if (!w) return;
    if (w.isVisible() && !w.isMinimized()) {
      w.hide();
    } else {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });

  tray.on('double-click', () => {
    const w = getMainWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  return tray;
}

export function destruirTray(): void {
  tray?.destroy();
  tray = null;
}
