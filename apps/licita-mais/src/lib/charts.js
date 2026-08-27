/* =========================================================
   LICITA+ — Gráficos
   ---------------------------------------------------------
   SVG escrito à mão em vez de biblioteca. Dois motivos: a
   prévia publicada roda sob CSP que bloqueia CDN, e um
   gráfico que só precisa de quatro formas não justifica
   300 KB de runtime.

   Regras aplicadas, na ordem em que importam:

   - **Um eixo, sempre.** Nunca dois eixos Y. Duas medidas de
     escalas diferentes viram dois gráficos.
   - **Cor pelo trabalho que faz.** Série única usa um tom só
     (magnitude); categorias usam a ordem fixa validada
     (`--grafico-1..3`), nunca uma cor gerada.
   - **Marca fina, grade recessiva.** A grade é referência, não
     conteúdo: fica no cinza mais claro que ainda se enxerga.
   - **Extremidade arredondada de 4px ancorada na base.** Só a
     ponta do dado é arredondada; o pé continua reto.
   - **Rótulo direto e seletivo.** Número em todo ponto vira
     ruído; o pico e as pontas bastam.
   ========================================================= */

const NS = 'http://www.w3.org/2000/svg';

/* ---------- Helpers de geometria ---------- */

/**
 * Retângulo com arredondamento só na extremidade do dado.
 * `direcao` diz de que lado o valor cresce — é a ponta que
 * recebe o raio; a base fica reta, ancorada no eixo.
 */
function barra(x, y, largura, altura, raio, direcao = 'cima') {
  const r = Math.max(0, Math.min(raio, largura / 2, altura));
  if (altura <= 0 || largura <= 0) return '';

  if (direcao === 'cima') {
    return `M${x} ${y + altura} L${x} ${y + r} Q${x} ${y} ${x + r} ${y}
            L${x + largura - r} ${y} Q${x + largura} ${y} ${x + largura} ${y + r}
            L${x + largura} ${y + altura} Z`;
  }
  // direita: barras horizontais
  return `M${x} ${y} L${x + largura - r} ${y} Q${x + largura} ${y} ${x + largura} ${y + r}
          L${x + largura} ${y + altura - r} Q${x + largura} ${y + altura} ${x + largura - r} ${y + altura}
          L${x} ${y + altura} Z`;
}

/** Curva suave (Catmull-Rom convertida em Bézier) para a série temporal. */
function linhaSuave(pontos) {
  if (pontos.length < 2) return '';
  let d = `M${pontos[0][0]} ${pontos[0][1]}`;

  for (let i = 0; i < pontos.length - 1; i += 1) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Escala "bonita": teto arredondado para um passo legível. */
function tetoAgradavel(maximo) {
  if (maximo <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(maximo));
  const passo = [1, 2, 2.5, 5, 10].find((p) => maximo / (magnitude * p) <= 4) ?? 10;
  return Math.ceil(maximo / (magnitude * passo)) * magnitude * passo;
}

/* ---------- Gráfico de área — evolução no tempo ---------- */

export function graficoArea({ dados, formatar = (v) => v, id = 'area' }) {
  const L = 720;
  const A = 250;
  const margem = { topo: 18, dir: 14, base: 30, esq: 44 };
  const larguraPlot = L - margem.esq - margem.dir;
  const alturaPlot = A - margem.topo - margem.base;

  const teto = tetoAgradavel(Math.max(...dados.map((d) => d.valor)));
  const x = (i) => margem.esq + (i * larguraPlot) / Math.max(1, dados.length - 1);
  const y = (v) => margem.topo + alturaPlot - (v / teto) * alturaPlot;

  const pontos = dados.map((d, i) => [x(i), y(d.valor)]);
  const linha = linhaSuave(pontos);
  const area = `${linha} L${x(dados.length - 1)} ${margem.topo + alturaPlot} L${x(0)} ${margem.topo + alturaPlot} Z`;

  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(teto * f));
  const picoIdx = dados.reduce((melhor, d, i) => (d.valor > dados[melhor].valor ? i : melhor), 0);

  return `
<svg class="gr" viewBox="0 0 ${L} ${A}" data-grafico="${id}" role="img"
     aria-label="Evolução de oportunidades por mês">
  <defs>
    <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--grafico-1)" stop-opacity=".22"/>
      <stop offset="100%" stop-color="var(--grafico-1)" stop-opacity="0"/>
    </linearGradient>
  </defs>

  ${marcas
    .map(
      (m) => `
    <line class="gr-grade" x1="${margem.esq}" y1="${y(m)}" x2="${L - margem.dir}" y2="${y(m)}"/>
    <text class="gr-eixo-txt" x="${margem.esq - 10}" y="${y(m) + 4}" text-anchor="end">${m}</text>`,
    )
    .join('')}

  <path d="${area}" fill="url(#${id}-fill)"/>
  <path d="${linha}" fill="none" stroke="var(--grafico-1)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>

  ${dados
    .map(
      (d, i) => `
    <text class="gr-eixo-txt" x="${x(i)}" y="${A - 8}" text-anchor="middle">${d.rotulo}</text>
    <circle class="gr-ponto" cx="${x(i)}" cy="${y(d.valor)}" r="4"
            fill="var(--grafico-superficie)" stroke="var(--grafico-1)" stroke-width="2"
            opacity="${i === picoIdx || i === dados.length - 1 ? 1 : 0}"/>
    <rect class="gr-alvo" x="${x(i) - larguraPlot / (dados.length * 2)}" y="${margem.topo}"
          width="${larguraPlot / dados.length}" height="${alturaPlot}" fill="transparent"
          data-rotulo="${d.rotulo}" data-valor="${formatar(d.valor)}" tabindex="0"
          role="graphics-symbol" aria-label="${d.rotulo}: ${formatar(d.valor)}"/>`,
    )
    .join('')}

  <!-- Rótulo direto no pico: o número que interessa, não todos -->
  <text class="gr-eixo-txt" x="${x(picoIdx)}" y="${y(dados[picoIdx].valor) - 12}"
        text-anchor="middle" style="fill: var(--texto-forte); font-weight: 700;">
    ${formatar(dados[picoIdx].valor)}
  </text>
</svg>`;
}

/* ---------- Barras horizontais — magnitude por categoria ---------- */

export function graficoBarrasH({ dados, formatar = (v) => String(v), id = 'barras' }) {
  const L = 720;
  const alturaItem = 38;
  const A = dados.length * alturaItem + 10;
  const rotuloLarg = 190;
  const valorLarg = 62;
  const plot = L - rotuloLarg - valorLarg;
  const maximo = Math.max(...dados.map((d) => d.valor)) || 1;

  return `
<svg class="gr" viewBox="0 0 ${L} ${A}" data-grafico="${id}" role="img"
     aria-label="Distribuição por categoria">
  ${dados
    .map((d, i) => {
      const y = i * alturaItem + 6;
      const largura = Math.max(3, (d.valor / maximo) * plot);
      return `
    <text class="gr-eixo-txt" x="0" y="${y + 16}" style="fill: var(--texto-padrao); font-size: 12px;">
      ${d.rotulo}
    </text>
    <rect x="${rotuloLarg}" y="${y + 4}" width="${plot}" height="16" rx="4"
          fill="var(--grafico-grade)" opacity=".5"/>
    <path class="gr-marca" d="${barra(rotuloLarg, y + 4, largura, 16, 4, 'direita')}"
          fill="var(--grafico-1)" data-rotulo="${d.rotulo}" data-valor="${formatar(d.valor)}"
          tabindex="0" role="graphics-symbol" aria-label="${d.rotulo}: ${formatar(d.valor)}"/>
    <text class="gr-eixo-txt" x="${L}" y="${y + 16}" text-anchor="end"
          style="fill: var(--texto-forte); font-weight: 700; font-size: 12px;">
      ${formatar(d.valor)}
    </text>`;
    })
    .join('')}
</svg>`;
}

/* ---------- Colunas — magnitude por período ---------- */

export function graficoColunas({ dados, formatar = (v) => String(v), id = 'colunas' }) {
  const L = 720;
  const A = 230;
  const margem = { topo: 20, dir: 8, base: 28, esq: 40 };
  const larguraPlot = L - margem.esq - margem.dir;
  const alturaPlot = A - margem.topo - margem.base;

  const teto = tetoAgradavel(Math.max(...dados.map((d) => d.valor)));
  const passo = larguraPlot / dados.length;
  // Folga de 2px entre colunas vizinhas: sem o vão elas leem
  // como um bloco só.
  const larguraBarra = Math.min(38, passo - 12);
  const y = (v) => margem.topo + alturaPlot - (v / teto) * alturaPlot;
  const marcas = [0, 0.5, 1].map((f) => Math.round(teto * f));

  return `
<svg class="gr" viewBox="0 0 ${L} ${A}" data-grafico="${id}" role="img"
     aria-label="Oportunidades por estado">
  ${marcas
    .map(
      (m) => `
    <line class="gr-grade" x1="${margem.esq}" y1="${y(m)}" x2="${L - margem.dir}" y2="${y(m)}"/>
    <text class="gr-eixo-txt" x="${margem.esq - 9}" y="${y(m) + 4}" text-anchor="end">${m}</text>`,
    )
    .join('')}

  ${dados
    .map((d, i) => {
      const cx = margem.esq + passo * i + passo / 2;
      const alt = Math.max(2, (d.valor / teto) * alturaPlot);
      return `
    <path class="gr-marca" d="${barra(cx - larguraBarra / 2, y(d.valor), larguraBarra, alt, 4, 'cima')}"
          fill="var(--grafico-1)" data-rotulo="${d.rotulo}" data-valor="${formatar(d.valor)}"
          tabindex="0" role="graphics-symbol" aria-label="${d.rotulo}: ${formatar(d.valor)}"/>
    <text class="gr-eixo-txt" x="${cx}" y="${A - 8}" text-anchor="middle">${d.rotulo}</text>`;
    })
    .join('')}
</svg>`;
}

/* ---------- Barra empilhada — composição de um total ----------
   Único gráfico com mais de uma cor. A ordem das cores é fixa
   (grafico-1..3) e vem da paleta validada: ΔE CVD ≥ 8 em todos
   os pares adjacentes. Legenda e rótulo direto sempre juntos,
   para a identidade nunca depender só da cor. */

export function graficoEmpilhado({ segmentos, id = 'pilha' }) {
  const L = 720;
  const A = 44;
  const total = segmentos.reduce((s, seg) => s + seg.valor, 0) || 1;
  const VAO = 3;

  let cursor = 0;
  const pecas = segmentos
    .map((seg, i) => {
      const largura = (seg.valor / total) * (L - VAO * (segmentos.length - 1));
      const x = cursor;
      cursor += largura + VAO;
      const pct = Math.round((seg.valor / total) * 100);

      return `
    <rect class="gr-marca" x="${x}" y="0" width="${Math.max(2, largura)}" height="22" rx="4"
          fill="var(--grafico-${i + 1})" data-rotulo="${seg.rotulo}"
          data-valor="${seg.valor} (${pct}%)" tabindex="0" role="graphics-symbol"
          aria-label="${seg.rotulo}: ${seg.valor}, ${pct} por cento"/>
    ${largura > 56
      ? `<text x="${x + largura / 2}" y="${38}" text-anchor="middle" class="gr-eixo-txt"
             style="fill: var(--texto-forte); font-weight: 700;">${pct}%</text>`
      : ''}`;
    })
    .join('');

  return `<svg class="gr" viewBox="0 0 ${L} ${A}" data-grafico="${id}" role="img"
     aria-label="Composição das participações">${pecas}</svg>`;
}

export function legenda(itens) {
  return `<div class="gr-legenda">${itens
    .map(
      (item, i) => `
    <span class="gr-legenda-item">
      <span class="gr-legenda-marca" style="background: var(--grafico-${i + 1})"></span>
      ${item.rotulo}${item.valor !== undefined ? ` · <b>${item.valor}</b>` : ''}
    </span>`,
    )
    .join('')}</div>`;
}

/* ---------- Camada de hover ----------
   Ligada por padrão: um gráfico em HTML que não responde ao
   ponteiro desperdiça o meio. Também responde a foco de
   teclado, então o dado exato não fica só no mouse. */

let dicaEl = null;

function mostrarDica(texto, x, y) {
  if (!dicaEl) {
    dicaEl = document.createElement('div');
    dicaEl.className = 'gr-dica';
    document.body.appendChild(dicaEl);
  }
  dicaEl.innerHTML = texto;
  dicaEl.style.display = 'block';

  const caixa = dicaEl.getBoundingClientRect();
  dicaEl.style.left = `${Math.min(Math.max(8, x - caixa.width / 2), window.innerWidth - caixa.width - 8)}px`;
  dicaEl.style.top = `${Math.max(8, y - caixa.height - 10)}px`;
}

function esconderDica() {
  if (dicaEl) dicaEl.style.display = 'none';
}

/** Liga tooltip em todo gráfico dentro da raiz. Idempotente. */
export function ativarGraficos(raiz = document) {
  raiz.querySelectorAll('[data-grafico]').forEach((svg) => {
    if (svg.dataset.ligado === '1') return;
    svg.dataset.ligado = '1';

    const alvos = svg.querySelectorAll('[data-valor]');

    alvos.forEach((alvo) => {
      const revelar = () => {
        const caixa = alvo.getBoundingClientRect();
        mostrarDica(
          `${alvo.dataset.rotulo} · <b>${alvo.dataset.valor}</b>`,
          caixa.left + caixa.width / 2,
          caixa.top,
        );
      };

      alvo.addEventListener('mouseenter', revelar);
      alvo.addEventListener('focus', revelar);
      alvo.addEventListener('mouseleave', esconderDica);
      alvo.addEventListener('blur', esconderDica);
    });

    svg.addEventListener('mouseleave', esconderDica);
  });
}
