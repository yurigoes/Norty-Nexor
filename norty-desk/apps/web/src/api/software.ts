import type {
  AtribuirLicencaRequest,
  InstalarSoftwareRequest,
  LicencaView,
  SoftwareDetail,
  SoftwareDoAtivo,
  SoftwareView,
  WriteLicenseRequest,
  WriteSoftwareRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/**
 * Software e licenças.
 *
 * Toda escrita devolve o software inteiro de novo (ou o que o equipamento
 * tem instalado): a tela troca o estado pelo que veio, sem recalcular
 * assento nem conformidade no navegador.
 */

export const listarSoftware = (filtro: { q?: string; incluirInativos?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.incluirInativos) p.set('incluirInativos', 'true');
  const texto = p.toString();
  return chamar<SoftwareView[]>(`/software${texto ? `?${texto}` : ''}`);
};

export const obterSoftware = (id: string) => chamar<SoftwareDetail>(`/software/${id}`);

export const criarSoftware = (dados: WriteSoftwareRequest) =>
  chamar<SoftwareDetail>('/software', { metodo: 'POST', corpo: dados });

export const editarSoftware = (id: string, dados: Partial<WriteSoftwareRequest>) =>
  chamar<SoftwareDetail>(`/software/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerSoftware = (id: string) => chamar<void>(`/software/${id}`, { metodo: 'DELETE' });

export const criarVersao = (id: string, name: string) =>
  chamar<SoftwareDetail>(`/software/${id}/versions`, { metodo: 'POST', corpo: { name } });

export const removerVersao = (id: string, versionId: string) =>
  chamar<SoftwareDetail>(`/software/${id}/versions/${versionId}`, { metodo: 'DELETE' });

export const criarLicenca = (softwareId: string, dados: WriteLicenseRequest) =>
  chamar<SoftwareDetail>(`/software/${softwareId}/licenses`, { metodo: 'POST', corpo: dados });

export const editarLicenca = (id: string, dados: Partial<WriteLicenseRequest>) =>
  chamar<SoftwareDetail>(`/licenses/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerLicenca = (id: string) => chamar<SoftwareDetail>(`/licenses/${id}`, { metodo: 'DELETE' });

export const atribuirLicenca = (id: string, dados: AtribuirLicencaRequest) =>
  chamar<SoftwareDetail>(`/licenses/${id}/assignments`, { metodo: 'POST', corpo: dados });

export const liberarAssento = (id: string, assignmentId: string) =>
  chamar<SoftwareDetail>(`/licenses/${id}/assignments/${assignmentId}`, { metodo: 'DELETE' });

/** Vencidas e vencendo nos próximos `dias`. */
export const licencasVencendo = (dias = 30) => chamar<LicencaView[]>(`/licenses?dias=${dias}`);

export const softwareDoAtivo = (assetId: string) => chamar<SoftwareDoAtivo>(`/assets/${assetId}/software`);

export const instalarSoftware = (assetId: string, dados: InstalarSoftwareRequest) =>
  chamar<SoftwareDoAtivo>(`/assets/${assetId}/software`, { metodo: 'POST', corpo: dados });

export const desinstalarSoftware = (assetId: string, installationId: string) =>
  chamar<SoftwareDoAtivo>(`/assets/${assetId}/software/${installationId}`, { metodo: 'DELETE' });
