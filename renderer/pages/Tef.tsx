/**
 * Aba TEF — agora consome sessao global (login uma vez, vide SessionContext).
 *
 * Estados:
 *  - "carregando-status" : checa diagnostico real (servico + processo + HTTPS + cert)
 *  - "saudavel"          : tudo OK, mostra info + botoes (recarregar, reinstalar)
 *  - "problema"          : lista problemas + botao reinstalar
 *  - "sem-config"        : nao temos PairConfig na sessao — pede pra recarregar do PDV
 *  - "instalando"        : barra de progresso (evento gutty:progresso)
 *  - "instalacao-erro"   : depois de tentar instalar e falhar
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  InstalacaoResultado,
  ProgressoInstalacao,
  StatusTefSnapshot,
} from '../../electron/shared-types';
import { useSession } from '../auth/SessionContext';

type EstadoUI = 'carregando-status' | 'saudavel' | 'problema' | 'sem-config' | 'instalando' | 'instalacao-erro';

export function TefPage(): JSX.Element {
  const { sessao, recarregarConfig } = useSession();
  const [estado, setEstado] = useState<EstadoUI>('carregando-status');
  const [status, setStatus] = useState<StatusTefSnapshot | null>(null);
  const [progresso, setProgresso] = useState<ProgressoInstalacao | null>(null);
  const [resultado, setResultado] = useState<InstalacaoResultado | null>(null);

  const carregarStatus = useCallback(async () => {
    setEstado('carregando-status');
    const s = await window.gutty.tefStatus();
    setStatus(s);
    setEstado(s.tudoOk ? 'saudavel' : 'problema');
  }, []);

  useEffect(() => {
    void carregarStatus();
  }, [carregarStatus]);

  useEffect(() => {
    return window.gutty.onProgresso((p) => setProgresso(p));
  }, []);

  async function instalar(reinstalar: boolean): Promise<void> {
    if (!sessao?.configTef) {
      setEstado('sem-config');
      return;
    }
    setEstado('instalando');
    setProgresso(null);
    const fn = reinstalar ? window.gutty.tefReinstalar : window.gutty.instalar;
    const r = await fn(sessao.configTef, sessao.tenantId);
    setResultado(r);
    if (r.ok) {
      await carregarStatus();
    } else {
      setEstado('instalacao-erro');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <p className="text-[11px] tracking-[0.2em] text-slate-400 font-semibold uppercase mb-1">
          Modulo
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">TEF — pagamento por cartao</h1>
        <p className="text-sm text-slate-500 mt-1">
          Agente CliSiTef oficial. Diagnostico em tempo real.
        </p>
      </div>

      {estado === 'carregando-status' && (
        <Card>
          <p className="text-sm text-slate-500">Verificando status do agente...</p>
        </Card>
      )}

      {(estado === 'saudavel' || estado === 'problema') && status && (
        <DiagnosticoView
          status={status}
          temConfig={!!sessao?.configTef}
          onRecarregarConfig={async () => {
            await recarregarConfig();
            await carregarStatus();
          }}
          onRecarregarStatus={() => void carregarStatus()}
          onInstalar={() => void instalar(false)}
          onReinstalar={() => void instalar(true)}
        />
      )}

      {estado === 'sem-config' && (
        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-1">Sem configuracao TEF</h2>
          <p className="text-sm text-slate-600 mb-4">
            Sua sessao nao tem config TEF salva. Acesse o PDV em{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">{sessao?.ambiente.baseUrl}</code>{' '}
            e configure em <strong>Configuracoes - TEF</strong> primeiro, depois clique abaixo.
          </p>
          <button
            onClick={async () => {
              await recarregarConfig();
              await carregarStatus();
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold"
          >
            Recarregar config do PDV
          </button>
        </Card>
      )}

      {estado === 'instalando' && <TelaInstalando progresso={progresso} />}

      {estado === 'instalacao-erro' && resultado && !resultado.ok && (
        <Card>
          <h2 className="text-xl font-semibold text-red-700 mb-2">Falhou na instalacao</h2>
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-5">
            <p className="text-red-800 text-sm font-mono whitespace-pre-wrap">{resultado.erro}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => void carregarStatus()}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium"
            >
              Voltar
            </button>
            <button
              onClick={() => void instalar(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold"
            >
              Reinstalar do zero
            </button>
            <BotaoCopiarDiagnostico />
          </div>
        </Card>
      )}
    </div>
  );
}

function DiagnosticoView({
  status,
  temConfig,
  onRecarregarConfig,
  onRecarregarStatus,
  onInstalar,
  onReinstalar,
}: {
  status: StatusTefSnapshot;
  temConfig: boolean;
  onRecarregarConfig: () => Promise<void>;
  onRecarregarStatus: () => void;
  onInstalar: () => void;
  onReinstalar: () => void;
}): JSX.Element {
  const d = status.detalhes;

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Bolinha cor={status.tudoOk ? 'verde' : d.pastaInstalada ? 'amber' : 'vermelha'} />
          <h2 className="text-base font-semibold text-slate-900">
            {status.tudoOk
              ? 'Agente saudavel'
              : d.pastaInstalada
              ? 'Agente com problemas'
              : 'Agente nao instalado'}
          </h2>
        </div>
        <button
          onClick={onRecarregarStatus}
          className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded transition"
          title="Refazer diagnostico"
        >
          Atualizar
        </button>
      </div>

      <div className="space-y-2 mb-5">
        <ChecklistItem ok={d.pastaInstalada} label="Arquivos do agente em C:\\Program Files\\Gutty TEF" />
        <ChecklistItem ok={d.servicoExiste} label='Servico Windows "AgenteCliSiTef" registrado' />
        <ChecklistItem ok={d.servicoRodando} label="Servico em estado RUNNING" />
        <ChecklistItem
          ok={d.processosAtivos === 1}
          label={`Processo unico (atual: ${d.processosAtivos})`}
        />
        <ChecklistItem ok={d.httpsResponde} label="HTTPS local respondendo (porta 443)" />
        <ChecklistItem
          ok={d.dllInicializada}
          label={
            d.dllInicializada
              ? `DLL CliSiTef inicializada (v${d.versaoClisitef ?? '?'})`
              : 'DLL CliSiTef inicializada (precisa de SitDemo/SiTef aberto)'
          }
        />
      </div>

      {!status.tudoOk && status.problemas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-5">
          <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
            Detalhes
          </p>
          <ul className="text-sm text-amber-900 space-y-1 mb-3">
            {status.problemas.map((p, i) => (
              <li key={i}>- {p}</li>
            ))}
          </ul>
          <BotaoCopiarDiagnostico />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {!d.pastaInstalada && temConfig && (
          <button
            onClick={onInstalar}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold"
          >
            Instalar agente
          </button>
        )}
        {d.pastaInstalada && (
          <button
            onClick={onReinstalar}
            disabled={!temConfig}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold"
          >
            Reinstalar do zero
          </button>
        )}
        <button
          onClick={() => void onRecarregarConfig()}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium"
        >
          Atualizar config do PDV
        </button>
      </div>

      {!temConfig && (
        <p className="text-xs text-slate-500 mt-3">
          Sua sessao nao tem config TEF — abra o PDV, configure em Configuracoes - TEF, e clique
          "Atualizar config do PDV" aqui.
        </p>
      )}
    </Card>
  );
}

function BotaoCopiarDiagnostico(): JSX.Element {
  const [estado, setEstado] = useState<'idle' | 'coletando' | 'copiado'>('idle');

  async function copiar(): Promise<void> {
    setEstado('coletando');
    try {
      const txt = await window.gutty.tefDiagnostico();
      await navigator.clipboard.writeText(txt);
      setEstado('copiado');
      setTimeout(() => setEstado('idle'), 2500);
    } catch {
      setEstado('idle');
    }
  }

  return (
    <button
      onClick={() => void copiar()}
      disabled={estado === 'coletando'}
      className="text-xs px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-md text-slate-700 transition"
    >
      {estado === 'coletando'
        ? 'Coletando...'
        : estado === 'copiado'
        ? 'Copiado! Cole no suporte'
        : 'Copiar diagnostico'}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="bg-white border border-slate-200 rounded-lg p-6">{children}</div>;
}

function Bolinha({ cor }: { cor: 'verde' | 'amber' | 'vermelha' }): JSX.Element {
  const classe =
    cor === 'verde' ? 'bg-emerald-500' : cor === 'amber' ? 'bg-amber-500' : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${classe}`} aria-hidden />;
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={[
          'w-5 h-4 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0',
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400',
        ].join(' ')}
        aria-hidden
      >
        {ok ? 'OK' : '—'}
      </span>
      <span className={ok ? 'text-slate-700' : 'text-slate-500'}>{label}</span>
    </div>
  );
}

function TelaInstalando({ progresso }: { progresso: ProgressoInstalacao | null }): JSX.Element {
  const passos = ['Limpeza', 'Extrair', 'Config', 'Certs+Servico', 'Iniciar', 'Validar'];
  const passoAtual = progresso?.passo ?? 0;
  const pct = progresso ? (passoAtual / (progresso.total || 6)) * 100 : 0;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Instalando agente local</h2>
      <p className="text-sm text-slate-600 mb-6">
        Nao feche essa janela. Pode levar ~1 minuto. UAC pode pedir permissao.
      </p>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {passos.map((p, idx) => {
            const n = idx;
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
                  {n + 1}
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
          <div className="h-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="text-slate-700 text-sm">
        {progresso?.label ?? 'Iniciando...'}
        {progresso?.detalhe && (
          <span className="text-slate-500 ml-2 text-xs">{progresso.detalhe}</span>
        )}
      </p>
    </Card>
  );
}
