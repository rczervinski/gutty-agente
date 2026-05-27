/**
 * Orquestrador da instalação. Coordena todos os steps emitindo progresso.
 *
 * No final, chama garantirSaudeAgente() que faz auto-correcao se sobrou
 * algum zumbi ou o servico parou — so retorna ok=true se TUDO esta verde
 * (excecao: DLL nao inicializada por falta de servidor SiTef externo,
 * o que nao e responsabilidade da instalacao resolver).
 */

import { execFileSync } from 'node:child_process';
import { extrairAgente, localizarPayloadZip } from './extract';
import { configurarAgente } from './configure';
import { gerarCertificadosEServico } from './certs';
import { iniciarServico } from './service';
import { limparZumbis } from './reset';
import { adicionarExclusoesDefender } from './defender';
import { garantirSaudeAgente, gerarMensagemErro } from './garantir-saude';
import type { InstalacaoResultado, PairConfig, ProgressoInstalacao } from '../shared-types';

type EmitProgresso = (p: ProgressoInstalacao) => void;

export function isAdmin(): boolean {
  try {
    execFileSync('net', ['session'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function instalar(
  config: PairConfig,
  tenantId: string,
  emit: EmitProgresso
): Promise<InstalacaoResultado> {
  if (process.platform !== 'win32') {
    return { ok: false, erro: 'Instalador suporta apenas Windows' };
  }
  // Nao verifica isAdmin aqui — a elevacao e feita pelo helper em
  // elevate.ts (instalarComElevacao). Quando este orquestrador roda,
  // ele *ja* esta no contexto elevado (ou o app foi aberto como admin).

  const TOTAL = 6;
  try {
    // 0) EXCLUSAO DEFENDER — CRITICO. A CliSiTef64I.dll (38MB, sem
    // assinatura) e detectada como heuristica (ThreatID 2147939874) e
    // quarentinada pelo Defender ANTES mesmo do agente conseguir usar.
    // Confirmado por Get-MpThreatDetection em PC real. Sem essa exclusao
    // toda instalacao termina com 'DLL ausente'.
    emit({ passo: 1, total: TOTAL, label: 'Adicionando excecoes no Windows Defender...' });
    await adicionarExclusoesDefender();

    // 1) Limpeza preventiva — APENAS processos e servico (nao-destrutivo).
    //
    // IMPORTANTE: NAO apaga arquivos aqui. Antes apagavamos a pasta toda
    // se ja existisse — isso criava race condition mortal quando o user
    // clicava "Instalar" duas vezes (UAC demora, clica de novo): a segunda
    // execucao detectava a pasta da primeira, apagava a DLL recem-extraida
    // E carregada pelo agente, e o serviço morria. Bug confirmado em audit.
    //
    // Reset destrutivo agora SO acontece via botao "Reinstalar do zero"
    // explicito (resetAntes=true no elevate.ts).
    emit({ passo: 1, total: TOTAL, label: 'Limpando processos do agente...' });
    await limparZumbis();

    // 2) Localizar e extrair
    emit({ passo: 2, total: TOTAL, label: 'Localizando pacote do agente...' });
    const zip = localizarPayloadZip();
    if (!zip) {
      return {
        ok: false,
        erro:
          'Pacote do agente nao encontrado em assets/payload/. Em prod ele vem embutido nos resources do Electron.',
      };
    }
    emit({ passo: 2, total: TOTAL, label: 'Extraindo agente CliSiTef...', detalhe: zip });
    const r1 = await extrairAgente(zip);
    emit({ passo: 2, total: TOTAL, label: `Extraido (${r1.arquivos} arquivos)` });

    // 3) Configurar
    emit({ passo: 3, total: TOTAL, label: 'Escrevendo configuracao local...' });
    await configurarAgente(config, tenantId);
    emit({ passo: 3, total: TOTAL, label: 'Configuracao gravada (DPAPI)' });

    // 4) Certificados + servico
    emit({ passo: 4, total: TOTAL, label: 'Gerando certificados SSL...' });
    await gerarCertificadosEServico((s, t, label) => {
      emit({ passo: 4, total: TOTAL, label: `Certificados ${s}/${t}: ${label}` });
    });
    emit({ passo: 4, total: TOTAL, label: 'Certificados + servico prontos' });

    // 5) Iniciar servico (best-effort — se nao subir aqui, garantirSaude resolve)
    emit({ passo: 5, total: TOTAL, label: 'Iniciando servico AgenteCliSiTef...' });
    try {
      await iniciarServico();
    } catch (e) {
      emit({
        passo: 5,
        total: TOTAL,
        label: 'Servico nao subiu na primeira — vou tentar recuperar...',
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }

    // 6) Garantir saude — loop de auto-correcao
    emit({ passo: 6, total: TOTAL, label: 'Verificando saude completa do agente...' });
    const status = await garantirSaudeAgente((label, detalhe) =>
      emit({ passo: 6, total: TOTAL, label, detalhe })
    );

    if (!status.detalhes.httpsResponde) {
      const erro = await gerarMensagemErro(status);
      return { ok: false, erro };
    }

    emit({ passo: 6, total: TOTAL, label: 'Agente saudavel' });

    return {
      ok: true,
      versaoAgente: status.detalhes.versaoAgente,
      versaoClisitef: status.detalhes.versaoClisitef,
      pinpadDetectado: false,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro desconhecido' };
  }
}
