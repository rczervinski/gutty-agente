import { exec, sleep } from './util';
import { SERVICE_NAME } from './paths';

function estaRunning(stdout: string): boolean {
  return /\bRUNNING\b/.test(stdout);
}
function estaStopped(stdout: string): boolean {
  return /\bSTOPPED\b/.test(stdout);
}

/**
 * DESABILITA o auto-restart do SCM. Sem isso, se o servico crasha,
 * o Windows reinicia ele em loop — criando ilusao de "2 processos" e
 * mascarando a causa real (servico nem deveria estar conseguindo subir).
 *
 * Com auto-restart desabilitado: se subir uma vez e crashar, fica
 * STOPPED visivelmente. Diagnostico mais facil.
 */
export async function desabilitarAutoRestart(): Promise<void> {
  // sc failure <nome> reset= 0 actions=
  // (espaco APOS "=" e obrigatorio na sintaxe do sc.exe)
  await exec(
    'sc.exe',
    ['failure', SERVICE_NAME, 'reset=', '0', 'actions=', ''],
    { ignoreErr: true }
  );
}

export async function iniciarServico(): Promise<void> {
  // Desabilita restart auto pra crashes ficarem visiveis (ver helper acima).
  await desabilitarAutoRestart();

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
