/**
 * Preload bridge — único ponto onde renderer fala com main process.
 * Tipos compartilhados em ./shared-types.ts (window.gutty).
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AmbienteApi,
  GuttyBridge,
  InstalacaoResultado,
  LoginErro,
  LoginResultado,
  PairConfig,
  PairErro,
  PairResultado,
  ProgressoInstalacao,
} from './shared-types';

const bridge: GuttyBridge = {
  versao: () => '1.0.0', // valor renderer-side; main retorna o real via IPC se precisar
  isAdmin: () => ipcRenderer.invoke('gutty:isAdmin') as Promise<boolean>,
  setBaseUrl: async () => {
    // Reservado pra config de ambiente — por enquanto nada
  },
  parearComToken: (token, ambiente) =>
    ipcRenderer.invoke('gutty:parearComToken', token, ambiente) as Promise<PairResultado | PairErro>,
  login: (email, senha, ambiente) =>
    ipcRenderer.invoke('gutty:login', email, senha, ambiente) as Promise<LoginResultado | LoginErro>,
  buscarConfigPosLogin: (jwt, ambiente) =>
    ipcRenderer.invoke('gutty:buscarConfigPosLogin', jwt, ambiente) as Promise<PairResultado | PairErro>,
  instalar: (config: PairConfig, tenantId: string) =>
    ipcRenderer.invoke('gutty:instalar', config, tenantId) as Promise<InstalacaoResultado>,
  onProgresso: (cb) => {
    const listener = (_e: unknown, p: ProgressoInstalacao): void => cb(p);
    ipcRenderer.on('gutty:progresso', listener);
    return () => ipcRenderer.removeListener('gutty:progresso', listener);
  },
  tokenInicial: () => ipcRenderer.invoke('gutty:tokenInicial') as Promise<string | null>,
  minimizarPraTray: () => ipcRenderer.invoke('gutty:minimizarPraTray') as Promise<void>,
  autostartEstado: () => ipcRenderer.invoke('gutty:autostartEstado') as Promise<boolean>,
  autostartSet: (habilitar: boolean) =>
    ipcRenderer.invoke('gutty:autostartSet', habilitar) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('gutty', bridge);

// Tipo augmentation pro renderer (já declarado em shared-types.ts via global)
