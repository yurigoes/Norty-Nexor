import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApprovalView } from '@norty-desk/shared';
import { estadoDaEtapa, faltamParaOQuorum } from '@norty-desk/shared';

import {
  aprovacoesDoChamado,
  decidirAprovacao,
  listarPessoas,
  solicitarAprovacao,
  type PessoaView,
} from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/**
 * Aprovação de um chamado.
 *
 * O desenho é `.timeline` — a linha de etapas com ponto e conector, não
 * `.conversa`, que é a linha do tempo do chamado. São coisas
 * diferentes, e o LICITA+ já separava as duas (CLAUDE.md, regra 6).
 *
 * O estado de cada etapa vem de `estadoDaEtapa`, a mesma função pura
 * que a API usa para decidir o status do chamado. No GLPI a interface
 * calcula o desfecho por conta própria, e por isso a tela e o relatório
 * às vezes discordam.
 */
export function Aprovacoes({ ticketId, aoMudar }: { ticketId: string; aoMudar: () => void }) {
  const { can, perfil } = useAutenticacao();
  const [linhas, setLinhas] = useState<ApprovalView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);

  const recarregar = useCallback(async () => {
    setLinhas(await aprovacoesDoChamado(ticketId));
  }, [ticketId]);

  useEffect(() => {
    void recarregar().catch(() => setLinhas([]));
  }, [recarregar]);

  const etapas = useMemo(() => agruparEtapas(linhas ?? []), [linhas]);

  // A etapa corrente é a primeira que ainda não passou: é ela que
  // aceita decisão, e as outras aparecem como histórico ou como espera.
  const corrente = etapas.find((e) => e.estado === 'AGUARDANDO')?.step ?? null;

  async function decidir(id: string, decision: 'APROVADO' | 'RECUSADO', comment?: string) {
    setErro(null);
    try {
      setLinhas(await decidirAprovacao(id, { decision, comment }));
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a decisão.');
    }
  }

  if (!linhas) return null;

  const podePedir = can('aprovacao:solicitar');
  if (linhas.length === 0 && !podePedir) return null;

  // A maioria dos chamados nunca precisa de aprovação. Um cartão
  // inteiro dizendo "nenhuma aprovação pedida" empurraria a conversa
  // para baixo em toda tela para não informar nada: sem etapas, o bloco
  // é só a ação.
  if (linhas.length === 0 && !pedindo) {
    return (
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn -fantasma -sm" onClick={() => setPedindo(true)}>
          Pedir aprovação
        </button>
      </div>
    );
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Aprovação</h3>
          <p className="card-sub">
            Etapas em sequência: a seguinte só começa quando a anterior passa.
          </p>
        </div>
        {podePedir && !pedindo ? (
          <button type="button" className="btn -secundario -sm" onClick={() => setPedindo(true)}>
            Nova etapa
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {etapas.length > 0 ? (
        <div className="card-corpo">
          <div className="timeline">
            {etapas.map((etapa) => (
              <Etapa
                key={etapa.step}
                etapa={etapa}
                ehCorrente={etapa.step === corrente}
                meuId={perfil?.user.id ?? ''}
                podeDecidir={can('aprovacao:decidir')}
                aoDecidir={decidir}
              />
            ))}
          </div>
        </div>
      ) : null}

      {pedindo ? (
        <Pedido
          ticketId={ticketId}
          proximaEtapa={(etapas.at(-1)?.step ?? 0) + 1}
          aoCancelar={() => setPedindo(false)}
          aoPedir={async (dados) => {
            setLinhas(await solicitarAprovacao(ticketId, dados));
            setPedindo(false);
            aoMudar();
          }}
        />
      ) : null}
    </section>
  );
}

type EtapaAgrupada = {
  step: number;
  quorum: number;
  estado: ReturnType<typeof estadoDaEtapa>;
  faltam: number;
  linhas: ApprovalView[];
};

function agruparEtapas(linhas: readonly ApprovalView[]): EtapaAgrupada[] {
  const porEtapa = new Map<number, ApprovalView[]>();

  for (const linha of linhas) {
    porEtapa.set(linha.step, [...(porEtapa.get(linha.step) ?? []), linha]);
  }

  return [...porEtapa.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, doGrupo]) => {
      const quorum = doGrupo[0]!.quorum;
      const decisoes = doGrupo.map((l) => l.status);
      return {
        step,
        quorum,
        estado: estadoDaEtapa(decisoes, quorum),
        faltam: faltamParaOQuorum(decisoes, quorum),
        linhas: doGrupo,
      };
    });
}

function Etapa({
  etapa,
  ehCorrente,
  meuId,
  podeDecidir,
  aoDecidir,
}: {
  etapa: EtapaAgrupada;
  ehCorrente: boolean;
  meuId: string;
  podeDecidir: boolean;
  aoDecidir: (id: string, decisao: 'APROVADO' | 'RECUSADO', comentario?: string) => Promise<void>;
}) {
  const [comentario, setComentario] = useState('');
  const minha = etapa.linhas.find((l) => l.approver.id === meuId && l.status === 'AGUARDANDO');
  const modificador =
    etapa.estado === 'APROVADA' ? '-feito' : etapa.estado === 'RECUSADA' ? '-recusado' : ehCorrente ? '-agora' : '';

  return (
    <div className={`timeline-item ${modificador}`}>
      <span className="timeline-ponto" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          {etapa.estado === 'RECUSADA' ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M5 13l4 4L19 7" />
          )}
        </svg>
      </span>

      <div className="pilha-sm">
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          <span className="timeline-titulo">Etapa {etapa.step}</span>
          <span
            className={`selo ${
              etapa.estado === 'APROVADA'
                ? '-sucesso'
                : etapa.estado === 'RECUSADA'
                  ? '-erro'
                  : ehCorrente
                    ? '-info'
                    : '-neutro'
            }`}
          >
            {etapa.estado === 'APROVADA'
              ? 'aprovada'
              : etapa.estado === 'RECUSADA'
                ? 'recusada'
                : ehCorrente
                  ? `faltam ${etapa.faltam} de ${etapa.quorum}`
                  : 'na fila'}
          </span>
        </div>

        <ul className="pilha-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {etapa.linhas.map((linha) => (
            <li key={linha.id} className="linha-entre" style={{ flexWrap: 'nowrap' }}>
              <span style={{ fontSize: 'var(--t-corpo-sm)', minWidth: 0 }}>
                {linha.approver.name}
                {linha.comment ? (
                  <span className="suave"> — “{linha.comment}”</span>
                ) : null}
              </span>
              <span className="timeline-data" style={{ flex: 'none' }}>
                {linha.status === 'AGUARDANDO'
                  ? 'aguardando'
                  : `${linha.status === 'APROVADO' ? 'aprovou' : 'recusou'} em ${dataCurta(linha.decidedAt!)}`}
              </span>
            </li>
          ))}
        </ul>

        {/* A caixa de decisão só aparece para quem tem decisão a tomar
            nesta etapa, e só quando é a vez dela. Mostrar o botão fora
            disso é convidar para um 409. */}
        {minha && ehCorrente && podeDecidir ? (
          <div className="pilha-sm">
            <textarea
              className="textarea"
              rows={2}
              placeholder="Comentário (opcional) — fica no chamado, como nota interna."
              value={comentario}
              maxLength={2000}
              onChange={(e) => setComentario(e.target.value)}
            />
            <div className="linha" style={{ gap: 'var(--e-2)' }}>
              <button
                type="button"
                className="btn -sucesso -sm"
                onClick={() => void aoDecidir(minha.id, 'APROVADO', comentario || undefined)}
              >
                Aprovar
              </button>
              <button
                type="button"
                className="btn -perigo -sm"
                onClick={() => void aoDecidir(minha.id, 'RECUSADO', comentario || undefined)}
              >
                Recusar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Pedido({
  proximaEtapa,
  aoCancelar,
  aoPedir,
}: {
  ticketId: string;
  proximaEtapa: number;
  aoCancelar: () => void;
  aoPedir: (dados: {
    approverIds: string[];
    quorum?: number;
    comment?: string;
  }) => Promise<void>;
}) {
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [quorum, setQuorum] = useState(1);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarPessoas()
      .then(setPessoas)
      .catch(() => setErro('Não foi possível carregar as pessoas.'));
  }, []);

  // O quórum não pode passar do número de validadores: a API recusa, e
  // deixar o número inválido na tela só adia o erro.
  const quorumValido = Math.min(Math.max(quorum, 1), Math.max(escolhidos.length, 1));

  return (
    <form
      className="card-rodape pilha"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        setOcupado(true);
        void aoPedir({
          approverIds: escolhidos,
          quorum: quorumValido,
          comment: comentario || undefined,
        })
          .catch((erroDoPedido: unknown) =>
            setErro(
              erroDoPedido instanceof ErroDaApi
                ? erroDoPedido.message
                : 'Não foi possível pedir a aprovação.',
            ),
          )
          .finally(() => setOcupado(false));
      }}
    >
      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      <div className="campo">
        <span className="campo-rotulo">Validadores da etapa {proximaEtapa}</span>
        <div className="pilha-sm" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {pessoas.map((pessoa) => (
            <label key={pessoa.id} className="check">
              <input
                type="checkbox"
                checked={escolhidos.includes(pessoa.id)}
                onChange={(e) =>
                  setEscolhidos((atual) =>
                    e.target.checked
                      ? [...atual, pessoa.id]
                      : atual.filter((id) => id !== pessoa.id),
                  )
                }
              />
              <span>
                {pessoa.name} <span className="suave">· {pessoa.role.toLowerCase()}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="quorum">
          Quantos “sim” a etapa precisa
        </label>
        <input
          id="quorum"
          className="input"
          type="number"
          min={1}
          max={Math.max(escolhidos.length, 1)}
          value={quorumValido}
          onChange={(e) => setQuorum(Number(e.target.value))}
        />
        <span className="campo-ajuda">
          Com {escolhidos.length || 'nenhum'} validador(es) escolhido(s), o máximo é{' '}
          {Math.max(escolhidos.length, 1)}.
        </span>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="motivo-aprovacao">
          Por quê
        </label>
        <textarea
          id="motivo-aprovacao"
          className="textarea"
          rows={2}
          maxLength={2000}
          placeholder="O que precisa de aval — fica como nota interna."
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </div>

      <div className="linha" style={{ justifyContent: 'flex-end', gap: 'var(--e-2)' }}>
        <button type="button" className="btn -fantasma -sm" onClick={aoCancelar}>
          Cancelar
        </button>
        <button
          type="submit"
          className="btn -primario -sm"
          disabled={ocupado || escolhidos.length === 0}
        >
          Pedir aprovação
        </button>
      </div>
    </form>
  );
}
