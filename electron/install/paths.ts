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
