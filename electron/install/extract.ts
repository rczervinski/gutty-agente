/**
 * Extracao do ZIP do agente CliSiTef oficial da Software Express.
 *
 * IMPORTANTE: nao usamos mais adm-zip. Ele falha silenciosamente em
 * extrair arquivos grandes (>10 MB). No nosso caso, a CliSiTef64I.dll
 * tem 38 MB e nao era extraida — o resto sim. Resultado: agente sobe,
 * mas crasha porque nao acha a DLL.
 *
 * Usamos `tar.exe` nativo do Windows (built-in desde Win10 1803,
 * trata zip transparente e e MUITO mais robusto com arquivos grandes).
 * Fallback: `Expand-Archive` do PowerShell.
 *
 * Verificacao critica no fim: confere que CliSiTef64I.dll esta presente.
 * Se nao estiver, aborta com mensagem util — porque o agente nao consegue
 * inicializar sem ela.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { AGENT_BIN, AGENT_DIR, AGENT_EXE, INSTALL_DIR } from './paths';
import { exec } from './util';

/**
 * Localiza o ZIP do agente SE dentro dos recursos do Electron empacotado.
 * Em dev (não empacotado), procura em `assets/payload/`.
 */
export function localizarPayloadZip(): string | null {
  const candidates: string[] = [];

  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'payload'));
  }
  candidates.push(join(app.getAppPath(), 'assets', 'payload'));
  candidates.push(join(__dirname, '..', '..', '..', 'assets', 'payload'));
  candidates.push(join(__dirname, '..', '..', 'assets', 'payload'));
  candidates.push(join(process.cwd(), 'assets', 'payload'));

  /* eslint-disable no-console */
  console.log('[extract] procurando payload em:');
  for (const dir of candidates) console.log('  -', dir);

  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.zip'));
    if (files.length > 0) {
      const simulado = files.find((f) => /simulado/i.test(f));
      const escolhido = join(dir, simulado ?? files[0]);
      console.log('[extract] usando:', escolhido);
      return escolhido;
    }
  }
  return null;
}

/**
 * tar.exe -xf <zip> -C <dest>
 * O tar nativo do Windows aceita .zip (libarchive) e e robusto com
 * arquivos grandes. Roda sincronamente.
 */
async function extrairComTar(zipPath: string, destino: string): Promise<boolean> {
  const r = await exec('tar.exe', ['-xf', zipPath, '-C', destino], { ignoreErr: true });
  if (r.code === 0) return true;
  console.warn(`[extract] tar falhou (${r.code}):`, r.stderr.slice(0, 300));
  return false;
}

/**
 * Expand-Archive como fallback. Mais lento mas tambem confiavel.
 */
async function extrairComPowerShell(zipPath: string, destino: string): Promise<boolean> {
  const r = await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destino.replace(/'/g, "''")}' -Force`,
    ],
    { ignoreErr: true }
  );
  if (r.code === 0) return true;
  console.warn(`[extract] Expand-Archive falhou (${r.code}):`, r.stderr.slice(0, 300));
  return false;
}

/**
 * Conta arquivos extraidos recursivamente.
 */
function contarArquivos(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const item of readdirSync(cur)) {
      const p = join(cur, item);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else n++;
    }
  }
  return n;
}

/**
 * Extrai pra um diretorio temporario e MOVE pra AGENT_DIR ajustando o path
 * baseado em onde o ZIP coloca os arquivos.
 *
 * Layout esperado do zip: bin/<arquivos> + helper/<arquivos> (sem prefixo
 * com nome do pacote). Se tiver prefixo (ex: agenteCliSiTef-1.0.0.16/bin/...),
 * a gente detecta e ajusta.
 */
export async function extrairAgente(
  zipPath: string
): Promise<{ destino: string; arquivos: number }> {
  if (!existsSync(zipPath)) throw new Error(`ZIP nao encontrado: ${zipPath}`);

  mkdirSync(INSTALL_DIR, { recursive: true });
  mkdirSync(AGENT_DIR, { recursive: true });

  console.log(`[extract] extraindo ${zipPath} -> ${AGENT_DIR}`);

  // Tenta tar primeiro (rapido, robusto), depois PS.
  let ok = await extrairComTar(zipPath, AGENT_DIR);
  if (!ok) {
    console.log('[extract] tar falhou, tentando Expand-Archive...');
    ok = await extrairComPowerShell(zipPath, AGENT_DIR);
  }
  if (!ok) {
    throw new Error(
      'Nao foi possivel extrair o pacote do agente. Tanto tar.exe quanto ' +
        'Expand-Archive falharam. Verifique se o Windows esta atualizado ' +
        '(tar precisa Win10 1803+).'
    );
  }

  // Se o zip tem prefixo (ex: pasta com nome do pacote), achata.
  // Caso comum: zip da SE tem direto bin/ e helper/ na raiz — entao
  // a gente nem precisa achatar.
  const itensRaiz = readdirSync(AGENT_DIR);
  const temBin = itensRaiz.includes('bin');
  if (!temBin && itensRaiz.length === 1) {
    const subdir = join(AGENT_DIR, itensRaiz[0]);
    if (statSync(subdir).isDirectory() && existsSync(join(subdir, 'bin'))) {
      console.log(`[extract] achatando subpasta ${itensRaiz[0]}/`);
      // move conteudo da subpasta pra AGENT_DIR
      const r = await exec(
        'cmd',
        ['/c', 'move', '/Y', join(subdir, '*'), AGENT_DIR],
        { ignoreErr: true, shell: true }
      );
      if (r.code !== 0) {
        console.warn('[extract] achatamento falhou:', r.stderr);
      }
    }
  }

  // VERIFICACAO CRITICA: agenteCliSiTef.exe E CliSiTef64I.dll precisam
  // existir no bin/. Se faltar qualquer um, agente nao sobe.
  if (!existsSync(AGENT_EXE)) {
    throw new Error(
      `Extracao parcial: agenteCliSiTef.exe nao encontrado em ${AGENT_EXE}.\n` +
        `Conteudo de ${AGENT_DIR}:\n${readdirSync(AGENT_DIR).join(', ')}`
    );
  }

  const dllCliSiTef = join(AGENT_BIN, 'CliSiTef64I.dll');
  if (!existsSync(dllCliSiTef)) {
    throw new Error(
      `Extracao parcial: CliSiTef64I.dll ausente em ${AGENT_BIN}.\n` +
        `Sem essa DLL o agente nao consegue inicializar.\n` +
        `Verifique se o ZIP em assets/payload/ inclui a DLL.\n` +
        `Conteudo de ${AGENT_BIN}:\n${readdirSync(AGENT_BIN).join(', ')}`
    );
  }

  // Tamanho minimo da DLL (sanity check — Simulado tem ~38MB, Producao
  // ~25MB. Se vier < 1MB, e arquivo placeholder/corrompido).
  const stDll = statSync(dllCliSiTef);
  if (stDll.size < 1_000_000) {
    throw new Error(
      `CliSiTef64I.dll suspeita: apenas ${stDll.size} bytes (esperado > 25MB).\n` +
        `A extracao pode ter sido parcial. ZIP em ${zipPath} pode estar corrompido.`
    );
  }

  const arquivos = contarArquivos(AGENT_DIR);
  console.log(`[extract] OK — ${arquivos} arquivos extraidos. DLL=${stDll.size} bytes`);

  return { destino: AGENT_DIR, arquivos };
}
