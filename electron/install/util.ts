import { spawn, type SpawnOptions } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function exec(cmd: string, args: string[], opts: SpawnOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { ...opts, shell: false });
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
