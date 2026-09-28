import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  BuscaSalvaView,
  Compartilhamento,
  FiltroSalvavel,
  TicketQuery,
  TicketStatus,
  TimeView,
} from '@norty-desk/shared';
import {
  ROTULO_COMPARTILHAMENTO,
  camposUsados,
  descreverFiltro,
  filtroParaParametros,
  parametrosParaFiltro,
} from '@norty-desk/shared';

import { useAutenticacao, useRecurso } from '../../auth/Autenticacao';
import { BarraDeLote } from '../lote/BarraDeLote';
import * as api from '../../api/endpoints';
import * as buscasApi from '../../api/buscas';
import { ErroDaApi } from '../../api/cliente';
import { FiltroDaFila } from './FiltroDaFila';
import {
  MODIFICADOR_PRIORIDADE,
  ROTULO_CANAL,
  ROTULO_STATUS,
  dataCurta,
  duracaoCurta,
  estadoSla,
  modificadorCanal,
  seloStatus,
} from '../../lib/formato';

type Visao = { chave: string; rotulo: string; filtro: Record<string, string> };

const VISOES: Visao[] = [
  { chave: 'time', rotulo: 'Do meu time', filtro: {} },
  { chave: 'meus', rotulo: 'Meus', filtro: { assignedUserId: 'me' } },
  { chave: 'sem', rotulo: 'Sem atribuição', filtro: { semAtribuicao: 'true' } },
  { chave: 'sla', rotulo: 'SLA estourado', filtro: { slaBreached: 'true' } },
  { chave: 'abertos', rotulo: 'Em aberto', filtro: { status: 'NOVO,ATRIBUIDO,PLANEJADO,PENDENTE' } },
];

/**
 * A fila de trabalho.
 *
 * O filtro mora na URL: um agente manda o link da visão para o colega e
 * o colega vê a mesma coisa. Estado de tela em `useState` não sobrevive
 * a um F5 nem cabe num link.
 *
 * As cinco visões fixas continuam sendo atalhos do código. O que a pessoa
 * monta no painel e nomeia vira **busca salva**, que é a mesma coisa com
 * dono: aba ao lado, ordem que ela escolhe, e uma que abre por padrão.
 */
export function Fila() {
  const navegar = useNavigate();
  const { can, revalidar, perfil } = useAutenticacao();
  const [parametros, definirParametros] = useSearchParams();
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const [buscas, setBuscas] = useState<BuscaSalvaView[]>([]);
  const [mostrarFiltro, setMostrarFiltro] = useState(false);
  const [nomeando, setNomeando] = useState<string | null>(null);
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null);
  const [meusTimes, setMeusTimes] = useState<TimeView[]>([]);

  const filtro = useMemo<TicketQuery & { semAtribuicao?: boolean }>(() => {
    const f: Record<string, unknown> = {};
    for (const [chave, valor] of parametros.entries()) f[chave] = valor;
    return f as TicketQuery;
  }, [parametros]);

  /** O filtro sem paginação: o que o painel edita e a busca salva guarda. */
  const filtroSalvavel = useMemo(() => parametrosParaFiltro(parametros), [parametros]);

  const chave = parametros.toString();
  const { dado, erro, carregando } = useRecurso(() => api.listarChamados(filtro), [chave]);

  // Trocar de visão limpa a seleção: agir sobre chamado que saiu da
  // tela é o jeito clássico de fechar em massa o que não devia.
  useEffect(() => setSelecionados([]), [chave]);

  useEffect(() => {
    void buscasApi
      .listarBuscasSalvas()
      .then((lista) => {
        setBuscas(lista);

        // A padrão abre a fila — mas só quando a URL não pediu nada.
        // Sobrescrever um link recebido faria o colega ver outra coisa
        // que não a que lhe mandaram, o que é o contrário do que o
        // filtro na URL existe para garantir.
        const padrao = lista.find((b) => b.isDefault);
        if (padrao && [...parametros.keys()].length === 0) {
          definirParametros(filtroParaParametros(padrao.filtro), { replace: true });
        }
      })
      .catch(() => undefined);
    void api
      .listarTimes()
      .then(setMeusTimes)
      .catch(() => undefined);

    // Só na montagem: relê a cada mudança de filtro seria uma consulta
    // por clique de aba, e a padrão brigaria com a escolha da pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicar(visao: Visao) {
    const proximos = new URLSearchParams();
    // A busca sobrevive à troca de visão; o resto do filtro, não.
    const q = parametros.get('q');
    if (q) proximos.set('q', q);
    for (const [k, v] of Object.entries(visao.filtro)) proximos.set(k, v);
    definirParametros(proximos);
  }

  /** Abre uma busca salva. O filtro vai inteiro para a URL. */
  function abrir(busca: BuscaSalvaView) {
    definirParametros(filtroParaParametros(busca.filtro));
  }

  const falhar = (e: unknown) =>
    setErroDaBusca(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a busca.');

  const podeLote = can('chamado:acao-em-lote');

  const visaoAtual =
    VISOES.find((v) =>
      Object.entries(v.filtro).every(([k, valor]) => parametros.get(k) === valor),
    ) ?? VISOES[0];

  // Qual busca salva está aberta: a que dá a mesma URL que a atual.
  // Comparar o filtro gravado com os parâmetros de agora, e não guardar
  // "qual aba cliquei", é o que faz a aba continuar marcada depois de um
  // F5 ou de um link colado.
  const daUrl = filtroParaParametros(filtroSalvavel).toString();
  const buscaAtual = buscas.find((b) => filtroParaParametros(b.filtro).toString() === daUrl);

  // A visão fixa só está "ativa" se nenhuma busca salva responde pela
  // URL: com as duas marcadas, a tela diria que está em dois lugares.
  const semVisaoFixa = Boolean(buscaAtual) || camposUsados(filtroSalvavel) > 0;

  return (
    <div className="pilha">
      <div className="abas" role="tablist" aria-label="Visões da fila">
        {VISOES.map((visao) => (
          <button
            key={visao.chave}
            type="button"
            role="tab"
            className="aba"
            aria-selected={!semVisaoFixa && visao.chave === visaoAtual.chave}
            onClick={() => aplicar(visao)}
          >
            {visao.rotulo}
          </button>
        ))}

        {buscas.map((busca) => (
          <button
            key={busca.id}
            type="button"
            role="tab"
            className="aba"
            aria-selected={busca.id === buscaAtual?.id}
            title={`${descreverFiltro(busca.filtro)}${
              busca.isMine
                ? ''
                : ` — ${busca.shareKind === 'TIME' ? `do time ${busca.team?.name}` : 'da casa'}, de ${busca.owner.name}`
            }`}
            onClick={() => abrir(busca)}
          >
            {busca.name}
            {busca.shareKind === 'PRIVADA' ? null : (
              // A aba que não é só minha diz isso à primeira vista: sem
              // marca, renomear a própria e a do time parecem a mesma
              // coisa até o 403 chegar.
              <span
                aria-label={busca.shareKind === 'TIME' ? 'do time' : 'da casa'}
                title={
                  busca.shareKind === 'TIME'
                    ? `Do time ${busca.team?.name}, de ${busca.owner.name}`
                    : `Da casa, de ${busca.owner.name}`
                }
              >
                {' '}
                {busca.shareKind === 'TIME' ? '👥' : '🏠'}
              </span>
            )}
            {busca.isDefault ? (
              <span aria-label="abre por padrão" title="Abre por padrão">
                {' '}
                ★
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <BarraDoFiltro
        filtro={filtroSalvavel}
        buscaAtual={buscaAtual}
        buscas={buscas}
        aberto={mostrarFiltro}
        nomeando={nomeando}
        aoAbrirPainel={() => setMostrarFiltro((v) => !v)}
        aoNomear={setNomeando}
        aoSalvar={(name) => {
          setErroDaBusca(null);
          void buscasApi
            .salvarBusca({ name, filtro: filtroSalvavel })
            .then((lista) => {
              setBuscas(lista);
              setNomeando(null);
            })
            .catch(falhar);
        }}
        aoRegravar={(id) => {
          setErroDaBusca(null);
          void buscasApi
            .atualizarBusca(id, { filtro: filtroSalvavel })
            .then(setBuscas)
            .catch(falhar);
        }}
        aoRenomear={(id, name) => {
          setErroDaBusca(null);
          void buscasApi
            .atualizarBusca(id, { name })
            .then((lista) => {
              setBuscas(lista);
              setNomeando(null);
            })
            .catch(falhar);
        }}
        aoMarcarPadrao={(id, isDefault) => {
          setErroDaBusca(null);
          void buscasApi.atualizarBusca(id, { isDefault }).then(setBuscas).catch(falhar);
        }}
        // Só os times que esta pessoa gerencia. Oferecer os outros seria
        // oferecer um botão que sempre responde 403 — e quem tem a
        // permissão da casa pode com qualquer um, então recebe a lista
        // inteira.
        times={
          can('chamado:busca-compartilhada')
            ? meusTimes
            : meusTimes.filter((t) =>
                t.members.some((m) => m.id === perfil?.user.id && m.isManager),
              )
        }
        podeCompartilharComACasa={can('chamado:busca-compartilhada')}
        aoCompartilhar={(id, shareKind, teamId) => {
          setErroDaBusca(null);
          void buscasApi
            .atualizarBusca(id, { shareKind, teamId: shareKind === 'TIME' ? teamId : null })
            .then(setBuscas)
            .catch(falhar);
        }}
        aoMover={(id, direcao) => {
          const ordem = buscas.map((b) => b.id);
          const onde = ordem.indexOf(id);
          const destino = onde + direcao;
          if (onde < 0 || destino < 0 || destino >= ordem.length) return;

          [ordem[onde], ordem[destino]] = [ordem[destino]!, ordem[onde]!];

          setErroDaBusca(null);
          void buscasApi.reordenarBuscas(ordem).then(setBuscas).catch(falhar);
        }}
        aoApagar={(id) => {
          setErroDaBusca(null);
          void buscasApi.removerBusca(id).then(setBuscas).catch(falhar);
        }}
      />

      {erroDaBusca ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erroDaBusca}</span>
        </div>
      ) : null}

      {mostrarFiltro ? (
        <FiltroDaFila
          filtro={filtroSalvavel}
          aoFechar={() => setMostrarFiltro(false)}
          aoAplicar={(novo) => {
            definirParametros(filtroParaParametros(novo));
            setMostrarFiltro(false);
          }}
        />
      ) : null}

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro.message}</span>
        </div>
      ) : null}

      {can('chamado:acao-em-lote') ? (
        <BarraDeLote
          selecionados={selecionados}
          aoLimpar={() => setSelecionados([])}
          aoConcluir={() => {
            setSelecionados([]);
            revalidar();
          }}
        />
      ) : null}

      {carregando ? (
        <div className="tabela-caixa" style={{ padding: 'var(--e-5)' }}>
          <div className="pilha-sm">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="sk sk-linha" />
            ))}
          </div>
        </div>
      ) : !dado || dado.data.length === 0 ? (
        <div className="tabela-caixa">
          <div className="vazio">
            <div className="vazio-arte" aria-hidden="true">
              <span style={{ transform: 'rotate(-45deg)' }}>✓</span>
            </div>
            <h3>Nada nesta visão</h3>
            <p>Quando um chamado cair neste filtro, ele aparece aqui.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="tabela-caixa fila-tabela">
            <div className="tabela-rolagem">
              <table className="tabela -densa">
                <thead>
                  <tr>
                    {podeLote ? (
                      <th scope="col" style={{ width: 36 }}>
                        <label className="check">
                          <span className="so-leitor">Selecionar todos</span>
                          <input
                            type="checkbox"
                            checked={
                              dado.data.length > 0 && selecionados.length === dado.data.length
                            }
                            onChange={(e) =>
                              setSelecionados(e.target.checked ? dado.data.map((c) => c.id) : [])
                            }
                          />
                        </label>
                      </th>
                    ) : null}
                    <th scope="col">Nº</th>
                    <th scope="col">Assunto</th>
                    <th scope="col">Status</th>
                    <th scope="col">Prioridade</th>
                    <th scope="col">Solicitante</th>
                    <th scope="col">Atribuído</th>
                    <th scope="col">SLA</th>
                    <th scope="col">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {dado.data.map((chamado) => {
                    const compromisso = chamado.commitments[0];
                    return (
                      <tr key={chamado.id} onClick={() => navegar(`/chamados/${chamado.id}`)}>
                        {podeLote ? (
                          // `stopPropagation`: marcar a caixa não pode
                          // abrir o chamado, que é o que a linha faz.
                          <td onClick={(e) => e.stopPropagation()}>
                            <label className="check">
                              <span className="so-leitor">Selecionar #{chamado.number}</span>
                              <input
                                type="checkbox"
                                checked={selecionados.includes(chamado.id)}
                                onChange={(e) =>
                                  setSelecionados((atual) =>
                                    e.target.checked
                                      ? [...atual, chamado.id]
                                      : atual.filter((id) => id !== chamado.id),
                                  )
                                }
                              />
                            </label>
                          </td>
                        ) : null}
                        <td className="mono">#{chamado.number}</td>
                        <td>
                          <span className="linha" style={{ gap: 'var(--e-2)' }}>
                            <span
                              className={`canal ${modificadorCanal(chamado.originChannel)}`}
                              title={`Aberto por ${ROTULO_CANAL[chamado.originChannel]}`}
                            />
                            <span className="tabela-titulo-celula">{chamado.subject}</span>
                          </span>
                        </td>
                        <td>
                          <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                            {ROTULO_STATUS[chamado.status]}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`prio -traco ${MODIFICADOR_PRIORIDADE[chamado.priority]}`}
                          >
                            <span className="prio-ponto" aria-hidden="true" />
                            {chamado.priority}
                          </span>
                        </td>
                        <td>{chamado.requester?.name ?? '—'}</td>
                        <td>{chamado.assignedUser?.name ?? chamado.assignedTeam?.name ?? '—'}</td>
                        <td>
                          {compromisso ? (
                            <span className={`sla ${estadoSla(compromisso.remainingSeconds)}`}>
                              {duracaoCurta(compromisso.remainingSeconds)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num">{dataCurta(chamado.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fila-cartoes pilha-sm">
            {dado.data.map((chamado) => {
              const compromisso = chamado.commitments[0];
              return (
                <button
                  key={chamado.id}
                  type="button"
                  className="chamado-card"
                  onClick={() => navegar(`/chamados/${chamado.id}`)}
                >
                  <div className="pilha-sm" style={{ textAlign: 'left', minWidth: 0 }}>
                    <span className="chamado-card-titulo">
                      <span className="mono">#{chamado.number}</span> {chamado.subject}
                    </span>
                    <span className="chamado-card-meta">
                      <span className="linha" style={{ gap: 5 }}>
                        <span className={`canal ${modificadorCanal(chamado.originChannel)}`} />
                        {ROTULO_CANAL[chamado.originChannel]}
                      </span>
                      <span>{chamado.requester?.name ?? '—'}</span>
                      <span className="num">{dataCurta(chamado.updatedAt)}</span>
                    </span>
                  </div>
                  <div className="chamado-card-lado">
                    <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                      {ROTULO_STATUS[chamado.status]}
                    </span>
                    {compromisso ? (
                      <span className={`sla ${estadoSla(compromisso.remainingSeconds)}`}>
                        {duracaoCurta(compromisso.remainingSeconds)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {dado.nextCursor ? (
            <div className="paginacao">
              <span className="suave" style={{ fontSize: 'var(--t-micro)' }}>
                {dado.data.length} chamados nesta página
              </span>
              <button
                type="button"
                className="btn -secundario -sm"
                onClick={() => {
                  const proximos = new URLSearchParams(parametros);
                  proximos.set('cursor', dado.nextCursor!);
                  definirParametros(proximos);
                }}
              >
                Próxima página
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * A linha entre as abas e a tabela: o que o filtro é, e o que fazer com ele.
 *
 * Dois estados, e a diferença é o que a pessoa espera de cada um:
 *
 * - **Numa busca salva**, os botões agem sobre ela: regravar com o filtro
 *   de agora, renomear, marcar como padrão, mover, apagar.
 * - **Num filtro solto**, o único botão é "Salvar esta busca" — e ele
 *   pede o nome antes, porque busca sem nome é aba sem rótulo.
 *
 * A frase do filtro sai de `descreverFiltro`, a mesma que o título da aba
 * usa: dois textos escritos à mão divergiriam na primeira vez que alguém
 * acrescentasse um campo.
 */
function BarraDoFiltro({
  filtro,
  buscaAtual,
  buscas,
  aberto,
  nomeando,
  aoAbrirPainel,
  aoNomear,
  aoSalvar,
  aoRegravar,
  aoRenomear,
  aoMarcarPadrao,
  aoMover,
  aoApagar,
  times,
  podeCompartilharComACasa,
  aoCompartilhar,
}: {
  filtro: FiltroSalvavel;
  buscaAtual: BuscaSalvaView | undefined;
  buscas: BuscaSalvaView[];
  aberto: boolean;
  nomeando: string | null;
  aoAbrirPainel: () => void;
  aoNomear: (nome: string | null) => void;
  aoSalvar: (nome: string) => void;
  aoRegravar: (id: string) => void;
  aoRenomear: (id: string, nome: string) => void;
  aoMarcarPadrao: (id: string, isDefault: boolean) => void;
  aoMover: (id: string, direcao: -1 | 1) => void;
  aoApagar: (id: string) => void;
  times: TimeView[];
  podeCompartilharComACasa: boolean;
  aoCompartilhar: (id: string, shareKind: Compartilhamento, teamId: string | null) => void;
}) {
  const usados = camposUsados(filtro);
  const posicao = buscaAtual ? buscas.findIndex((b) => b.id === buscaAtual.id) : -1;

  return (
    <div className="linha-entre" style={{ flexWrap: 'wrap', gap: 'var(--e-2)' }}>
      <span className="campo-ajuda">{descreverFiltro(filtro)}</span>

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn -sm ${aberto ? '-primario' : '-secundario'}`}
          onClick={aoAbrirPainel}
        >
          Filtrar
          {usados > 0 ? ` (${usados})` : ''}
        </button>

        {nomeando !== null ? (
          <form
            className="linha"
            style={{ gap: 'var(--e-2)' }}
            onSubmit={(e) => {
              e.preventDefault();
              const nome = nomeando.trim();
              if (!nome) return;
              if (buscaAtual) aoRenomear(buscaAtual.id, nome);
              else aoSalvar(nome);
            }}
          >
            <label className="so-leitor" htmlFor="nome-da-busca">
              Nome da busca
            </label>
            <input
              id="nome-da-busca"
              className="input"
              required
              autoFocus
              maxLength={80}
              placeholder="Ex.: Alta do meu time"
              value={nomeando}
              onChange={(e) => aoNomear(e.target.value)}
            />
            <button type="submit" className="btn -primario -sm">
              {buscaAtual ? 'Renomear' : 'Salvar'}
            </button>
            <button type="button" className="btn -fantasma -sm" onClick={() => aoNomear(null)}>
              Cancelar
            </button>
          </form>
        ) : buscaAtual && !buscaAtual.isMine ? (
          // A busca de outro: dá para usar e para marcar como padrão —
          // que é preferência de quem olha —, não para reescrever. O
          // caminho de quem quer uma variação é mexer no filtro e
          // "Salvar esta busca", que cria uma cópia sua.
          <>
            <span className="selo -contorno">
              {buscaAtual.shareKind === 'TIME'
                ? `Do time ${buscaAtual.team?.name ?? ''}`
                : 'Da casa'}
              {' · '}
              {buscaAtual.owner.name}
            </span>
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => aoMarcarPadrao(buscaAtual.id, !buscaAtual.isDefault)}
            >
              {buscaAtual.isDefault ? 'Não abrir por padrão' : 'Abrir por padrão'}
            </button>
          </>
        ) : buscaAtual ? (
          <>
            <label className="so-leitor" htmlFor="alcance-da-busca">
              Com quem compartilhar
            </label>
            <select
              id="alcance-da-busca"
              className="select -auto -sm"
              value={
                buscaAtual.shareKind === 'TIME'
                  ? `TIME:${buscaAtual.team?.id ?? ''}`
                  : buscaAtual.shareKind
              }
              onChange={(e) => {
                const [tipo, time] = e.target.value.split(':');
                aoCompartilhar(buscaAtual.id, tipo as Compartilhamento, time ?? null);
              }}
            >
              <option value="PRIVADA">{ROTULO_COMPARTILHAMENTO.PRIVADA}</option>
              {times.map((t) => (
                <option key={t.id} value={`TIME:${t.id}`}>
                  Do time {t.name}
                </option>
              ))}
              {podeCompartilharComACasa ? (
                <option value="ORGANIZACAO">{ROTULO_COMPARTILHAMENTO.ORGANIZACAO}</option>
              ) : null}
            </select>
            <button
              type="button"
              className="btn -fantasma -sm"
              title="Guardar o filtro de agora nesta busca"
              onClick={() => aoRegravar(buscaAtual.id)}
            >
              Regravar
            </button>
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => aoNomear(buscaAtual.name)}
            >
              Renomear
            </button>
            <button
              type="button"
              className="btn -fantasma -sm"
              title={
                buscaAtual.isDefault
                  ? 'Deixar de abrir por padrão'
                  : 'Abrir esta busca ao entrar na fila'
              }
              onClick={() => aoMarcarPadrao(buscaAtual.id, !buscaAtual.isDefault)}
            >
              {buscaAtual.isDefault ? 'Não abrir por padrão' : 'Abrir por padrão'}
            </button>
            <button
              type="button"
              className="btn -fantasma -sm"
              aria-label="Mover para a esquerda"
              disabled={posicao <= 0}
              onClick={() => aoMover(buscaAtual.id, -1)}
            >
              ←
            </button>
            <button
              type="button"
              className="btn -fantasma -sm"
              aria-label="Mover para a direita"
              disabled={posicao < 0 || posicao >= buscas.length - 1}
              onClick={() => aoMover(buscaAtual.id, 1)}
            >
              →
            </button>
            <button
              type="button"
              className="btn -perigo -sm"
              onClick={() => aoApagar(buscaAtual.id)}
            >
              Apagar
            </button>
          </>
        ) : usados > 0 ? (
          // Sem filtro não há o que salvar: uma busca chamada "tudo" é a
          // fila, que já está ali do lado.
          <button type="button" className="btn -secundario -sm" onClick={() => aoNomear('')}>
            Salvar esta busca
          </button>
        ) : null}
      </div>
    </div>
  );
}
