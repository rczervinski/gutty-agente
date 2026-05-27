/**
 * Coleta diagnostico detalhado quando a instalacao/start do agente falha.
 *
 * Em vez de devolver "servico parado", devolvemos:
 *   - Quem esta usando porta 443 (se nao for nosso agente)
 *   - Estado completo do servico via `sc qc`
 *   - Ultimas linhas do log do agente (se existir)
 *   - Eventos recentes do Event Log relacionados ao AgenteCliSiTef
 *
 * Roda como admin (chamado pelo helper elevado quando ja eleva).
 */

import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENT_DIR, SERVICE_NAME } from './paths';
import { exec, pwsh } from './util';

export interface DiagnosticoDetalhado {
  /** Resumo legivel pra mostrar no erro */
  resumo: string;
  /** Quem usa 443? "ours" / "outro" / "ninguem" */
  porta443: { ocupada: boolean; processo?: string; pid?: number; ehNosso: boolean };
  /** Output bruto de `sc qc AgenteCliSiTef` */
  servicoConfig?: string;
  /** Ultimas linhas do log mais recente do agente */
  logTrecho?: string;
  /** Eventos recentes do Event Log */
  eventosRecentes?: string;
}

/**
 * netstat pra ver quem ouve 443. Retorna PID e nome do processo.
 */
async function checarPorta443(): Promise<DiagnosticoDetalhado['porta443']> {
  const r = await exec('netstat', ['-ano', '-p', 'tcp'], { ignoreErr: true });
  if (r.code !== 0) return { ocupada: false, ehNosso: false };

  // Linhas do tipo:
  //   TCP    0.0.0.0:443    0.0.0.0:0    LISTENING    1234
  const listening = r.stdout
    .split(/\r?\n/)
    .filter((l) => /:443\s+0\.0\.0\.0:0\s+LISTENING\s+\d+/.test(l));

  if (listening.length === 0) return { ocupada: false, ehNosso: false };

  const m = /LISTENING\s+(\d+)/.exec(listening[0]);
  const pid = m ? parseInt(m[1], 10) : 0;
  if (!pid) return { ocupada: true, ehNosso: false };

  const t = await exec(
    'tasklist',
    ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
    { ignoreErr: true }
  );
  // tasklist CSV: "imageName","PID","SessionName","SessionNumber","MemUsage"
  const imageMatch = /^"([^"]+)"/.exec(t.stdout.trim());
  const processo = imageMatch ? imageMatch[1] : 'desconhecido';
  const ehNosso = /agenteCliSiTef/i.test(processo);
  return { ocupada: true, processo, pid, ehNosso };
}

/**
 * Le ultimas linhas do log mais recente. Procura em varios candidatos
 * (a SE muda o local entre versoes).
 */
async function lerLogRecente(): Promise<string | undefined> {
  if (!existsSync(AGENT_DIR)) return undefined;
  const candidatos: string[] = [];
  // Walker simples — so profundidade 2 (suficiente)
  try {
    const nivel1 = await readdir(AGENT_DIR);
    for (const a of nivel1) {
      const p1 = join(AGENT_DIR, a);
      try {
        const st1 = await stat(p1);
        if (st1.isDirectory()) {
          for (const b of await readdir(p1)) {
            if (/\.log$/i.test(b)) candidatos.push(join(p1, b));
          }
        } else if (/\.log$/i.test(a)) {
          candidatos.push(p1);
        }
      } catch {
        /* ignora */
      }
    }
  } catch {
    return undefined;
  }
  if (candidatos.length === 0) return undefined;

  // Pega o mais recente
  let maisRecente = candidatos[0];
  let maxMtime = 0;
  for (const c of candidatos) {
    try {
      const st = await stat(c);
      if (st.mtimeMs > maxMtime) {
        maxMtime = st.mtimeMs;
        maisRecente = c;
      }
    } catch {
      /* ignora */
    }
  }

  try {
    const conteudo = readFileSync(maisRecente, 'utf-8').split(/\r?\n/);
    const ultimas = conteudo.slice(-15).join('\n');
    return `${maisRecente}:\n${ultimas}`;
  } catch {
    return undefined;
  }
}

async function lerEventosRecentes(): Promise<string | undefined> {
  // Busca eventos recentes (ultimos 5 min) que mencionem o servico
  const r = await pwsh(
    `Get-EventLog -LogName System -Newest 50 -ErrorAction SilentlyContinue | ` +
      `Where-Object { $_.Message -match '${SERVICE_NAME}' -or $_.Source -match 'Service' } | ` +
      `Select-Object -First 5 TimeGenerated, EntryType, Source, Message | Format-List`
  );
  if (r.code !== 0 || !r.stdout.trim()) return undefined;
  return r.stdout.trim().split(/\r?\n/).slice(0, 40).join('\n');
}

export async function coletarDiagnostico(): Promise<DiagnosticoDetalhado> {
  const porta443 = await checarPorta443();
  const sc = await exec('sc.exe', ['qc', SERVICE_NAME], { ignoreErr: true });
  const log = await lerLogRecente();
  const eventos = await lerEventosRecentes();

  const partes: string[] = [];
  if (porta443.ocupada && !porta443.ehNosso) {
    partes.push(
      `Porta 443 ocupada por "${porta443.processo}" (PID ${porta443.pid}). ` +
        `O servico AgenteCliSiTef precisa dessa porta — feche esse programa ` +
        `(geralmente IIS, Skype, Hyper-V ou outro web server local).`
    );
  } else if (porta443.ocupada && porta443.ehNosso) {
    partes.push('Porta 443 ja esta sendo usada pelo agente (provavelmente um processo orfao).');
  } else {
    partes.push('Porta 443 livre.');
  }

  if (log) {
    partes.push('Log do agente:\n' + log);
  } else {
    partes.push('Nenhum log do agente encontrado.');
  }

  if (eventos) {
    partes.push('Eventos recentes:\n' + eventos);
  }

  return {
    resumo: partes.join('\n\n'),
    porta443,
    servicoConfig: sc.stdout,
    logTrecho: log,
    eventosRecentes: eventos,
  };
}
