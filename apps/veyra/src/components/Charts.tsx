import { useId, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';

/**
 * VEYRA — Visualização de dados
 *
 * SVG puro, sem biblioteca de gráfico. A escolha não é ideológica: os
 * gráficos aqui são poucos e conhecidos, e uma dependência de 90 kB para
 * desenhar cinco formas custaria mais em carregamento do que economiza
 * em código.
 *
 * Regras que valem para todos os gráficos deste arquivo:
 *  - um eixo por gráfico, nunca dois eixos verticais;
 *  - duas ou mais séries sempre têm legenda, e até quatro também têm
 *    rótulo direto — identidade nunca depende só da cor;
 *  - grade e eixo são recessivos;
 *  - área e linha têm cursor de leitura com valor; barra e fatia têm
 *    destaque no ponteiro.
 */

export const CORES_SERIE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export interface Serie {
  nome: string;
  valores: number[];
}

export function formatarMoeda(valor: number, compacto = false): string {
  if (compacto && Math.abs(valor) >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(valor);
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

export function formatarNumero(valor: number, casas = 0): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
}

export function formatarPercentual(valor: number, casas = 1): string {
  return `${formatarNumero(valor, casas)}%`;
}

/* ---------- Legenda ---------- */

export function Legenda({ series, cores = CORES_SERIE }: { series: string[]; cores?: readonly string[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
      {series.map((nome, i) => (
        <li key={nome} className="vy-row" style={{ gap: 'var(--space-2)' }}>
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              background: cores[i % cores.length],
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>{nome}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Área / linha no tempo ---------- */

interface GraficoAreaProps {
  rotulos: string[];
  series: Serie[];
  altura?: number;
  /** Como o valor aparece no cursor de leitura. */
  formatar?: (v: number) => string;
  preencher?: boolean;
}

export function GraficoArea({
  rotulos,
  series,
  altura = 200,
  formatar = (v) => formatarNumero(v),
  preencher = true,
}: GraficoAreaProps) {
  const id = useId();
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  const L = 44;
  const R = 12;
  const T = 12;
  const B = 26;
  const larguraTotal = 720;
  const larguraPlot = larguraTotal - L - R;
  const alturaPlot = altura - T - B;

  const maximo = useMemo(() => {
    const m = Math.max(...series.flatMap((s) => s.valores), 1);
    /* Arredonda para cima até uma "década bonita" para o eixo não
       terminar num número torto. */
    const magnitude = 10 ** Math.floor(Math.log10(m));
    return Math.ceil(m / magnitude) * magnitude;
  }, [series]);

  const x = (i: number) => L + (rotulos.length <= 1 ? larguraPlot / 2 : (i / (rotulos.length - 1)) * larguraPlot);
  const y = (v: number) => T + alturaPlot - (v / maximo) * alturaPlot;

  const linhasGrade = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${larguraTotal} ${altura}`}
        width="100%"
        height={altura}
        role="img"
        aria-label={`Evolução de ${series.map((s) => s.nome).join(', ')}`}
        onMouseLeave={() => setIndiceAtivo(null)}
        onMouseMove={(e) => {
          const caixa = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - caixa.left) / caixa.width) * larguraTotal;
          const razao = (px - L) / larguraPlot;
          const i = Math.round(razao * (rotulos.length - 1));
          setIndiceAtivo(i >= 0 && i < rotulos.length ? i : null);
        }}
      >
        <defs>
          {series.map((_, i) => (
            <linearGradient key={i} id={`${id}-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CORES_SERIE[i % CORES_SERIE.length]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CORES_SERIE[i % CORES_SERIE.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {linhasGrade.map((f) => (
          <g key={f}>
            <line
              x1={L}
              x2={larguraTotal - R}
              y1={T + alturaPlot * f}
              y2={T + alturaPlot * f}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={L - 8}
              y={T + alturaPlot * f + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--chart-label)"
              fontFamily="var(--font-sans)"
            >
              {formatarNumero(maximo * (1 - f))}
            </text>
          </g>
        ))}

        {series.map((serie, si) => {
          const cor = CORES_SERIE[si % CORES_SERIE.length];
          const pontos = serie.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={serie.nome}>
              {preencher && (
                <polygon
                  points={`${L},${T + alturaPlot} ${pontos} ${x(serie.valores.length - 1)},${T + alturaPlot}`}
                  fill={`url(#${id}-fill-${si})`}
                />
              )}
              <polyline points={pontos} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {/* O ponto só aparece sob o cursor: um marcador por valor
                  em doze meses vira poluição. */}
              {indiceAtivo !== null && serie.valores[indiceAtivo] !== undefined && (
                <circle
                  cx={x(indiceAtivo)}
                  cy={y(serie.valores[indiceAtivo])}
                  r={4.5}
                  fill={cor}
                  stroke="var(--surface-app)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {indiceAtivo !== null && (
          <line
            x1={x(indiceAtivo)}
            x2={x(indiceAtivo)}
            y1={T}
            y2={T + alturaPlot}
            stroke="var(--chart-axis)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {rotulos.map((r, i) => {
          /* Em séries longas, rotula um a cada dois para os rótulos não
             colidirem em telas estreitas. */
          const passo = rotulos.length > 8 ? 2 : 1;
          if (i % passo !== 0) return null;
          return (
            <text
              key={r}
              x={x(i)}
              y={altura - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--chart-label)"
              fontFamily="var(--font-sans)"
            >
              {r}
            </text>
          );
        })}
      </svg>

      {indiceAtivo !== null && (
        <div
          className="vy-card"
          style={{
            position: 'absolute',
            top: 4,
            left: `clamp(0px, ${((x(indiceAtivo) - L) / larguraTotal) * 100}%, calc(100% - 168px))`,
            padding: 'var(--space-2) var(--space-3)',
            pointerEvents: 'none',
            minWidth: 152,
            background: 'var(--vy-midnight-900)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="vy-eyebrow">{rotulos[indiceAtivo]}</div>
          {series.map((s, i) => (
            <div key={s.nome} className="vy-row-between" style={{ gap: 'var(--space-4)', marginTop: 4 }}>
              <span className="vy-row" style={{ gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: CORES_SERIE[i % CORES_SERIE.length] }}
                />
                {s.nome}
              </span>
              <strong className="vy-numeric" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-strong)' }}>
                {formatar(s.valores[indiceAtivo] ?? 0)}
              </strong>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Legenda series={series.map((s) => s.nome)} />
      </div>
    </div>
  );
}

/* ---------- Barras ---------- */

export interface BarraDado {
  rotulo: string;
  valor: number;
  cor?: string;
}

export function GraficoBarras({
  dados,
  altura = 200,
  formatar = (v: number) => formatarNumero(v),
  horizontal = false,
}: {
  dados: BarraDado[];
  altura?: number;
  formatar?: (v: number) => string;
  horizontal?: boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const maximo = Math.max(...dados.map((d) => d.valor), 1);

  if (horizontal) {
    return (
      <ul className="vy-stack" style={{ gap: 'var(--space-3)' }}>
        {dados.map((d, i) => (
          <li key={d.rotulo}>
            <div className="vy-row-between" style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)' }}>{d.rotulo}</span>
              <strong className="vy-numeric" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-strong)' }}>
                {formatar(d.valor)}
              </strong>
            </div>
            <div className="vy-progresso">
              <div
                className="vy-progresso__trilho"
                style={{
                  width: `${(d.valor / maximo) * 100}%`,
                  background: d.cor ?? CORES_SERIE[i % CORES_SERIE.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const larguraTotal = 720;
  const T = 14;
  const B = 26;
  const alturaPlot = altura - T - B;
  const passo = larguraTotal / dados.length;
  /* 2px de folga entre barras vizinhas: o corte vira respiro, não borda. */
  const larguraBarra = Math.min(46, passo - 10);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${larguraTotal} ${altura}`} width="100%" height={altura} role="img" aria-label="Comparação por categoria">
        <line x1={0} x2={larguraTotal} y1={T + alturaPlot} y2={T + alturaPlot} stroke="var(--chart-axis)" strokeWidth={1} />
        {dados.map((d, i) => {
          const h = (d.valor / maximo) * alturaPlot;
          const cx = passo * i + passo / 2;
          return (
            <g key={d.rotulo} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}>
              {/* Alvo de ponteiro maior que a barra, para o hover não exigir mira. */}
              <rect x={cx - passo / 2} y={T} width={passo} height={alturaPlot} fill="transparent" />
              <rect
                x={cx - larguraBarra / 2}
                y={T + alturaPlot - h}
                width={larguraBarra}
                height={Math.max(h, 2)}
                rx={4}
                fill={d.cor ?? CORES_SERIE[i % CORES_SERIE.length]}
                opacity={ativo === null || ativo === i ? 1 : 0.42}
                style={{ transition: 'opacity var(--duration-fast) var(--ease-out)' }}
              />
              <text x={cx} y={altura - 8} textAnchor="middle" fontSize={10} fill="var(--chart-label)" fontFamily="var(--font-sans)">
                {d.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      {ativo !== null && (
        <div
          className="vy-card"
          style={{
            position: 'absolute',
            top: 0,
            left: `clamp(0px, ${((passo * ativo + passo / 2) / larguraTotal) * 100}%, calc(100% - 140px))`,
            padding: 'var(--space-2) var(--space-3)',
            pointerEvents: 'none',
            background: 'var(--vy-midnight-900)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="vy-eyebrow">{dados[ativo].rotulo}</div>
          <strong className="vy-numeric" style={{ color: 'var(--text-strong)' }}>
            {formatar(dados[ativo].valor)}
          </strong>
        </div>
      )}
    </div>
  );
}

/* ---------- Rosca ---------- */

export function GraficoRosca({
  dados,
  tamanho = 168,
  centroRotulo,
  centroValor,
}: {
  dados: BarraDado[];
  tamanho?: number;
  centroRotulo?: string;
  centroValor?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const total = dados.reduce((s, d) => s + d.valor, 0) || 1;
  const raio = tamanho / 2 - 10;
  const espessura = 18;
  const perimetro = 2 * Math.PI * raio;

  let acumulado = 0;

  return (
    <div className="vy-row" style={{ gap: 'var(--space-6)', flexWrap: 'wrap' }}>
      <span style={{ position: 'relative', width: tamanho, height: tamanho, flexShrink: 0 }}>
        <svg width={tamanho} height={tamanho} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label="Distribuição por categoria">
          {dados.map((d, i) => {
            const fracao = d.valor / total;
            /* 2px de folga entre fatias, descontados do arco. */
            const comprimento = Math.max(fracao * perimetro - 2, 0);
            const deslocamento = -acumulado * perimetro;
            acumulado += fracao;
            return (
              <circle
                key={d.rotulo}
                cx={tamanho / 2}
                cy={tamanho / 2}
                r={raio}
                fill="none"
                stroke={d.cor ?? CORES_SERIE[i % CORES_SERIE.length]}
                strokeWidth={ativo === i ? espessura + 3 : espessura}
                strokeDasharray={`${comprimento} ${perimetro}`}
                strokeDashoffset={deslocamento}
                opacity={ativo === null || ativo === i ? 1 : 0.4}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                style={{ transition: 'opacity var(--duration-fast) var(--ease-out), stroke-width var(--duration-fast) var(--ease-out)' }}
              />
            );
          })}
        </svg>
        {(centroValor || centroRotulo) && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeContent: 'center',
              textAlign: 'center',
            }}
          >
            <strong className="vy-numeric" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-strong)' }}>
              {centroValor}
            </strong>
            <span className="vy-eyebrow">{centroRotulo}</span>
          </span>
        )}
      </span>

      {/* Rótulo direto ao lado da fatia: a cor sozinha nunca carrega a
          identidade da categoria. */}
      <ul className="vy-stack vy-grow" style={{ gap: 'var(--space-2)', minWidth: 160 }}>
        {dados.map((d, i) => (
          <li
            key={d.rotulo}
            className="vy-row-between"
            onMouseEnter={() => setAtivo(i)}
            onMouseLeave={() => setAtivo(null)}
            style={{ fontSize: 'var(--text-xs)', cursor: 'default' }}
          >
            <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
              <span
                style={{ width: 9, height: 9, borderRadius: 3, background: d.cor ?? CORES_SERIE[i % CORES_SERIE.length] }}
              />
              <span style={{ color: 'var(--text-muted)' }}>{d.rotulo}</span>
            </span>
            <strong className="vy-numeric" style={{ color: 'var(--text-strong)' }}>
              {formatarPercentual((d.valor / total) * 100, 0)}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Minigráfico ---------- */

export function Minigrafico({
  valores,
  cor = 'var(--chart-1)',
  altura = 40,
}: {
  valores: number[];
  cor?: string;
  altura?: number;
}) {
  const id = useId();
  const largura = 200;
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const faixa = max - min || 1;
  const pontos = valores
    .map((v, i) => `${(i / (valores.length - 1)) * largura},${altura - ((v - min) / faixa) * (altura - 4) - 2}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" height={altura} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={cor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${altura} ${pontos} ${largura},${altura}`} fill={`url(#${id}-g)`} />
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Indicador ----------
   Um número grande com contexto. Não é gráfico: quando a resposta é um
   valor só, a forma certa é o valor, não uma barra de um item. */

export function Indicador({
  rotulo,
  valor,
  delta,
  contexto,
  icone: Icone,
  serie,
  corSerie,
}: {
  rotulo: string;
  valor: string;
  delta?: number;
  contexto?: string;
  icone?: LucideIcon;
  serie?: number[];
  corSerie?: string;
}) {
  const direcao = delta === undefined ? 'neutro' : delta > 0 ? 'sobe' : delta < 0 ? 'desce' : 'neutro';
  const IconeDelta = direcao === 'sobe' ? ArrowUpRight : direcao === 'desce' ? ArrowDownRight : Minus;

  return (
    <div className="vy-card vy-stat">
      <div className="vy-stat__rotulo">
        {Icone && <Icone size={14} strokeWidth={2} />}
        {rotulo}
      </div>
      <div className="vy-stat__valor">{valor}</div>
      {(delta !== undefined || contexto) && (
        <div className="vy-stat__rodape">
          {delta !== undefined && (
            <span className={`vy-stat__delta vy-stat__delta--${direcao}`}>
              <IconeDelta size={13} strokeWidth={2.6} />
              {formatarPercentual(Math.abs(delta), 1)}
            </span>
          )}
          {contexto && <span>{contexto}</span>}
        </div>
      )}
      {serie && (
        <div className="vy-stat__grafico">
          <Minigrafico valores={serie} cor={corSerie} altura={34} />
        </div>
      )}
    </div>
  );
}
