/* =========================================================
   LICITA+ — Confirmar e-mail
   ---------------------------------------------------------
   Destino do link enviado no cadastro. O token vem no hash
   (`#/confirmar?token=…`) e é consumido assim que a tela
   abre — o usuário já clicou uma vez no e-mail; pedir que
   clique de novo aqui seria uma etapa sem função.

   O token é de uso único e vale 24 horas, então a tela precisa
   tratar bem o caso mais provável de erro: link velho, ou já
   usado. A saída é sempre acionável — reenviar, ou entrar.
   ========================================================= */

import { html, raw, $, ao } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { campo } from '../ui/primitives.js';
import { molduraAuth, avisoAuth } from '../ui/autenticacao.js';
import { confirmarEmailToken, reenviarConfirmacao } from '../lib/sessao.js';

export default {
  titulo: 'Confirmar e-mail',
  shell: false,

  render() {
    return molduraAuth({
      titulo: 'Confirmando seu e-mail',
      subtitulo: 'Só um instante.',
      chamada: 'Falta um passo para o seu radar começar.',

      corpo: html`
        <div id="resultado-confirmacao" style="margin-top: var(--e-6)">
          <div class="skeleton" style="height: 74px; border-radius: var(--r-md)"></div>
        </div>`,

      rodape: `
        <p class="suave" style="text-align: center; margin-top: var(--e-8); font-size: var(--t-corpo-sm)">
          <a href="#/entrar" style="font-weight: var(--p-semi)">Voltar para o login</a>
        </p>`,
    });
  },

  ativar(raiz, ctx) {
    const destino = $('#resultado-confirmacao', raiz);
    const token = ctx.consulta?.token;

    if (!token) {
      destino.innerHTML = semToken();
      ligarReenvio(raiz, destino);
      return;
    }

    confirmarEmailToken(token)
      .then(({ mensagem }) => {
        destino.innerHTML = `
          ${avisoAuth(mensagem, 'sucesso')}
          <a class="btn -gradiente -lg -cheio" href="#/entrar" style="margin-top: var(--e-5)">
            Entrar agora
          </a>`;
      })
      .catch((erro) => {
        destino.innerHTML = `
          ${avisoAuth(erro.message)}
          <p class="suave" style="margin-top: var(--e-5); font-size: var(--t-corpo-sm)">
            Links de confirmação valem 24 horas e só podem ser usados uma vez.
            Informe seu e-mail para receber outro.
          </p>
          ${formularioReenvio()}`;
        ligarReenvio(raiz, destino);
      });
  },
};

const semToken = () => `
  ${avisoAuth('Este endereço precisa do link que enviamos por e-mail.')}
  <p class="suave" style="margin-top: var(--e-5); font-size: var(--t-corpo-sm)">
    Abra o e-mail de confirmação e clique no botão. Se ele não chegou, peça outro:
  </p>
  ${formularioReenvio()}`;

function formularioReenvio() {
  return `<form class="pilha" id="form-reenvio" style="margin-top: var(--e-4)" novalidate>
    ${campo({
      rotulo: 'Seu e-mail', id: 'conf-email', tipo: 'email',
      placeholder: 'voce@suaempresa.com.br',
      atributos: 'autocomplete="email" required',
    })}
    <button class="btn -secundario -cheio" type="submit" id="btn-reenviar">
      ${icone('atualizar')} Reenviar link de confirmação
    </button>
  </form>`;
}

function ligarReenvio(raiz, destino) {
  const form = $('#form-reenvio', raiz);
  if (!form) return;

  ao(form, 'submit', async (evento) => {
    evento.preventDefault();
    const email = $('#conf-email', raiz).value.trim();

    if (!email.includes('@')) {
      destino.querySelector('.alerta-bloco').outerHTML = avisoAuth('Informe um e-mail válido.');
      return;
    }

    const botao = $('#btn-reenviar', raiz);
    botao.disabled = true;

    try {
      const { mensagem } = await reenviarConfirmacao(email);
      // Resposta idêntica exista ou não a conta — a tela não
      // pode revelar o que o servidor esconde de propósito.
      destino.innerHTML = avisoAuth(mensagem, 'sucesso');
    } catch (erro) {
      botao.disabled = false;
      destino.querySelector('.alerta-bloco').outerHTML = avisoAuth(erro.message);
    }
  });
}
