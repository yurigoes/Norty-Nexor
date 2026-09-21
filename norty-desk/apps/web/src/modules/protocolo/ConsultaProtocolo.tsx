import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROTULO_STATUS, normalizarProtocolo, type ConsultaPublica } from '@norty-desk/shared';

import { consultarProtocolo, urlDoComprovante } from '../../api/protocolo';
import { useMarca } from '../../api/marca';
import { MarcaCompleta } from '../../components/Marca';
import { seloStatus } from '../../lib/formato';

/**
 * Acompanhar o chamado pelo protocolo, sem login.
 *
 * Quem digita um protocolo aqui provou ter o código, e nada mais — não
 * provou ser a pessoa do chamado. Por isso esta tela mostra menos que a
 * do produto: sem anexo para baixar, sem nota interna, sem e-mail de
 * ninguém. Só o andamento, que é o que o código promete.
 *
 * É só de leitura de propósito. Para escrever no chamado existe o
 * portal, que pede login — e é justamente essa a diferença entre quem
 * tem um código e quem tem uma conta.
 */
export function ConsultaProtocolo() {
  const { codigo: daUrl } = useParams();
  const navegar = useNavigate();
  const marca = useMarca();

  const [digitado, setDigitado] = useState(daUrl ?? '');
  const [consulta, setConsulta] = useState<ConsultaPublica | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  // O botão só habilita com oito caracteres válidos. Vale a mesma
  // função que a API usa para normalizar — o aplicativo não reimplementa
  // a regra, lê a mesma (CLAUDE.md, regra 1).
  const codigo = normalizarProtocolo(digitado);

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    if (!codigo) return;

    setErro(null);
    setBuscando(true);
    setConsulta(null);

    void consultarProtocolo(codigo)
      .then((c) => {
        setConsulta(c);
        // A URL passa a carregar o protocolo: assim a pessoa pode
        // guardar o endereço e voltar sem digitar tudo de novo.
        navegar(`/protocolo/${codigo}`, { replace: true });
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setBuscando(false));
  }

  return (
    <div className="tela-publica" style={{ minHeight: '100vh', padding: 'var(--e-5)' }}>
      <main className="pilha" style={{ width: 'min(680px, 100%)', margin: '0 auto' }}>
        <MarcaCompleta logoUrl={marca.logoUrl} nome={marca.productName} frase="Acompanhar chamado" />

        <form className="card" onSubmit={buscar}>
          <div className="card-topo">
            <div>
              <h1 className="card-titulo">Consultar por protocolo</h1>
              <p className="card-sub">
                O código de oito caracteres que você recebeu ao abrir o chamado.
              </p>
            </div>
          </div>

          <div className="card-corpo pilha-sm">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="protocolo">
                Protocolo
              </label>
              <input
                id="protocolo"
                className="input"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder="4K7P-WZ9N"
                autoComplete="off"
                spellCheck={false}
                // Monoespaçada e larga: o código é copiado de um e-mail
                // ou lido em voz alta, e caractere apertado faz errar.
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 'var(--t-h3)',
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                }}
              />
              <p className="campo-ajuda">Pode digitar com ou sem o traço.</p>
            </div>

            <button className="btn -primario" type="submit" disabled={!codigo || buscando}>
              {buscando ? 'Consultando…' : 'Consultar'}
            </button>
          </div>
        </form>

        {erro ? (
          <div className="alerta-bloco -aviso" role="status">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {consulta ? <Andamento consulta={consulta} /> : null}
      </main>
    </div>
  );
}

function Andamento({ consulta }: { consulta: ConsultaPublica }) {
  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">{consulta.subject}</h2>
          <p className="card-sub">
            Protocolo {consulta.protocol} · {consulta.organization}
          </p>
        </div>
        <span className={`selo ${seloStatus(consulta.status)}`}>
          {ROTULO_STATUS[consulta.status]}
        </span>
      </div>

      <div className="card-corpo pilha">
        <div className="pilha-sm">
          <Linha rotulo="Aberto em">{dataHora(consulta.openedAt)}</Linha>
          {consulta.scheduledFor ? (
            <Linha rotulo="Atendimento agendado">{dataHora(consulta.scheduledFor)}</Linha>
          ) : null}
          {consulta.solvedAt ? <Linha rotulo="Solução">{dataHora(consulta.solvedAt)}</Linha> : null}
          {consulta.closedAt ? (
            <Linha rotulo="Encerrado em">{dataHora(consulta.closedAt)}</Linha>
          ) : null}
        </div>

        <div className="conversa">
          {consulta.timeline.length === 0 ? (
            <p className="campo-ajuda">Ainda sem movimentação.</p>
          ) : (
            consulta.timeline.map((evento, i) => (
              <article key={`${evento.at}-${i}`} className="conversa-evento -sistema">
                <header className="conversa-topo">
                  {evento.by ? (
                    <>
                      <span className="conversa-autor">{evento.by}</span>
                      <span className="conversa-sep">·</span>
                    </>
                  ) : null}
                  <span className="suave">{dataHora(evento.at)}</span>
                </header>
                <p className="conversa-corpo">{evento.text}</p>
              </article>
            ))
          )}
        </div>

        {/* `download` e não `target`: o comprovante é para guardar, e
            abrir numa aba deixa a pessoa com um PDF e sem a consulta. */}
        <a
          className="btn -secundario"
          href={urlDoComprovante(consulta.protocol)}
          download={`protocolo-${consulta.protocol}.pdf`}
        >
          Baixar comprovante em PDF
        </a>
      </div>
    </section>
  );
}

/** Rótulo à esquerda, valor à direita — o mesmo par do detalhe do chamado. */
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="linha-entre" style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}>
      <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', flex: 'none' }}>
        {rotulo}
      </span>
      <span style={{ textAlign: 'right', fontSize: 'var(--t-corpo-sm)', minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
