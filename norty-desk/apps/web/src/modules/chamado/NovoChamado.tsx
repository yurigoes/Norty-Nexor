import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PRIORITY_MATRIX, ROTULO_ESCALA, computePriority, type Scale } from './escala';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { useRecurso } from '../../auth/Autenticacao';
import { MODIFICADOR_PRIORIDADE, ROTULO_PRIORIDADE } from '../../lib/formato';

/**
 * Abertura de chamado.
 *
 * No portal são três campos e um anexo; para o agente, os mesmos mais a
 * classificação. Não há um formulário de trinta campos como no GLPI: o
 * que falta o agente completa depois, com o chamado já aberto e o SLA
 * já correndo (`docs/02-gap-analysis.md`, item 9).
 */
export function NovoChamado({ noPortal = false }: { noPortal?: boolean }) {
  const navegar = useNavigate();
  const { dado: categorias } = useRecurso(() => api.listarCategorias(), []);

  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [urgencia, setUrgencia] = useState<Scale>(3);
  const [impacto, setImpacto] = useState<Scale>(3);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A prioridade é mostrada, não escolhida: o usuário vê o resultado da
  // matriz enquanto mexe em urgência e impacto (CLAUDE.md, regra 7).
  const prioridade = computePriority(urgencia, impacto, DEFAULT_PRIORITY_MATRIX);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const chamado = await api.abrirChamado({
        subject: assunto.trim(),
        description: descricao.trim(),
        ...(categoria ? { categoryId: categoria } : {}),
        ...(noPortal ? {} : { urgency: urgencia, impact: impacto }),
      });

      if (arquivo) await api.anexar(chamado.id, arquivo);

      navegar(noPortal ? `/chamados/${chamado.id}` : `/chamados/${chamado.id}`);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível abrir o chamado.');
      setEnviando(false);
    }
  }

  return (
    <form className="card" onSubmit={enviar} style={{ maxWidth: 720 }}>
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">Abrir chamado</h2>
          <p className="card-sub">
            Descreva o que está acontecendo. O resto a equipe completa.
          </p>
        </div>
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="assunto">
            Assunto
          </label>
          <input
            id="assunto"
            className="input"
            required
            minLength={3}
            maxLength={255}
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Impressora do 3º andar não imprime"
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="descricao">
            O que está acontecendo
          </label>
          <textarea
            id="descricao"
            className="textarea"
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Desde quando, o que já tentou, qual a mensagem de erro."
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="categoria">
            Categoria
          </label>
          <select
            id="categoria"
            className="select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Não sei classificar</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="campo-ajuda">
            A categoria define o time que atende e o prazo de resposta.
          </span>
        </div>

        {!noPortal ? (
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="urgencia">
                Urgência
              </label>
              <select
                id="urgencia"
                className="select"
                value={urgencia}
                onChange={(e) => setUrgencia(Number(e.target.value) as Scale)}
              >
                {([1, 2, 3, 4, 5] as Scale[]).map((n) => (
                  <option key={n} value={n}>
                    {n} · {ROTULO_ESCALA[n]}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="impacto">
                Impacto
              </label>
              <select
                id="impacto"
                className="select"
                value={impacto}
                onChange={(e) => setImpacto(Number(e.target.value) as Scale)}
              >
                {([1, 2, 3, 4, 5] as Scale[]).map((n) => (
                  <option key={n} value={n}>
                    {n} · {ROTULO_ESCALA[n]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {!noPortal ? (
          <div className="linha-entre">
            <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
              Prioridade resultante
            </span>
            <span className={`prio ${MODIFICADOR_PRIORIDADE[prioridade]}`}>
              <span className="prio-ponto" aria-hidden="true" />
              {prioridade} · {ROTULO_PRIORIDADE[prioridade]}
            </span>
          </div>
        ) : null}

        <div className="campo">
          <label className="campo-rotulo" htmlFor="anexo-novo">
            Anexo (opcional)
          </label>
          <input
            id="anexo-novo"
            className="input"
            type="file"
            style={{ paddingTop: 7 }}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="card-rodape linha" style={{ justifyContent: 'flex-end', gap: 'var(--e-2)' }}>
        <button type="button" className="btn -secundario" onClick={() => navegar('/')}>
          Cancelar
        </button>
        <button
          type="submit"
          className={`btn -primario ${enviando ? '-carregando' : ''}`}
          disabled={enviando}
        >
          Abrir chamado
        </button>
      </div>
    </form>
  );
}
