/**
 * Tutorial visual pra o user resolver bloqueio do Windows Defender.
 *
 * Aparece quando o status detecta:
 *   - defender.ativo === true
 *   - defender.pastaExcluida === false
 *   - (ou) defender.quarentenaDetectada === true
 *
 * Mostra 4 imagens passo-a-passo + texto explicativo. As imagens vivem
 * em renderer/assets/defender-img/passo1..4.png (copiadas no build).
 */

import { useState } from 'react';

const PASSOS = [
  {
    img: 'passo1.png',
    titulo: 'Abra Seguranca do Windows',
    descricao:
      'Clique no botao Iniciar e digite "Seguranca do Windows". Abra o aplicativo que aparecer.',
  },
  {
    img: 'passo2.png',
    titulo: 'Va em Protecao contra virus e ameacas',
    descricao:
      'Na lateral esquerda, clique em "Protecao contra virus e ameacas". Depois clique em "Gerenciar configuracoes" abaixo de "Configuracoes de protecao contra virus e ameacas".',
  },
  {
    img: 'passo3.png',
    titulo: 'Adicione uma exclusao',
    descricao:
      'Role a tela ate o final, em "Exclusoes" clique em "Adicionar ou remover exclusoes". O Windows pode pedir autorizacao (UAC) — aceite.',
  },
  {
    img: 'passo4.png',
    titulo: 'Escolha a pasta do Gutty Agente',
    descricao:
      'Clique em "Adicionar uma exclusao" -> "Pasta". Navegue ate C:\\Program Files\\Gutty Agente e clique em "Selecionar Pasta". Pronto — agora reinstale o agente pela aba TEF.',
  },
];

export function TutorialDefender({ onFechar }: { onFechar: () => void }): JSX.Element {
  const [passo, setPasso] = useState(0);
  const atual = PASSOS[passo];

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-slate-400 font-semibold uppercase">
              Tutorial — passo {passo + 1} de {PASSOS.length}
            </p>
            <h2 className="text-lg font-semibold text-slate-900">
              Liberar Gutty Agente no Windows Defender
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="text-slate-400 hover:text-slate-900 text-2xl leading-none px-2"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="mb-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-3">
            O Windows Defender detecta o componente do TEF como suspeito por padrao
            (e DLL grande nao-assinada). Voce precisa adicionar a pasta do Gutty
            Agente como excecao — uma vez so, fica salvo.
          </div>

          <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 mb-4">
            <img
              src={`./assets/defender-img/${atual.img}`}
              alt={`Passo ${passo + 1}: ${atual.titulo}`}
              className="w-full max-h-[400px] object-contain bg-white"
            />
          </div>

          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {atual.titulo}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">{atual.descricao}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex gap-1">
            {PASSOS.map((_, i) => (
              <span
                key={i}
                className={[
                  'w-2 h-2 rounded-full transition',
                  i === passo ? 'bg-slate-900' : 'bg-slate-300',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPasso((p) => Math.max(0, p - 1))}
              disabled={passo === 0}
              className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            {passo < PASSOS.length - 1 ? (
              <button
                onClick={() => setPasso((p) => p + 1)}
                className="px-3 py-1.5 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold"
              >
                Proximo
              </button>
            ) : (
              <button
                onClick={onFechar}
                className="px-3 py-1.5 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold"
              >
                Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
