import { exec, sleep } from './util';
import { SERVICE_NAME } from './paths';

function estaRunning(stdout: string): boolean {
  return /\bRUNNING\b/.test(stdout);
}
function estaStopped(stdout: string): boolean {
  return /\bSTOPPED\b/.test(stdout);
}

export async function iniciarServico(): Promise<void> {
  let q;
  for (let i = 0; i < 5; i++) {
    q = await exec('sc.exe', ['query', SERVICE_NAME]);
    if (q.code === 0) break;
    await sleep(1000);
  }
  if (!q || q.code !== 0) {
    throw new Error(`Servico "${SERVICE_NAME}" nao listado em sc query.`);
  }
  if (estaRunning(q.stdout)) return;

  const s = await exec('sc.exe', ['start', SERVICE_NAME]);
  if (s.code !== 0 && !/1056/.test(s.stdout + s.stderr)) {
    throw new Error(`sc start falhou (${s.code})\n${s.stdout}\n${s.stderr}`);
  }

  for (let i = 0; i < 10; i++) {
    await sleep(800);
    const c = await exec('sc.exe', ['query', SERVICE_NAME]);
    if (c.code === 0 && estaRunning(c.stdout)) return;
    if (c.code === 0 && estaStopped(c.stdout)) {
      throw new Error('Servico parou imediatamente apos iniciar. Verifique logs em logs/');
    }
  }
  throw new Error('Timeout aguardando servico ficar RUNNING.');
}
