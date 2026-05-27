/**
 * Valida que o agente CliSiTef esta ativo e respondendo via HTTPS local.
 *
 * Implementacao usando `electron.net` (stack HTTP do Chromium) em vez de
 * `node:https`. Motivo: Electron 32 usa BoringSSL e tava lançando
 *   error:1000009e:SSL routines:OPENSSL_internal:INVALID_COMMAND
 * na hora do handshake com o cert self-signed do agente (DH 1024 / RSA 2048).
 *
 * electron.net resolve isso porque:
 *   1. Usa o mesmo TLS stack do Chrome (mais permissivo que o Node puro)
 *   2. Permite override do verify via session.setCertificateVerifyProc()
 *      → aceitamos qualquer cert quando hostname e 127.0.0.1/localhost
 *
 * O agente serve em https://127.0.0.1/agente/clisitef.
 */

import { net, session } from 'electron';
import { URL } from 'node:url';
import { AGENT_BASE_URL } from './paths';

export interface ValidacaoResultado {
  ok: boolean;
  serviceVersion?: string;
  clisitefVersion?: string;
  pinpadPresente?: boolean;
  erro?: string;
}

let sessaoCfgFeita = false;
function configurarSessaoLocalhost(): void {
  if (sessaoCfgFeita) return;
  // Aceita qualquer cert quando o host e local. Em tudo mais, deixa
  // o Chromium aplicar a verificacao normal.
  // Doc: https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc
  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    if (req.hostname === '127.0.0.1' || req.hostname === 'localhost') {
      cb(0); // 0 = aceito explicitamente
    } else {
      cb(-3); // -3 = usa default do Chromium
    }
  });
  sessaoCfgFeita = true;
}

function httpsCall(
  urlStr: string,
  method: 'GET' | 'POST',
  body?: string
): Promise<{ status: number; body: string }> {
  configurarSessaoLocalhost();
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = net.request({
      method,
      url: urlStr,
      // session implicita = defaultSession (onde colocamos o verifyProc)
      // useSessionCookies false (irrelevante pra agente)
    });

    // Timeout manual (net.request nao tem opcao nativa).
    const timeoutMs = 8000;
    const timeoutTimer = setTimeout(() => {
      req.abort();
      reject(new Error(`timeout apos ${timeoutMs}ms`));
    }, timeoutMs);

    if (body) {
      req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
      req.setHeader('Content-Length', String(Buffer.byteLength(body)));
    }

    req.on('response', (response) => {
      let buf = '';
      response.on('data', (chunk: Buffer) => (buf += chunk.toString('utf-8')));
      response.on('end', () => {
        clearTimeout(timeoutTimer);
        resolve({ status: response.statusCode, body: buf });
      });
      response.on('error', (e: Error) => {
        clearTimeout(timeoutTimer);
        reject(e);
      });
    });

    req.on('error', (e) => {
      clearTimeout(timeoutTimer);
      reject(e);
    });

    if (body) req.write(body);
    req.end();
    // marca uso de URL parseada (evita warning de var nao usada)
    void u;
  });
}

// Marker pra confirmar que esse codigo esta rodando (vs versao antiga em cache).
const VALIDATE_VERSION = 'v2-electron-net';

export async function validarAgente(): Promise<ValidacaoResultado> {
  let last: ValidacaoResultado = { ok: false, erro: `sem tentativa [${VALIDATE_VERSION}]` };
  for (let i = 0; i < 6; i++) {
    try {
      const r = await httpsCall(`${AGENT_BASE_URL}/state`, 'GET');
      if (r.status !== 200) {
        last = { ok: false, erro: `HTTP ${r.status}: ${r.body.slice(0, 200)}` };
      } else {
        const j = JSON.parse(r.body) as {
          serviceStatus: number;
          serviceVersion?: string;
        };
        if (j.serviceStatus !== 0) {
          last = { ok: false, erro: `serviceStatus=${j.serviceStatus}` };
        } else {
          let clisitefVersion: string | undefined;
          try {
            const r2 = await httpsCall(`${AGENT_BASE_URL}/getVersion`, 'POST', '');
            if (r2.status === 200) {
              const j2 = JSON.parse(r2.body) as { clisitefVersion?: string };
              clisitefVersion = j2.clisitefVersion;
            }
          } catch {
            /* opcional */
          }
          return { ok: true, serviceVersion: j.serviceVersion, clisitefVersion };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      last = { ok: false, erro: `${msg} [${VALIDATE_VERSION}]` };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}
