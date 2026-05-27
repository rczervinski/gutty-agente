/**
 * Contexto global de sessao Gutty. Login uma vez, persiste em DPAPI no main.
 *
 * Renderer consome via useSession() — recebe { sessao, carregando, login*, logout, recarregarConfig }.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AmbienteApi, SessaoSnapshot } from '../../electron/shared-types';

interface SessionContextValue {
  sessao: SessaoSnapshot | null;
  carregando: boolean;
  loginComToken: (token: string, ambiente: AmbienteApi) => Promise<{ ok: boolean; erro?: string }>;
  loginComCredenciais: (
    nome: string,
    senha: string,
    ambiente: AmbienteApi
  ) => Promise<{ ok: boolean; erro?: string }>;
  logout: () => Promise<void>;
  recarregarConfig: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [sessao, setSessao] = useState<SessaoSnapshot | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Carrega sessao salva no boot.
  useEffect(() => {
    void (async () => {
      const s = await window.gutty.sessaoAtual();
      setSessao(s);
      setCarregando(false);
    })();
  }, []);

  const loginComToken = useCallback(
    async (token: string, ambiente: AmbienteApi) => {
      const s = await window.gutty.sessaoLoginToken(token.trim(), ambiente);
      if (!s) return { ok: false, erro: 'Token invalido ou expirado.' };
      setSessao(s);
      return { ok: true };
    },
    []
  );

  const loginComCredenciais = useCallback(
    async (nome: string, senha: string, ambiente: AmbienteApi) => {
      const r = await window.gutty.sessaoLoginGutty(nome, senha, ambiente);
      if (!r.ok) return { ok: false, erro: r.erro };
      setSessao(r.sessao);
      return { ok: true };
    },
    []
  );

  const logout = useCallback(async () => {
    await window.gutty.sessaoLogout();
    setSessao(null);
  }, []);

  const recarregarConfig = useCallback(async () => {
    const s = await window.gutty.sessaoRecarregarConfig();
    setSessao(s);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ sessao, carregando, loginComToken, loginComCredenciais, logout, recarregarConfig }),
    [sessao, carregando, loginComToken, loginComCredenciais, logout, recarregarConfig]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession deve estar dentro de <SessionProvider>');
  return ctx;
}
