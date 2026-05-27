/**
 * Tela de login. Mostrada uma vez na primeira execucao do GuttyAgente.
 * Apos login, a sessao fica salva em DPAPI e nunca mais aparece.
 */

import { useMemo, useState } from 'react';
import type { AmbienteApi } from '../../electron/shared-types';
import { useSession } from './SessionContext';

const BASE_URL_PADRAO = 'https://caixa.gutty.app.br';

type Modo = 'inicio' | 'token' | 'credenciais';

export function LoginScreen(): JSX.Element {
  const { loginComToken, loginComCredenciais } = useSession();
  const [modo, setModo] = useState<Modo>('inicio');
  const [baseUrl, setBaseUrl] = useState(BASE_URL_PADRAO);
  const ambiente: AmbienteApi = useMemo(() => ({ baseUrl }), [baseUrl]);

  return (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-8">
          <p className="text-[10px] tracking-[0.3em] text-slate-400 font-semibold uppercase mb-1">
            Gutty
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Agente</h1>
          <p className="text-sm text-slate-500 mt-2">
            Entre uma vez. A sessao fica salva neste PC.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6">
          {modo === 'inicio' && <Inicio onEscolher={setModo} />}
          {modo === 'token' && (
            <ComToken
              ambiente={ambiente}
              onVoltar={() => setModo('inicio')}
              loginComToken={loginComToken}
            />
          )}
          {modo === 'credenciais' && (
            <ComCredenciais
              ambiente={ambiente}
              onVoltar={() => setModo('inicio')}
              loginComCredenciais={loginComCredenciais}
            />
          )}
        </div>

        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700">Avancado</summary>
          <div className="mt-3 p-3 bg-white border border-slate-200 rounded">
            <label className="block text-slate-600 mb-1 font-medium">Servidor Gutty</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Padrao: {BASE_URL_PADRAO}.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

function Inicio({ onEscolher }: { onEscolher: (m: Modo) => void }): JSX.Element {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Como entrar</h2>
      <p className="text-xs text-slate-600 mb-5">
        Escolha uma das duas formas. Os dados ficam criptografados (DPAPI) so
        neste PC.
      </p>

      <div className="space-y-2">
        <button
          onClick={() => onEscolher('credenciais')}
          className="w-full text-left p-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md transition"
        >
          <p className="font-semibold mb-0.5">Login Gutty</p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Mesmas credenciais do PDV. Recomendado.
          </p>
        </button>

        <button
          onClick={() => onEscolher('token')}
          className="w-full text-left p-4 bg-white border border-slate-300 hover:border-slate-500 rounded-md transition"
        >
          <p className="font-semibold text-slate-900 mb-0.5">Usar token</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Token de uso unico do PDV. Expira em 10 minutos.
          </p>
        </button>
      </div>
    </div>
  );
}

function ComToken({
  ambiente,
  onVoltar,
  loginComToken,
}: {
  ambiente: AmbienteApi;
  onVoltar: () => void;
  loginComToken: (token: string, ambiente: AmbienteApi) => Promise<{ ok: boolean; erro?: string }>;
}): JSX.Element {
  const [token, setToken] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!token.trim()) return;
    setCarregando(true);
    setErro(null);
    const r = await loginComToken(token.trim(), ambiente);
    setCarregando(false);
    if (!r.ok) setErro(r.erro ?? 'Erro desconhecido');
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Token de pareamento</h2>
      <p className="text-xs text-slate-600 mb-4">
        Cole o token gerado em Configuracoes - TEF - "Gerar token" no PDV.
      </p>

      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="gtef_xxxxxxxxxxxxxxxxxxxxxx"
        className="w-full bg-white border-2 border-slate-200 focus:border-slate-900 outline-none rounded-md px-3 py-2 text-slate-900 font-mono text-sm mb-3 transition"
        autoFocus
      />

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded mb-3 text-sm">
          {erro}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVoltar}
          disabled={carregando}
          className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm"
        >
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={carregando || !token.trim()}
          className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-semibold transition"
        >
          {carregando ? 'Validando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

function ComCredenciais({
  ambiente,
  onVoltar,
  loginComCredenciais,
}: {
  ambiente: AmbienteApi;
  onVoltar: () => void;
  loginComCredenciais: (
    nome: string,
    senha: string,
    ambiente: AmbienteApi
  ) => Promise<{ ok: boolean; erro?: string }>;
}): JSX.Element {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!nome || !senha) return;
    setCarregando(true);
    setErro(null);
    const r = await loginComCredenciais(nome, senha, ambiente);
    setCarregando(false);
    if (!r.ok) setErro(r.erro ?? 'Erro desconhecido');
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Login Gutty</h2>
      <p className="text-xs text-slate-600 mb-4">
        Use as mesmas credenciais que voce usa em{' '}
        <code className="bg-slate-100 px-1 rounded text-[10px]">{ambiente.baseUrl}</code>.
      </p>

      <div className="space-y-3 mb-3">
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
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded mb-3 text-sm">
          {erro}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVoltar}
          disabled={carregando}
          className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm"
        >
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={carregando || !nome || !senha}
          className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-semibold transition"
        >
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
