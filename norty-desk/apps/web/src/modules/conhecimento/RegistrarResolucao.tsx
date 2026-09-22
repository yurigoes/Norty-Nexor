import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TicketDetail } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { registrarResolucao } from '../../api/conhecimento';
import { eventosDoChamado } from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * A resolução deste chamado, indo para o índice.
 *
 * Aparece só no chamado resolvido, e com o texto **já preenchido** a
 * partir da solução que quem atendeu escreveu. Página em branco no fim
 * do atendimento é onde a base de conhecimento morre: ninguém redige
 * artigo depois de já ter resolvido o problema.
 *
 * Some assim que o chamado já tem resolução registrada — ele não vira
 * um convite permanente a escrever o mesmo artigo duas vezes.
 */
export function RegistrarResolucao({
  chamado,
  aoRegistrar,
}: {
  chamado: TicketDetail;
  aoRegistrar: () => void;
}) {
  const { can } = useAutenticacao();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [title, setTitle] = useState(chamado.subject);
  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const resolvido = chamado.status === 'SOLUCIONADO' || chamado.status === 'FECHADO';

  // O corpo nasce da solução escrita no chamado. Buscá-la só ao abrir
  // evita uma chamada por chamado aberto na tela.
  useEffect(() => {
    if (!aberto || body) return;
    void eventosDoChamado(chamado.id)
      .then((eventos) => {
        const solucao = [...eventos].reverse().find((e) => e.type === 'SOLUCAO');
        if (solucao?.body) setBody(solucao.body);
      })
      .catch(() => undefined);
  }, [aberto, body, chamado.id]);

  if (!resolvido || !can('artigo:escrever')) return null;

  if (!aberto) {
    return (
      <section className="card">
        <div className="card-corpo linha-entre" style={{ gap: 'var(--e-3)' }}>
          <span>
            <strong>Isto vai acontecer de novo?</strong>
            <span className="campo-ajuda" style={{ display: 'block' }}>
              Registre a resolução no índice e o próximo chamado parecido já chega com a
              verificação pronta.
            </span>
          </span>
          <button
            type="button"
            className="btn -secundario -sm"
            style={{ flex: 'none' }}
            onClick={() => setAberto(true)}
          >
            Registrar resolução
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Registrar a resolução</h3>
          <p className="card-sub">
            O texto veio da solução que você escreveu. Ajuste o que for específico deste chamado —
            nome de pessoa, patrimônio — para valer no próximo.
          </p>
        </div>
      </div>

      <form
        className="card-corpo pilha"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setOcupado(true);
          void registrarResolucao(chamado.id, { title: title.trim(), body, isPublic })
            .then((artigo) => {
              aoRegistrar();
              navegar(`/conhecimento/${artigo.id}`);
            })
            .catch((e2: unknown) =>
              setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível registrar.'),
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
          <label className="campo-rotulo" htmlFor="titulo-resolucao">
            Como alguém vai procurar por isto
          </label>
          <input
            id="titulo-resolucao"
            className="input"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <span className="campo-ajuda">
            O assunto do chamado serve de ponto de partida, mas raramente é o melhor título: “Ana
            não imprime” só acha quem lembrar da Ana.
          </span>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="corpo-resolucao">
            O que resolveu
          </label>
          <textarea
            id="corpo-resolucao"
            className="textarea"
            required
            minLength={10}
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="O passo a passo que funcionou."
          />
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
          <span>Publicar no portal do solicitante</span>
        </label>
        <span className="campo-ajuda">
          Marcado, quem abre chamado enxerga e talvez resolva sozinho. Deixe desmarcado se o texto
          cita nome de servidor, caminho de rede ou qualquer coisa de dentro.
        </span>

        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <button type="submit" className="btn -primario" disabled={ocupado}>
            Registrar no índice
          </button>
          <button type="button" className="btn -fantasma" onClick={() => setAberto(false)}>
            Agora não
          </button>
        </div>
      </form>
    </section>
  );
}
