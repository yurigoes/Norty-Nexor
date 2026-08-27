import type { ReactNode } from 'react';

/**
 * Cabeçalho de página
 *
 * Todo módulo abre igual: título, uma linha dizendo o que aquela tela
 * resolve, e as ações à direita. A frase não é enfeite — ela é o que
 * distingue "mais uma lista" de "a lista que responde tal pergunta".
 */
export function Pagina({
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="vy-pagina__cabecalho vy-enter">
        <div>
          <h1 className="vy-pagina__titulo">{titulo}</h1>
          {subtitulo && <p className="vy-pagina__subtitulo">{subtitulo}</p>}
        </div>
        {acoes && (
          <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
            {acoes}
          </div>
        )}
      </div>
      {children}
    </>
  );
}

/** Barra de filtros. Fica sempre acima do conteúdo, em uma linha só. */
export function BarraFiltros({ children }: { children: ReactNode }) {
  return (
    <div
      className="vy-row vy-wrap"
      style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
      role="search"
    >
      {children}
    </div>
  );
}

/** Data e hora legíveis a partir do ISO. */
export function formatarData(iso?: string, comHora = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** "há 3 h", "em 2 dias". Mais útil que a data absoluta em lista de fila. */
export function tempoRelativo(iso?: string): string {
  if (!iso) return '—';
  const alvo = new Date(iso).getTime();
  const agora = new Date('2026-08-27T09:00:00-03:00').getTime();
  const minutos = Math.round((alvo - agora) / 60000);
  const abs = Math.abs(minutos);
  const formatador = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

  if (abs < 60) return formatador.format(minutos, 'minute');
  if (abs < 1440) return formatador.format(Math.round(minutos / 60), 'hour');
  if (abs < 43200) return formatador.format(Math.round(minutos / 1440), 'day');
  return formatador.format(Math.round(minutos / 43200), 'month');
}
