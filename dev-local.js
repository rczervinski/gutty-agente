/**
 * dev-local.js — fluxo de teste local sem subir release no GitHub.
 *
 * O Inno Setup nativo (WinHTTP) so aceita URLs http/https, nao file://.
 * Entao subimos um HTTP server local minimo (Node) servindo bin/, builda
 * o stub apontando pra http://127.0.0.1:PORTA/agente-payload.zip, abre o
 * setup, e desliga o server quando ele encerra.
 *
 * Uso:
 *   npm run test:installer        (refaz payload + stub e abre)
 *   npm run test:installer:fast   (so refaz o stub, reusa payload)
 */

const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const BIN = path.join(ROOT, 'bin');
const PAYLOAD = path.join(BIN, 'agente-payload.zip');
const STUB = path.join(BIN, 'GuttyAgenteSetup.exe');
const PORT = 28931;

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

// 1) Payload
if (FAST && fs.existsSync(PAYLOAD)) {
  log(`Reusando payload existente: ${PAYLOAD}`);
} else {
  log('Buildando payload');
  run('npm', ['run', 'pack:payload']);
}
if (!fs.existsSync(PAYLOAD)) {
  console.error(`Payload nao existe em ${PAYLOAD}`);
  process.exit(1);
}

// 2) Sobe HTTP server local servindo bin/
log(`Subindo HTTP server local em :${PORT}`);
const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(BIN, reqPath);
  // Bloqueia path traversal
  if (!file.startsWith(BIN)) {
    res.writeHead(403); res.end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found');
    return;
  }
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
  });
  fs.createReadStream(file).pipe(res);
  console.log(`  served ${reqPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/agente-payload.zip`;
  console.log(`  URL: ${url}`);

  // 3) Stub apontando pra esse URL
  log('Buildando stub apontando pro server local');
  run(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', 'installer/build-installer.ps1'],
    { env: { ...process.env, GUTTY_PAYLOAD_URL: url } }
  );
  if (!fs.existsSync(STUB)) {
    console.error(`Stub nao gerado em ${STUB}`);
    server.close();
    process.exit(1);
  }

  // 4) Abre o stub e mantem o server vivo enquanto ele roda
  log('Abrindo GuttyAgenteSetup.exe');
  console.log(`
  Wizard vai aparecer agora. Download e instantaneo (LAN local).
  Apos instalar, o GuttyAgente abre na bandeja.

  Pra desinstalar e iterar de novo:
    %LOCALAPPDATA%\\GuttyAgente\\unins000.exe
  E pra resetar o servico TEF (se ja instalou):
    cd ..\\caixa
    .\\scripts\\reset-tef.bat   (admin)

  Pressione Ctrl+C aqui pra encerrar o server local quando terminar.
`);

  const child = spawn(STUB, [], { stdio: 'inherit', cwd: BIN });

  child.on('exit', (code) => {
    console.log(`\nSetup encerrou (exit ${code}). Mantendo server vivo por mais 5s pra eventual retry...`);
    setTimeout(() => {
      server.close();
      console.log('Server local encerrado.');
      process.exit(0);
    }, 5000);
  });
});

// Ctrl+C limpa
process.on('SIGINT', () => {
  console.log('\nEncerrando server local...');
  server.close();
  process.exit(0);
});
