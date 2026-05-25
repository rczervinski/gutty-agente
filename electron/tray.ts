/**
 * Bandeja do sistema (system tray) do Gutty Agente.
 *
 * Comportamento:
 *  - Clique no icone: mostra/oculta a janela principal
 *  - Clique direito: menu com Abrir / Sair
 *  - Janela "fechada" (X): minimiza pra bandeja (nao mata o processo)
 *  - Quit real apenas via menu "Sair" da bandeja
 *
 * O icone vem do app.asar (renderer/assets/icon.png). Em dev, cai em
 * fallback transparente pra nao quebrar.
 */

import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

let tray: Tray | null = null;

/** Reta se janela principal deveria fechar pra valer (chamado pelo menu Sair). */
let saidaConfirmada = false;

export function tudoQueremSair(): boolean {
  return saidaConfirmada;
}

function resolverIcone(): Electron.NativeImage {
  // Caminhos possiveis dependendo de packed vs dev
  const candidatos = [
    join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
    join(__dirname, '..', '..', 'renderer', 'assets', 'icon.png'),
    join(process.resourcesPath, 'renderer', 'assets', 'icon.png'),
  ];
  for (const p of candidatos) {
    if (existsSync(p)) return nativeImage.createFromPath(p);
  }
  // Fallback: 16x16 quadrado verde (visivel ate termos icone)
  return nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAH0lEQVQ4y2NgGAWjYBSMglEwCkbBKBgFo2AUjILBDgAGagABaqj0pAAAAABJRU5ErkJggg==',
      'base64'
    )
  );
}

export function criarTray(getMainWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray;

  tray = new Tray(resolverIcone());
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

  // Clique simples = toggle janela
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

  return tray;
}

export function destruirTray(): void {
  tray?.destroy();
  tray = null;
}
