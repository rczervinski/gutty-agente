import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { AGENT_BASE_URL } from './paths';

export interface ValidacaoResultado {
  ok: boolean;
  serviceVersion?: string;
  clisitefVersion?: string;
  pinpadPresente?: boolean;
  erro?: string;
}

function httpsCall(urlStr: string, method: 'GET' | 'POST', body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    // minDHSize não está no tipo do node:https oficial mas é aceito em runtime
    // (https://nodejs.org/api/tls.html#tlsconnectoptions-callback)
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port ? Number(u.port) : 443,
      path: u.pathname + u.search,
      method,
      rejectUnauthorized: false,
      ciphers: 'DEFAULT:@SECLEVEL=0',
      minDHSize: 1024,
      timeout: 8000,
      headers: body
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          }
        : undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = httpsRequest(
      opts as any,
      (res) => {
        let buf = '';
        res.setEncoding('utf-8');
        res.on('data', (d: string) => (buf += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: buf }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

export async function validarAgente(): Promise<ValidacaoResultado> {
  let last: ValidacaoResultado = { ok: false, erro: 'sem tentativa' };
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
      last = { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}
