/**
 * Configuracoes do Gutty Agente.
 *
 * Por enquanto: toggle de autostart no Windows + info de versao/suporte.
 * Futuro: ajuste de servidor Gutty, idioma, logs, etc.
 */

import { useEffect, useState } from 'react';

export function SettingsPage(): JSX.Element {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [versao, setVersao] = useState('1.0.0');

  useEffect(() => {
    void window.gutty.autostartEstado().then(setAutostart);
    setVersao(window.gutty.versao());
  }, []);

  async function alternar(): Promise<void> {
    if (autostart === null) return;
    setAutostart(null);
    const novo = await window.gutty.autostartSet(!autostart);
    setAutostart(novo);
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-6">
        <p className="text-[11px] tracking-[0.2em] text-slate-400 font-semibold uppercase mb-1">
          Configuracoes
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Preferencias</h1>
      </div>

      {/* Autostart */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1">
              Iniciar com o Windows
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              O Gutty Agente sobe minimizado na bandeja assim que voce loga no PC.
              Necessario pra que o PDV web encontre o agente sem voce abrir manualmente.
            </p>
          </div>
          <button
            onClick={alternar}
            disabled={autostart === null}
            className={[
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition',
              autostart ? 'bg-slate-900' : 'bg-slate-300',
              autostart === null ? 'opacity-50' : '',
            ].join(' ')}
            aria-checked={!!autostart}
            role="switch"
          >
            <span
              className={[
                'inline-block h-5 w-5 rounded-full bg-white shadow transition',
                autostart ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-slate-900 mb-3">Sobre</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Versao</dt>
            <dd className="text-slate-900 font-mono">{versao}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Servidor</dt>
            <dd className="text-slate-900 font-mono">caixa.gutty.app.br</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Suporte</dt>
            <dd className="text-slate-900">suporte@gutty.com.br</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
