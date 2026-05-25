/**
 * Chamadas à API do Gutty backend (caixa.gutty.app.br).
 *
 * Funções:
 *  - `consumirToken` — POST /api/tef/pair/use { token } → config TEF
 *  - `login` — POST /api/auth/login { email, senha } → JWT do tenant
 *  - `buscarConfig` — GET /api/tef/config (com cookie/token) → config TEF
 *
 * Segurança:
 *  - HTTPS sempre (rejectUnauthorized: true em prod — desabilitado só pra dev local)
 *  - Erros não vazam detalhes do motivo (importante pra brute force)
 */

import type { LoginErro, LoginResultado, PairConfig, PairErro, PairResultado, AmbienteApi } from '../shared-types';

function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !!process.env.GUTTY_DEV;
}

async function fetchSeguro(url: string, init: RequestInit): Promise<Response> {
  // Em prod usamos a verificação TLS padrão. Em dev permitimos self-signed.
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (isDev()) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    return await fetch(url, init);
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev ?? '';
  }
}

/** Extrai o cookie AUTH_TOKEN do header Set-Cookie da resposta */
function extrairAuthCookie(resp: Response): string | null {
  // Node fetch tem um método getSetCookie() no headers que devolve array.
  // Em runtimes mais antigos cai pro get('set-cookie').
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers = resp.headers as any;
  const list: string[] =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  for (const c of list) {
    const m = /^AUTH_TOKEN=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

export async function consumirToken(token: string, ambiente: AmbienteApi): Promise<PairResultado | PairErro> {
  try {
    const r = await fetchSeguro(`${ambiente.baseUrl}/api/tef/pair/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = (await r.json().catch(() => ({}))) as {
      success?: boolean;
      tenantId?: string;
      config?: PairConfig;
      error?: string;
    };
    if (!r.ok || !data.success || !data.tenantId || !data.config) {
      return { ok: false, erro: data.error ?? `HTTP ${r.status}` };
    }
    return { ok: true, tenantId: data.tenantId, config: data.config };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro de rede' };
  }
}

export async function login(
  nome: string,
  senha: string,
  ambiente: AmbienteApi
): Promise<LoginResultado | LoginErro> {
  try {
    const r = await fetchSeguro(`${ambiente.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha }),
    });
    const data = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!r.ok || !data.ok) {
      const motivo =
        data.error === 'invalid'
          ? 'Credenciais inválidas'
          : data.error === 'rate_limited'
          ? 'Muitas tentativas — espere alguns minutos'
          : data.error === 'captcha_required'
          ? 'Captcha necessário (não suportado pelo instalador). Use token de pareamento.'
          : data.error === 'missing'
          ? 'Nome ou senha em branco'
          : data.error ?? `HTTP ${r.status}`;
      return { ok: false, erro: motivo };
    }
    // O backend usa cookie HTTP-only, não retorna token no JSON.
    // Extraímos o cookie AUTH_TOKEN do header Set-Cookie pra reusar.
    const cookie = extrairAuthCookie(r);
    if (!cookie) {
      return { ok: false, erro: 'Login OK mas cookie AUTH_TOKEN não veio na resposta' };
    }
    return { ok: true, token: cookie };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro de rede' };
  }
}

export async function buscarConfigPosLogin(
  authCookie: string,
  ambiente: AmbienteApi
): Promise<PairResultado | PairErro> {
  try {
    const r = await fetchSeguro(`${ambiente.baseUrl}/api/tef/config`, {
      method: 'GET',
      headers: { Cookie: `AUTH_TOKEN=${authCookie}` },
    });
    const data = (await r.json().catch(() => ({}))) as {
      success?: boolean;
      data?: {
        configurado?: boolean;
        ativo?: boolean;
        sitefIp?: string;
        storeId?: string;
        terminalId?: string;
        cnpjLoja?: string;
        agentUrl?: string;
        modalidadesHabilitadas?: string[];
        parcelasMax?: number;
      };
      error?: string;
    };
    if (!r.ok || !data.success || !data.data?.configurado) {
      return { ok: false, erro: data.error ?? 'TEF nao configurado neste tenant' };
    }
    const d = data.data;
    if (!d.sitefIp || !d.storeId || !d.terminalId || !d.cnpjLoja) {
      return { ok: false, erro: 'config TEF incompleta' };
    }

    // tenantId precisamos extrair do JWT (claim tid) — fazemos um decode raso.
    // O cookie AUTH_TOKEN É o JWT (assinado por signToken).
    const tenantId = decodeJwtClaim(authCookie, 'tid') ?? 'desconhecido';

    return {
      ok: true,
      tenantId,
      config: {
        sitefIp: d.sitefIp,
        storeId: d.storeId,
        terminalId: d.terminalId,
        cnpjLoja: d.cnpjLoja,
        agentUrl: d.agentUrl ?? 'https://127.0.0.1/agente/clisitef',
        modalidadesHabilitadas: d.modalidadesHabilitadas ?? ['credito', 'debito', 'pix'],
        parcelasMax: d.parcelasMax ?? 12,
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro de rede' };
  }
}

function decodeJwtClaim(jwt: string, claim: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as Record<string, unknown>;
    const v = payload[claim];
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
