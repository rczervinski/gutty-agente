/**
 * Orquestrador da instalação. Coordena todos os steps emitindo progresso.
 */

import { execFileSync } from 'node:child_process';
import { extrairAgente, localizarPayloadZip } from './extract';
import { configurarAgente } from './configure';
import { gerarCertificadosEServico } from './certs';
import { iniciarServico } from './service';
import { validarAgente } from './validate';
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
  if (!isAdmin()) {
    return { ok: false, erro: 'Instalador precisa rodar como Administrador' };
  }

  const TOTAL = 5;
  try {
    // 1) Localizar e extrair
    emit({ passo: 1, total: TOTAL, label: 'Localizando pacote do agente...' });
    const zip = localizarPayloadZip();
    if (!zip) {
      return {
        ok: false,
        erro: 'Pacote do agente não encontrado em assets/payload/. Em prod ele vem embutido nos resources do Electron.',
      };
    }
    emit({ passo: 1, total: TOTAL, label: 'Extraindo agente CliSiTef...', detalhe: zip });
    const r1 = extrairAgente(zip);
    emit({ passo: 1, total: TOTAL, label: `Extraído (${r1.arquivos} arquivos)` });

    // 2) Configurar
    emit({ passo: 2, total: TOTAL, label: 'Escrevendo configuração local...' });
    await configurarAgente(config, tenantId);
    emit({ passo: 2, total: TOTAL, label: 'Configuração gravada (DPAPI)' });

    // 3) Certificados + serviço (8 sub-passos)
    emit({ passo: 3, total: TOTAL, label: 'Gerando certificados SSL...' });
    await gerarCertificadosEServico((s, t, label) => {
      emit({ passo: 3, total: TOTAL, label: `Certificados ${s}/${t}: ${label}` });
    });
    emit({ passo: 3, total: TOTAL, label: 'Certificados + serviço prontos' });

    // 4) Iniciar serviço
    emit({ passo: 4, total: TOTAL, label: 'Iniciando serviço AgenteCliSiTef...' });
    await iniciarServico();
    emit({ passo: 4, total: TOTAL, label: 'Serviço rodando' });

    // 5) Validar
    emit({ passo: 5, total: TOTAL, label: 'Validando comunicação HTTPS local...' });
    const v = await validarAgente();
    if (!v.ok) {
      return { ok: false, erro: `Agente não respondeu: ${v.erro}` };
    }
    emit({ passo: 5, total: TOTAL, label: 'Validação OK' });

    return {
      ok: true,
      versaoAgente: v.serviceVersion,
      versaoClisitef: v.clisitefVersion,
      pinpadDetectado: v.pinpadPresente,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro desconhecido' };
  }
}
