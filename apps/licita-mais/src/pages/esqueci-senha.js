/* =========================================================
   LICITA+ — Recuperar acesso
   ---------------------------------------------------------
   A resposta é sempre a mesma, exista ou não a conta. Isso não
   é imprecisão da tela: dizer "não encontramos esse e-mail"
   transformaria a recuperação num verificador de quem tem
   conta no sistema — e a lista de clientes de uma plataforma
   de licitações é informação comercial.

   Por isso o sucesso mostra o mesmo texto sempre, e a tela
   fecha o formulário depois do envio: reenviar invalidaria o
   link recém-enviado, e o usuário ficaria com dois e-mails e
   um só funcionando.
   ========================================================= */

import { html, raw, $, ao } from '../lib/dom.js';
import { campo } from '../ui/primitives.js';
import { molduraAuth, avisoAuth } from '../ui/autenticacao.js';
import { pedirRedefinicao } from '../lib/sessao.js';

export default {
  titulo: 'Recuperar acesso',
  shell: false,

  render() {
    return molduraAuth({
      titulo: 'Recuperar acesso',
      subtitulo: 'Informe o e-mail da conta e enviamos um link para criar uma nova senha.',
      chamada: 'Perdeu a senha? Isso se resolve em um minuto.',

      corpo: html`
        <div id="aviso-esqueci"></div>

        <form class="pilha" style="margin-top: var(--e-6)" id="form-esqueci" novalidate>
          ${raw(campo({
            rotulo: 'E-mail da conta', id: 'esq-email', tipo: 'email',
            placeholder: 'voce@suaempresa.com.br',
            atributos: 'autocomplete="email" required autofocus',
          }))}

          <button class="btn -gradiente -lg -cheio" type="submit" id="btn-esqueci">
            Enviar link de redefinição
          </button>
        </form>`,

      rodape: `
        <p class="suave" style="text-align: center; margin-top: var(--e-8); font-size: var(--t-corpo-sm)">
          Lembrou a senha? <a href="#/entrar" style="font-weight: var(--p-semi)">Entrar</a>
        </p>`,
    });
  },

  ativar(raiz) {
    const form = $('#form-esqueci', raiz);
    const aviso = $('#aviso-esqueci', raiz);
    const botao = $('#btn-esqueci', raiz);

    ao(form, 'submit', async (evento) => {
      evento.preventDefault();
      const email = $('#esq-email', raiz).value.trim();

      if (!email.includes('@')) {
        aviso.innerHTML = avisoAuth('Informe um e-mail válido.');
        return;
      }

      aviso.innerHTML = '';
      botao.classList.add('-carregando');
      botao.disabled = true;

      try {
        const { mensagem } = await pedirRedefinicao(email);
        form.innerHTML = '';
        aviso.innerHTML = avisoAuth(
          `${mensagem}<br><br>O link vale por uma hora. Se não chegar em alguns minutos,
           confira a caixa de spam.`,
          'sucesso',
        );
      } catch (erro) {
        botao.classList.remove('-carregando');
        botao.disabled = false;
        aviso.innerHTML = avisoAuth(erro.message);
      }
    });
  },
};
