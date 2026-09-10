import type { SituacaoDaLicenca } from '@norty-desk/shared';

const SITUACAO: Record<SituacaoDaLicenca, { rotulo: string; classe: string }> = {
  ok: { rotulo: 'Em dia', classe: '-sucesso' },
  vencendo: { rotulo: 'Vencendo', classe: '-aviso' },
  vencida: { rotulo: 'Vencida', classe: '-erro' },
  excedida: { rotulo: 'Assentos excedidos', classe: '-erro' },
};

export function SeloDaSituacao({ situacao }: { situacao: SituacaoDaLicenca }) {
  const { rotulo, classe } = SITUACAO[situacao];
  return <span className={`selo ${classe}`}>{rotulo}</span>;
}

/** "3 de 10", "3 (ilimitada)" ou "sem licença". */
export function textoDeAssentos(usados: number, comprados: number | null): string {
  if (comprados === null) return `${usados} (ilimitada)`;
  if (comprados === 0 && usados === 0) return 'sem licença';
  return `${usados} de ${comprados}`;
}
