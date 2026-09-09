import type { FatiaDeContagem, PainelView, RelatorioSlaView } from '@norty-desk/shared';

import { baixar, chamar } from './cliente';

export type Periodo = '7d' | '30d' | '90d' | '12m';

export const painelDoAgente = (periodo: Periodo = '30d') =>
  chamar<PainelView>(`/dashboards/agente?periodo=${periodo}`);

export const painelDoTime = (periodo: Periodo = '30d', teamId?: string) =>
  chamar<PainelView>(
    `/dashboards/time?periodo=${periodo}${teamId ? `&teamId=${teamId}` : ''}`,
  );

export const painelDaOrganizacao = (periodo: Periodo = '30d') =>
  chamar<PainelView>(`/dashboards/organizacao?periodo=${periodo}`);

export const relatorioDeSla = (
  periodo: Periodo = '30d',
  agrupar: RelatorioSlaView['agrupamento'] = 'categoria',
) => chamar<RelatorioSlaView>(`/reports/sla?periodo=${periodo}&agrupar=${agrupar}`);

export const relatorioDeVolume = (
  periodo: Periodo = '30d',
  agrupar: 'categoria' | 'canal' | 'time' | 'dia' = 'categoria',
) => chamar<FatiaDeContagem[]>(`/reports/volume?periodo=${periodo}&agrupar=${agrupar}`);

export const baixarCsvDeSla = (periodo: Periodo, agrupar: string) =>
  baixar(
    `/reports/sla?formato=csv&periodo=${periodo}&agrupar=${agrupar}`,
    `sla-${agrupar}-${periodo}.csv`,
  );

export const baixarCsvDeVolume = (periodo: Periodo, agrupar: string) =>
  baixar(
    `/reports/volume?formato=csv&periodo=${periodo}&agrupar=${agrupar}`,
    `volume-${agrupar}-${periodo}.csv`,
  );
