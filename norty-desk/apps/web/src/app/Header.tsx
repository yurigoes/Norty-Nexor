import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAutenticacao } from '../auth/Autenticacao';

export function Header() {
  const navegar = useNavigate();
  const { can } = useAutenticacao();
  const [parametros, definirParametros] = useSearchParams();
  const [busca, setBusca] = useState(parametros.get('q') ?? '');

  function pesquisar(evento: FormEvent) {
    evento.preventDefault();
    const proximos = new URLSearchParams(parametros);
    if (busca.trim()) proximos.set('q', busca.trim());
    else proximos.delete('q');
    definirParametros(proximos);
  }

  return (
    <header className="header">
      <div className="header-titulo">
        <h1>Chamados</h1>
      </div>

      <div className="header-acoes">
        <form onSubmit={pesquisar} className="busca">
          <label className="so-leitor" htmlFor="busca-global">
            Buscar chamados
          </label>
          <input
            id="busca-global"
            className="input"
            type="search"
            placeholder="Número, assunto ou solicitante"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ minWidth: 280, paddingLeft: 'var(--e-3)' }}
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
