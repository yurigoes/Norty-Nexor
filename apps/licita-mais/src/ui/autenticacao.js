/* =========================================================
   LICITA+ — Moldura das telas de conta
   ---------------------------------------------------------
   Entrar, criar conta, confirmar e-mail e redefinir senha
   compartilham a mesma composição: marca e promessa à
   esquerda, formulário à direita. Ter isso num lugar só evita
   que quatro telas divirjam em detalhes que ninguém revisa —
   e é o que permite corrigir o comportamento em tela estreita
   uma vez.
   ========================================================= */

import { html, raw } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { marcaHorizontal, textoMarca, simbolo } from './brand.js';

const PROMESSAS = [
  'Oportunidades analisadas contra o perfil da sua empresa',
  'Compatibilidade com a conta aberta, critério por critério',
  'Alerta de prazo antes de a oportunidade fechar',
  'Histórico que ensina a calibrar o próximo preço',
];

/**
 * @param {object} config
 *   titulo, subtitulo — cabeçalho do formulário
 *   corpo             — marcação do formulário
 *   rodape            — link de ida e volta entre as telas
 *   chamada           — título do lado da marca
 */
export function molduraAuth({ titulo, subtitulo, corpo, rodape = '', chamada }) {
  return html`
<div class="login">

  <aside class="login-arte">
    <span class="login-geo-1" aria-hidden="true"></span>
    <span class="login-geo-2" aria-hidden="true"></span>
    <span class="login-geo-3" aria-hidden="true"></span>

    <a href="#/" style="position: relative; z-index: 1; display: inline-flex; align-items: center; gap: var(--e-3)">
      ${raw(simbolo({ tamanho: 38, comPontos: false }))}
      ${raw(textoMarca({ classe: '-inversa' }))}
    </a>

    <div style="position: relative; z-index: 1">
      <h2>${chamada ?? 'Inteligência para encontrar oportunidades.'}</h2>
      <p>
        O LICITA+ analisa o que é publicado nos portais públicos e mostra o que
        realmente faz sentido para o seu negócio.
      </p>

      <div class="login-lista" style="margin-top: var(--e-8)">
        ${raw(PROMESSAS.map((p) => `
          <div class="login-lista-item">${icone('check_circulo')}<span>${p}</span></div>`).join(''))}
      </div>
    </div>

    <p style="position: relative; z-index: 1; font-size: var(--t-micro); color: rgba(255,255,255,.42)">
      Plataforma privada e independente, sem vínculo com órgãos públicos.
    </p>
  </aside>

  <main class="login-form">
    <div class="login-caixa">
      <div style="display: none" class="login-marca-mobile">${raw(marcaHorizontal({ tamanho: 34 }))}</div>

      <h1 style="font-size: var(--t-h2)">${titulo}</h1>
      ${raw(subtitulo ? `<p class="suave" style="margin-top: 6px; font-size: var(--t-corpo-sm)">${subtitulo}</p>` : '')}

      ${raw(corpo)}
      ${raw(rodape)}
    </div>
  </main>
</div>`;
}

/**
 * Campo de senha com o olho de mostrar/ocultar. O botão vive
 * dentro do campo, então a marcação vem daqui em vez de o
 * `campo()` genérico ganhar um caso especial.
 */
export function campoSenha({ id, rotulo, placeholder = 'Sua senha', autocomplete = 'current-password', ajuda }) {
  return html`<div class="campo">
    <label class="campo-rotulo" for="${id}">${rotulo}</label>
    <div style="position: relative">
      <input class="input" id="${id}" type="password" placeholder="${placeholder}"
        autocomplete="${autocomplete}" required style="padding-right: 44px">
      <button type="button" class="btn-icone" data-acao="ver-senha" data-alvo="${id}"
        aria-label="Mostrar senha" aria-pressed="false"
        style="position: absolute; right: 2px; top: 1px">${raw(icone('olho'))}</button>
    </div>
    ${raw(ajuda ? `<span class="campo-ajuda">${ajuda}</span>` : '')}
  </div>`;
}

/** A regra da API é de comprimento, não de composição — ver dto.ts. */
export const SENHA_MINIMA = 12;

export const senhaCurta = (senha) => senha.length < SENHA_MINIMA;

export const AJUDA_SENHA =
  'Ao menos 12 caracteres. Uma frase que só você lembra vale mais que símbolo e maiúscula.';

/** Liga o olho de senha em qualquer tela que use `campoSenha`. */
export function ligarOlhoDeSenha(raiz, aoClicar) {
  aoClicar(raiz, '[data-acao="ver-senha"]', (_evento, alvo) => {
    const campo = raiz.querySelector(`#${alvo.dataset.alvo}`);
    if (!campo) return;

    const visivel = campo.type === 'text';
    campo.type = visivel ? 'password' : 'text';
    alvo.setAttribute('aria-pressed', String(!visivel));
    alvo.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
  });
}

/**
 * Caixa de aviso das telas de conta. Serve tanto para o erro do
 * servidor quanto para a confirmação de envio — as duas ocupam
 * o mesmo lugar, então quem lê não precisa procurar.
 */
export function avisoAuth(texto, variante = 'erro') {
  const nomeIcone = { erro: 'alerta', sucesso: 'check_circulo', info: 'info' }[variante] ?? 'info';
  return `<div class="alerta-bloco -${variante}" style="margin-top: var(--e-5)">
    ${icone(nomeIcone)}<div>${texto}</div>
  </div>`;
}
