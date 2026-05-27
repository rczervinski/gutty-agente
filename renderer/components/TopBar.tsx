/**
 * Topbar do Gutty Agente.
 *  - Subtitulo a esquerda
 *  - Nome do usuario logado (canto direito)
 *  - Botao "Minimizar pra bandeja"
 */

export function TopBar({ nomeUsuario }: { nomeUsuario?: string }): JSX.Element {
  return (
    <header className="h-12 shrink-0 bg-white border-b border-slate-200 flex items-center px-6">
      <p className="text-sm text-slate-500">Gerenciador local de dispositivos</p>

      <div className="ml-auto flex items-center gap-4">
        {nomeUsuario && (
          <span className="text-xs text-slate-500">
            Logado: <span className="text-slate-800 font-medium">{nomeUsuario}</span>
          </span>
        )}
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
