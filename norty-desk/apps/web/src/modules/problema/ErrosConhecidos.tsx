import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ErroConhecidoSugerido } from '@norty-desk/shared';
import { ROTULO_PROBLEMA_STATUS } from '@norty-desk/shared';

import { errosConhecidos } from '../../api/problemas';
import { seloDoProblema } from './formato';

/**
 * A base de erros conhecidos.
 *
 * O que separa "estamos investigando" de "sabemos o que é e como
 * contornar". O contorno vem inteiro na lista de propósito: quem chega
 * aqui está com o telefone na mão e precisa da resposta, não de mais um
 * clique.
 */
export function ErrosConhecidos() {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [erros, setErros] = useState<ErroConhecidoSugerido[] | null>(null);

  useEffect(() => {
    setErros(null);
    void errosConhecidos({ q: busca || undefined, limit: 50 })
      .then(setErros)
      .catch(() => setErros([]));
  }, [busca]);

  return (
    <div className="pilha" style={{ maxWidth: 880 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Erros conhecidos</h2>
          <p>
            Problemas com causa e contorno documentados. É o que o atendimento consulta quando o
            mesmo chamado chega pela décima vez.
          </p>
        </div>
        <Link to="/problemas" className="btn -secundario">
          Todos os problemas
        </Link>
      </div>

      <form
        className="busca"
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(termo.trim());
        }}
      >
        <label className="so-leitor" htmlFor="busca-erros">
          Buscar erro conhecido
        </label>
        <input
          id="busca-erros"
          className="input"
          type="search"
          placeholder="Descreva o sintoma"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </form>

      {!erros ? (
        <div className="sk sk-bloco" />
      ) : erros.length === 0 ? (
        <div className="vazio">
          <h3>Nada por aqui</h3>
          <p>
            Um problema entra nesta base quando alguém escreve a causa e o contorno juntos, na
            tela do problema.
          </p>
        </div>
      ) : (
        erros.map((erro) => (
          <article key={erro.id} className="card">
            <div className="card-topo">
              <div>
                <h3 className="card-titulo">
                  <Link to={`/problemas/${erro.id}`}>{erro.title}</Link>
                </h3>
                <p className="card-sub mono">P#{erro.number}</p>
              </div>
              <span className={`selo ${seloDoProblema(erro.status)}`}>
                {ROTULO_PROBLEMA_STATUS[erro.status]}
              </span>
            </div>
            <div className="card-corpo">
              <span className="campo-rotulo">Solução de contorno</span>
              <p style={{ whiteSpace: 'pre-wrap' }}>{erro.workaround}</p>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
