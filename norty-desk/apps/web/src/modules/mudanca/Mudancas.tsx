import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EscreverMudancaRequest, MudancaResumo } from '@norty-desk/shared';
import {
  CHANGE_KINDS,
  CHANGE_RISKS,
  CHANGE_STATUSES,
  ROTULO_MUDANCA_RISCO,
  ROTULO_MUDANCA_STATUS,
  ROTULO_MUDANCA_TIPO,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { buscarMudancas, criarMudanca } from '../../api/mudancas';
import { useAutenticacao } from '../../auth/Autenticacao';
import { janelaCurta, seloDaMudanca, seloDoRisco } from './formato';

/**
 * As mudanças.
 *
 * Ordenadas pela janela, não pela data de cadastro: quem abre esta tela
 * quer saber **o que passa hoje**. A coluna de tipo está sempre visível
 * porque é ela que diz se aquela linha precisou de aval — e uma fila de
 * emergenciais é o sinal de que o processo virou fachada.
 */
export function Mudancas() {
  const { can } = useAutenticacao();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [abertas, setAbertas] = useState(true);
  const [mudancas, setMudancas] = useState<MudancaResumo[] | null>(null);
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setMudancas(
      await buscarMudancas({
        q: busca || undefined,
        status: (status || undefined) as MudancaResumo['status'] | undefined,
        abertas: status ? undefined : abertas,
      }),
    );
  }, [busca, status, abertas]);

  useEffect(() => {
    setMudancas(null);
    void recarregar().catch(() => setErro('Não foi possível carregar as mudanças.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Mudanças</h2>
          <p>
            O que vai mexer em produção, quando, e como se desfaz. Sem plano de recuo escrito,
            a mudança não sai do rascunho.
          </p>
        </div>
        {can('mudanca:gerenciar') ? (
          <button type="button" className="btn -primario" onClick={() => setNova(true)}>
            Nova mudança
          </button>
        ) : null}
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
          <label className="so-leitor" htmlFor="busca-mudancas">
            Buscar mudanças
          </label>
          <input
            id="busca-mudancas"
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
          {CHANGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_MUDANCA_STATUS[s]}
            </option>
          ))}
        </select>

        <label className="switch">
          <input
            type="checkbox"
            checked={abertas}
            disabled={Boolean(status)}
            onChange={(e) => setAbertas(e.target.checked)}
          />
          <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
          <span>Só as em curso</span>
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

      {!mudancas ? (
        <div className="sk sk-bloco" />
      ) : mudancas.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma mudança</h3>
          <p>
            Toda alteração planejada em produção passa por aqui — com plano de execução, de
            teste e de recuo.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="-num">#</th>
                  <th>Mudança</th>
                  <th>Situação</th>
                  <th>Tipo</th>
                  <th>Risco</th>
                  <th>Janela</th>
                  <th className="-num">Chamados</th>
                </tr>
              </thead>
              <tbody>
                {mudancas.map((m) => (
                  <tr key={m.id}>
                    <td className="-num mono">{m.number}</td>
                    <td className="tabela-titulo-celula">
                      <Link to={`/mudancas/${m.id}`}>{m.title}</Link>
                    </td>
                    <td>
                      <span className={`selo ${seloDaMudanca(m.status)}`}>
                        {ROTULO_MUDANCA_STATUS[m.status]}
                      </span>
                    </td>
                    <td>{ROTULO_MUDANCA_TIPO[m.kind]}</td>
                    <td>
                      <span className={`selo ${seloDoRisco(m.risk)}`}>
                        {ROTULO_MUDANCA_RISCO[m.risk]}
                      </span>
                    </td>
                    <td className="num">{janelaCurta(m.windowStart, m.windowEnd)}</td>
                    <td className="-num">{m.ticketCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nova ? (
        <NovaMudanca
          aoFechar={() => setNova(false)}
          aoSalvar={async (dados) => {
            await criarMudanca(dados);
            setNova(false);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function NovaMudanca({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void;
  aoSalvar: (dados: EscreverMudancaRequest) => Promise<void>;
}) {
  const [campos, setCampos] = useState<EscreverMudancaRequest>({
    title: '',
    description: '',
    kind: 'NORMAL',
    risk: 'MEDIO',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const definir = (chave: keyof EscreverMudancaRequest, valor: string) =>
    setCampos((atual) => ({ ...atual, [chave]: valor }));

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nova mudança"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Nova mudança</h3>
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
            void aoSalvar(campos)
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
              <label className="campo-rotulo" htmlFor="titulo-mudanca">
                Título
              </label>
              <input
                id="titulo-mudanca"
                className="input"
                required
                minLength={3}
                value={campos.title}
                onChange={(e) => definir('title', e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="descricao-mudanca">
                O que vai mudar
              </label>
              <textarea
                id="descricao-mudanca"
                className="textarea"
                rows={3}
                required
                minLength={3}
                value={campos.description}
                onChange={(e) => definir('description', e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-mudanca">
                  Tipo
                </label>
                <select
                  id="tipo-mudanca"
                  className="select"
                  value={campos.kind}
                  onChange={(e) => definir('kind', e.target.value)}
                >
                  {CHANGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_MUDANCA_TIPO[k]}
                    </option>
                  ))}
                </select>
                <span className="campo-ajuda">
                  Normal exige aval antes de executar. Padrão é pré-aprovada; emergencial
                  executa antes e aprova depois.
                </span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="risco-mudanca">
                  Risco
                </label>
                <select
                  id="risco-mudanca"
                  className="select"
                  value={campos.risk}
                  onChange={(e) => definir('risk', e.target.value)}
                >
                  {CHANGE_RISKS.map((r) => (
                    <option key={r} value={r}>
                      {ROTULO_MUDANCA_RISCO[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="campo-ajuda">
              Os planos de execução, teste e recuo entram na tela da mudança — o rascunho existe
              para eles serem escritos aos poucos.
            </p>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Abrir rascunho
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
