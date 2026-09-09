import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EscreverProblemaRequest, ProblemaResumo } from '@norty-desk/shared';
import { PROBLEM_STATUSES, ROTULO_PRIORIDADE, ROTULO_PROBLEMA_STATUS } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { buscarProblemas, criarProblema } from '../../api/problemas';
import { useAutenticacao } from '../../auth/Autenticacao';
import { MODIFICADOR_PRIORIDADE, dataCurta } from '../../lib/formato';
import { seloDoProblema } from './formato';

/**
 * Os problemas abertos.
 *
 * O que o GLPI chama de problema é um chamado com outra tabela — mesmos
 * status, e a causa raiz num campo que ninguém preenche. Aqui o status
 * conta a investigação, e a coluna que importa é a de chamados: um
 * problema com doze chamados pendurados é o que se ataca primeiro.
 */
export function Problemas() {
  const { can } = useAutenticacao();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [abertos, setAbertos] = useState(true);
  const [problemas, setProblemas] = useState<ProblemaResumo[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setProblemas(
      await buscarProblemas({
        q: busca || undefined,
        status: (status || undefined) as ProblemaResumo['status'] | undefined,
        abertos: status ? undefined : abertos,
      }),
    );
  }, [busca, status, abertos]);

  useEffect(() => {
    setProblemas(null);
    void recarregar().catch(() => setErro('Não foi possível carregar os problemas.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Problemas</h2>
          <p>
            A causa por trás dos chamados que se repetem. Documentar causa e contorno juntos é o
            que transforma o problema em erro conhecido.
          </p>
        </div>
        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <Link to="/problemas/erros-conhecidos" className="btn -secundario">
            Erros conhecidos
          </Link>
          {can('problema:gerenciar') ? (
            <button type="button" className="btn -primario" onClick={() => setNovo(true)}>
              Novo problema
            </button>
          ) : null}
        </div>
      </div>

      <form
        className="linha"
        style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(termo.trim());
        }}
      >
        <div className="busca" style={{ flex: '1 1 260px' }}>
          <label className="so-leitor" htmlFor="busca-problemas">
            Buscar problemas
          </label>
          <input
            id="busca-problemas"
            className="input"
            type="search"
            placeholder="Título ou descrição"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>

        <select
          className="select -auto"
          aria-label="Situação"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todas as situações</option>
          {PROBLEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_PROBLEMA_STATUS[s]}
            </option>
          ))}
        </select>

        <label className="switch">
          <input
            type="checkbox"
            checked={abertos}
            disabled={Boolean(status)}
            onChange={(e) => setAbertos(e.target.checked)}
          />
          <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
          <span>Só os de pé</span>
        </label>

        <button type="submit" className="btn -secundario">
          Buscar
        </button>
      </form>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!problemas ? (
        <div className="sk sk-bloco" />
      ) : problemas.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum problema</h3>
          <p>
            Quando o mesmo chamado chega pela terceira vez, abra um problema e pendure os três
            nele. É assim que a causa deixa de se perder.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="-num">#</th>
                  <th>Problema</th>
                  <th>Situação</th>
                  <th>Prioridade</th>
                  <th>Responsável</th>
                  <th className="-num">Chamados</th>
                  <th>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {problemas.map((p) => (
                  <tr key={p.id}>
                    <td className="-num mono">{p.number}</td>
                    <td className="tabela-titulo-celula">
                      <Link to={`/problemas/${p.id}`}>{p.title}</Link>
                      {p.isKnownError ? (
                        <span className="selo -sucesso" style={{ marginLeft: 'var(--e-2)' }}>
                          erro conhecido
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`selo ${seloDoProblema(p.status)}`}>
                        {ROTULO_PROBLEMA_STATUS[p.status]}
                      </span>
                    </td>
                    <td>
                      <span className={`prio ${MODIFICADOR_PRIORIDADE[p.priority]}`}>
                        <span className="prio-ponto" aria-hidden="true" />
                        {ROTULO_PRIORIDADE[p.priority]}
                      </span>
                    </td>
                    <td>{p.assignedUser?.name ?? p.assignedTeam?.name ?? '—'}</td>
                    <td className="-num">{p.ticketCount}</td>
                    <td className="num">{dataCurta(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {novo ? (
        <NovoProblema
          aoFechar={() => setNovo(false)}
          aoSalvar={async (dados) => {
            await criarProblema(dados);
            setNovo(false);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function NovoProblema({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void;
  aoSalvar: (dados: EscreverProblemaRequest) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState(3);
  const [impact, setImpact] = useState(3);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Novo problema"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Novo problema</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              title,
              description,
              urgency: urgency as EscreverProblemaRequest['urgency'],
              impact: impact as EscreverProblemaRequest['impact'],
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <label className="campo-rotulo" htmlFor="titulo-problema">
                Título
              </label>
              <input
                id="titulo-problema"
                className="input"
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="campo-ajuda">
                O sintoma como quem sofre dele o descreve — é por ele que a busca vai achar.
              </span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="descricao-problema">
                O que acontece
              </label>
              <textarea
                id="descricao-problema"
                className="textarea"
                rows={4}
                required
                minLength={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <Escala id="urgencia-problema" rotulo="Urgência" valor={urgency} aoMudar={setUrgency} />
              <Escala id="impacto-problema" rotulo="Impacto" valor={impact} aoMudar={setImpact} />
            </div>

            <p className="campo-ajuda">
              A prioridade sai da matriz da organização — ela não se digita.
            </p>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Abrir problema
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Escala({
  id,
  rotulo,
  valor,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <select
        id={id}
        className="select"
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
      >
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <option key={n} value={n}>
            {n} · {ROTULO_PRIORIDADE[n]}
          </option>
        ))}
      </select>
    </div>
  );
}
