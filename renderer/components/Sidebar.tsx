/**
 * Sidebar de navegacao do Gutty Agente.
 *
 * Cinza claro, minimalista, sem icones decorativos. Inspiracao: VSCode,
 * Linear, painel da Vercel. Indicador ativo: barra vertical lateral +
 * fundo levemente destacado.
 */

export type AbaId = 'inicio' | 'tef' | 'impressoras' | 'balancas' | 'config';

type Item = {
  id: AbaId;
  label: string;
  /** Descricao curta, mostrada em tooltip / hover. */
  hint: string;
  /** Se a aba esta funcional, ou ainda nao. Visual = opacidade. */
  status: 'ativo' | 'desenvolvimento';
};

const ITENS: Item[] = [
  { id: 'inicio', label: 'Inicio', hint: 'Visao geral dos dispositivos', status: 'ativo' },
  { id: 'tef', label: 'TEF', hint: 'Pagamentos por cartao (CliSiTef)', status: 'ativo' },
  { id: 'impressoras', label: 'Impressoras', hint: 'Cupom, etiquetas, NFC-e', status: 'desenvolvimento' },
  { id: 'balancas', label: 'Balancas', hint: 'Toledo, Filizola, Urano', status: 'desenvolvimento' },
  { id: 'config', label: 'Configuracoes', hint: 'Conta, autostart, suporte', status: 'ativo' },
];

export function Sidebar({
  abaAtiva,
  onTrocar,
}: {
  abaAtiva: AbaId;
  onTrocar: (id: AbaId) => void;
}): JSX.Element {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-200">
        <p className="text-[10px] tracking-[0.2em] text-slate-400 font-semibold uppercase">Gutty</p>
        <p className="text-lg font-semibold text-slate-800 leading-tight">Agente</p>
      </div>

      {/* Itens */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {ITENS.map((it) => {
          const ativa = it.id === abaAtiva;
          return (
            <button
              key={it.id}
              onClick={() => onTrocar(it.id)}
              title={it.hint}
              className={[
                'w-full text-left px-3 py-2 rounded-md transition flex items-center gap-3 group',
                ativa
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'w-0.5 h-5 rounded-full transition',
                  ativa ? 'bg-slate-900' : 'bg-transparent group-hover:bg-slate-300',
                ].join(' ')}
              />
              <span className="text-sm font-medium flex-1">{it.label}</span>
              {it.status === 'desenvolvimento' && (
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                  beta
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-400 leading-tight">
        v1.0.0
        <br />
        caixa.gutty.app.br
      </div>
    </aside>
  );
}
