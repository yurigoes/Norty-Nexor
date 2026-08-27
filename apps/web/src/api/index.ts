/**
 * Fonte de dados do aplicativo.
 *
 * `mock`  — banco provisório em memória, para a demonstração navegável
 * `api`   — API real em api-myhome.norty.com.br
 *
 * A troca é por variável de ambiente para que a demonstração continue
 * funcionando sem servidor enquanto os módulos migram um a um.
 */
export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE ?? 'mock') as 'mock' | 'api';
export const USING_API = DATA_SOURCE === 'api';

export * from './client';
export * as endpoints from './endpoints';
