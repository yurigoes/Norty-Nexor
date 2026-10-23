import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { errorMessage } from './api';
import { useToast } from '../components/toast';

export interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (value: T | undefined) => void;
}

/**
 * Busca dados da API e acompanha carregamento e erro. Respostas fora de
 * ordem são descartadas: só a última consulta pinta a tela.
 */
export function useApi<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList, enabled = true): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fnRef.current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/**
 * Executa uma ação (salvar, aprovar, dar baixa) com estado de envio e
 * mensagem de sucesso/erro. Impede envio duplo enquanto a anterior roda.
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; silentError?: boolean } = {},
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    try {
      const result = await fn(...args);
      const message = typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.success(message);
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      if (!options.silentError) toast.error(errorMessage(error));
      throw error;
    } finally {
      busy.current = false;
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
  return { run, pending };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Estado sincronizado com a query string (filtros compartilháveis por link). */
export function useQueryState(key: string, initial = ''): [string, (v: string) => void] {
  const read = () => new URLSearchParams(window.location.search).get(key) ?? initial;
  const [value, setValue] = useState(read);
  const update = useCallback((next: string) => {
    setValue(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set(key, next);
    else params.delete(key);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [key]);
  return [value, update];
}
