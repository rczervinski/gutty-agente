/**
 * Garantia de saude do agente — chamado no FINAL da instalacao.
 *
 * Loop ate o status TEF ficar verde, ou retorna o ultimo estado com
 * problemas + diagnostico detalhado.
 *
 * Auto-correcao em cada iteracao:
 *   1. Mata processos zumbis (taskkill /F /T)
 *   2. Para servico (sc stop)
 *   3. Verifica porta 443 livre (so loga, nao mata)
 *   4. Inicia servico (sc start)
 *   5. Espera ate 10s pelo RUNNING
 *   6. Conta processos: se != 1, mata os extras
 *   7. Re-verifica HTTPS
 *
 * Se apos 3 iteracoes nao virou verde, coleta diagnostico (porta, log,
 * eventos) e devolve mensagem util.
 */

import { exec, sleep } from './util';
import { SERVICE_NAME } from './paths';
import { verificarStatusTef } from './status';
import { coletarDiagnostico } from './diagnostico';
import type { StatusTefSnapshot } from '../shared-types';

type EmitLabel = (label: string, detalhe?: string) => void;

const MAX_TENTATIVAS = 3;

async function matarTodosOsZumbis(): Promise<void> {
  await exec('taskkill', ['/F', '/IM', 'agenteCliSiTef.exe', '/T'], { ignoreErr: true });
}

async function pararServico(): Promise<void> {
  await exec('sc.exe', ['stop', SERVICE_NAME], { ignoreErr: true });
  for (let i = 0; i < 12; i++) {
    const q = await exec('sc.exe', ['query', SERVICE_NAME], { ignoreErr: true });
    if (q.code === 0 && /STOPPED/.test(q.stdout)) return;
    await sleep(500);
  }
}

async function iniciarServicoForce(): Promise<boolean> {
  // Garante auto-start (caso o `-i` da SE nao tenha configurado)
  await exec('sc.exe', ['config', SERVICE_NAME, 'start=', 'auto'], { ignoreErr: true });
  await exec('sc.exe', ['start', SERVICE_NAME], { ignoreErr: true });
  for (let i = 0; i < 15; i++) {
    const q = await exec('sc.exe', ['query', SERVICE_NAME], { ignoreErr: true });
    if (q.code === 0 && /RUNNING/.test(q.stdout)) return true;
    await sleep(800);
  }
  return false;
}

/**
 * Roda uma iteracao de correcao agressiva. Devolve true se serviço subiu.
 */
async function corrigirEReiniciar(emit: EmitLabel): Promise<boolean> {
  emit('Matando processos do agente (limpeza)...');
  await matarTodosOsZumbis();
  await sleep(1000);

  emit('Parando servico AgenteCliSiTef...');
  await pararServico();
  await sleep(500);

  // Mata de novo — sc stop pode ter relancado processo
  await matarTodosOsZumbis();
  await sleep(500);

  emit('Iniciando servico do zero...');
  return await iniciarServicoForce();
}

export async function garantirSaudeAgente(
  emit: EmitLabel
): Promise<StatusTefSnapshot> {
  let status: StatusTefSnapshot = await verificarStatusTef();

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    // Verde mesmo? (excecao: DLL nao inicializada por falta de servidor SiTef
    // externo NAO conta como falha — isso depende de SitDemo aberto)
    const problemasInfra = status.problemas.filter(
      (p) => !/dll\s+clisitef|servidor\s+sitef|sitdemo/i.test(p)
    );

    if (status.detalhes.httpsResponde && problemasInfra.length === 0) {
      // Servico + processo + HTTPS verdes. Pode faltar so a DLL (SitDemo).
      return status;
    }

    if (tentativa === MAX_TENTATIVAS) break;

    emit(`Auto-correcao tentativa ${tentativa}/${MAX_TENTATIVAS - 1}...`);
    await corrigirEReiniciar(emit);
    await sleep(2000); // tempo pro servico estabilizar
    status = await verificarStatusTef();
  }

  return status;
}

/**
 * Coleta diagnostico detalhado e gera mensagem util baseada nos sintomas.
 * Chamado quando garantirSaude termina com problemas.
 */
export async function gerarMensagemErro(status: StatusTefSnapshot): Promise<string> {
  const diag = await coletarDiagnostico();
  const partes: string[] = ['O agente foi instalado mas nao ficou saudavel.\n'];

  if (diag.porta443.ocupada && !diag.porta443.ehNosso) {
    partes.push(
      `Causa provavel: porta 443 esta sendo usada por "${diag.porta443.processo}" ` +
        `(PID ${diag.porta443.pid}).`
    );
    partes.push(
      `Como resolver: feche esse programa (geralmente IIS, Skype antigo, Hyper-V, World Wide Web Publishing Service) ` +
        `e clique "Reinstalar do zero".`
    );
  } else if (status.detalhes.processosAtivos > 1) {
    partes.push(
      `Causa: ${status.detalhes.processosAtivos} processos do agente rodando (deveria ser 1). ` +
        `A auto-correcao nao conseguiu liberar — algum app esta segurando o exe.`
    );
    partes.push('Como resolver: reinicie o Windows e clique "Reinstalar do zero".');
  } else if (!status.detalhes.servicoRodando) {
    partes.push('Causa: servico Windows nao quer ficar RUNNING.');
    if (diag.logTrecho) {
      partes.push('Log do agente:\n' + diag.logTrecho);
    } else {
      partes.push(
        'Sem log do agente disponivel. Tente "Reinstalar do zero" ou contate suporte@gutty.com.br.'
      );
    }
  } else if (!status.detalhes.httpsResponde) {
    partes.push('Causa: servico esta rodando mas HTTPS local nao responde.');
    if (diag.logTrecho) partes.push('Log do agente:\n' + diag.logTrecho);
  } else {
    partes.push('Problemas listados:\n' + status.problemas.map((p) => `  - ${p}`).join('\n'));
  }

  return partes.join('\n\n');
}
