/**
 * Reset / limpeza do TEF no PC.
 *
 * Duas funcoes:
 *
 *  - limparZumbis() : nao-destrutivo. Mata processo agenteCliSiTef e para
 *    o servico Windows se estiver respondendo. Usado ANTES de instalar pra
 *    garantir que nao tem processo segurando DLL/arquivo.
 *
 *  - resetCompleto(): destrutivo. Apaga TUDO (servico, arquivos, cert no
 *    trust root). Usado quando o user clica "Reinstalar agente".
 *
 * Ambas funcoes requerem admin (chamado pelo helper elevado).
 */

import { existsSync, rmSync } from 'node:fs';
import { AGENT_EXE, GUTTY_CONFIG_DIR, INSTALL_DIR, NSSM_INSTALLED, SERVICE_NAME } from './paths';
import { exec } from './util';

/**
 * Mata processos zumbis do agenteCliSiTef + NSSM e para o servico.
 * Loop ate confirmar zero processos vivos (evita race condition onde
 * NSSM relança o agente antes do reset prosseguir).
 *
 * NAO apaga arquivos. Idempotente — sempre seguro de chamar.
 */
export async function limparZumbis(): Promise<void> {
  // Primeiro: parar NSSM (pra ele NAO restartar o agente quando matarmos).
  if (existsSync(NSSM_INSTALLED)) {
    await exec(NSSM_INSTALLED, ['stop', SERVICE_NAME], { ignoreErr: true });
  }
  await exec('sc', ['stop', SERVICE_NAME], { ignoreErr: true });
  await new Promise((r) => setTimeout(r, 1000));

  // Loop ate processos morrerem de verdade. Tipicamente 1-2 iteracoes
  // bastam, mas garantimos com timeout de 10s.
  for (let i = 0; i < 10; i++) {
    await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });
    await exec('taskkill', ['/F', '/IM', 'nssm.exe', '/T'], { ignoreErr: true });
    await new Promise((r) => setTimeout(r, 600));

    // Conta processos restantes
    const r = await exec(
      'tasklist',
      ['/FI', 'IMAGENAME eq agenteCliSiTef.exe', '/FO', 'CSV', '/NH'],
      { ignoreErr: true }
    );
    if (r.code === 0 && (r.stdout.includes('INFO:') || r.stdout.trim() === '')) {
      // Tudo limpo
      return;
    }
  }
}

/**
 * Reset completo do TEF. Mata tudo, remove servico, apaga pastas, remove
 * cert da CA do trust store. Equivalente a `scripts/reset-tef.bat`.
 */
export async function resetCompleto(
  emit?: (label: string, detalhe?: string) => void
): Promise<void> {
  const passo = (label: string, detalhe?: string): void => {
    emit?.(label, detalhe);
  };

  passo('Parando servico AgenteCliSiTef...');
  // Tenta tanto via NSSM (se instalado) quanto via sc — qualquer um funciona.
  if (existsSync(NSSM_INSTALLED)) {
    await exec(NSSM_INSTALLED, ['stop', SERVICE_NAME], { ignoreErr: true });
  }
  await exec('sc', ['stop', SERVICE_NAME], { ignoreErr: true });
  await new Promise((r) => setTimeout(r, 1500));

  passo('Removendo servico (via NSSM ou sc delete)...');
  if (existsSync(NSSM_INSTALLED)) {
    await exec(NSSM_INSTALLED, ['remove', SERVICE_NAME, 'confirm'], { ignoreErr: true });
  }
  // Tenta `-u` oficial como fallback (instalacoes antigas que usavam o modo SE)
  if (existsSync(AGENT_EXE)) {
    await exec(AGENT_EXE, ['-u'], { ignoreErr: true });
  }
  await exec('sc', ['delete', SERVICE_NAME], { ignoreErr: true });

  passo('Matando processos zumbis...');
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });
  await exec('taskkill', ['/F', '/IM', 'nssm.exe', '/T'], { ignoreErr: true });

  passo('Removendo CA Gutty TEF do trust root...');
  await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-ChildItem Cert:\\CurrentUser\\Root -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.Subject -match 'Gutty TEF' } | Remove-Item -Force -ErrorAction SilentlyContinue`,
    ],
    { ignoreErr: true }
  );

  passo('Apagando pastas de instalacao...');
  for (const dir of [INSTALL_DIR, GUTTY_CONFIG_DIR]) {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      /* alguns arquivos podem estar em uso — best effort */
    }
  }

  passo('Limpeza concluida.');
}
