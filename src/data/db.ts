/* =========================================================
   NEXOR — Banco de dados provisório (Fase 1)
   ---------------------------------------------------------
   ARQUITETURA
   O dataset base é RECONSTRUÍDO deterministicamente a cada
   carregamento (ver seed/generate.ts). Somente as alterações
   feitas durante a demonstração são persistidas, na forma de
   um journal compacto de operações no localStorage.

       seed determinístico  +  journal de alterações  =  estado atual

   Vantagens desta abordagem no MVP:
   · o localStorage não estoura (o seed pesa megabytes, o journal, KBs);
   · a demonstração é reprodutível em qualquer máquina;
   · "reiniciar demonstração" é apenas descartar o journal;
   · a troca para o banco definitivo (Fase 2) substitui apenas
     este arquivo e as implementações de repositories — a UI,
     os services e os tipos permanecem intactos.
   ========================================================= */

import type { CollectionName, NexorDatabase } from './types';
import { DB_VERSION, generateDatabase } from './seed/generate';

const JOURNAL_KEY = 'nexor.mvp.journal.v1';
const TRIAL_KEY = 'nexor.mvp.trial.v1';
/** Janela de teste do MVP, conforme escopo da primeira fase. */
export const TRIAL_DAYS = 30;

type JournalOp =
  | { c: CollectionName; t: 'upsert'; d: Record<string, unknown> }
  | { c: CollectionName; t: 'delete'; id: string };

interface Journal {
  version: number;
  ops: JournalOp[];
}

let cache: NexorDatabase | null = null;
let journal: Journal = { version: DB_VERSION, ops: [] };
const listeners = new Set<() => void>();

/* ---------------- Persistência do journal ---------------- */

function readJournal(): Journal {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return { version: DB_VERSION, ops: [] };
    const parsed = JSON.parse(raw) as Journal;
    if (parsed.version !== DB_VERSION) return { version: DB_VERSION, ops: [] };
    return parsed;
  } catch {
    return { version: DB_VERSION, ops: [] };
  }
}

function writeJournal() {
  try {
    // O journal guarda apenas o delta da sessão de demonstração.
    if (journal.ops.length > 4000) journal.ops = journal.ops.slice(-4000);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  } catch {
    // Cota excedida: a demonstração continua em memória.
  }
}

function applyJournal(db: NexorDatabase) {
  for (const op of journal.ops) {
    const collection = db[op.c] as unknown as { id: string }[];
    if (!Array.isArray(collection)) continue;
    if (op.t === 'delete') {
      const idx = collection.findIndex((r) => r.id === op.id);
      if (idx >= 0) collection.splice(idx, 1);
    } else {
      const entity = op.d as { id: string };
      const idx = collection.findIndex((r) => r.id === entity.id);
      if (idx >= 0) collection[idx] = entity;
      else collection.unshift(entity);
    }
  }
}

/* ---------------- Janela de teste (30 dias) ---------------- */

export interface TrialInfo {
  startedAt: string;
  endsAt: string;
  daysUsed: number;
  daysLeft: number;
  expired: boolean;
}

export function getTrialInfo(): TrialInfo {
  let startedAt = localStorage.getItem(TRIAL_KEY);
  if (!startedAt) {
    startedAt = new Date().toISOString();
    try { localStorage.setItem(TRIAL_KEY, startedAt); } catch { /* modo privado */ }
  }
  const start = new Date(startedAt);
  const ends = new Date(start);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  const daysUsed = Math.floor((Date.now() - start.getTime()) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
  return {
    startedAt,
    endsAt: ends.toISOString(),
    daysUsed,
    daysLeft,
    expired: daysLeft === 0,
  };
}

/* ---------------- API do banco ---------------- */

export function getDatabase(): NexorDatabase {
  if (!cache) {
    journal = readJournal();
    cache = generateDatabase();
    applyJournal(cache);
  }
  return cache;
}

/** Grava a criação/atualização de um registro e notifica a UI. */
export function commit<T extends { id: string }>(collection: CollectionName, entity: T): T {
  const db = getDatabase();
  const list = db[collection] as unknown as T[];
  const idx = list.findIndex((r) => r.id === entity.id);
  if (idx >= 0) list[idx] = entity;
  else list.unshift(entity);

  journal.ops.push({ c: collection, t: 'upsert', d: entity as unknown as Record<string, unknown> });
  writeJournal();
  notify();
  return entity;
}

export function remove(collection: CollectionName, id: string): void {
  const db = getDatabase();
  const list = db[collection] as unknown as { id: string }[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx >= 0) list.splice(idx, 1);
  journal.ops.push({ c: collection, t: 'delete', id });
  writeJournal();
  notify();
}

/** Reinicia a demonstração descartando o journal (o seed é reconstruído). */
export function resetDemo(): void {
  journal = { version: DB_VERSION, ops: [] };
  try {
    localStorage.removeItem(JOURNAL_KEY);
    localStorage.removeItem(TRIAL_KEY);
  } catch { /* ignore */ }
  cache = null;
  notify();
}

export function journalSize(): number {
  return journal.ops.length;
}

/* ---------------- Reatividade ---------------- */

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let version = 0;
export function getVersion(): number {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((l) => l());
}

/** Gera identificadores únicos para registros criados na demonstração. */
let idSeq = 0;
export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}${idSeq.toString(36)}`;
}
