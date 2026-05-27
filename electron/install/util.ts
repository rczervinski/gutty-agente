import { spawn, type SpawnOptions } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecOpts extends SpawnOptions {
  /** Se true, nao loga warning quando code != 0. (Util pra taskkill/sc stop) */
  ignoreErr?: boolean;
}

export function exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
  const { ignoreErr: _ignoreErr, ...spawnOpts } = opts;
  void _ignoreErr; // consumido — significa "callsite ja sabe que pode falhar"
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { ...spawnOpts, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf-8')));
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf-8')));
    proc.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + err.message }));
  });
}

export function pwsh(script: string): Promise<ExecResult> {
  return exec('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
