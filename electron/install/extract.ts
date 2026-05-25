import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { AGENT_DIR, AGENT_EXE, INSTALL_DIR } from './paths';

/**
 * Localiza o ZIP do agente SE dentro dos recursos do Electron empacotado.
 * Em dev (não empacotado), procura em `assets/payload/`.
 */
export function localizarPayloadZip(): string | null {
  const candidates: string[] = [];

  // 1) Resources do Electron empacotado (extraResources do electron-builder)
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'payload'));
  }

  // 2) Dev sem empacotar — vários candidatos cobrindo diferentes layouts
  candidates.push(join(app.getAppPath(), 'assets', 'payload'));
  // dist/electron/install -> sobe 3 níveis até a raiz do gutty-tef-installer-gui
  candidates.push(join(__dirname, '..', '..', '..', 'assets', 'payload'));
  candidates.push(join(__dirname, '..', '..', 'assets', 'payload'));
  // process.cwd quando rodado via `electron .`
  candidates.push(join(process.cwd(), 'assets', 'payload'));

  /* eslint-disable no-console */
  console.log('[extract] procurando payload em:');
  for (const dir of candidates) console.log('  -', dir);

  for (const dir of candidates) {
    if (!existsSync(dir)) {
      console.log('[extract] nao existe:', dir);
      continue;
    }
    const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip'));
    console.log(`[extract] ${dir}: ${files.length} zip(s) — ${files.join(', ')}`);
    if (files.length > 0) {
      const simulado = files.find((f) => /simulado/i.test(f));
      const escolhido = join(dir, simulado ?? files[0]);
      console.log('[extract] usando:', escolhido);
      return escolhido;
    }
  }
  return null;
}

export function extrairAgente(zipPath: string): { destino: string; arquivos: number } {
  if (!existsSync(zipPath)) throw new Error(`ZIP nao encontrado: ${zipPath}`);

  mkdirSync(INSTALL_DIR, { recursive: true });
  mkdirSync(AGENT_DIR, { recursive: true });

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const firstDir = entries[0]?.entryName.split(/[/\\]/)[0] ?? '';
  const stripPrefix = entries.every((e) => e.entryName.startsWith(`${firstDir}/`));

  let count = 0;
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = stripPrefix ? e.entryName.slice(firstDir.length + 1) : e.entryName;
    if (!rel) continue;
    const dest = join(AGENT_DIR, rel.replace(/\//g, '\\'));
    mkdirSync(dirname(dest), { recursive: true });
    zip.extractEntryTo(e, dirname(dest), false, true);
    count++;
  }

  if (!existsSync(AGENT_EXE)) {
    throw new Error(`agenteCliSiTef.exe nao encontrado apos extracao em ${AGENT_EXE}`);
  }

  return { destino: AGENT_DIR, arquivos: count };
}
