/**
 * Estado padrao "Em desenvolvimento" pras abas que ainda nao foram
 * implementadas. Mantem a aparencia consistente com o resto do app.
 */

export function EmDesenvolvimento({
  modulo,
  descricao,
  recursos,
}: {
  modulo: string;
  descricao: string;
  recursos: string[];
}): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <p className="text-[11px] tracking-[0.2em] text-slate-400 font-semibold uppercase mb-1">
          Modulo
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">{modulo}</h1>
        <p className="text-sm text-slate-500 mt-1">{descricao}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs uppercase tracking-wider font-semibold text-amber-800">
            Em desenvolvimento
          </span>
        </div>

        <p className="text-sm text-slate-700 mb-5 leading-relaxed">
          Esse modulo ainda esta sendo construido. Quando ficar pronto, a
          atualizacao chega automatica e essa aba comeca a funcionar sem
          reinstalacao.
        </p>

        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            O que vai ter:
          </p>
          <ul className="space-y-1.5">
            {recursos.map((r) => (
              <li key={r} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">-</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
