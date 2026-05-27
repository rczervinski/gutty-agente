/**
 * Tipos compartilhados entre main process e renderer (IPC bridge).
 */

export interface PairConfig {
  sitefIp: string;
  storeId: string;
  terminalId: string;
  cnpjLoja: string;
  agentUrl: string;
  modalidadesHabilitadas: string[];
  parcelasMax: number;
}

export interface AmbienteApi {
  /** URL base do Gutty Backend — ex: https://caixa.gutty.app.br */
  baseUrl: string;
}

export interface PairResultado {
  ok: true;
  tenantId: string;
  config: PairConfig;
}

export interface PairErro {
  ok: false;
  erro: string;
}

export interface LoginResultado {
  ok: true;
  token: string;
}

export interface LoginErro {
  ok: false;
  erro: string;
}

export interface ProgressoInstalacao {
  passo: number;
  total: number;
  label: string;
  detalhe?: string;
  /** Quando o passo gera log secundário (ex: openssl) */
  ultimaLinha?: string;
}

export interface InstalacaoResultado {
  ok: boolean;
  erro?: string;
  versaoAgente?: string;
  versaoClisitef?: string;
  pinpadDetectado?: boolean;
}

/**
 * Snapshot da sessao gutty atual (enviada pro renderer).
 * NAO contem authCookie cru por seguranca — fica isolado no main process.
 */
export interface SessaoSnapshot {
  ambiente: AmbienteApi;
  tenantId: string;
  nome?: string;
  configTef?: PairConfig;
}

/**
 * Status real do TEF (diagnostico ortogonal).
 */
export interface StatusTefSnapshot {
  tudoOk: boolean;
  problemas: string[];
  detalhes: {
    pastaInstalada: boolean;
    servicoExiste: boolean;
    servicoRodando: boolean;
    processosAtivos: number;
    httpsResponde: boolean;
    dllInicializada: boolean;
    versaoAgente?: string;
    versaoClisitef?: string;
  };
}

/**
 * API exposta ao renderer via contextBridge.
 * Renderer chama: window.gutty.xxx().
 */
export interface GuttyBridge {
  /** Versão do instalador */
  versao(): string;
  /** Checa se está rodando elevado */
  isAdmin(): Promise<boolean>;
  /** Define a URL base do backend (ex: https://caixa.gutty.app.br) */
  setBaseUrl(url: string): Promise<void>;
  /** Consome token de pareamento via API */
  parearComToken(token: string, ambiente: AmbienteApi): Promise<PairResultado | PairErro>;
  /** Login fallback com nome/senha do tenant Gutty. Retorna cookie AUTH_TOKEN (JWT) pra próximas calls. */
  login(
    nome: string,
    senha: string,
    ambiente: AmbienteApi
  ): Promise<LoginResultado | LoginErro>;
  /** Após login: busca config TEF do tenant usando cookie AUTH_TOKEN recebido do /login */
  buscarConfigPosLogin(authCookie: string, ambiente: AmbienteApi): Promise<PairResultado | PairErro>;
  /** Instala o agente com a config recebida — emite progresso via onProgresso */
  instalar(config: PairConfig, tenantId: string): Promise<InstalacaoResultado>;
  onProgresso(cb: (p: ProgressoInstalacao) => void): () => void;
  /** Quando o instalador foi aberto via `GuttyAgente.exe --token=ABC123` */
  tokenInicial(): Promise<string | null>;

  // --- Janela ---
  /** Esconde a janela principal (sai pra tray, processo continua). */
  minimizarPraTray(): Promise<void>;

  // --- Autostart no Windows ---
  /** Estado atual: o app sobe junto com o Windows? */
  autostartEstado(): Promise<boolean>;
  /** Liga/desliga autostart. Retorna o estado final. */
  autostartSet(habilitar: boolean): Promise<boolean>;

  // --- Sessao persistente Gutty (login uma vez) ---
  /** Sessao atual ou null. Carregada de safeStorage no boot. */
  sessaoAtual(): Promise<SessaoSnapshot | null>;
  /** Apaga sessao (logout) e zera estado in-memory. */
  sessaoLogout(): Promise<void>;
  /** Login com token de pareamento — salva sessao se sucesso. */
  sessaoLoginToken(token: string, ambiente: AmbienteApi): Promise<SessaoSnapshot | null>;
  /** Login com nome/senha — salva sessao se sucesso. */
  sessaoLoginGutty(
    nome: string,
    senha: string,
    ambiente: AmbienteApi
  ): Promise<{ ok: true; sessao: SessaoSnapshot } | { ok: false; erro: string }>;
  /** Refaz fetch da config TEF usando JWT salvo. */
  sessaoRecarregarConfig(): Promise<SessaoSnapshot | null>;

  // --- Diagnostico TEF ---
  /** Verificacao ortogonal: servico + processo + HTTPS + cert. */
  tefStatus(): Promise<StatusTefSnapshot>;
  /** Reset completo + instalacao do zero. Eleva via UAC se preciso. */
  tefReinstalar(config: PairConfig, tenantId: string): Promise<InstalacaoResultado>;
  /** Coleta diagnostico completo (porta 443, log do agente, eventos) e
   *  retorna o texto pra o user colar pro suporte. */
  tefDiagnostico(): Promise<string>;
}

declare global {
  interface Window {
    gutty: GuttyBridge;
  }
}
