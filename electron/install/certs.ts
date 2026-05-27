/**
 * Geração de certificados + trust + registro do serviço Windows.
 *
 * Mesmo fluxo do CLI gutty-tef-installer: chamadas openssl diretas com -subj
 * (sem prompts interativos), CertMgr/certutil pra trust, agenteCliSiTef.exe -i
 * pra registrar serviço.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { AGENT_BIN, AGENT_EXE, AGENT_HELPER } from './paths';
import { exec } from './util';

const OPENSSL_CANDIDATES = [
  'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  'C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
  'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  'C:\\Program Files (x86)\\Git\\mingw32\\bin\\openssl.exe',
];

async function localizarOpenssl(): Promise<string | null> {
  const r = await exec('openssl', ['version']);
  if (r.code === 0) {
    const w = await exec('where.exe', ['openssl.exe']);
    const path = w.stdout.split(/\r?\n/).filter(Boolean)[0]?.trim();
    if (path && existsSync(path)) return path;
    return 'openssl';
  }
  for (const c of OPENSSL_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

const SUBJ_CA = '/C=BR/ST=Sao Paulo/L=Sao Paulo/O=Gutty TEF/OU=TEF/CN=Gutty TEF Local CA';
const SUBJ_SERVER = '/C=BR/ST=Sao Paulo/L=Sao Paulo/O=Gutty TEF/OU=TEF/CN=localhost';

async function ossl(opensslPath: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv, label?: string): Promise<void> {
  const r = await exec(opensslPath, args, { cwd, env });
  if (r.code !== 0) {
    throw new Error(`openssl ${label ?? args[0]} falhou (${r.code})\n${r.stderr.slice(0, 1500)}`);
  }
}

export interface ProgressoCerts {
  (passo: number, total: number, label: string): void;
}

export async function gerarCertificadosEServico(progresso: ProgressoCerts): Promise<{ opensslPath: string }> {
  if (!existsSync(AGENT_HELPER)) throw new Error(`Pasta helper nao existe: ${AGENT_HELPER}`);

  const opensslPath = await localizarOpenssl();
  if (!opensslPath) {
    throw new Error(
      'OpenSSL nao encontrado. Instale Win64 OpenSSL Light de https://slproweb.com/products/Win32OpenSSL.html ' +
        '(ou tenha Git for Windows instalado).'
    );
  }

  const certsDir = join(AGENT_HELPER, 'certs');
  const privateDir = join(AGENT_HELPER, 'private');
  mkdirSync(certsDir, { recursive: true });
  mkdirSync(privateDir, { recursive: true });

  const dhparam = join(certsDir, 'dhparam.pem');
  const caKey = join(privateDir, 'ca_key.pem');
  const caCert = join(certsDir, 'ca_cert.pem');
  const serverKey = join(privateDir, 'server_key.pem');
  const csr = join(certsDir, 'localhost.csr');
  const serverCert = join(certsDir, 'server_cert.pem');

  const env = {
    ...process.env,
    PATH: `${dirname(opensslPath)}${delimiter}${process.env.PATH ?? ''}`,
    RANDFILE: join(AGENT_HELPER, '.rnd'),
  };

  const TOTAL = 8;

  progresso(1, TOTAL, 'Gerando parâmetros DH (5s)...');
  await ossl(opensslPath, ['dhparam', '-outform', 'PEM', '-out', dhparam, '1024'], AGENT_HELPER, env, 'dhparam');

  progresso(2, TOTAL, 'Gerando CA auto-assinada...');
  await ossl(
    opensslPath,
    ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-new', '-x509', '-days', '1825', '-sha256', '-out', caCert, '-subj', SUBJ_CA],
    AGENT_HELPER,
    env,
    'CA'
  );

  progresso(3, TOTAL, 'Gerando chave do servidor...');
  await ossl(opensslPath, ['genrsa', '-out', serverKey, '2048'], AGENT_HELPER, env, 'genrsa');

  progresso(4, TOTAL, 'Gerando CSR localhost...');
  await ossl(
    opensslPath,
    ['req', '-config', join(AGENT_HELPER, 'localhost.conf'), '-key', serverKey, '-new', '-sha256', '-out', csr, '-subj', SUBJ_SERVER],
    AGENT_HELPER,
    env,
    'CSR'
  );

  progresso(5, TOTAL, 'Assinando certificado servidor...');
  await ossl(
    opensslPath,
    ['x509', '-req', '-days', '1825', '-CA', caCert, '-CAkey', caKey, '-CAcreateserial', '-in', csr, '-out', serverCert, '-sha256', '-extfile', join(AGENT_HELPER, 'localhost.conf'), '-extensions', 'req_ext'],
    AGENT_HELPER,
    env,
    'sign'
  );

  progresso(6, TOTAL, 'Copiando certificados pro agente...');
  copyFileSync(dhparam, join(AGENT_BIN, 'dhparam.pem'));
  copyFileSync(serverCert, join(AGENT_BIN, 'server_cert.pem'));
  copyFileSync(serverKey, join(AGENT_BIN, 'server_key.pem'));

  progresso(7, TOTAL, 'Confiando CA no Windows...');
  const certMgr = join(AGENT_HELPER, 'CertMgr.Exe');
  if (existsSync(certMgr)) {
    const r = await exec(certMgr, ['-add', caCert, '-all', '-s', '-r', 'currentuser', 'root']);
    if (r.code !== 0) {
      const r2 = await exec('certutil.exe', ['-user', '-addstore', 'Root', caCert]);
      if (r2.code !== 0) throw new Error(`Trust CA falhou: ${r2.stderr || r.stderr}`);
    }
  } else {
    const r2 = await exec('certutil.exe', ['-user', '-addstore', 'Root', caCert]);
    if (r2.code !== 0) throw new Error(`certutil falhou: ${r2.stderr || r2.stdout}`);
  }

  progresso(8, TOTAL, 'Registrando serviço Windows AgenteCliSiTef...');
  if (!existsSync(AGENT_EXE)) throw new Error(`agenteCliSiTef.exe ausente: ${AGENT_EXE}`);
  const r = await exec(AGENT_EXE, ['-i']);
  if (r.code !== 0) throw new Error(`agenteCliSiTef.exe -i falhou (${r.code})\n${r.stderr || r.stdout}`);

  // CRITICO: o `-i` da SE alem de registrar o servico no SCM, deixa um
  // processo "console" do agenteCliSiTef.exe rodando. Esse processo
  // depois disputa a porta 443 com o servico que vamos iniciar, e o
  // servico nao consegue bindar -> STOPPED. Mata tudo agora pra o sc start
  // ter o terreno limpo.
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], {
    ignoreErr: true,
  });

  // Garante auto-start no boot do Windows + tipo de servico correto.
  await exec('sc.exe', ['config', 'AgenteCliSiTef', 'start=', 'auto'], { ignoreErr: true });

  return { opensslPath };
}
