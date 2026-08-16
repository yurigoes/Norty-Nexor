/* =========================================================
   NEXOR — Repositories
   ---------------------------------------------------------
   Única porta de entrada da aplicação para os dados. Nenhum
   componente importa `db.ts` diretamente: eles conversam com
   os services, que conversam com estes repositories.

   Na Fase 2 estas funções passam a chamar a API real; as
   assinaturas permanecem idênticas.
   ========================================================= */

import { commit, getDatabase, nextId, remove } from '../db';
import type { CollectionName, NexorDatabase } from '../types';

type Entity<K extends CollectionName> = NexorDatabase[K][number];

export function all<K extends CollectionName>(collection: K): Entity<K>[] {
  return getDatabase()[collection] as Entity<K>[];
}

export function where<K extends CollectionName>(
  collection: K,
  predicate: (row: Entity<K>) => boolean,
): Entity<K>[] {
  return (getDatabase()[collection] as Entity<K>[]).filter(predicate);
}

export function find<K extends CollectionName>(
  collection: K,
  predicate: (row: Entity<K>) => boolean,
): Entity<K> | undefined {
  return (getDatabase()[collection] as Entity<K>[]).find(predicate);
}

export function byId<K extends CollectionName>(collection: K, id: string): Entity<K> | undefined {
  return (getDatabase()[collection] as unknown as { id: string }[]).find((r) => r.id === id) as Entity<K> | undefined;
}

export function insert<K extends CollectionName>(collection: K, entity: Entity<K>): Entity<K> {
  return commit(collection, entity as unknown as { id: string }) as unknown as Entity<K>;
}

export function update<K extends CollectionName>(
  collection: K,
  id: string,
  patch: Partial<Entity<K>>,
): Entity<K> | undefined {
  const current = byId(collection, id);
  if (!current) return undefined;
  const next = { ...current, ...patch } as Entity<K>;
  return commit(collection, next as unknown as { id: string }) as unknown as Entity<K>;
}

export function destroy(collection: CollectionName, id: string): void {
  remove(collection, id);
}

export { nextId };
