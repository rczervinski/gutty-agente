/**
 * Pagina inicial do Gutty Agente — visao geral dos modulos.
 */

import type { AbaId } from '../components/Sidebar';

type Modulo = {
  id: AbaId;
  titulo: string;
  descricao: string;
  estado: 'pronto' | 'em-desenvolvimento';
};

const MODULOS: Modulo[] = [
  {
    id: 'tef',
    titulo: 'TEF',
    descricao:
      'Pagamentos por cartao via CliSiTef oficial (Software Express / Fiserv). Pinpad fisico, com ou sem touch.',
    estado: 'pronto',
  },
  {
    id: 'impressoras',
    titulo: 'Impressoras',
    descricao:
      'Cupom termico (Bematech, Epson, Daruma), etiquetas, e DANFE NFC-e direto do navegador.',
    estado: 'em-desenvolvimento',
  },
  {
    id: 'balancas',
    titulo: 'Balancas',
    descricao:
      'Leitura serial/USB de balancas (Toledo, Filizola, Urano) e envio do peso pro PDV.',
    estado: 'em-desenvolvimento',
  },
];

export function WelcomePage({ onIrPara }: { onIrPara: (id: AbaId) => void }): JSX.Element {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Bem-vindo ao Gutty Agente
        </h1>
        <p className="text-slate-600 leading-relaxed">
          O Gutty Agente conecta os dispositivos locais do seu PC (pinpad, impressora,
          balanca) ao Gutty Web. Tudo no mesmo lugar, sem precisar instalar drivers
          espalhados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {MODULOS.map((m) => {
          const pronto = m.estado === 'pronto';
          return (
            <button
              key={m.id}
              onClick={() => onIrPara(m.id)}
              className="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-lg px-5 py-4 transition group"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-base font-semibold text-slate-900 group-hover:text-slate-800">
                  {m.titulo}
                </p>
                <span
                  className={[
                    'text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded',
                    pronto ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                  ].join(' ')}
                >
                  {pronto ? 'Disponivel' : 'Em desenvolvimento'}
                </span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">{m.descricao}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          Modulos novos chegam por atualizacao automatica. Sem reinstalar nada.
        </p>
      </div>
    </div>
  );
}
