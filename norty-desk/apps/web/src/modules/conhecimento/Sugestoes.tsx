import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArticleListItem } from '@norty-desk/shared';

import { artigosSugeridos } from '../../api/conhecimento';

/**
 * O que já foi escrito sobre este chamado.
 *
 * É a razão de a base de conhecimento existir. No GLPI o artigo mora
 * longe do chamado, e por isso quase ninguém o consulta: encontrar a
 * resposta depois de fechar não ajuda ninguém.
 *
 * Fica recolhido por padrão — a sugestão é oferta, não interrupção.
 */
export function Sugestoes({ ticketId }: { ticketId: string }) {
  const [artigos, setArtigos] = useState<ArticleListItem[] | null>(null);

  useEffect(() => {
    void artigosSugeridos(ticketId)
      .then(setArtigos)
      .catch(() => setArtigos([]));
  }, [ticketId]);

  if (!artigos || artigos.length === 0) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Já escrevemos sobre isto</h3>
          <p className="card-sub">
            {artigos.length} artigo(s) que casam com o assunto deste chamado.
          </p>
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        {artigos.map((artigo) => (
          <Link
            key={artigo.id}
            to={`/conhecimento/${artigo.id}`}
            className="conversa-anexo"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--e-3)' }}
          >
            <span style={{ minWidth: 0 }}>
              <span className="tabela-titulo-celula">{artigo.title}</span>
              {artigo.excerpt ? (
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {artigo.excerpt}
                </span>
              ) : null}
            </span>
            {artigo.isPublic ? (
              <span className="selo -sucesso" style={{ flex: 'none' }}>
                no portal
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
