/**
 * Auto-elevacao UAC sem fechar o app.
 *
 * Fluxo:
 *   1. App rodando como user clica "Instalar TEF"
 *   2. Detecta !isAdmin() -> chama instalarElevado()
 *   3. Escreve config + paths de progresso/resultado num diretorio temp do user
 *   4. Spawna o proprio GuttyAgente.exe com flag --install-tef <cfgPath>
 *      via PowerShell `Start-Process -Verb RunAs` (UAC sobe AQUI)
 *   5. Processo elevado roda main.ts -> detecta a flag -> chama instalar()
 *      -> escreve progresso linha-a-linha em progress.jsonl -> resultado em result.json
 *      -> app.quit()
 *   6. Processo user faz polling de progress.jsonl pra emitir IPC pra UI
 *   7. Ao terminar, le result.json e devolve
 *
 * Vantagem: o app principal NAO fecha. UAC sobe so na hora do clique.
 * Se user negar UAC, o helper falha sem efeito colateral.
 */

import { spawn } from 'node:child_process';
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { InstalacaoResultado, PairConfig, ProgressoInstalacao } from '../shared-types';
import { instalar } from './orquestrador';
import { resetCompleto } from './reset';

type EmitProgresso = (p: ProgressoInstalacao) => void;

// =====================================================================
// Modo helper: o processo elevado entra por aqui
// =====================================================================

export interface PayloadElevado {
  config: PairConfig;
  tenantId: string;
  progressPath: string;
  resultPath: string;
  /** Se true, faz resetCompleto() ANTES de instalar (botao "Reinstalar"). */
  resetAntes?: boolean;
}

/**
 * Detecta `--install-tef <pathConfig>` no argv. Se presente, executa o
 * orquestrador e sai. Chame esse helper *cedo* no main.ts, antes de
 * criar a janela.
 */
export function processarFlagInstalacaoElevada(): boolean {
  const idx = process.argv.indexOf('--install-tef');
  if (idx < 0 || idx + 1 >= process.argv.length) return false;
  const cfgPath = process.argv[idx + 1];

  void (async () => {
    let payload: PayloadElevado | null = null;
    // Lockfile pra defesa CONTRA segunda instancia elevada paralela
    // (alem do mutex no main.ts, que pode ser bypassed se algo quebrar).
    const lockfile = path.join(os.tmpdir(), 'gutty-install.lock');
    try {
      if (fs.existsSync(lockfile)) {
        const idade = Date.now() - fs.statSync(lockfile).mtimeMs;
        if (idade < 5 * 60 * 1000) {
          // Lock recente — outra instalacao em curso. Sai sem fazer nada.
          // Como nao temos como reportar pro main (somos processo separado),
          // escrevemos no resultPath se conseguirmos ler o cfg.
          try {
            const raw = fs.readFileSync(cfgPath, 'utf8');
            const p = JSON.parse(raw) as PayloadElevado;
            fs.writeFileSync(
              p.resultPath,
              JSON.stringify({
                ok: false,
                erro: 'Outra instalacao ja esta em andamento. Aguarde concluir.',
              }),
              'utf8'
            );
          } catch {
            /* ignora */
          }
          app.quit();
          return;
        }
        // Lock velho (>5min) — provavelmente helper antigo crashou. Apaga.
        try { fs.unlinkSync(lockfile); } catch { /* ignora */ }
      }
      fs.writeFileSync(lockfile, String(process.pid), 'utf8');

      const raw = fs.readFileSync(cfgPath, 'utf8');
      payload = JSON.parse(raw) as PayloadElevado;

      const emit = (p: ProgressoInstalacao): void => {
        try {
          fs.appendFileSync(payload!.progressPath, JSON.stringify(p) + '\n', 'utf8');
        } catch {
          /* nao falha por causa de log */
        }
      };

      // Modo "Reinstalar": resetCompleto antes de instalar.
      if (payload.resetAntes) {
        emit({ passo: 0, total: 6, label: 'Resetando instalacao anterior...' });
        await resetCompleto((label, detalhe) =>
          emit({ passo: 0, total: 6, label, detalhe })
        );
      }

      const res = await instalar(payload.config, payload.tenantId, emit);
      fs.writeFileSync(payload.resultPath, JSON.stringify(res), 'utf8');
    } catch (e) {
      const erro: InstalacaoResultado = {
        ok: false,
        erro: e instanceof Error ? e.message : 'erro desconhecido no helper elevado',
      };
      if (payload?.resultPath) {
        try {
          fs.writeFileSync(payload.resultPath, JSON.stringify(erro), 'utf8');
        } catch {
          /* ignora */
        }
      }
    } finally {
      // Libera lockfile pra proxima instalacao poder rodar
      try { fs.unlinkSync(lockfile); } catch { /* ignora */ }
      app.quit();
    }
  })();

  return true;
}

// =====================================================================
// Lado user: spawna o helper elevado e tail-a progresso
// =====================================================================

function criarDirTemp(): string {
  const dir = path.join(os.tmpdir(), `gutty-install-${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Spawna `GuttyAgente.exe --install-tef <cfg>` elevado via PowerShell.
 * Resolve quando o processo elevado encerra.
 *
 * UAC negado -> child exit code != 0 -> rejeita.
 */
function spawnElevado(exePath: string, cfgPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // Padrao robusto: -PassThru retorna o objeto Process, WaitForExit()
    // garante que o ExitCode esta disponivel. Combinar -Wait com -PassThru
    // + pipe pra ExpandProperty quebra ("processo deve ser encerrado pra
    // que as informacoes solicitadas sejam determinadas").
    //
    // Aspas: usamos here-string nao precisamos. Em vez disso, montamos
    // o script PowerShell com escape correto. Quoting de caminhos com
    // espacos: encapsulamos em aspas simples PS, e escapamos aspa simples
    // duplicando ('' dentro de '...').
    const psScript = `
$ErrorActionPreference = 'Stop'
try {
  $proc = Start-Process -FilePath '${exePath.replace(/'/g, "''")}' ` +
      `-ArgumentList '--install-tef','${cfgPath.replace(/'/g, "''")}' ` +
      `-Verb RunAs -PassThru
  $proc.WaitForExit()
  exit $proc.ExitCode
} catch {
  Write-Error $_.Exception.Message
  exit 99
}`.trim();

    const child = spawn(
      'powershell',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );

    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(0);
      } else {
        const lower = stderr.toLowerCase();
        const negouUac =
          lower.includes('canceled by the user') ||
          lower.includes('cancelada pelo usu') ||
          lower.includes('operacao foi cancelada') ||
          lower.includes('operação foi cancelada');
        reject(
          new Error(
            negouUac
              ? 'UAC negado pelo usuario'
              : `Helper elevado falhou (exit ${code}): ${stderr.slice(0, 300)}`
          )
        );
      }
    });
  });
}

/**
 * Polling de progress.jsonl. Le linhas novas a cada 200ms, parse JSON,
 * chama emit pra cada uma. Devolve um stop() pra cancelar.
 */
function tailProgress(progressPath: string, emit: EmitProgresso): () => void {
  let pos = 0;
  let buf = '';
  const timer = setInterval(() => {
    try {
      const stat = fs.statSync(progressPath);
      if (stat.size <= pos) return;
      const fd = fs.openSync(progressPath, 'r');
      const len = stat.size - pos;
      const data = Buffer.alloc(len);
      fs.readSync(fd, data, 0, len, pos);
      fs.closeSync(fd);
      pos = stat.size;
      buf += data.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) {
          try {
            emit(JSON.parse(line) as ProgressoInstalacao);
          } catch {
            /* linha invalida, ignora */
          }
        }
      }
    } catch {
      /* arquivo pode nao existir ainda */
    }
  }, 200);

  return () => clearInterval(timer);
}

/**
 * Caminho user-facing. Se ja somos admin, chama instalar() direto.
 * Caso contrario, eleva via UAC.
 */
export async function instalarComElevacao(
  config: PairConfig,
  tenantId: string,
  emit: EmitProgresso,
  isAdminAgora: boolean,
  resetAntes = false
): Promise<InstalacaoResultado> {
  if (isAdminAgora) {
    if (resetAntes) {
      emit({ passo: 0, total: 6, label: 'Resetando instalacao anterior...' });
      await resetCompleto((label, detalhe) =>
        emit({ passo: 0, total: 6, label, detalhe })
      );
    }
    return instalar(config, tenantId, emit);
  }

  const dir = criarDirTemp();
  const cfgPath = path.join(dir, 'config.json');
  const progressPath = path.join(dir, 'progress.jsonl');
  const resultPath = path.join(dir, 'result.json');

  const payload: PayloadElevado = { config, tenantId, progressPath, resultPath, resetAntes };
  fs.writeFileSync(cfgPath, JSON.stringify(payload), 'utf8');
  fs.writeFileSync(progressPath, '', 'utf8'); // garante existencia

  emit({ passo: 0, total: 5, label: 'Pedindo permissao de administrador (UAC)...' });

  const stopTail = tailProgress(progressPath, emit);

  try {
    await spawnElevado(process.execPath, cfgPath);
  } catch (e) {
    stopTail();
    return {
      ok: false,
      erro:
        e instanceof Error
          ? `${e.message}. Sem permissao, o agente TEF nao pode ser instalado.`
          : 'Falha desconhecida na elevacao.',
    };
  }

  stopTail();

  // Le resultado do helper
  try {
    if (!fs.existsSync(resultPath)) {
      return { ok: false, erro: 'Helper elevado encerrou sem produzir resultado.' };
    }
    const raw = fs.readFileSync(resultPath, 'utf8');
    const res = JSON.parse(raw) as InstalacaoResultado;
    return res;
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : 'erro ao ler resultado do helper',
    };
  } finally {
    // Cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}
