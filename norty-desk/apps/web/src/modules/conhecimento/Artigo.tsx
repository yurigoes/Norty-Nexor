import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ArticleDetail, ArticleRevisionView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarArtigo,
  editarArtigo,
  obterArtigo,
  revisoesDoArtigo,
} from '../../api/conhecimento';
import { listarCategorias, type CategoriaView } from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/**
 * Um artigo — leitura e edição na mesma tela.
 *
 * Separar "ver" de "editar" em duas rotas faz o agente que reparou num
 * erro de digitação desistir de corrigir. Aqui é um botão.
 */
export function Artigo({ novo = false }: { novo?: boolean }) {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();

  const [artigo, setArtigo] = useState<ArticleDetail | null>(null);
  const [editando, setEditando] = useState(novo);
  const [erro, setErro] = useState<string | null>(null);
  const [revisoes, setRevisoes] = useState<ArticleRevisionView[] | null>(null);

  useEffect(() => {
    if (novo) return;
    void obterArtigo(id)
      .then(setArtigo)
      .catch(() => setErro('Artigo não encontrado.'));
  }, [id, novo]);

  if (erro && !artigo) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  if (!novo && !artigo) return <div className="sk sk-bloco" />;

  if (editando) {
    return (
      <Editor
        artigo={artigo}
        aoCancelar={() => (novo ? navegar('/conhecimento') : setEditando(false))}
        aoSalvar={async (dados) => {
          const salvo = novo ? await criarArtigo(dados) : await editarArtigo(id, dados);
          setArtigo(salvo);
          setEditando(false);
          setRevisoes(null);
          if (novo) navegar(`/conhecimento/${salvo.id}`, { replace: true });
        }}
      />
    );
  }

  return (
    <div className="pilha" style={{ maxWidth: 820 }}>
      <button type="button" className="btn -fantasma -sm" onClick={() => navegar('/conhecimento')}>
        ← Voltar para a base
      </button>

      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">{artigo!.title}</h2>
          <p>
            {artigo!.author.name} · versão {artigo!.version} · atualizado em{' '}
            {dataCurta(artigo!.updatedAt)} · {artigo!.views}{' '}
            {artigo!.views === 1 ? 'leitura' : 'leituras'}
          </p>
        </div>
        {can('artigo:escrever') ? (
          <button type="button" className="btn -secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
        ) : null}
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        {artigo!.isPublic ? <span className="selo -sucesso">no portal</span> : (
          <span className="selo -neutro">só para quem atende</span>
        )}
        {artigo!.isArchived ? <span className="selo -aviso">arquivado</span> : null}
        {artigo!.category ? <span className="selo -contorno">{artigo!.category.name}</span> : null}
        {artigo!.keywords.map((k) => (
          <span key={k} className="selo -contorno">
            {k}
          </span>
        ))}
      </div>

      <article className="card">
        <div className="card-corpo">
          {/* Texto puro, quebrado por linha. Renderizar HTML de artigo
              exigiria sanitização — e o artigo é escrito por gente de
              dentro, mas "de dentro" não é o mesmo que "confiável". */}
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{artigo!.body}</p>
        </div>
      </article>

      <details
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && !revisoes) {
            void revisoesDoArtigo(id)
              .then(setRevisoes)
              .catch(() => setRevisoes([]));
          }
        }}
      >
        <summary className="campo-rotulo" style={{ cursor: 'pointer' }}>
          Histórico de revisões
        </summary>

        {!revisoes ? (
          <div className="sk sk-linha" style={{ marginTop: 'var(--e-3)' }} />
        ) : (
          <div className="timeline" style={{ marginTop: 'var(--e-4)' }}>
            {revisoes.map((r) => (
              <div key={r.version} className="timeline-item -feito">
                <span className="timeline-ponto" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div className="pilha-sm">
                  <span className="timeline-titulo">
                    Versão {r.version} · {r.editor.name}
                  </span>
                  <span className="timeline-data">{dataCurta(r.createdAt)}</span>
                  {r.note ? <span className="suave">{r.note}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

function Editor({
  artigo,
  aoCancelar,
  aoSalvar,
}: {
  artigo: ArticleDetail | null;
  aoCancelar: () => void;
  aoSalvar: (dados: {
    title: string;
    body: string;
    categoryId?: string | null;
    keywords?: string[];
    isPublic?: boolean;
    isArchived?: boolean;
    note?: string;
  }) => Promise<void>;
}) {
  const { can } = useAutenticacao();
  const [titulo, setTitulo] = useState(artigo?.title ?? '');
  const [corpo, setCorpo] = useState(artigo?.body ?? '');
  const [categoria, setCategoria] = useState(artigo?.category?.id ?? '');
  const [etiquetas, setEtiquetas] = useState((artigo?.keywords ?? []).join(', '));
  const [publico, setPublico] = useState(artigo?.isPublic ?? false);
  const [arquivado, setArquivado] = useState(artigo?.isArchived ?? false);
  const [nota, setNota] = useState('');
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
  }, []);

  return (
    <form
      className="pilha"
      style={{ maxWidth: 820 }}
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        setOcupado(true);
        void aoSalvar({
          title: titulo,
          body: corpo,
          categoryId: categoria || null,
          keywords: etiquetas
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
          isPublic: publico,
          isArchived: arquivado,
          note: nota || undefined,
        })
          .catch((e2: unknown) =>
            setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
          )
          .finally(() => setOcupado(false));
      }}
    >
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">{artigo ? 'Editar artigo' : 'Escrever artigo'}</h2>
          <p>O artigo bom é o que responde o chamado que você já respondeu três vezes.</p>
        </div>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      <div className="campo">
        <label className="campo-rotulo" htmlFor="titulo-artigo">
          Título
        </label>
        <input
          id="titulo-artigo"
          className="input"
          required
          minLength={3}
          maxLength={200}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="corpo-artigo">
          Conteúdo
        </label>
        <textarea
          id="corpo-artigo"
          className="textarea"
          required
          rows={16}
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
        />
      </div>

      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo" htmlFor="categoria-artigo">
            Categoria
          </label>
          <select
            id="categoria-artigo"
            className="select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="campo-ajuda">
            É por ela que o artigo aparece como sugestão nos chamados do assunto.
          </span>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="etiquetas-artigo">
            Palavras-chave
          </label>
          <input
            id="etiquetas-artigo"
            className="input"
            value={etiquetas}
            placeholder="0x0000011b, spooler, impressora"
            onChange={(e) => setEtiquetas(e.target.value)}
          />
          <span className="campo-ajuda">
            Separadas por vírgula. Busca exata — para o que não aparece no texto.
          </span>
        </div>
      </div>

      <label className="switch">
        <input
          type="checkbox"
          checked={publico}
          disabled={!can('artigo:publicar')}
          onChange={(e) => setPublico(e.target.checked)}
        />
        <span className="switch-trilho">
          <span className="switch-bolinha" />
        </span>
        <span>
          Publicar no portal do solicitante
          {!can('artigo:publicar') ? (
            <span className="campo-ajuda"> — exige a permissão de publicar</span>
          ) : null}
        </span>
      </label>

      {artigo ? (
        <>
          <label className="switch">
            <input
              type="checkbox"
              checked={arquivado}
              onChange={(e) => setArquivado(e.target.checked)}
            />
            <span className="switch-trilho">
              <span className="switch-bolinha" />
            </span>
            <span>Arquivar — sai da busca sem sumir do histórico</span>
          </label>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="nota-revisao">
              Por que mudou
            </label>
            <input
              id="nota-revisao"
              className="input"
              maxLength={500}
              placeholder="Fica no histórico de revisões."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="linha" style={{ justifyContent: 'flex-end', gap: 'var(--e-2)' }}>
        <button type="button" className="btn -fantasma" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="btn -primario" disabled={ocupado}>
          Salvar
        </button>
      </div>
    </form>
  );
}
