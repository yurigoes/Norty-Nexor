import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  listarEntradas,
  listarSaidas,
  obterEntrada,
  reenviarSaida,
  reprocessarEntrada,
  type EntradaDetalhe,
  type EntradaView,
  type SaidaView,
} from '../../api/canais';
import { ErroDaApi } from '../../api/cliente';
import { dataCurta, modificadorCanal } from '../../lib/formato';

type Aba = 'entrada' | 'saida';
type FiltroEntrada = 'todas' | 'pendentes' | 'descartadas';

/**
 * Diagnóstico de canal.
 *
 * A tela que o GLPI não tem. Quando um e-mail não vira chamado, no GLPI
 * a mensagem some: ou ficou não lida numa caixa que ninguém abre, ou o
 * coletor a marcou como lida e engoliu. Aqui ela fica gravada com o
 * motivo do descarte, e um botão a reprocessa depois de o operador
 * corrigir a regra (`docs/02-gap-analysis.md`, item 7).
 */
export function Diagnostico() {
  const [aba, setAba] = useState<Aba>('entrada');

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Diagnóstico de canais</h2>
          <p>
            Toda mensagem recebida fica gravada, inclusive a que não virou chamado — com o
            motivo. Nada é descartado em silêncio.
          </p>
        </div>
      </div>

      <div className="abas" role="tablist">
        <button
          type="button"
          role="tab"
          className="aba"
          aria-selected={aba === 'entrada'}
          onClick={() => setAba('entrada')}
        >
          Recebidas
        </button>
        <button
          type="button"
          role="tab"
          className="aba"
          aria-selected={aba === 'saida'}
          onClick={() => setAba('saida')}
        >
          Enviadas
        </button>
      </div>

      {aba === 'entrada' ? <Recebidas /> : <Enviadas />}
    </div>
  );
}

function Recebidas() {
  const [filtro, setFiltro] = useState<FiltroEntrada>('todas');
  const [mensagens, setMensagens] = useState<EntradaView[] | null>(null);
  const [aberta, setAberta] = useState<EntradaDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setMensagens(await listarEntradas(filtro));
  }, [filtro]);

  useEffect(() => {
    setMensagens(null);
    void recarregar().catch(() => setErro('Não foi possível carregar as mensagens.'));
  }, [recarregar]);

  if (erro) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  return (
    <div className="pilha">
      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        {(['todas', 'pendentes', 'descartadas'] as FiltroEntrada[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`btn -sm ${filtro === f ? '-secundario' : '-fantasma'}`}
            onClick={() => setFiltro(f)}
          >
            {f === 'todas' ? 'Todas' : f === 'pendentes' ? 'Não processadas' : 'Descartadas'}
          </button>
        ))}
      </div>

      {!mensagens ? (
        <div className="sk sk-bloco" />
      ) : mensagens.length === 0 ? (
        <div className="vazio">
          <h3>Nada por aqui</h3>
          <p>
            {filtro === 'descartadas'
              ? 'Nenhuma mensagem foi descartada. É o que se espera.'
              : 'Nenhuma mensagem recebida ainda.'}
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Recebida</th>
                  <th>De</th>
                  <th>Assunto</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className={`canal ${modificadorCanal(m.channel)}`}
                        aria-hidden="true"
                        style={{ marginRight: 'var(--e-2)' }}
                      />
                      {dataCurta(m.receivedAt)}
                    </td>
                    <td>{m.fromAddress ?? '—'}</td>
                    <td className="tabela-titulo-celula">{m.subject ?? '(sem assunto)'}</td>
                    <td>
                      <Situacao mensagem={m} />
                    </td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => {
                          void obterEntrada(m.id)
                            .then(setAberta)
                            .catch(() => setErro('Não foi possível abrir a mensagem.'));
                        }}
                      >
                        Ver original
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aberta ? (
        <Original
          mensagem={aberta}
          aoFechar={() => setAberta(null)}
          aoReprocessar={async () => {
            const nova = await reprocessarEntrada(aberta.id);
            setAberta(nova);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Situacao({ mensagem }: { mensagem: EntradaView }) {
  if (mensagem.ticket) {
    return (
      <Link to={`/chamados/${mensagem.ticket.id}`} className="selo -sucesso">
        #{mensagem.ticket.number}
      </Link>
    );
  }

  if (mensagem.discardedReason) {
    return (
      <span className="selo -erro" title={mensagem.discardedReason}>
        {mensagem.discardedReason.slice(0, 48)}
      </span>
    );
  }

  if (!mensagem.processedAt) return <span className="selo -aviso">Na fila</span>;
  return <span className="selo -neutro">Processada sem chamado</span>;
}

function Original({
  mensagem,
  aoFechar,
  aoReprocessar,
}: {
  mensagem: EntradaDetalhe;
  aoFechar: () => void;
  aoReprocessar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal -lg"
        role="dialog"
        aria-modal="true"
        aria-label="Mensagem original"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Mensagem original</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <div className="modal-corpo pilha">
          {erro ? (
            <div className="alerta-bloco -erro">
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          {mensagem.discardedReason ? (
            <div className="alerta-bloco -aviso">
              <span aria-hidden="true">!</span>
              <span>Descartada: {mensagem.discardedReason}</span>
            </div>
          ) : null}

          <dl className="lista-definicao">
            <div className="lista-definicao-item">
              <dt>Canal</dt>
              <dd>{mensagem.channel}</dd>
            </div>
            <div className="lista-definicao-item">
              <dt>De</dt>
              <dd>{mensagem.fromAddress ?? '—'}</dd>
            </div>
            <div className="lista-definicao-item">
              <dt>Assunto</dt>
              <dd>{mensagem.subject ?? '(sem assunto)'}</dd>
            </div>
            <div className="lista-definicao-item">
              <dt>Recebida em</dt>
              <dd>{dataCurta(mensagem.receivedAt)}</dd>
            </div>
            <div className="lista-definicao-item">
              <dt>Identificador</dt>
              {/* O `Message-ID` é o que dá idempotência e threading:
                  quando um e-mail vira dois chamados, a resposta está
                  aqui. */}
              <dd className="-mono">{mensagem.externalId}</dd>
            </div>
          </dl>

          <div className="campo">
            <span className="campo-rotulo">Corpo</span>
            <pre className="bloco-bruto">{mensagem.bodyText ?? '(vazio)'}</pre>
          </div>

          {mensagem.rawHeaders ? (
            <details>
              <summary className="campo-rotulo" style={{ cursor: 'pointer' }}>
                Cabeçalhos
              </summary>
              <pre className="bloco-bruto">{JSON.stringify(mensagem.rawHeaders, null, 2)}</pre>
            </details>
          ) : null}
        </div>

        <div className="modal-rodape">
          <button type="button" className="btn -fantasma" onClick={aoFechar}>
            Fechar
          </button>
          <button
            type="button"
            className={`btn -primario ${ocupado ? '-carregando' : ''}`}
            disabled={ocupado}
            onClick={() => {
              setErro(null);
              setOcupado(true);
              void aoReprocessar()
                .catch((e: unknown) =>
                  setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível reprocessar.'),
                )
                .finally(() => setOcupado(false));
            }}
          >
            Reprocessar
          </button>
        </div>
      </div>
    </div>
  );
}

function Enviadas() {
  const [status, setStatus] = useState<'' | 'PENDENTE' | 'ENVIADO' | 'FALHOU'>('');
  const [mensagens, setMensagens] = useState<SaidaView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setMensagens(await listarSaidas(status || undefined));
  }, [status]);

  useEffect(() => {
    setMensagens(null);
    void recarregar().catch(() => setErro('Não foi possível carregar a fila de saída.'));
  }, [recarregar]);

  if (erro) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  return (
    <div className="pilha">
      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        {(['', 'PENDENTE', 'FALHOU', 'ENVIADO'] as const).map((s) => (
          <button
            key={s || 'todas'}
            type="button"
            className={`btn -sm ${status === s ? '-secundario' : '-fantasma'}`}
            onClick={() => setStatus(s)}
          >
            {s === '' ? 'Todas' : s === 'PENDENTE' ? 'Na fila' : s === 'FALHOU' ? 'Falharam' : 'Enviadas'}
          </button>
        ))}
      </div>

      {!mensagens ? (
        <div className="sk sk-bloco" />
      ) : mensagens.length === 0 ? (
        <div className="vazio">
          <h3>Fila vazia</h3>
          <p>Nenhuma mensagem de saída neste filtro.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Criada</th>
                  <th>Para</th>
                  <th>Assunto</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className={`canal ${modificadorCanal(m.channel)}`}
                        aria-hidden="true"
                        style={{ marginRight: 'var(--e-2)' }}
                      />
                      {dataCurta(m.createdAt)}
                    </td>
                    <td>{m.toAddress}</td>
                    <td className="tabela-titulo-celula">{m.subject ?? '—'}</td>
                    <td>
                      {m.status === 'ENVIADO' ? (
                        <span className="selo -sucesso">Enviada</span>
                      ) : m.status === 'FALHOU' ? (
                        <span className="selo -erro" title={m.lastError ?? undefined}>
                          Falhou · {m.attempts} tentativa(s)
                        </span>
                      ) : (
                        <span className="selo -aviso">
                          Na fila{m.attempts > 0 ? ` · ${m.attempts} tentativa(s)` : ''}
                        </span>
                      )}
                    </td>
                    <td className="-num">
                      {m.status === 'ENVIADO' ? null : (
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          disabled={ocupado === m.id}
                          onClick={() => {
                            setOcupado(m.id);
                            void reenviarSaida(m.id)
                              .then(recarregar)
                              .catch(() => setErro('Não foi possível reenviar.'))
                              .finally(() => setOcupado(null));
                          }}
                        >
                          Reenviar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
