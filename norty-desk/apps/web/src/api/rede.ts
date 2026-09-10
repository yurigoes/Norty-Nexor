import type {
  IpView,
  RedeDoAtivo,
  SubRedeDetail,
  SubRedeView,
  VlanView,
  WriteIpRequest,
  WritePortaRequest,
  WriteSubRedeRequest,
  WriteVlanRequest,
} from '@norty-desk/shared';

import { chamar } from './cliente';

/** Rede do inventário: VLANs, sub-redes, IPs e portas. */

export const listarVlans = () => chamar<VlanView[]>('/vlans');
export const criarVlan = (dados: WriteVlanRequest) => chamar<VlanView[]>('/vlans', { metodo: 'POST', corpo: dados });
export const editarVlan = (id: string, dados: Partial<WriteVlanRequest>) =>
  chamar<VlanView[]>(`/vlans/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerVlan = (id: string) => chamar<VlanView[]>(`/vlans/${id}`, { metodo: 'DELETE' });

export const listarSubredes = () => chamar<SubRedeView[]>('/ip-networks');
export const obterSubrede = (id: string) => chamar<SubRedeDetail>(`/ip-networks/${id}`);
export const criarSubrede = (dados: WriteSubRedeRequest) =>
  chamar<SubRedeDetail>('/ip-networks', { metodo: 'POST', corpo: dados });
export const editarSubrede = (id: string, dados: Partial<Omit<WriteSubRedeRequest, 'cidr'>>) =>
  chamar<SubRedeDetail>(`/ip-networks/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerSubrede = (id: string) => chamar<void>(`/ip-networks/${id}`, { metodo: 'DELETE' });

export const criarIp = (dados: WriteIpRequest) => chamar<IpView>('/ip-addresses', { metodo: 'POST', corpo: dados });
export const editarIp = (id: string, dados: Partial<Omit<WriteIpRequest, 'address'>>) =>
  chamar<IpView>(`/ip-addresses/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerIp = (id: string) => chamar<void>(`/ip-addresses/${id}`, { metodo: 'DELETE' });

export const redeDoAtivo = (assetId: string) => chamar<RedeDoAtivo>(`/assets/${assetId}/network`);
export const criarPorta = (assetId: string, dados: WritePortaRequest) =>
  chamar<RedeDoAtivo>(`/assets/${assetId}/ports`, { metodo: 'POST', corpo: dados });
export const editarPorta = (id: string, dados: Partial<WritePortaRequest>) =>
  chamar<RedeDoAtivo>(`/ports/${id}`, { metodo: 'PATCH', corpo: dados });
export const removerPorta = (id: string) => chamar<RedeDoAtivo>(`/ports/${id}`, { metodo: 'DELETE' });
export const conectarPorta = (id: string, portId: string) =>
  chamar<RedeDoAtivo>(`/ports/${id}/connection`, { metodo: 'POST', corpo: { portId } });
export const desconectarPorta = (id: string) => chamar<RedeDoAtivo>(`/ports/${id}/connection`, { metodo: 'DELETE' });
