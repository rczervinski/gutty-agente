/**
 * Topbar do Gutty Agente. Reservada pra:
 *  - Acoes globais (minimizar pra bandeja)
 *  - Indicadores de status no futuro (online/offline, alerta de pendencia)
 */

export function TopBar(): JSX.Element {
  return (
    <header className="h-12 shrink-0 bg-white border-b border-slate-200 flex items-center px-6">
      <p className="text-sm text-slate-500">Gerenciador local de dispositivos</p>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => void window.gutty.minimizarPraTray()}
          className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded transition"
          title="Ocultar pra bandeja (continua rodando)"
        >
          Minimizar pra bandeja
        </button>
      </div>
    </header>
  );
}
