import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MeResponse, Permission, Role } from '@norty-desk/shared';

import { aoExpirar, guardarToken, recuperarSessao } from '../api/cliente';
import * as api from '../api/endpoints';

type Sessao = {
  carregando: boolean;
  perfil: MeResponse | null;
  /**
   * Muda a cada operação que altera dados. Consultas o incluem nas
   * dependências para revalidar sem cada tela inventar o seu próprio
   * mecanismo de recarga.
   */
  versao: number;
};

type Contexto = Sessao & {
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  revalidar: () => void;
  can: (permissao: Permission) => boolean;
  papel: Role | null;
};

const ContextoAutenticacao = createContext<Contexto | null>(null);

export function ProvedorDeAutenticacao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao>({
    carregando: true,
    perfil: null,
    versao: 0,
  });

  const carregarPerfil = useCallback(async () => {
    const perfil = await api.meuPerfil();
    setSessao((s) => ({ ...s, carregando: false, perfil }));
  }, []);

  useEffect(() => {
    // O access token vive em memória e some ao recarregar a página. O
    // cookie httpOnly do refresh sobrevive, então a subida tenta
    // recuperar a sessão em silêncio antes de mostrar o login.
    let ativo = true;

    (async () => {
      const recuperada = await recuperarSessao();
      if (!ativo) return;

      if (!recuperada) {
        setSessao({ carregando: false, perfil: null, versao: 0 });
        return;
      }

      try {
        await carregarPerfil();
      } catch {
        if (ativo) setSessao({ carregando: false, perfil: null, versao: 0 });
      }
    })();

    aoExpirar(() => setSessao({ carregando: false, perfil: null, versao: 0 }));

    return () => {
      ativo = false;
    };
  }, [carregarPerfil]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const resposta = await api.entrar(email, senha);
      guardarToken(resposta.accessToken);
      await carregarPerfil();
    },
    [carregarPerfil],
  );

  const sair = useCallback(async () => {
    await api.sair().catch(() => undefined);
    guardarToken(null);
    setSessao({ carregando: false, perfil: null, versao: 0 });
  }, []);

  const revalidar = useCallback(() => {
    setSessao((s) => ({ ...s, versao: s.versao + 1 }));
  }, []);

  const valor = useMemo<Contexto>(
    () => ({
      ...sessao,
      entrar,
      sair,
      revalidar,
      papel: sessao.perfil?.role ?? null,
      // As permissões vêm resolvidas do `/me`: o aplicativo não
      // recalcula a matriz, e as duas pontas não podem divergir.
      can: (permissao) => sessao.perfil?.permissions.includes(permissao) ?? false,
    }),
    [sessao, entrar, sair, revalidar],
  );

  return (
    <ContextoAutenticacao.Provider value={valor}>{children}</ContextoAutenticacao.Provider>
  );
}

export function useAutenticacao(): Contexto {
  const contexto = useContext(ContextoAutenticacao);
  if (!contexto) {
    throw new Error('useAutenticacao precisa estar dentro de ProvedorDeAutenticacao.');
  }
  return contexto;
}

/**
 * Consulta com revalidação.
 *
 * `versao` entra nas dependências: qualquer comando que chame
 * `revalidar()` recarrega o que estiver na tela, sem cada componente
 * inventar o seu mecanismo.
 */
export function useRecurso<T>(
  buscar: () => Promise<T>,
  dependencias: unknown[] = [],
): { dado: T | null; erro: Error | null; carregando: boolean } {
  const { versao } = useAutenticacao();
  const [estado, setEstado] = useState<{ dado: T | null; erro: Error | null; carregando: boolean }>(
    { dado: null, erro: null, carregando: true },
  );

  useEffect(() => {
    let ativo = true;
    setEstado((e) => ({ ...e, carregando: true }));

    buscar()
      .then((dado) => ativo && setEstado({ dado, erro: null, carregando: false }))
      .catch((erro: Error) => ativo && setEstado({ dado: null, erro, carregando: false }));

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, ...dependencias]);

  return estado;
}
