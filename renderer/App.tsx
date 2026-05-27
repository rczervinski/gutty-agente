/**
 * Gutty Agente — shell principal.
 *
 * Fluxo:
 *   1. Carrega sessao salva (DPAPI). Se nao ha sessao, mostra LoginScreen.
 *   2. Logado, mostra Sidebar + abas.
 *   3. Logout (em Configuracoes) volta pro LoginScreen.
 *
 * O login eh GLOBAL — abas TEF, Impressoras, Balancas, Configuracoes
 * todas reutilizam a sessao salva. Login uma unica vez no app.
 */

import { useState } from 'react';
import { Sidebar, type AbaId } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WelcomePage } from './pages/Welcome';
import { TefPage } from './pages/Tef';
import { PrintersPage } from './pages/Printers';
import { ScalesPage } from './pages/Scales';
import { SettingsPage } from './pages/Settings';
import { SessionProvider, useSession } from './auth/SessionContext';
import { LoginScreen } from './auth/LoginScreen';

function AppShell(): JSX.Element {
  const { sessao, carregando } = useSession();
  const [aba, setAba] = useState<AbaId>('inicio');

  if (carregando) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Carregando...</p>
      </div>
    );
  }

  if (!sessao) {
    return <LoginScreen />;
  }

  return (
    <div className="h-full flex bg-slate-50">
      <Sidebar abaAtiva={aba} onTrocar={setAba} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar nomeUsuario={sessao.nome} />
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

export function App(): JSX.Element {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}
