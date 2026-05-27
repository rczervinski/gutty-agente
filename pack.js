/**
 * Empacotamento do GUtty Agente — gera o payload zip que o stub Inno baixa.
 *
 * Fluxo:
 *   1) Build TS + renderer + tailwind
 *   2) electron-packager → ./bin/GuttyAgente-win32-x64/  (Electron empacotado)
 *   3) Copia agente CliSiTef ZIP pra resources/payload/
 *   4) Zipa tudo em ./bin/agente-payload.zip
 *
 * O stub Inno (build-installer.ps1) compila separado e cria
 * ./bin/GuttyAgenteSetup.exe (~4MB) que baixa o agente-payload.zip
 * em runtime de GitHub Releases.
 *
 * Tamanhos esperados:
 *   bin/GuttyAgente-win32-x64/        ~280 MB (pasta crua, nao usar)
 *   bin/agente-payload.zip            ~185 MB (sobe pro Release)
 *   bin/GuttyAgenteSetup.exe          ~4 MB   (sobe pro Release + cliente baixa)
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'bin');
const PAYLOAD_SRC = path.join(ROOT, 'assets', 'payload');

function log(msg) {
  console.log(`\n=== ${msg} ===`);
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: ROOT, ...opts });
}

// =====================================================================
// 1) Build
// =====================================================================
log('1/4 Build TypeScript + renderer');
if (run('npm', ['run', 'build']).status !== 0) {
  console.error('Build falhou');
  process.exit(1);
}

// =====================================================================
// 2) Verifica payload SE (agente CliSiTef oficial)
// =====================================================================
log('2/4 Verificando payload do agente CliSiTef');
const payloadFiles = fs
  .readdirSync(PAYLOAD_SRC)
  .filter((f) => f.toLowerCase().endsWith('.zip'));
if (payloadFiles.length === 0) {
  console.error(`Erro: nenhum ZIP em ${PAYLOAD_SRC}. Coloque o agente da SE la antes.`);
  process.exit(1);
}
console.log(`  ${payloadFiles.length} ZIP(s) detectado(s):`);
for (const f of payloadFiles) console.log(`    - ${f}`);

// =====================================================================
// 3) electron-packager
// =====================================================================
log('3/4 Empacotando Electron (electron-packager)');
const packResult = run('npx', [
  'electron-packager',
  '.',
  'GuttyAgente',
  '--platform=win32',
  '--arch=x64',
  '--out=bin',
  '--overwrite',
  '--executable-name=GuttyAgente',
  '--app-copyright=Gutty',
  '--app-version=1.0.0',
  '--build-version=1.0.0',
  '--icon=renderer/assets/icon.ico',
  '--asar',
  '--prune=true',
]);

if (packResult.status !== 0) {
  console.error('electron-packager falhou');
  process.exit(1);
}

const PACK_DIR = path.join(OUT, 'GuttyAgente-win32-x64');
if (!fs.existsSync(PACK_DIR)) {
  console.error(`Erro: pasta esperada nao foi criada: ${PACK_DIR}`);
  process.exit(1);
}

// Copia payload SE pra resources/payload (o orquestrador acha dali via paths.ts)
const RES_PAYLOAD = path.join(PACK_DIR, 'resources', 'payload');
fs.mkdirSync(RES_PAYLOAD, { recursive: true });
for (const f of payloadFiles) {
  fs.copyFileSync(path.join(PAYLOAD_SRC, f), path.join(RES_PAYLOAD, f));
  console.log(`  payload copiado: ${f}`);
}

// Remove locales nao-pt-br pra economizar ~30-50MB no zip final.
// O Electron mantem en-US por default; vamos limpar tudo menos pt-BR e en-US.
const LOCALES = path.join(PACK_DIR, 'locales');
if (fs.existsSync(LOCALES)) {
  const manter = new Set(['en-US.pak', 'pt-BR.pak']);
  let removidos = 0;
  for (const arq of fs.readdirSync(LOCALES)) {
    if (!manter.has(arq)) {
      fs.unlinkSync(path.join(LOCALES, arq));
      removidos++;
    }
  }
  console.log(`  locales: removi ${removidos} arquivos (mantive pt-BR + en-US)`);
}

// =====================================================================
// 4) Zip do payload
// =====================================================================
log('4/4 Gerando agente-payload.zip');

const ZIP_FINAL = path.join(OUT, 'agente-payload.zip');
if (fs.existsSync(ZIP_FINAL)) fs.unlinkSync(ZIP_FINAL);

const zip = new AdmZip();
// Importante: a raiz do zip e o conteudo direto (GuttyAgente.exe na raiz),
// NAO uma subpasta. O stub Inno extrai direto em {app}.
zip.addLocalFolder(PACK_DIR);
zip.writeZip(ZIP_FINAL);

const sizeMb = (fs.statSync(ZIP_FINAL).size / 1024 / 1024).toFixed(1);

log('PRONTO');
console.log(`
  Payload empacotado:
    ${ZIP_FINAL}  (${sizeMb} MB)

  Proximos passos:
    1) npm run pack:installer    # compila GuttyAgenteSetup.exe (~4MB)
    2) npm run deploy:release    # mostra como subir ambos no GitHub Releases

  Ou tudo de uma vez:
    npm run pack                 # = pack:payload + pack:installer
`);
