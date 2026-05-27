/**
 * Diagnostico TEF — verifica se o agente esta REALMENTE funcionando.
 *
 * Em vez de uma flag "instalado=true", checa 5 sinais ortogonais:
 *   1. Servico Windows AgenteCliSiTef existe e esta RUNNING
 *   2. Apenas 1 processo agenteCliSiTef.exe (sem zumbis)
 *   3. HTTPS local (https://127.0.0.1/agente/clisitef/state) responde
 *   4. serviceStatus do agente == 0 (DLL inicializou)
 *   5. Cert da CA "Gutty TEF" no trust store
 *
 * Se algum falha, retorna lista de problemas e marca podeReinstalar=true.
 *
 * Roda como user (nao precisa admin pra LER status — apenas o reset+install).
 */

import { existsSync } from 'node:fs';
import { AGENT_EXE, INSTALL_DIR, SERVICE_NAME } from './paths';
import { exec, pwsh } from './util';
import { validarAgente } from './validate';

export interface StatusTef {
  /** True = ta tudo OK e venda passa. False = algum problema na lista. */
  tudoOk: boolean;
  /** Lista descritiva pra mostrar pro user. */
  problemas: string[];
  detalhes: {
    pastaInstalada: boolean;
    servicoExiste: boolean;
    servicoRodando: boolean;
    processosAtivos: number;
    httpsResponde: boolean;
    dllInicializada: boolean;
    versaoAgente?: string;
    versaoClisitef?: string;
  };
}

/**
 * Conta quantos processos agenteCliSiTef.exe estao ativos.
 */
async function contarProcessos(): Promise<number> {
  // tasklist.exe e mais rapido que Get-Process em PowerShell
  const r = await exec(
    'tasklist',
    ['/FI', 'IMAGENAME eq agenteCliSiTef.exe', '/FO', 'CSV', '/NH'],
    { ignoreErr: true }
  );
  if (r.code !== 0 || !r.stdout) return 0;
  // tasklist retorna "INFO: ..." se nada bate, ou 1 linha CSV por processo
  if (r.stdout.includes('INFO:')) return 0;
  return r.stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('"')).length;
}

/**
 * Checa se servico AgenteCliSiTef esta RUNNING via `sc query`.
 */
async function checarServico(): Promise<{ existe: boolean; rodando: boolean }> {
  const r = await exec('sc', ['query', SERVICE_NAME], { ignoreErr: true });
  if (r.code !== 0) return { existe: false, rodando: false };
  // Saida tipica:
  //   STATE              : 4  RUNNING
  // ou STATE             : 1  STOPPED
  const rodando = /STATE\s+:\s+4\s+RUNNING/i.test(r.stdout);
  return { existe: true, rodando };
}

/**
 * Checa se cert "Gutty TEF" esta no trust store (CurrentUser\Root).
 */
async function checarCert(): Promise<boolean> {
  const r = await pwsh(
    `(Get-ChildItem Cert:\\CurrentUser\\Root -ErrorAction SilentlyContinue | ` +
      `Where-Object { $_.Subject -match 'Gutty TEF' }).Count`
  );
  if (r.code !== 0) return false;
  return parseInt(r.stdout.trim(), 10) > 0;
}

export async function verificarStatusTef(): Promise<StatusTef> {
  const problemas: string[] = [];

  const pastaInstalada = existsSync(AGENT_EXE);
  if (!pastaInstalada) {
    return {
      tudoOk: false,
      problemas: ['Agente TEF nao esta instalado neste PC'],
      detalhes: {
        pastaInstalada: false,
        servicoExiste: false,
        servicoRodando: false,
        processosAtivos: 0,
        httpsResponde: false,
        dllInicializada: false,
      },
    };
  }

  const [{ existe: servicoExiste, rodando: servicoRodando }, processosAtivos, certOk] =
    await Promise.all([checarServico(), contarProcessos(), checarCert()]);

  if (!servicoExiste) problemas.push('Servico Windows "AgenteCliSiTef" nao existe');
  else if (!servicoRodando) problemas.push('Servico "AgenteCliSiTef" parado');

  if (processosAtivos > 1) {
    problemas.push(
      `${processosAtivos} processos agenteCliSiTef.exe rodando (deveria ser 1) — zumbis ativos`
    );
  } else if (processosAtivos === 0 && servicoRodando) {
    problemas.push('Servico marca RUNNING mas processo nao esta vivo');
  }

  if (!certOk) {
    problemas.push('Certificado CA "Gutty TEF" nao encontrado no trust root do Windows');
  }

  // Valida HTTPS local — mesma logica do validate.ts do install.
  // Se servico nao roda, nem tenta (poupa timeout de 8s).
  let httpsResponde = false;
  let dllInicializada = false;
  let versaoAgente: string | undefined;
  let versaoClisitef: string | undefined;
  if (servicoRodando) {
    const v = await validarAgente();
    httpsResponde = !!v.serviceVersion || v.ok;
    dllInicializada = v.ok;
    versaoAgente = v.serviceVersion;
    versaoClisitef = v.clisitefVersion;
    if (!v.ok) {
      problemas.push(`HTTPS local nao respondeu OK: ${v.erro ?? 'erro desconhecido'}`);
    }
  } else {
    problemas.push('Servico parado — HTTPS local nao pode ser testado');
  }

  return {
    tudoOk: problemas.length === 0,
    problemas,
    detalhes: {
      pastaInstalada,
      servicoExiste,
      servicoRodando,
      processosAtivos,
      httpsResponde,
      dllInicializada,
      versaoAgente,
      versaoClisitef,
    },
  };
}

// silence unused
void INSTALL_DIR;
