/**
 * Geração de certificados + trust + registro do serviço Windows.
 *
 * Mesmo fluxo do CLI gutty-tef-installer: chamadas openssl diretas com -subj
 * (sem prompts interativos), CertMgr/certutil pra trust, agenteCliSiTef.exe -i
 * pra registrar serviço.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import {
  AGENT_BIN,
  AGENT_DIR,
  AGENT_EXE,
  AGENT_HELPER,
  NSSM_INSTALLED,
  nssmSourcePath,
  SERVICE_NAME,
} from './paths';
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

  // ===================================================================
  //  Passo 8: registrar servico Windows via NSSM
  // ===================================================================
  //
  //  Antes usavamos `agenteCliSiTef.exe -i` (recomendacao SE), mas esse
  //  exe NAO implementa Service Control Handler corretamente — ele sobe
  //  HTTPS, faz fork, parent sai, SCM mata o processo como STOPPED e
  //  workers ficam orfaos. Resultado: "2 processos zumbi" em todas as
  //  instalacoes, servico jamais RUNNING.
  //
  //  NSSM (Non-Sucking Service Manager, MIT) wrappa qualquer .exe num
  //  servico Windows funcional: trata Service Control Handler direito,
  //  mantem o processo vivo, restarta se cair, redireciona stdout/err.
  //
  //  Doc: https://nssm.cc/usage
  // ===================================================================
  progresso(8, TOTAL, 'Registrando servico Windows via NSSM...');
  if (!existsSync(AGENT_EXE)) throw new Error(`agenteCliSiTef.exe ausente: ${AGENT_EXE}`);

  // Copia nssm.exe pro bin do agente (vamos invocar via path absoluto)
  if (!existsSync(NSSM_INSTALLED)) {
    copyFileSync(nssmSourcePath(), NSSM_INSTALLED);
  }

  // Pasta de logs do NSSM
  const logsDir = join(AGENT_DIR, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const nssmStdout = join(logsDir, 'nssm-stdout.log');
  const nssmStderr = join(logsDir, 'nssm-stderr.log');

  // 1) Garantir que servico nao exista (cleanup defensive)
  await exec(NSSM_INSTALLED, ['stop', SERVICE_NAME], { ignoreErr: true });
  await exec(NSSM_INSTALLED, ['remove', SERVICE_NAME, 'confirm'], { ignoreErr: true });
  await exec('sc.exe', ['delete', SERVICE_NAME], { ignoreErr: true });
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });

  // 2) Registrar via NSSM (sintaxe: nssm install <nome> <exe> [args...])
  // Importante: NAO passamos /s — esse modo e que esta bugado na SE.
  // NSSM mantem o processo vivo em modo console.
  const inst = await exec(NSSM_INSTALLED, ['install', SERVICE_NAME, AGENT_EXE], {
    ignoreErr: true,
  });
  if (inst.code !== 0) {
    throw new Error(`nssm install falhou (${inst.code})\n${inst.stderr || inst.stdout}`);
  }

  // 3) Configurar NSSM
  // AppDirectory = onde o processo deve rodar (CWD). Critico porque o
  // agente usa paths relativos pra carregar DLLs/certs.
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'AppDirectory', AGENT_BIN], { ignoreErr: true });
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'AppStdout', nssmStdout], { ignoreErr: true });
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'AppStderr', nssmStderr], { ignoreErr: true });

  // Restart automatico em caso de crash (NSSM cuida disso, nao o SCM)
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'AppExit', 'Default', 'Restart'], {
    ignoreErr: true,
  });
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'AppRestartDelay', '5000'], { ignoreErr: true });

  // Roda como LocalSystem (default), auto-start no boot
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START'], {
    ignoreErr: true,
  });

  // Display name + descricao
  await exec(NSSM_INSTALLED, ['set', SERVICE_NAME, 'DisplayName', 'Gutty Agente TEF (CliSiTef)'], {
    ignoreErr: true,
  });
  await exec(
    NSSM_INSTALLED,
    [
      'set',
      SERVICE_NAME,
      'Description',
      'Agente CliSiTef oficial gerenciado via NSSM. Conecta o PDV web Gutty ao pinpad fisico.',
    ],
    { ignoreErr: true }
  );

  return { opensslPath };
}
