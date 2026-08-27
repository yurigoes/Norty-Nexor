/* =========================================================
   LICITA+ — Marca
   ---------------------------------------------------------
   O símbolo é losango + círculo + sinal de mais: a geometria
   da bandeira lida como conexão e o "+" como oportunidade.
   Os quadradinhos que escapam pela esquerda são o dado
   público se organizando — é o que o produto faz.

   Reconstruída em SVG em vez de bitmap: escala sem borrar,
   herda cor por token e serve de favicon sem exportação.

   Regra de escrita, sem exceção: LICITA+ — sem acento no I e
   com o "+" fazendo parte do nome, nunca um enfeite solto.
   ========================================================= */

let contadorGradiente = 0;

/**
 * Símbolo isolado. `unico` gera ids próprios de gradiente
 * porque a página mostra o símbolo várias vezes ao mesmo
 * tempo — ids repetidos fariam todas as instâncias herdarem o
 * gradiente da primeira.
 */
export function simbolo({ tamanho = 40, comPontos = true } = {}) {
  const id = `lm${(contadorGradiente += 1)}`;

  return `
<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 48 48" fill="none"
     role="img" aria-label="LICITA+">
  <defs>
    <linearGradient id="${id}a" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1677E8"/><stop offset=".55" stop-color="#005CA9"/><stop offset="1" stop-color="#071E3D"/>
    </linearGradient>
    <linearGradient id="${id}b" x1="24" y1="8" x2="42" y2="26" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFCC00"/><stop offset="1" stop-color="#E5B400"/>
    </linearGradient>
    <linearGradient id="${id}c" x1="24" y1="40" x2="42" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00A95C"/><stop offset="1" stop-color="#008C45"/>
    </linearGradient>
  </defs>

  <!-- Losango: quadrado girado com canto suave -->
  <rect x="10.5" y="10.5" width="27" height="27" rx="7.5"
        transform="rotate(45 24 24)" fill="url(#${id}a)"/>

  <!-- Fitas: quartos de anel em amarelo e verde, sugerindo movimento -->
  <path d="M24 7.5 A16.5 16.5 0 0 1 40.5 24 L33.5 24 A9.5 9.5 0 0 0 24 14.5 Z"
        fill="url(#${id}b)" opacity=".95"/>
  <path d="M40.5 24 A16.5 16.5 0 0 1 24 40.5 L24 33.5 A9.5 9.5 0 0 0 33.5 24 Z"
        fill="url(#${id}c)" opacity=".95"/>

  <!-- Círculo central e o "+" -->
  <circle cx="24" cy="24" r="10" fill="#071E3D"/>
  <path d="M24 18.5v11M18.5 24h11" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>

  ${comPontos ? `
  <rect x="4.5" y="21" width="4" height="4" rx="1" fill="#005CA9" opacity=".85"/>
  <rect x="0" y="27.5" width="3" height="3" rx=".8" fill="#1677E8" opacity=".6"/>
  <rect x="5" y="31.5" width="3.4" height="3.4" rx="1" fill="#008C45" opacity=".8"/>
  <rect x="10.5" y="37" width="3" height="3" rx=".8" fill="#FFCC00" opacity=".85"/>` : ''}
</svg>`;
}

/**
 * Símbolo com as peças nomeadas, para a tela de carregamento
 * montá-lo na ordem. A sequência conta a história do produto:
 * primeiro os dados chegando (os quadradinhos), depois a
 * estrutura que os organiza (o losango), e por último a
 * oportunidade que sai disso (o "+").
 *
 * O "+" é desenhado por `stroke-dasharray`, não por opacidade:
 * traço que se desenha lê como construção, e fade lê como
 * aparição. A diferença é o que faz a marca parecer montada em
 * vez de apenas revelada.
 */
export function simboloAnimado({ tamanho = 96 } = {}) {
  const id = `lma${(contadorGradiente += 1)}`;

  return `
<svg class="lm-simbolo" width="${tamanho}" height="${tamanho}" viewBox="0 0 48 48" fill="none"
     role="img" aria-label="LICITA+">
  <defs>
    <linearGradient id="${id}a" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1677E8"/><stop offset=".55" stop-color="#005CA9"/><stop offset="1" stop-color="#071E3D"/>
    </linearGradient>
    <linearGradient id="${id}b" x1="24" y1="8" x2="42" y2="26" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFCC00"/><stop offset="1" stop-color="#E5B400"/>
    </linearGradient>
    <linearGradient id="${id}c" x1="24" y1="40" x2="42" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00A95C"/><stop offset="1" stop-color="#008C45"/>
    </linearGradient>
  </defs>

  <rect class="lm-pix" x="4.5" y="21" width="4" height="4" rx="1" fill="#005CA9"/>
  <rect class="lm-pix" x="0" y="27.5" width="3" height="3" rx=".8" fill="#1677E8"/>
  <rect class="lm-pix" x="5" y="31.5" width="3.4" height="3.4" rx="1" fill="#008C45"/>
  <rect class="lm-pix" x="10.5" y="37" width="3" height="3" rx=".8" fill="#FFCC00"/>

  <rect class="lm-losango" x="10.5" y="10.5" width="27" height="27" rx="7.5"
        transform="rotate(45 24 24)" fill="url(#${id}a)"/>

  <path class="lm-fita lm-fita-a" d="M24 7.5 A16.5 16.5 0 0 1 40.5 24 L33.5 24 A9.5 9.5 0 0 0 24 14.5 Z"
        fill="url(#${id}b)"/>
  <path class="lm-fita lm-fita-b" d="M40.5 24 A16.5 16.5 0 0 1 24 40.5 L24 33.5 A9.5 9.5 0 0 0 33.5 24 Z"
        fill="url(#${id}c)"/>

  <circle class="lm-circulo" cx="24" cy="24" r="10" fill="#071E3D"/>
  <path class="lm-mais" d="M24 18.5v11M18.5 24h11"
        stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"
        stroke-dasharray="22" stroke-dashoffset="22"/>
</svg>`;
}

/** Assinatura textual. O "+" recebe o gradiente de oportunidade. */
export function textoMarca({ classe = '' } = {}) {
  return `<span class="marca-texto ${classe}">LICITA<i>+</i></span>`;
}

/** Logo horizontal: símbolo + nome + assinatura. */
export function marcaHorizontal({ tamanho = 38, comTagline = false } = {}) {
  return `
<span class="marca">
  ${simbolo({ tamanho })}
  <span class="marca-bloco">
    ${textoMarca()}
    ${comTagline ? '<span class="marca-tagline">Inteligência para oportunidades públicas.</span>' : ''}
  </span>
</span>`;
}

/** Versão da sidebar: some o texto quando a barra encolhe. */
export function marcaSidebar() {
  return `
<a class="marca marca-sidebar" href="#/painel" aria-label="LICITA+ — ir para o painel">
  ${simbolo({ tamanho: 34, comPontos: false })}
  ${textoMarca({ classe: '-inversa' })}
</a>`;
}

/** Compacta: só símbolo e nome, sem assinatura. */
export function marcaCompacta({ tamanho = 30 } = {}) {
  return `<span class="marca">${simbolo({ tamanho, comPontos: false })}${textoMarca({ classe: '-sm' })}</span>`;
}

/**
 * Favicon em data URI. Sem pontos e com o losango sangrando
 * até a borda: em 16px, detalhe fino vira sujeira.
 */
export function faviconDataUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <defs><linearGradient id="g" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1677E8"/><stop offset="1" stop-color="#071E3D"/></linearGradient></defs>
    <rect x="7" y="7" width="34" height="34" rx="9" transform="rotate(45 24 24)" fill="url(#g)"/>
    <path d="M24 8.5A15.5 15.5 0 0 1 39.5 24h-7A8.5 8.5 0 0 0 24 15.5Z" fill="#FFCC00"/>
    <path d="M39.5 24A15.5 15.5 0 0 1 24 39.5v-7A8.5 8.5 0 0 0 32.5 24Z" fill="#00A95C"/>
    <circle cx="24" cy="24" r="10.5" fill="#071E3D"/>
    <path d="M24 18v12M18 24h12" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
