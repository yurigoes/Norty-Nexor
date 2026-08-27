/* =========================================================
   LICITA+ — Nova senha
   ---------------------------------------------------------
   Destino do link de redefinição. Vale uma hora, uma vez só.

   Trocar a senha derruba todas as sessões — decisão do
   servidor, e a tela avisa antes em vez de o usuário descobrir
   pelo celular deslogado. Se a troca foi por suspeita de
   invasão, manter as sessões antigas vivas anularia o gesto.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { molduraAuth, campoSenha, ligarOlhoDeSenha, avisoAuth, senhaCurta, AJUDA_SENHA } from '../ui/autenticacao.js';
import { redefinirSenhaToken } from '../lib/sessao.js';

export default {
  titulo: 'Nova senha',
  shell: false,

  render(ctx) {
    const token = ctx.consulta?.token;

    if (!token) {
      return molduraAuth({
        titulo: 'Link incompleto',
        subtitulo: 'Este endereço precisa do link que enviamos por e-mail.',
        chamada: 'Vamos recuperar o seu acesso.',
        corpo: `
          ${avisoAuth('Abra o e-mail de redefinição e clique no botão que ele traz.')}
          <a class="btn -secundario -cheio" href="#/esqueci-senha" style="margin-top: var(--e-5)">
            Pedir um novo link
          </a>`,
      });
    }

    return molduraAuth({
      titulo: 'Criar nova senha',
      subtitulo: 'Escolha uma senha que você lembre e ninguém adivinhe.',
      chamada: 'Vamos recuperar o seu acesso.',

      corpo: html`
        <div id="aviso-redefinir"></div>

        <form class="pilha" style="margin-top: var(--e-6)" id="form-redefinir" novalidate>
          ${raw(campoSenha({
            id: 'red-senha', rotulo: 'Nova senha',
            placeholder: 'Uma frase que só você lembra',
            autocomplete: 'new-password',
            ajuda: AJUDA_SENHA,
          }))}

          ${raw(campoSenha({
            id: 'red-confirma', rotulo: 'Repita a nova senha',
            placeholder: 'A mesma de cima',
            autocomplete: 'new-password',
          }))}

          <div class="alerta-bloco -info" style="margin-top: var(--e-2)">
            ${raw(icone('info'))}
            <div>Ao trocar a senha, todas as sessões abertas serão encerradas —
            inclusive no celular. Você entrará de novo com a senha nova.</div>
          </div>

          <button class="btn -gradiente -lg -cheio" type="submit" id="btn-redefinir">
            Salvar nova senha
          </button>
        </form>`,

      rodape: `
        <p class="suave" style="text-align: center; margin-top: var(--e-8); font-size: var(--t-corpo-sm)">
          <a href="#/entrar" style="font-weight: var(--p-semi)">Voltar para o login</a>
        </p>`,
    });
  },

  ativar(raiz, ctx) {
    const form = $('#form-redefinir', raiz);
    if (!form) return;

    const aviso = $('#aviso-redefinir', raiz);
    const botao = $('#btn-redefinir', raiz);

    ligarOlhoDeSenha(raiz, aoClicarEm);

    ao(form, 'submit', async (evento) => {
      evento.preventDefault();

      const senha = $('#red-senha', raiz).value;
      const confirma = $('#red-confirma', raiz).value;

      if (senhaCurta(senha)) {
        aviso.innerHTML = avisoAuth(AJUDA_SENHA);
        return;
      }
      if (senha !== confirma) {
        aviso.innerHTML = avisoAuth('As duas senhas não são iguais.');
        return;
      }

      aviso.innerHTML = '';
      botao.classList.add('-carregando');
      botao.disabled = true;

      try {
        const { mensagem } = await redefinirSenhaToken(ctx.consulta.token, senha);
        form.innerHTML = '';
        aviso.innerHTML = `
          ${avisoAuth(mensagem, 'sucesso')}
          <a class="btn -gradiente -lg -cheio" href="#/entrar" style="margin-top: var(--e-5)">
            Entrar com a nova senha
          </a>`;
      } catch (erro) {
        botao.classList.remove('-carregando');
        botao.disabled = false;
        aviso.innerHTML = avisoAuth(erro.message);
      }
    });
  },
};
