/**
 * Aba TEF — contem todo o fluxo de instalacao/operacao do agente
 * CliSiTef que antes vivia no App.tsx do antigo instalador.
 *
 * Estados internos:
 *  - intro     -> apresenta as duas formas de pareamento (token / login)
 *  - token     -> cola token (uso unico, 10min)
 *  - login     -> e-mail/senha Gutty Web
 *  - installing-> barra de progresso (recebe eventos via IPC)
 *  - done      -> sucesso (versoes detectadas) ou erro
 *
 * Sem emojis, paleta clara, tipografia sobria. Mesmo backend (mesmas
 * APIs window.gutty.*) da versao instalador.
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  AmbienteApi,
  InstalacaoResultado,
  PairConfig,
  PairResultado,
  ProgressoInstalacao,
} from '../../electron/shared-types';

type Estado = 'intro' | 'token' | 'login' | 'installing' | 'done';

const BASE_URL_PADRAO = 'https://caixa.gutty.app.br';

export function TefPage(): JSX.Element {
  const [estado, setEstado] = useState<Estado>('intro');
  const [baseUrl, setBaseUrl] = useState(BASE_URL_PADRAO);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [config, setConfig] = useState<PairConfig | null>(null);
  const [resultado, setResultado] = useState<InstalacaoResultado | null>(null);
  const [progresso, setProgresso] = useState<ProgressoInstalacao | null>(null);

  // Captura --token=... do CLI no boot (so dispara uma vez).
  useEffect(() => {
    void (async () => {
      const t = await window.gutty.tokenInicial();
      if (t) {
        setEstado('token');
        // Defer pra render mostrar a tela
        setTimeout(() => void usarToken(t), 60);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listener de progresso
  useEffect(() => {
    return window.gutty.onProgresso((p) => setProgresso(p));
  }, []);

  const ambiente: AmbienteApi = useMemo(() => ({ baseUrl }), [baseUrl]);

  async function usarToken(token: string): Promise<void> {
    setProgresso({ passo: 0, total: 5, label: 'Consultando servidor Gutty...' });
    const r = await window.gutty.parearComToken(token, ambiente);
    if (!r.ok) {
      setResultado({ ok: false, erro: r.erro });
      setEstado('done');
      return;
    }
    setTenantId(r.tenantId);
    setConfig(r.config);
    setEstado('installing');
    await instalarAgora(r);
  }

  async function instalarAgora(r: PairResultado): Promise<void> {
    const res = await window.gutty.instalar(r.config, r.tenantId);
    setResultado(res);
    setEstado('done');
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <p className="text-[11px] tracking-[0.2em] text-slate-400 font-semibold uppercase mb-1">
          Modulo
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">TEF — pagamento por cartao</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conecta o seu pinpad fisico ao PDV web atraves do agente CliSiTef oficial.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        {estado === 'intro' && (
          <TelaIntro
            onComToken={() => setEstado('token')}
            onSemToken={() => setEstado('login')}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
          />
        )}

        {estado === 'token' && (
          <TelaToken
            ambiente={ambiente}
            onConcluido={async (r) => {
              setTenantId(r.tenantId);
              setConfig(r.config);
              setEstado('installing');
              await instalarAgora(r);
            }}
            onVoltar={() => setEstado('intro')}
          />
        )}

        {estado === 'login' && (
          <TelaLogin
            ambiente={ambiente}
            onConcluido={async (r) => {
              setTenantId(r.tenantId);
              setConfig(r.config);
              setEstado('installing');
              await instalarAgora(r);
            }}
            onVoltar={() => setEstado('intro')}
          />
        )}

        {estado === 'installing' && <TelaInstalando progresso={progresso} />}

        {estado === 'done' && (
          <TelaConcluido
            resultado={resultado}
            config={config}
            tenantId={tenantId}
            onReiniciar={() => {
              setEstado('intro');
              setResultado(null);
              setConfig(null);
              setTenantId(null);
              setProgresso(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Subtelas
// =====================================================================

function TelaIntro({
  onComToken,
  onSemToken,
  baseUrl,
  setBaseUrl,
}: {
  onComToken: () => void;
  onSemToken: () => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Como conectar</h2>
      <p className="text-sm text-slate-600 mb-6">
        Escolha uma das duas formas abaixo. Em qualquer caso, os dados sensiveis
        ficam no seu PC criptografados (DPAPI) — nunca em texto puro.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <button
          onClick={onComToken}
          className="text-left p-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md transition"
        >
          <p className="font-semibold mb-1">Usar token</p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Token de uso unico, gerado no PDV em Configuracoes - TEF.
            Expira em 10 minutos.
          </p>
        </button>

        <button
          onClick={onSemToken}
          className="text-left p-4 bg-white border border-slate-300 hover:border-slate-500 rounded-md transition"
        >
          <p className="font-semibold text-slate-900 mb-1">Login Gutty</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Mesmas credenciais que voce usa pra entrar no PDV. Sem token
            necessario.
          </p>
        </button>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">Avancado</summary>
        <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
          <label className="block text-slate-600 mb-1 font-medium">Servidor Gutty</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Padrao: {BASE_URL_PADRAO}. So mude se sua instalacao Gutty estiver em
            outro dominio.
          </p>
        </div>
      </details>
    </div>
  );
}

function TelaToken({
  ambiente,
  onConcluido,
  onVoltar,
}: {
  ambiente: AmbienteApi;
  onConcluido: (r: PairResultado) => void;
  onVoltar: () => void;
}): JSX.Element {
  const [token, setToken] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token.trim()) return;
    setCarregando(true);
    setErro(null);
    const r = await window.gutty.parearComToken(token.trim(), ambiente);
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    onConcluido(r);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Token de pareamento</h2>
      <p className="text-sm text-slate-600 mb-5">
        Cole o token gerado no PDV. Ele e unico e expira em 10 minutos.
      </p>

      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="gtef_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        className="w-full bg-white border-2 border-slate-200 focus:border-slate-900 outline-none rounded-md px-4 py-3 text-slate-900 font-mono text-sm mb-4 transition"
        autoFocus
      />

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded mb-4 text-sm">
          {erro}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVoltar}
          disabled={carregando}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm"
        >
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={carregando || !token.trim()}
          className="flex-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-semibold transition"
        >
          {carregando ? 'Validando...' : 'Validar token e continuar'}
        </button>
      </div>
    </div>
  );
}

function TelaLogin({
  ambiente,
  onConcluido,
  onVoltar,
}: {
  ambiente: AmbienteApi;
  onConcluido: (r: PairResultado) => void;
  onVoltar: () => void;
}): JSX.Element {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setCarregando(true);
    setErro(null);
    const r1 = await window.gutty.login(nome, senha, ambiente);
    if (!r1.ok) {
      setCarregando(false);
      setErro(r1.erro);
      return;
    }
    const r2 = await window.gutty.buscarConfigPosLogin(r1.token, ambiente);
    setCarregando(false);
    if (!r2.ok) {
      setErro(r2.erro);
      return;
    }
    onConcluido(r2);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Entrar com login Gutty</h2>
      <p className="text-sm text-slate-600 mb-5">
        Use as mesmas credenciais que voce usa em{' '}
        <code className="bg-slate-100 px-1 rounded text-xs">{ambiente.baseUrl}</code>.
      </p>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-slate-700 text-xs font-medium mb-1">Nome / Login</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            autoComplete="username"
            className="w-full bg-white border-2 border-slate-200 focus:border-slate-900 outline-none rounded-md px-3 py-2 text-slate-900 transition"
          />
        </div>
        <div>
          <label className="block text-slate-700 text-xs font-medium mb-1">Senha</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            className="w-full bg-white border-2 border-slate-200 focus:border-slate-900 outline-none rounded-md px-3 py-2 text-slate-900 transition"
          />
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded mb-4 text-sm">
          {erro}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVoltar}
          disabled={carregando}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm"
        >
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={carregando || !nome || !senha}
          className="flex-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-semibold transition"
        >
          {carregando ? 'Entrando...' : 'Entrar e instalar'}
        </button>
      </div>
    </div>
  );
}

function TelaInstalando({ progresso }: { progresso: ProgressoInstalacao | null }): JSX.Element {
  const passos = ['Extrair', 'Config local', 'Certs + Servico', 'Iniciar', 'Validar'];
  const passoAtual = progresso?.passo ?? 0;
  const pct = progresso ? (passoAtual / (progresso.total || 5)) * 100 : 0;

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Instalando agente local</h2>
      <p className="text-sm text-slate-600 mb-6">Nao feche essa janela. Pode levar ~1 minuto.</p>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {passos.map((p, idx) => {
            const n = idx + 1;
            return (
              <div key={p} className="flex items-center flex-1">
                <div
                  className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition',
                    n < passoAtual
                      ? 'bg-slate-900 text-white'
                      : n === passoAtual
                      ? 'bg-slate-900 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-500',
                  ].join(' ')}
                >
                  {n}
                </div>
                {idx < passos.length - 1 && (
                  <div
                    className={[
                      'flex-1 h-0.5 mx-1 transition',
                      n < passoAtual ? 'bg-slate-900' : 'bg-slate-200',
                    ].join(' ')}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wider">
          {passos.map((p) => (
            <span key={p} className="flex-1 text-center font-medium">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-slate-100 rounded-md p-4 mb-2">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-slate-700 text-sm">
        {progresso?.label ?? 'Aguardando...'}
        {progresso?.detalhe && (
          <span className="text-slate-500 ml-2 text-xs">{progresso.detalhe}</span>
        )}
      </p>
    </div>
  );
}

function TelaConcluido({
  resultado,
  config,
  tenantId,
  onReiniciar,
}: {
  resultado: InstalacaoResultado | null;
  config: PairConfig | null;
  tenantId: string | null;
  onReiniciar: () => void;
}): JSX.Element {
  if (!resultado || resultado.ok) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-emerald-700 mb-2">Tudo pronto</h2>
        <p className="text-slate-700 mb-5 leading-relaxed">
          O agente Gutty TEF foi instalado e esta rodando como servico Windows.
          Seu PDV web ja pode aceitar pagamentos por cartao.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-2 mb-5 text-sm">
          <Linha k="Agente CliSiTef" v={resultado?.versaoAgente ?? '?'} />
          <Linha k="DLL CliSiTef" v={resultado?.versaoClisitef ?? '?'} />
          {config && (
            <>
              <Linha k="Servidor SiTef" v={config.sitefIp} />
              <Linha k="Loja" v={config.storeId} mono />
              <Linha k="Terminal" v={config.terminalId} mono />
            </>
          )}
          <Linha k="Servico Windows" v="AgenteCliSiTef (autostart)" />
          <Linha k="URL local" v="https://127.0.0.1/agente/clisitef" mono />
        </div>

        {tenantId && (
          <p className="text-slate-500 text-xs mb-4">
            Tenant: <code className="bg-slate-100 px-1 rounded">{tenantId}</code>
          </p>
        )}

        <button
          onClick={onReiniciar}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-red-700 mb-2">Falhou na instalacao</h2>
      <p className="text-slate-700 mb-4">A configuracao nao pode ser concluida.</p>

      <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-5">
        <p className="text-red-800 text-sm font-mono whitespace-pre-wrap">{resultado.erro}</p>
      </div>

      <p className="text-slate-600 text-xs mb-4">
        Voce pode tentar novamente. Se persistir, contate o suporte Gutty
        (suporte@gutty.com.br) com o erro acima.
      </p>

      <button
        onClick={onReiniciar}
        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold"
      >
        Tentar de novo
      </button>
    </div>
  );
}

function Linha({ k, v, mono }: { k: string; v: string; mono?: boolean }): JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{k}</span>
      <span className={`text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
    </div>
  );
}
