import type { Channel } from '@norty-desk/shared';

import type { PortaDeEnvio } from './transporte';

/** Um transporte por canal. Canal sem transporte não despacha. */
export type PortasDeEnvio = Partial<Record<Channel, PortaDeEnvio>>;

export const PORTAS_DE_ENVIO = Symbol('PortasDeEnvio');
