import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  MODULOS,
  ROLE_PERMISSIONS,
  podeExecutar,
  podeVer,
  type ModuleDefinition,
  type ModuleKey,
  type PermissionKey,
  type RoleKey,
  type User,
} from '@veyra/core';
import { ORGANIZACOES, PLANOS, USUARIOS } from '../data/base';

/**
 * Sessão
 *
 * Guarda o usuário autenticado, o tema e o acesso. Duas decisões aqui
 * são deliberadas:
 *
 *  1. A lista de módulos visíveis sai da mesma matriz que protegeria a
 *     rota na API. Não existe um segundo lugar dizendo "quem vê o quê" —
 *     um segundo lugar é onde os dois divergem.
 *
 *  2. Trocar de papel não recarrega a página. Isso existe para a
 *     demonstração: dá para ver o mesmo dado sob quatro permissões
 *     diferentes em segundos, que é o que convence quem está avaliando.
 */

export type Tema = 'escuro' | 'claro';

interface Sessao {
  usuario: User;
  organizacao: (typeof ORGANIZACOES)[number];
  plano: (typeof PLANOS)[number];
  permissoes: PermissionKey[];
  modulosVisiveis: ModuleDefinition[];
  pode: (permissao: PermissionKey) => boolean;
  veModulo: (modulo: ModuleKey) => boolean;
  trocarPapel: (papel: RoleKey) => void;
  tema: Tema;
  alternarTema: () => void;
  /** Cresce a cada mutação. Consultas em componentes dependem dele. */
  versaoDados: number;
  invalidar: () => void;
}

const SessaoContext = createContext<Sessao | null>(null);

const CHAVE_TEMA = 'veyra:tema';
const CHAVE_PAPEL = 'veyra:papel';

function lerArmazenado(chave: string): string | null {
  /* Navegador em janela anônima ou com dados de site bloqueados lança
     aqui. A preferência é conveniência: perder o valor não pode derrubar
     o aplicativo. */
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarArmazenado(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    /* segue sem persistir */
  }
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [papel, setPapel] = useState<RoleKey>(() => (lerArmazenado(CHAVE_PAPEL) as RoleKey) ?? 'administrador');
  /* O escuro é o padrão mesmo quando o sistema do leitor está claro: no
     VEYRA ele não é uma preferência de acessibilidade, é a superfície
     onde o dado brilha e a marca se lê. Quem preferir claro alterna na
     barra superior, e a escolha fica guardada. */
  const [tema, setTema] = useState<Tema>(() => (lerArmazenado(CHAVE_TEMA) as Tema) ?? 'escuro');
  const [versaoDados, setVersaoDados] = useState(1);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    gravarArmazenado(CHAVE_TEMA, tema);
  }, [tema]);

  const usuario = useMemo(() => USUARIOS.find((u) => u.papel === papel) ?? USUARIOS[0], [papel]);
  const organizacao = ORGANIZACOES[0];
  const plano = useMemo(() => PLANOS.find((p) => p.id === organizacao.planoId) ?? PLANOS[0], [organizacao.planoId]);

  const permissoes = useMemo(() => ROLE_PERMISSIONS[papel], [papel]);

  const sujeito = useMemo(
    () => ({
      papel,
      permissoesExtras: usuario.permissoesExtras,
      permissoesRevogadas: usuario.permissoesRevogadas,
      modulosLiberados: organizacao.modulosLiberados,
    }),
    [papel, usuario, organizacao.modulosLiberados],
  );

  const pode = useCallback((permissao: PermissionKey) => podeExecutar(sujeito, permissao), [sujeito]);
  const veModulo = useCallback((modulo: ModuleKey) => podeVer(sujeito, modulo), [sujeito]);

  const modulosVisiveis = useMemo(
    /* `email` é um canal dentro de Conversas, não um item de menu próprio. */
    () => MODULOS.filter((m) => m.chave !== 'email' && podeVer(sujeito, m.chave)),
    [sujeito],
  );

  const trocarPapel = useCallback((novo: RoleKey) => {
    setPapel(novo);
    gravarArmazenado(CHAVE_PAPEL, novo);
  }, []);

  const alternarTema = useCallback(() => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro')), []);
  const invalidar = useCallback(() => setVersaoDados((v) => v + 1), []);

  const valor = useMemo<Sessao>(
    () => ({
      usuario,
      organizacao,
      plano,
      permissoes,
      modulosVisiveis,
      pode,
      veModulo,
      trocarPapel,
      tema,
      alternarTema,
      versaoDados,
      invalidar,
    }),
    [usuario, organizacao, plano, permissoes, modulosVisiveis, pode, veModulo, trocarPapel, tema, alternarTema, versaoDados, invalidar],
  );

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}

export function useSessao(): Sessao {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error('useSessao precisa estar dentro de ProvedorSessao.');
  return ctx;
}
