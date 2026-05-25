/**
 * Gutty Agente — shell principal.
 *
 * Layout:
 *   ┌─────────────┬───────────────────────────────────┐
 *   │             │   topbar (titulo + status)        │
 *   │   sidebar   ├───────────────────────────────────┤
 *   │             │                                   │
 *   │  - Inicio   │           conteudo da aba         │
 *   │  - TEF      │                                   │
 *   │  - Impres.  │                                   │
 *   │  - Balancas │                                   │
 *   │  - Config.  │                                   │
 *   │             │                                   │
 *   └─────────────┴───────────────────────────────────┘
 *
 * Cada aba e um modulo isolado dentro de pages/. O Gutty Agente comeca
 * generico desde o inicio — TEF e so o primeiro modulo implementado.
 */

import { useState } from 'react';
import { Sidebar, type AbaId } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WelcomePage } from './pages/Welcome';
import { TefPage } from './pages/Tef';
import { PrintersPage } from './pages/Printers';
import { ScalesPage } from './pages/Scales';
import { SettingsPage } from './pages/Settings';

export function App(): JSX.Element {
  const [aba, setAba] = useState<AbaId>('inicio');

  return (
    <div className="h-full flex bg-slate-50">
      <Sidebar abaAtiva={aba} onTrocar={setAba} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {aba === 'inicio' && <WelcomePage onIrPara={setAba} />}
          {aba === 'tef' && <TefPage />}
          {aba === 'impressoras' && <PrintersPage />}
          {aba === 'balancas' && <ScalesPage />}
          {aba === 'config' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
