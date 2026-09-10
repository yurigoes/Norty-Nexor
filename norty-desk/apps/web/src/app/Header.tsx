import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useAutenticacao } from '../auth/Autenticacao';

/**
 * O título de cada rota.
 *
 * A barra ficava escrita "Chamados" em toda tela, inclusive na
 * configuração de canais — e a busca, que só faz sentido na fila,
 * escrevia `?q=` na URL da configuração e não acontecia nada.
 */
const TITULOS: { prefixo: string; titulo: string }[] = [
  { prefixo: '/config/canais/diagnostico', titulo: 'Diagnóstico de canais' },
  { prefixo: '/config/canais', titulo: 'Canais' },
  { prefixo: '/config/categorias', titulo: 'Categorias' },
  { prefixo: '/config/sla', titulo: 'SLA e calendários' },
  { prefixo: '/config/recorrencias', titulo: 'Chamados recorrentes' },
  { prefixo: '/config/formularios', titulo: 'Formulários' },
  { prefixo: '/config/modelos', titulo: 'Modelos' },
  { prefixo: '/config/contratos', titulo: 'Contratos e custo' },
  { prefixo: '/config/catalogo-ativos', titulo: 'Catálogo do ativo' },
  { prefixo: '/config/marca', titulo: 'Marca' },
  { prefixo: '/config/webhooks', titulo: 'Webhooks' },
  { prefixo: '/config/auditoria', titulo: 'Auditoria' },
  { prefixo: '/config/autenticacao', titulo: 'Autenticação' },
  { prefixo: '/config/pessoas', titulo: 'Pessoas' },
  { prefixo: '/painel', titulo: 'Painel' },
  { prefixo: '/ativos/', titulo: 'Equipamento' },
  { prefixo: '/ativos', titulo: 'Ativos' },
  { prefixo: '/problemas/erros-conhecidos', titulo: 'Erros conhecidos' },
  { prefixo: '/problemas/', titulo: 'Problema' },
  { prefixo: '/problemas', titulo: 'Problemas' },
  { prefixo: '/mudancas/', titulo: 'Mudança' },
  { prefixo: '/mudancas', titulo: 'Mudanças' },
  { prefixo: '/aprovacoes', titulo: 'Aprovações' },
  { prefixo: '/conhecimento', titulo: 'Base de conhecimento' },
  { prefixo: '/chamados/novo', titulo: 'Abrir chamado' },
  { prefixo: '/chamados/', titulo: 'Chamado' },
  { prefixo: '/', titulo: 'Chamados' },
];

function tituloDa(caminho: string): string {
  return TITULOS.find((t) => caminho.startsWith(t.prefixo))?.titulo ?? 'Chamados';
}

export function Header() {
  const navegar = useNavigate();
  const local = useLocation();
  const { can } = useAutenticacao();
  const [parametros, definirParametros] = useSearchParams();
  const [busca, setBusca] = useState(parametros.get('q') ?? '');

  const naFila = local.pathname === '/';

  function pesquisar(evento: FormEvent) {
    evento.preventDefault();
    const termo = busca.trim();

    // Fora da fila, buscar leva para a fila com o termo aplicado. Antes
    // a busca escrevia na URL da tela em que estava e não fazia nada.
    if (!naFila) {
      navegar(termo ? `/?q=${encodeURIComponent(termo)}` : '/');
      return;
    }

    const proximos = new URLSearchParams(parametros);
    if (termo) proximos.set('q', termo);
    else proximos.delete('q');
    definirParametros(proximos);
  }

  return (
    <header className="header">
      <div className="header-titulo">
        <h1>{tituloDa(local.pathname)}</h1>
      </div>

      <div className="header-acoes">
        <form onSubmit={pesquisar} className="busca">
          <label className="so-leitor" htmlFor="busca-global">
            Buscar chamados
          </label>
          <input
            id="busca-global"
            className="input busca-global"
            type="search"
            placeholder="Número, assunto ou solicitante"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>

        {can('chamado:criar') ? (
          <button
            type="button"
            className="btn -primario"
            onClick={() => navegar('/chamados/novo')}
          >
            Novo chamado
          </button>
        ) : null}
      </div>
    </header>
  );
}
