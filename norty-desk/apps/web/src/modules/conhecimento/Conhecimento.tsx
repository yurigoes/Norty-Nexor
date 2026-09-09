import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ArticleListItem } from '@norty-desk/shared';

import { buscarArtigos } from '../../api/conhecimento';
import { useAutenticacao } from '../../auth/Autenticacao';
import { listarCategorias, type CategoriaView } from '../../api/endpoints';
import { dataCurta } from '../../lib/formato';

/**
 * A base de conhecimento.
 *
 * A busca é a tela: no GLPI a base é uma árvore de categorias que
 * ninguém navega, e o artigo se perde. Aqui abre-se buscando, e o que
 * não é buscado aparece pelo mais recente.
 */
export function Conhecimento() {
  const { can } = useAutenticacao();
  const [parametros, definirParametros] = useSearchParams();
  const [termo, setTermo] = useState(parametros.get('q') ?? '');
  const [artigos, setArtigos] = useState<ArticleListItem[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const q = parametros.get('q') ?? '';
  const categoryId = parametros.get('categoryId') ?? '';
  const arquivados = parametros.get('arquivados') === 'true';

  const recarregar = useCallback(async () => {
    setArtigos(
      await buscarArtigos({
        q: q || undefined,
        categoryId: categoryId || undefined,
        arquivados: arquivados || undefined,
      }),
    );
  }, [q, categoryId, arquivados]);

  useEffect(() => {
    setArtigos(null);
    void recarregar().catch(() => setErro('Não foi possível buscar os artigos.'));
  }, [recarregar]);

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined);
  }, []);

  function aplicar(chave: string, valor: string) {
    const proximos = new URLSearchParams(parametros);
    if (valor) proximos.set(chave, valor);
    else proximos.delete(chave);
    definirParametros(proximos);
  }

  return (
    <div className="pilha" style={{ maxWidth: 940 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Base de conhecimento</h2>
          <p>
            O que já foi escrito. A busca entende português — plural e conjugação encontram o
            mesmo artigo.
          </p>
        </div>
        {can('artigo:escrever') ? (
          <Link to="/conhecimento/novo" className="btn -primario">
            Escrever artigo
          </Link>
        ) : null}
      </div>

      <form
        className="linha"
        style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          aplicar('q', termo.trim());
        }}
      >
        <div className="busca" style={{ flex: '1 1 280px' }}>
          <label className="so-leitor" htmlFor="busca-artigos">
            Buscar artigos
          </label>
          <input
            id="busca-artigos"
            className="input"
            type="search"
            placeholder="Erro, equipamento, procedimento…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>

        <select
          className="select -auto"
          aria-label="Categoria"
          value={categoryId}
          onChange={(e) => aplicar('categoryId', e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="check -bloco">
          <input
            type="checkbox"
            checked={arquivados}
            onChange={(e) => aplicar('arquivados', e.target.checked ? 'true' : '')}
          />
          <span>Incluir arquivados</span>
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

      {!artigos ? (
        <div className="sk sk-bloco" />
      ) : artigos.length === 0 ? (
        <div className="vazio">
          <h3>{q ? 'Nada encontrado' : 'A base está vazia'}</h3>
          <p>
            {q
              ? 'Nenhum artigo casa com esses termos. Vale escrever um — a próxima pessoa agradece.'
              : 'O primeiro artigo costuma ser a resposta que você já deu três vezes por e-mail.'}
          </p>
        </div>
      ) : (
        artigos.map((artigo) => <Cartao key={artigo.id} artigo={artigo} />)
      )}
    </div>
  );
}

export function Cartao({ artigo }: { artigo: ArticleListItem }) {
  return (
    <Link to={`/conhecimento/${artigo.id}`} className="card -interativo" style={{ display: 'block' }}>
      <div className="card-corpo pilha-sm">
        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          <span className="tabela-titulo-celula">{artigo.title}</span>
          {artigo.isPublic ? <span className="selo -sucesso">no portal</span> : null}
          {artigo.isArchived ? <span className="selo -neutro">arquivado</span> : null}
          {artigo.category ? (
            <span className="selo -contorno">{artigo.category.name}</span>
          ) : null}
        </div>

        {artigo.excerpt ? <p className="suave">{artigo.excerpt}</p> : null}

        <div className="chamado-card-meta">
          <span>{artigo.author.name}</span>
          <span>atualizado em {dataCurta(artigo.updatedAt)}</span>
          <span>
            {artigo.views} {artigo.views === 1 ? 'leitura' : 'leituras'}
          </span>
          {artigo.keywords.length > 0 ? <span>{artigo.keywords.join(' · ')}</span> : null}
        </div>
      </div>
    </Link>
  );
}
