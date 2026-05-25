import { EmDesenvolvimento } from '../components/EmDesenvolvimento';

export function ScalesPage(): JSX.Element {
  return (
    <EmDesenvolvimento
      modulo="Balancas"
      descricao="Leitura de balancas seriais e USB integrada ao PDV — peso aparece no campo da venda automaticamente."
      recursos={[
        'Toledo Prix III / IV / V (Serial)',
        'Filizola CS-15 / Platina',
        'Urano Pop / US-30',
        'Detecao automatica de porta COM',
        'Calibracao guiada',
      ]}
    />
  );
}
