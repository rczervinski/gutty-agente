import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_BIN, GUTTY_CONFIG_DIR, GUTTY_CONFIG_FILE } from './paths';
import { pwsh } from './util';
import type { PairConfig } from '../shared-types';

async function dpapiEncrypt(plain: string): Promise<string> {
  const script = `
Add-Type -AssemblyName System.Security
$plain = @'
${plain.replace(/'@/g, "'@")}
'@
$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[Convert]::ToBase64String($enc)
  `.trim();
  const r = await pwsh(script);
  if (r.code !== 0) throw new Error(`DPAPI falhou: ${r.stderr}`);
  return r.stdout.trim();
}

export async function configurarAgente(cfg: PairConfig, tenantId: string): Promise<void> {
  if (!existsSync(AGENT_BIN)) throw new Error(`AGENT_BIN nao existe: ${AGENT_BIN}`);

  // 1) CliSiTef.ini — formato oficial do exemplo SE
  const cliSitefIni = join(AGENT_BIN, 'CliSiTef.ini');
  const cliIniBody = [
    '[PinPadCompartilhado]',
    'Porta=AUTO_USB',
    '',
    '[Geral]',
    'TransacoesAdicionaisHabilitadas=7;8;29',
    '',
    '[CliSiTef]',
    'HabilitaTrace=1',
    '',
    '[CliSiTefI]',
    'HabilitaTrace=1',
    '',
  ].join('\r\n');
  writeFileSync(cliSitefIni, cliIniBody, 'utf-8');

  // 2) agenteclisitef.ini — só sobrescreve se não existir
  const agenteIni = join(AGENT_BIN, 'agenteclisitef.ini');
  if (!existsSync(agenteIni)) {
    const agenteIniBody = [
      '[HTTP-SERVER]',
      'Port=443',
      'DocumentRoot=..\\html',
      'clisitefi=.\\CliSiTef64I.dll',
      '',
      'SSLCertificateFile=.\\server_cert.pem',
      'SSLCertificateKeyfile=.\\server_key.pem',
      'SSLDHParameters=.\\dhparam.pem',
      '',
      'AcessLog=..\\logs\\access-<YYYY/><MM/><DD/>.log',
      'ErrorLog=..\\logs\\error-<YYYY/><MM/><DD/>.log',
      'Debug=1',
    ].join('\r\n');
    writeFileSync(agenteIni, agenteIniBody, 'utf-8');
  }

  // 3) Gutty config criptografada com DPAPI
  mkdirSync(GUTTY_CONFIG_DIR, { recursive: true });
  const payload = JSON.stringify({
    tenantId,
    sitefIp: cfg.sitefIp,
    storeId: cfg.storeId,
    terminalId: cfg.terminalId,
    cnpjLoja: cfg.cnpjLoja,
    agentUrl: cfg.agentUrl,
    modalidades: cfg.modalidadesHabilitadas,
    parcelasMax: cfg.parcelasMax,
    instaladoEm: new Date().toISOString(),
  });
  const cipher = await dpapiEncrypt(payload);
  writeFileSync(GUTTY_CONFIG_FILE, JSON.stringify({ version: 1, ciphertext: cipher }, null, 2), 'utf-8');
}
