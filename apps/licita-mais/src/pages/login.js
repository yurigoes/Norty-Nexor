/* =========================================================
   LICITA+ — Entrar
   ---------------------------------------------------------
   Autenticação de verdade contra a API. Duas decisões que a
   tela precisa respeitar e que vêm do servidor:

   - A mensagem de erro é a mesma para e-mail inexistente e
     senha errada. A tela não pode "melhorar" isso dizendo
     "e-mail não encontrado" — seria transformar o login num
     verificador de quem tem conta.
   - E-mail não confirmado tem mensagem própria, e aí sim vale
     oferecer o reenvio do link: aqui a existência da conta já
     foi estabelecida por quem digitou a senha certa.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { campo, toast } from '../ui/primitives.js';
import { molduraAuth, campoSenha, ligarOlhoDeSenha, avisoAuth } from '../ui/autenticacao.js';
import { comCarregamento } from '../ui/carregando.js';
import { irPara } from '../lib/router.js';
import { entrarNaConta, reenviarConfirmacao, primeiroNome, destinoAposEntrar } from '../lib/sessao.js';
import { emDemonstracao } from '../lib/config.js';

export default {
  titulo: 'Entrar',
  shell: false,

  render() {
    return molduraAuth({
      titulo: 'Bem-vindo de volta',
      subtitulo: 'Entre para continuar acompanhando suas oportunidades.',

      corpo: html`
        <div id="aviso-login"></div>

        <form class="pilha" style="margin-top: var(--e-8)" id="form-login" novalidate>
          ${raw(campo({
            rotulo: 'E-mail', id: 'login-email', tipo: 'email',
            placeholder: 'voce@suaempresa.com.br',
            atributos: 'autocomplete="email" required',
          }))}

          ${raw(campoSenha({ id: 'login-senha', rotulo: 'Senha' }))}

          <div class="linha-entre" style="margin-top: -4px">
            <span></span>
            <a href="#/esqueci-senha" style="font-size: var(--t-micro); font-weight: var(--p-semi)">
              Esqueci minha senha
            </a>
          </div>

          <button class="btn -gradiente -lg -cheio" type="submit" id="btn-entrar" style="margin-top: var(--e-2)">
            Entrar
          </button>
        </form>

        ${raw(emDemonstracao() ? avisoAuth(
          '<b>Modo demonstração.</b> A API não está respondendo neste ambiente. ' +
          'Qualquer e-mail entra numa conta fictícia, e nenhum dado é real.',
          'info',
        ) : '')}`,

      rodape: `
        <p class="suave" style="text-align: center; margin-top: var(--e-8); font-size: var(--t-corpo-sm)">
          Não possui uma conta?
          <a href="#/criar-conta" style="font-weight: var(--p-semi)">Criar conta</a>
        </p>`,
    });
  },

  ativar(raiz) {
    const form = $('#form-login', raiz);
    const botao = $('#btn-entrar', raiz);
    const aviso = $('#aviso-login', raiz);

    ligarOlhoDeSenha(raiz, aoClicarEm);

    ao(form, 'submit', async (evento) => {
      evento.preventDefault();

      const email = $('#login-email', raiz).value.trim();
      const senha = $('#login-senha', raiz).value;

      if (!email.includes('@') || senha.length === 0) {
        aviso.innerHTML = avisoAuth('Informe e-mail e senha para continuar.');
        return;
      }

      aviso.innerHTML = '';
      botao.classList.add('-carregando');
      botao.disabled = true;

      try {
        await entrarNaConta({ email, senha });

        // A cortina só entra depois da autenticação dar certo. Se
        // ela cobrisse a espera, um erro de senha apareceria
        // depois de dois segundos de animação — a espera precisa
        // ser sobre carregar dados, não sobre esconder a demora.
        comCarregamento(
          {
            texto: 'Preparando o seu radar…',
            etapas: ['Carregando o perfil da empresa', 'Selecionando o que fecha primeiro'],
            duracao: 1500,
          },
          () => {
            irPara(destinoAposEntrar());
            toast(`Bem-vindo de volta, ${primeiroNome()}`, { variante: 'sucesso' });
          },
        );
      } catch (erro) {
        botao.classList.remove('-carregando');
        botao.disabled = false;

        const naoConfirmado = /confirme seu e-mail/i.test(erro.message ?? '');
        aviso.innerHTML = avisoAuth(
          naoConfirmado
            ? `${erro.message} <button class="btn-link" data-acao="reenviar">Reenviar o link</button>`
            : erro.message,
        );
      }
    });

    aoClicarEm(raiz, '[data-acao="reenviar"]', async () => {
      const email = $('#login-email', raiz).value.trim();
      try {
        const { mensagem } = await reenviarConfirmacao(email);
        aviso.innerHTML = avisoAuth(mensagem, 'sucesso');
      } catch (erro) {
        aviso.innerHTML = avisoAuth(erro.message);
      }
    });
  },
};
