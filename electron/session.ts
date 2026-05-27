/**
 * Sessao Gutty persistente — login uma vez, vale ate o user fazer logout.
 *
 * Armazenamento:
 *   <app.getPath('userData')>\session.bin
 *
 * Criptografado com Electron `safeStorage` (DPAPI no Windows, vinculado ao
 * perfil do usuario logado). Outro user na mesma maquina nao consegue
 * descriptografar. Se o user trocar de perfil/conta, sessao fica ilegivel
 * e o app pede login de novo.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AmbienteApi, PairConfig } from './shared-types';

export interface SessaoGutty {
  ambiente: AmbienteApi;
  tenantId: string;
  /** Cookie AUTH_TOKEN (JWT) usado pra chamar /api/* autenticado */
  authCookie: string;
  /** Pra mostrar "Olá, X" na UI */
  nome?: string;
  /** Config TEF cacheada — pode estar stale */
  configTef?: PairConfig;
  /** Quando foi salva (ISO8601) */
  salvaEm: string;
}

function caminhoSessao(): string {
  return path.join(app.getPath('userData'), 'session.bin');
}

/**
 * Salva a sessao criptografada. Idempotente — sobrescreve a anterior.
 */
export function salvarSessao(s: SessaoGutty): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Em raros casos (sistema sem DPAPI, ou usuario sem credenciais
    // configuradas), safeStorage cai. Nesse caso, NAO persistimos —
    // a sessao vive so em memoria nesse processo.
    console.warn('[session] safeStorage indisponivel — sessao nao sera persistida');
    return;
  }
  const enc = safeStorage.encryptString(JSON.stringify(s));
  const dir = path.dirname(caminhoSessao());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(caminhoSessao(), enc);
}

/**
 * Carrega a sessao salva, ou null se nao existir / falhar descriptografar.
 */
export function carregarSessao(): SessaoGutty | null {
  const p = caminhoSessao();
  if (!fs.existsSync(p)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const enc = fs.readFileSync(p);
    const raw = safeStorage.decryptString(enc);
    return JSON.parse(raw) as SessaoGutty;
  } catch (e) {
    console.warn('[session] falha ao ler sessao:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Apaga a sessao — chamado quando user clica em "Sair" / "Logout".
 */
export function apagarSessao(): void {
  const p = caminhoSessao();
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignora */
  }
}

/**
 * Atualiza apenas o configTef sem precisar refazer login. Util quando
 * a config muda no PDV (refetch via /api/tef/config).
 */
export function atualizarConfigTef(configTef: PairConfig): void {
  const atual = carregarSessao();
  if (!atual) return;
  salvarSessao({ ...atual, configTef, salvaEm: new Date().toISOString() });
}
