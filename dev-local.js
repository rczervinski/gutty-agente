/**
 * dev-local.js — fluxo de teste local sem mexer em GitHub Releases.
 *
 * Builda payload + stub apontando pro arquivo LOCAL (file://...) em vez
 * do GitHub Releases. Roda o stub no final. Equivale ao fluxo do cliente
 * sem precisar fazer upload.
 *
 * Uso:
 *   npm run test:installer        (refaz payload + stub e abre)
 *   npm run test:installer:fast   (so refaz o stub, reusa payload existente)
 *
 * Pre-requisitos: Inno Setup 6 + payload SE em assets/payload/*.zip
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const BIN = path.join(ROOT, 'bin');
const PAYLOAD = path.join(BIN, 'agente-payload.zip');
const STUB = path.join(BIN, 'GuttyAgenteSetup.exe');

const FAST = process.argv.includes('--fast');

function log(msg) {
  console.log(`\n=== ${msg} ===`);
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd: ROOT, ...opts });
  if (r.status !== 0) {
    console.error(`Comando falhou (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// 1) Payload (pula se --fast e ja existe)
if (FAST && fs.existsSync(PAYLOAD)) {
  log(`Pulando payload (reusando ${PAYLOAD})`);
} else {
  log('Buildando payload (npm run pack:payload)');
  run('npm', ['run', 'pack:payload']);
}

if (!fs.existsSync(PAYLOAD)) {
  console.error(`Payload nao gerado em ${PAYLOAD}`);
  process.exit(1);
}

// 2) Stub apontando pra arquivo local
log('Buildando stub apontando pro payload local');
// Inno aceita file:/// URLs como qualquer outra
const localUrl = 'file:///' + PAYLOAD.replace(/\\/g, '/');
console.log(`  URL: ${localUrl}`);

run('powershell', [
  '-ExecutionPolicy', 'Bypass',
  '-File', 'installer/build-installer.ps1',
], {
  env: { ...process.env, GUTTY_PAYLOAD_URL: localUrl },
});

if (!fs.existsSync(STUB)) {
  console.error(`Stub nao gerado em ${STUB}`);
  process.exit(1);
}

// 3) Abre o stub
log('Abrindo GuttyAgenteSetup.exe');
console.log(`
  O wizard vai aparecer agora.
  Como o payload esta em file://, o "download" e instantaneo.
  Apos instalar, o GuttyAgente abre na bandeja.

  Pra desinstalar e testar de novo:
    Apps e Recursos do Windows -> Gutty Agente -> Desinstalar
  Ou:
    %LOCALAPPDATA%\\GuttyAgente\\unins000.exe

  E pra desinstalar o agente TEF (servico Windows):
    cd ..\\caixa
    .\\scripts\\reset-tef.bat   (admin)
`);

spawnSync(STUB, [], { stdio: 'inherit', cwd: BIN, detached: true });
