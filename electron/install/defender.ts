/**
 * Exclusoes do Windows Defender pro agente CliSiTef.
 *
 * MOTIVO: a CliSiTef64I.dll (38MB, sem assinatura digital publica
 * verificavel da SE, faz bind em porta privilegiada 443) e detectada
 * pelo Defender como Heuristica (ThreatID 2147939874) e quarentinada
 * silenciosamente. Confirmado em diagnostico ao vivo:
 *   - Defender RealTimeProtection = True
 *   - DLL extraida -> Get-MpThreatDetection mostra "Resources: ...CliSiTef64I.dll"
 *   - DLL some do disco enquanto o agente ainda esta com handle aberto
 *
 * SOLUCAO (recomendada pelo proprio CliSiTef e por integradores brasileiros):
 * adicionar a pasta inteira + processos como exclusao ANTES de extrair.
 *
 * Requer admin (Add-MpPreference). Como rodamos elevado via NSSM/elevate,
 * isso esta OK no contexto da instalacao.
 */

import { INSTALL_DIR } from './paths';
import { pwsh } from './util';

/**
 * Adiciona exclusoes ANTES da extracao. Idempotente — chamar varias
 * vezes nao quebra (Add-MpPreference ignora duplicatas).
 */
export async function adicionarExclusoesDefender(): Promise<void> {
  // Exclui pasta inteira (recursiva por design)
  await pwsh(
    `try { Add-MpPreference -ExclusionPath '${INSTALL_DIR}' -ErrorAction Stop } catch {}`
  );
  // Exclui o processo do agente (mata o behavior-based detection)
  await pwsh(
    `try { Add-MpPreference -ExclusionProcess 'agenteCliSiTef.exe' -ErrorAction Stop } catch {}`
  );
  // Exclui NSSM (que executa o agente como child)
  await pwsh(
    `try { Add-MpPreference -ExclusionProcess 'nssm.exe' -ErrorAction Stop } catch {}`
  );
  // Tira da quarentena qualquer DLL CliSiTef que ja foi pego antes da exclusao
  await pwsh(
    `Get-MpThreat -ErrorAction SilentlyContinue | ` +
      `Where-Object { $_.Resources -match 'CliSiTef64I|Gutty' } | ` +
      `ForEach-Object { Restore-MpThreat -ThreatID $_.ThreatID -ErrorAction SilentlyContinue }`
  );
}

/**
 * Remove exclusoes — chamado pelo uninstall pra deixar o PC limpo
 * apos remover o agente.
 */
export async function removerExclusoesDefender(): Promise<void> {
  await pwsh(
    `try { Remove-MpPreference -ExclusionPath '${INSTALL_DIR}' -ErrorAction Stop } catch {}`
  );
  await pwsh(
    `try { Remove-MpPreference -ExclusionProcess 'agenteCliSiTef.exe' -ErrorAction Stop } catch {}`
  );
  await pwsh(
    `try { Remove-MpPreference -ExclusionProcess 'nssm.exe' -ErrorAction Stop } catch {}`
  );
}
