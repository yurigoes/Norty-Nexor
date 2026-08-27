/* =========================================================
   LICITA+ — Utilitários de DOM
   ---------------------------------------------------------
   O suficiente para escrever componentes sem framework e sem
   concatenar HTML na mão em todo lugar.

   `html` monta a árvore a partir de template literal e escapa
   toda interpolação por padrão. Só o que passa por `raw()`
   entra sem escapar — o que torna a injeção uma decisão
   explícita e visível na revisão, em vez do comportamento
   acidental de um `innerHTML +=`.
   ========================================================= */

const MARCA_CRUA = Symbol('cru');

/** Marca um trecho como HTML já confiável (ícone, sub-template). */
export function raw(texto) {
  return { [MARCA_CRUA]: true, valor: String(texto ?? '') };
}

export function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolver(valor) {
  if (valor === null || valor === undefined || valor === false) return '';
  if (Array.isArray(valor)) return valor.map(resolver).join('');
  if (typeof valor === 'object' && valor[MARCA_CRUA]) return valor.valor;
  return escapar(valor);
}

/** Template literal que devolve string de HTML com tudo escapado. */
export function html(partes, ...valores) {
  return partes.reduce((acc, parte, i) => acc + parte + resolver(valores[i]), '');
}

/** Converte string de HTML no primeiro elemento correspondente. */
export function elemento(marcacao) {
  const suporte = document.createElement('div');
  suporte.innerHTML = String(marcacao).trim();
  return suporte.firstElementChild;
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/**
 * Delegação de evento: um único ouvinte na raiz atende a todos
 * os alvos, inclusive os que ainda não existem. É o que permite
 * repintar uma lista inteira sem religar nada.
 *
 * Devolve o cancelador. Ligado na raiz da página ele é
 * dispensável — o nó morre com a troca de tela. Ligado no
 * `body` (o caso de modal e gaveta, que vivem fora dela) ele é
 * obrigatório: sem cancelar, cada visita à mesma página
 * empilharia mais um ouvinte, e o quinto clique em "salvar"
 * dispararia cinco gravações.
 */
export function aoClicarEm(raiz, seletor, manipulador) {
  const ouvinte = (evento) => {
    const alvo = evento.target.closest(seletor);
    if (alvo && raiz.contains(alvo)) manipulador(evento, alvo);
  };

  raiz.addEventListener('click', ouvinte);
  return () => raiz.removeEventListener('click', ouvinte);
}

export function ao(alvo, tipo, manipulador, opcoes) {
  alvo.addEventListener(tipo, manipulador, opcoes);
  return () => alvo.removeEventListener(tipo, manipulador, opcoes);
}

/** Espera o próximo quadro — usado para animar a partir do estado inicial. */
export function proximoQuadro() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function debounce(fn, ms = 220) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

/** Prende o Tab dentro de um contêiner enquanto ele estiver aberto. */
export function prenderFoco(container) {
  const foco = () =>
    $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container)
      .filter((el) => el.offsetParent !== null);

  const primeiro = foco()[0];
  if (primeiro) primeiro.focus();

  return ao(container, 'keydown', (evento) => {
    if (evento.key !== 'Tab') return;
    const itens = foco();
    if (itens.length === 0) return;
    const inicio = itens[0];
    const fim = itens[itens.length - 1];

    if (evento.shiftKey && document.activeElement === inicio) {
      evento.preventDefault();
      fim.focus();
    } else if (!evento.shiftKey && document.activeElement === fim) {
      evento.preventDefault();
      inicio.focus();
    }
  });
}
