import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SurveyPublicView } from '@norty-desk/shared';

import { obterPesquisa, responderPesquisa } from '../../api/ativos';
import { useMarca } from '../../api/marca';
import { MarcaCompleta } from '../../components/Marca';

const NOTAS = [
  { valor: 1, rotulo: 'Péssimo' },
  { valor: 2, rotulo: 'Ruim' },
  { valor: 3, rotulo: 'Regular' },
  { valor: 4, rotulo: 'Bom' },
  { valor: 5, rotulo: 'Ótimo' },
];

/**
 * A pesquisa de satisfação — página pública.
 *
 * Sem login, sem barra lateral, sem nada do produto. Exigir senha de
 * quem só quer dar uma nota é o jeito mais eficiente de não receber nota
 * nenhuma, e é o que faz a taxa de resposta do GLPI ser o que é.
 */
export function Pesquisa() {
  const { token = '' } = useParams();
  const marca = useMarca();

  const [pesquisa, setPesquisa] = useState<SurveyPublicView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void obterPesquisa(token)
      .then((p) => {
        setPesquisa(p);
        setNota(p.score);
        setComentario(p.comment ?? '');
      })
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  return (
    <div className="tela-publica" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <main className="pilha" style={{ width: 'min(560px, 100%)', padding: 'var(--e-5)' }}>
        <MarcaCompleta
          logoUrl={marca.logoUrl}
          nome={marca.productName}
          frase={pesquisa?.organizationName}
        />

        {erro ? (
          <div className="alerta-bloco -aviso">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : !pesquisa ? (
          <div className="sk sk-bloco" />
        ) : pesquisa.answered ? (
          <section className="card">
            <div className="card-corpo pilha-sm">
              <h1 className="titulo-seccao">Obrigado!</h1>
              <p>
                Sua avaliação do chamado #{pesquisa.ticketNumber} foi registrada:{' '}
                <strong>{pesquisa.score} de 5</strong>.
              </p>
              {/* Mudar de ideia é permitido: recusar seria discutir com
                  quem se dispôs a avaliar. */}
              <p className="campo-ajuda">
                Se quiser mudar a nota, basta escolher outra abaixo.
              </p>
            </div>
          </section>
        ) : null}

        {pesquisa && !erro ? (
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nota) return;
              setErro(null);
              setEnviando(true);
              void responderPesquisa(token, nota, comentario || undefined)
                .then(setPesquisa)
                .catch((erroDoEnvio: Error) => setErro(erroDoEnvio.message))
                .finally(() => setEnviando(false));
            }}
          >
            <div className="card-topo">
              <div>
                <h2 className="card-titulo">Como foi o atendimento?</h2>
                <p className="card-sub">
                  Chamado #{pesquisa.ticketNumber} · {pesquisa.subject}
                </p>
              </div>
            </div>

            <div className="card-corpo pilha">
              <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
                {NOTAS.map((n) => (
                  <button
                    key={n.valor}
                    type="button"
                    className={`btn ${nota === n.valor ? '-primario' : '-secundario'}`}
                    aria-pressed={nota === n.valor}
                    onClick={() => setNota(n.valor)}
                    // As cinco notas numa linha só: quebrar em duas
                    // desalinha a escala e faz a pessoa procurar o 5.
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      flexDirection: 'column',
                      height: 'auto',
                      padding: 'var(--e-3) var(--e-1)',
                    }}
                  >
                    <span style={{ fontSize: 'var(--t-h3)', fontWeight: 'var(--p-bold)' }}>
                      {n.valor}
                    </span>
                    <span style={{ fontSize: 'var(--t-micro)' }}>{n.rotulo}</span>
                  </button>
                ))}
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="comentario-pesquisa">
                  Quer contar mais? (opcional)
                </label>
                <textarea
                  id="comentario-pesquisa"
                  className="textarea"
                  rows={3}
                  maxLength={2000}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
              </div>
            </div>

            <div className="card-rodape linha" style={{ justifyContent: 'flex-end' }}>
              <button type="submit" className="btn -primario" disabled={!nota || enviando}>
                {pesquisa.answered ? 'Trocar minha nota' : 'Enviar avaliação'}
              </button>
            </div>
          </form>
        ) : null}
      </main>
    </div>
  );
}
