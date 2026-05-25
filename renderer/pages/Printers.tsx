import { EmDesenvolvimento } from '../components/EmDesenvolvimento';

export function PrintersPage(): JSX.Element {
  return (
    <EmDesenvolvimento
      modulo="Impressoras"
      descricao="Cupom termico, etiquetas de balanca e DANFE NFC-e direto do navegador, sem driver Windows."
      recursos={[
        'Bematech MP-4200 / MP-2800 (USB e Serial)',
        'Epson TM-T20 / TM-T88 (USB e Rede)',
        'Daruma DR-700 / DR-800',
        'Etiquetas Argox / Zebra (ZPL)',
        'Impressao silenciosa via WebSocket local',
      ]}
    />
  );
}
