/**
 * deploy:release — instrucoes pra subir os 2 artefatos no GitHub Releases.
 *
 * Artefatos esperados em ./bin/:
 *   - agente-payload.zip       (gerado por: npm run pack:payload)
 *   - GuttyAgenteSetup.exe     (gerado por: npm run pack:installer)
 *
 * O stub baixa o payload de:
 *   github.com/<owner>/<repo>/releases/latest/download/agente-payload.zip
 *
 * O PDV resolve a URL do stub via /api/tef/installer/info, que aponta pra:
 *   github.com/<owner>/<repo>/releases/latest/download/GuttyAgenteSetup.exe
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, 'bin');
const STUB = path.join(BIN, 'GuttyAgenteSetup.exe');
const PAYLOAD = path.join(BIN, 'agente-payload.zip');

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function fmtMb(file) {
  return (fs.statSync(file).size / 1024 / 1024).toFixed(1);
}

const tag = process.env.TEF_INSTALLER_GH_TAG || 'latest';
const owner = process.env.TEF_INSTALLER_GH_OWNER || 'rczervinski';
const repo = process.env.TEF_INSTALLER_GH_REPO || 'gutty-agente';

const presentes = [];
if (fs.existsSync(STUB)) presentes.push({ file: STUB, label: 'stub (GuttyAgenteSetup.exe)' });
if (fs.existsSync(PAYLOAD)) presentes.push({ file: PAYLOAD, label: 'payload (agente-payload.zip)' });

if (presentes.length === 0) {
  console.error(`
Erro: nem o stub nem o payload existem em ${BIN}.
Gere primeiro:
  npm run pack:payload      # cria bin/agente-payload.zip
  npm run pack:installer    # cria bin/GuttyAgenteSetup.exe
`);
  process.exit(1);
}

console.log(`
==========================================================
 Gutty Agente — preparar release no GitHub
==========================================================
`);

for (const { file, label } of presentes) {
  const size = fmtMb(file);
  const hash = sha256(file);
  console.log(`
  ${label}
    Caminho: ${file}
    Tamanho: ${size} MB
    SHA-256: ${hash}
`);
}

const ghCheck = spawnSync('gh', ['--version'], { stdio: 'ignore', shell: true });
const temGh = ghCheck.status === 0;

if (temGh) {
  const files = presentes.map(({ file }) => `"${file}"`).join(' ');
  console.log(`
gh CLI detectado. Comandos prontos:

  # primeira vez (cria tag + release):
  gh release create ${tag} ${files} \\
    --title "Gutty Agente ${tag}" \\
    --notes "Release automatico do Gutty Agente"

  # atualizacoes (substitui assets):
  gh release upload ${tag} ${files} --clobber
`);
} else {
  console.log(`
gh CLI nao encontrado. Upload manual via navegador:

  1) Abre: https://github.com/${owner}/${repo}/releases
  2) "Draft a new release" (ou edite a tag '${tag}')
  3) Tag: ${tag}     Title: Gutty Agente ${tag}
  4) Arraste pro campo "Attach binaries":
${presentes.map((c) => `        ${c.file}`).join('\n')}
  5) Marque "Set as the latest release"
  6) Publish release.
`);
}

console.log(`
==========================================================
 Apos publicar
==========================================================

  PDV resolve automaticamente via:
    https://caixa.gutty.app.br/api/tef/installer/info
    https://caixa.gutty.app.br/api/tef/installer/download

  Cliente clica em "Baixar Gutty Agente" no PDV → recebe ~4MB.
  Stub baixa o payload (~185MB) no proprio PC dele.

  (Opcional) Em .env.production do PDV:
    TEF_INSTALLER_VERSION=1.0.0
    TEF_INSTALLER_SIZE_MB=${fs.existsSync(STUB) ? fmtMb(STUB) : '4'}
    TEF_INSTALLER_DEFAULT_TYPE=exe
`);
