/**
 * Diagnostico de problemas EXTERNOS — coisas que nao sao bug nosso mas
 * impedem o agente de funcionar:
 *
 *  1. Windows Defender ativo SEM exclusao da nossa pasta → vai
 *     quarentinar a CliSiTef64I.dll (heuristica). Mostra tutorial visual.
 *
 *  2. Outro processo ouvindo porta 443 (IIS, Skype, Hyper-V) → conflito
 *     de bind. Mostra qual processo e como parar.
 *
 *  3. SitDemo nao aberto (em homologacao) → agente sobe mas DLL CliSiTef
 *     fica em estado limbo. Mostra alerta info (nao bloqueia install).
 *
 * Esse diagnostico roda em loop pela UI (polling 5s) — sem admin.
 * O fix de cada problema, esse sim, pode precisar admin.
 */

import { existsSync } from 'node:fs';
import { INSTALL_DIR } from './paths';
import { exec, pwsh } from './util';

export interface DiagnosticoExterno {
  /** Status do Windows Defender em relacao ao agente */
  defender: {
    /** Real Time Protection ligada? */
    ativo: boolean;
    /** Nossa pasta esta na lista de exclusoes? */
    pastaExcluida: boolean;
    /** ZeroOuMaisCaminhos de Threats detectadas em nossa DLL? */
    quarentenaDetectada: boolean;
    /** Veredito: Defender vai atrapalhar? */
    vaiAtrapalhar: boolean;
  };
  /** Porta 443 livre ou ocupada por terceiro? */
  porta443: {
    livre: boolean;
    /** Se ocupada, qual processo (nome)? */
    processoOutro?: string;
    /** Se ocupada e nao e nosso */
    bloqueada: boolean;
  };
  /** SitDemo (servidor de homologacao SiTef) esta rodando? */
  sitdemo: {
    rodando: boolean;
  };
}

async function diagnosticarDefender(): Promise<DiagnosticoExterno['defender']> {
  // Get-MpComputerStatus + Get-MpPreference + Get-MpThreatDetection
  // O agente roda no GuttyAgente (sem admin) — Get-Mp* funciona como user.
  let ativo = false;
  let pastaExcluida = false;
  let quarentenaDetectada = false;

  try {
    const r = await pwsh(
      `(Get-MpComputerStatus).RealTimeProtectionEnabled`
    );
    ativo = /True/i.test(r.stdout);
  } catch {
    /* sem MpStatus = sem defender ou sem perm */
  }

  try {
    const r = await pwsh(
      `(Get-MpPreference).ExclusionPath -contains '${INSTALL_DIR.replace(/'/g, "''")}'`
    );
    pastaExcluida = /True/i.test(r.stdout);
  } catch {
    /* idem */
  }

  try {
    const r = await pwsh(
      `(Get-MpThreatDetection -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.Resources -match 'CliSiTef|Gutty' } | ` +
        `Measure-Object).Count`
    );
    quarentenaDetectada = parseInt(r.stdout.trim(), 10) > 0;
  } catch {
    /* idem */
  }

  // Vai atrapalhar se: Defender ATIVO e pasta NAO esta excluida.
  // Se a pasta esta excluida, mesmo Defender ativo nao escaneia.
  const vaiAtrapalhar = ativo && !pastaExcluida;

  return { ativo, pastaExcluida, quarentenaDetectada, vaiAtrapalhar };
}

async function diagnosticarPorta443(): Promise<DiagnosticoExterno['porta443']> {
  const r = await exec('netstat', ['-ano', '-p', 'tcp'], { ignoreErr: true });
  if (r.code !== 0) return { livre: false, bloqueada: false };

  const listening = r.stdout
    .split(/\r?\n/)
    .filter((l) => /:443\s+0\.0\.0\.0:0\s+LISTENING\s+\d+/.test(l));

  if (listening.length === 0) return { livre: true, bloqueada: false };

  const m = /LISTENING\s+(\d+)/.exec(listening[0]);
  const pid = m ? parseInt(m[1], 10) : 0;
  if (!pid) return { livre: false, bloqueada: false };

  const t = await exec(
    'tasklist',
    ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
    { ignoreErr: true }
  );
  const imageMatch = /^"([^"]+)"/.exec(t.stdout.trim());
  const processo = imageMatch ? imageMatch[1] : 'desconhecido';
  const ehNosso = /agenteCliSiTef|nssm/i.test(processo);

  return {
    livre: false,
    processoOutro: ehNosso ? undefined : processo,
    bloqueada: !ehNosso,
  };
}

async function diagnosticarSitDemo(): Promise<DiagnosticoExterno['sitdemo']> {
  const r = await exec(
    'tasklist',
    ['/FI', 'IMAGENAME eq SitDemo.exe', '/FO', 'CSV', '/NH'],
    { ignoreErr: true }
  );
  const rodando = r.code === 0 && !r.stdout.includes('INFO:') && r.stdout.trim().length > 0;
  return { rodando };
}

export async function coletarDiagnosticoExterno(): Promise<DiagnosticoExterno> {
  const [defender, porta443, sitdemo] = await Promise.all([
    diagnosticarDefender(),
    diagnosticarPorta443(),
    diagnosticarSitDemo(),
  ]);
  return { defender, porta443, sitdemo };
}

// Marker pra evitar warning de unused
void existsSync;
