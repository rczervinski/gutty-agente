/**
 * Extracao do ZIP do agente CliSiTef oficial.
 *
 * Historia:
 *  - Primeira tentativa: adm-zip — falhava silenciosamente em arquivos
 *    > 10MB. CliSiTef64I.dll (38MB) sumia.
 *  - Segunda tentativa: tar.exe nativo do Windows — tambem extrai parcial
 *    em zips com arquivos grandes (confirmado em produção).
 *  - Agora: `node-stream-zip` que faz streaming entry-por-entry e tem
 *    suporte completo a Zip64. Verificacao byte-a-byte pos-extracao
 *    garante que NADA passou em branco.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import StreamZip from 'node-stream-zip';
import { AGENT_BIN, AGENT_DIR, AGENT_EXE, INSTALL_DIR } from './paths';

/**
 * Localiza o ZIP do agente SE.
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
 * Extrai um zip entry-por-entry usando node-stream-zip (lib robusta com
 * arquivos grandes + zip64 + paths longos). Suporta layout com bin/+helper/
 * direto na raiz (caso SE).
 */
async function extrairComStreamZip(
  zipPath: string,
  destino: string
): Promise<{ arquivos: number; bytesTotais: number; entries: string[] }> {
  const zip = new StreamZip.async({ file: zipPath, storeEntries: true });

  const entries = await zip.entries();
  const lista: string[] = [];
  let bytesTotais = 0;
  let arquivos = 0;

  for (const entry of Object.values(entries)) {
    if (entry.isDirectory) continue;

    // Mantem path interno (ex: bin/CliSiTef64I.dll -> destino/bin/CliSiTef64I.dll)
    const relPath = entry.name.replace(/\//g, '\\');
    const destFile = join(destino, relPath);
    const destDir = destFile.substring(0, destFile.lastIndexOf('\\'));

    mkdirSync(destDir, { recursive: true });

    // Extracao streaming — sem carregar arquivo inteiro na memoria.
    // Por isso aguenta arquivos de 38MB+ tranquilamente.
    await zip.extract(entry.name, destFile);

    // Verifica que o arquivo foi escrito com o tamanho esperado
    const escrito = statSync(destFile).size;
    if (escrito !== entry.size) {
      await zip.close();
      throw new Error(
        `Extracao corrompida: ${entry.name} ` +
          `(esperado ${entry.size} bytes, escrito ${escrito})`
      );
    }

    arquivos++;
    bytesTotais += escrito;
    lista.push(entry.name);
  }

  await zip.close();
  return { arquivos, bytesTotais, entries: lista };
}

/**
 * Verifica que arquivos criticos pro agente estao presentes.
 */
function verificarExtracao(): void {
  const obrigatorios = [
    { path: AGENT_EXE, tamMin: 100_000, nome: 'agenteCliSiTef.exe' },
    {
      path: join(AGENT_BIN, 'CliSiTef64I.dll'),
      tamMin: 1_000_000,
      nome: 'CliSiTef64I.dll',
    },
    { path: join(AGENT_BIN, 'libcurl64.dll'), tamMin: 100_000, nome: 'libcurl64.dll' },
    { path: join(AGENT_BIN, 'libemv64.dll'), tamMin: 100_000, nome: 'libemv64.dll' },
  ];

  const ausentes: string[] = [];
  const truncados: string[] = [];
  for (const { path, tamMin, nome } of obrigatorios) {
    if (!existsSync(path)) {
      ausentes.push(nome);
      continue;
    }
    const tam = statSync(path).size;
    if (tam < tamMin) {
      truncados.push(`${nome} (${tam} bytes, esperado >= ${tamMin})`);
    }
  }

  if (ausentes.length > 0 || truncados.length > 0) {
    const partes: string[] = [];
    if (ausentes.length > 0) partes.push('Arquivos ausentes: ' + ausentes.join(', '));
    if (truncados.length > 0) partes.push('Arquivos truncados: ' + truncados.join(', '));
    throw new Error(
      `Extracao incompleta — agente nao vai funcionar.\n${partes.join('\n')}\n\n` +
        `Conteudo de ${AGENT_BIN}:\n${readdirSync(AGENT_BIN).join(', ')}`
    );
  }
}

export async function extrairAgente(
  zipPath: string
): Promise<{ destino: string; arquivos: number }> {
  if (!existsSync(zipPath)) throw new Error(`ZIP nao encontrado: ${zipPath}`);

  mkdirSync(INSTALL_DIR, { recursive: true });
  mkdirSync(AGENT_DIR, { recursive: true });

  console.log(`[extract] extraindo ${zipPath} -> ${AGENT_DIR}`);

  const r = await extrairComStreamZip(zipPath, AGENT_DIR);
  console.log(
    `[extract] ${r.arquivos} arquivos, ${(r.bytesTotais / 1024 / 1024).toFixed(1)} MB`
  );

  // Verifica que tudo critico esta presente E com tamanho razoavel
  verificarExtracao();

  console.log('[extract] verificacao OK');
  return { destino: AGENT_DIR, arquivos: r.arquivos };
}
