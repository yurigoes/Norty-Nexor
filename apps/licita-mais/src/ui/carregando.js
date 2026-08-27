/* =========================================================
   LICITA+ — Tela de carregamento
   ---------------------------------------------------------
   A marca se montando peça por peça, com o texto dizendo o que
   está acontecendo.

   Por que não um spinner: o spinner informa que algo trava, não
   o quê. Aqui a espera é ocupada por duas coisas úteis — a
   identidade se construindo, que é a única memória visual que
   sobra de uma tela de espera, e a etapa em texto, que faz o
   tempo passar mais rápido porque há o que ler.

   `mostrar()` devolve um controlador com `etapa()` e `fechar()`,
   então quem chamou decide o ritmo em vez de torcer para o
   tempo bater.
   ========================================================= */

import { elemento, $ } from '../lib/dom.js';
import { simboloAnimado, textoMarca } from './brand.js';

let cortinaAtual = null;

/**
 * @param {object} opcoes
 * @param {string}   opcoes.texto    primeira etapa exibida
 * @param {string[]} opcoes.etapas   etapas seguintes, em ordem
 * @param {number}   opcoes.intervalo ms entre etapas automáticas
 */
export function mostrarCarregando({ texto = 'Carregando…', etapas = [], intervalo = 900 } = {}) {
  fecharCarregando();

  const el = elemento(`
    <div class="lm-cortina" role="status" aria-live="polite" aria-label="${texto}">
      <span class="lm-anel" aria-hidden="true"></span>
      <div class="lm-palco">
        ${simboloAnimado({ tamanho: 128 })}
        <div class="lm-marca">${textoMarca()}</div>
        <div class="lm-trilho"><span class="lm-avanco"></span></div>
        <p class="lm-etapa">${texto}</p>
      </div>
    </div>`);

  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const avanco = $('.lm-avanco', el);
  const etapaEl = $('.lm-etapa', el);
  const timers = [];

  // A barra parte de um valor visível: 0% lê como "não começou".
  requestAnimationFrame(() => {
    avanco.style.width = etapas.length ? '18%' : '92%';
  });

  etapas.forEach((passo, i) => {
    timers.push(setTimeout(() => {
      etapaEl.textContent = passo;
      avanco.style.width = `${18 + ((i + 1) / etapas.length) * 74}%`;
    }, intervalo * (i + 1)));
  });

  cortinaAtual = {
    el,
    timers,
    etapa(texto, porcento) {
      etapaEl.textContent = texto;
      if (porcento !== undefined) avanco.style.width = `${porcento}%`;
    },
  };

  return cortinaAtual;
}

export function fecharCarregando() {
  if (!cortinaAtual) return;

  cortinaAtual.timers.forEach(clearTimeout);
  const { el } = cortinaAtual;
  cortinaAtual = null;

  // Completa a barra antes de sair. Cortina que some no meio do
  // percurso deixa a sensação de que algo foi interrompido.
  const avanco = $('.lm-avanco', el);
  if (avanco) avanco.style.width = '100%';

  el.classList.add('-saindo');
  document.body.style.overflow = '';
  setTimeout(() => el.remove(), 420);
}

/**
 * Açúcar para o caso comum: mostra, espera, fecha e segue.
 * Devolve promessa para quem quiser encadear a navegação.
 */
export function comCarregamento({ texto, etapas, duracao = 1600 }, aoTerminar) {
  mostrarCarregando({ texto, etapas, intervalo: duracao / Math.max(1, etapas?.length ?? 1) });

  return new Promise((resolve) => {
    setTimeout(() => {
      fecharCarregando();
      aoTerminar?.();
      resolve();
    }, duracao);
  });
}
