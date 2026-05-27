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
import { AGENT_EXE, GUTTY_CONFIG_DIR, INSTALL_DIR, SERVICE_NAME } from './paths';
import { exec } from './util';

/**
 * Mata processos zumbis do agenteCliSiTef e para o servico.
 * NAO apaga arquivos. Idempotente — sempre seguro de chamar.
 */
export async function limparZumbis(): Promise<void> {
  // Mata processos avulsos (pode ter mais de um se reset anterior nao limpou).
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });
  // Para o servico (se existir).
  await exec('sc', ['stop', SERVICE_NAME], { ignoreErr: true });
  // Pequena espera pra Windows liberar handles.
  await new Promise((r) => setTimeout(r, 1000));
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
  await exec('sc', ['stop', SERVICE_NAME], { ignoreErr: true });
  await new Promise((r) => setTimeout(r, 1500));

  passo('Desinstalando servico (-u oficial)...');
  if (existsSync(AGENT_EXE)) {
    await exec(AGENT_EXE, ['-u'], { ignoreErr: true });
    await new Promise((r) => setTimeout(r, 1500));
  }

  passo('Force-delete do servico (sc delete)...');
  await exec('sc', ['delete', SERVICE_NAME], { ignoreErr: true });

  passo('Matando processos zumbis...');
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });

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
