import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const INSTALL_DIR = 'C:\\Program Files\\Gutty TEF';
export const AGENT_DIR = join(INSTALL_DIR, 'agente');
export const AGENT_BIN = join(AGENT_DIR, 'bin');
export const AGENT_EXE = join(AGENT_BIN, 'agenteCliSiTef.exe');
export const AGENT_HELPER = join(AGENT_DIR, 'helper');

export const GUTTY_CONFIG_DIR = 'C:\\ProgramData\\GuttyTef';
export const GUTTY_CONFIG_FILE = join(GUTTY_CONFIG_DIR, 'gutty.config.json');

export const AGENT_BASE_URL = 'https://127.0.0.1/agente/clisitef';

export const SERVICE_NAME = 'AgenteCliSiTef';

/** Onde nssm.exe foi instalado junto com o agente. */
export const NSSM_INSTALLED = join(AGENT_BIN, 'nssm.exe');

/**
 * Localiza nssm.exe bundlado em resources/payload (packed) ou
 * assets/payload (dev). Tente import deferido pra evitar carregar
 * electron cedo demais.
 */
export function nssmSourcePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron');
  const candidatos = [
    join(process.resourcesPath || '', 'payload', 'nssm.exe'),
    join(app.getAppPath(), 'assets', 'payload', 'nssm.exe'),
    join(__dirname, '..', '..', '..', 'assets', 'payload', 'nssm.exe'),
    join(__dirname, '..', '..', 'assets', 'payload', 'nssm.exe'),
  ];
  for (const c of candidatos) {
    if (c && existsSync(c)) return c;
  }
  throw new Error(`nssm.exe nao encontrado. Procurado em:\n  ${candidatos.join('\n  ')}`);
}
