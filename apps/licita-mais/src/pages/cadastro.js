/* =========================================================
   LICITA+ — Criar conta
   ---------------------------------------------------------
   Cadastro aberto: qualquer empresa cria a própria conta.

   O formulário pede o mínimo que a triagem precisa para já
   funcionar no primeiro acesso — quem é a empresa, onde ela
   está e como entrar. Linhas de fornecimento, faixa de valor
   e municípios da região ficam para o perfil, depois do
   primeiro login: pedir tudo aqui transformaria a criação de
   conta num questionário, e questionário abandonado não vira
   usuário.

   O CNPJ é a única colisão que a tela informa: ele é público,
   e quem descobre que a empresa já tem conta precisa saber
   disso para pedir acesso em vez de criar uma segunda. Já o
   e-mail responde igual exista ou não — senão o cadastro
   viraria um verificador de quem tem conta.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { campo, seletor } from '../ui/primitives.js';
import { molduraAuth, campoSenha, ligarOlhoDeSenha, avisoAuth, senhaCurta, AJUDA_SENHA } from '../ui/autenticacao.js';
import { cadastrarConta } from '../lib/sessao.js';
import { UFS } from '../lib/tabelas.js';

const soDigitos = (texto) => texto.replace(/\D/g, '');

/** 32.874.100/0001-59 — máscara aplicada enquanto digita. */
function mascararCnpj(bruto) {
  const d = soDigitos(bruto).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default {
  titulo: 'Criar conta',
  shell: false,

  render() {
    return molduraAuth({
      titulo: 'Criar sua conta',
      subtitulo: 'Leva um minuto. O restante do perfil você ajusta depois, por dentro.',
      chamada: 'Comece a ver o que já está publicado para você.',

      corpo: html`
        <div id="aviso-cadastro"></div>

        <form class="pilha" style="margin-top: var(--e-6)" id="form-cadastro" novalidate>

          <div class="campo-grupo">
            ${raw(campo({
              rotulo: 'Seu nome', id: 'cad-nome',
              placeholder: 'Como devemos chamar você',
              atributos: 'autocomplete="name" required',
            }))}
            ${raw(campo({
              rotulo: 'E-mail', id: 'cad-email', tipo: 'email',
              placeholder: 'voce@suaempresa.com.br',
              atributos: 'autocomplete="email" required',
            }))}
          </div>

          ${raw(campoSenha({
            id: 'cad-senha', rotulo: 'Senha',
            placeholder: 'Uma frase que só você lembra',
            autocomplete: 'new-password',
            ajuda: AJUDA_SENHA,
          }))}

          <div class="divisor-texto">Dados da empresa</div>

          ${raw(campo({
            rotulo: 'Razão social', id: 'cad-razao',
            placeholder: 'Como consta no cartão CNPJ',
            atributos: 'autocomplete="organization" required',
          }))}

          ${raw(campo({
            rotulo: 'Nome fantasia', id: 'cad-fantasia',
            placeholder: 'Opcional',
            ajuda: 'É o nome que aparece dentro do sistema.',
          }))}

          <div class="campo-grupo">
            ${raw(campo({
              rotulo: 'CNPJ', id: 'cad-cnpj',
              placeholder: '00.000.000/0000-00',
              atributos: 'inputmode="numeric" required',
            }))}
            ${raw(seletor({
              rotulo: 'Estado', id: 'cad-uf',
              opcoes: UFS.map((uf) => ({ valor: uf, rotulo: uf })),
              valor: 'BA',
            }))}
          </div>

          ${raw(campo({
            rotulo: 'Cidade', id: 'cad-municipio',
            placeholder: 'Onde a empresa está sediada',
            atributos: 'required',
            ajuda: 'Usada para priorizar o que está perto de você.',
          }))}

          <label class="check" for="cad-aceite" style="margin-top: var(--e-2)">
            <input type="checkbox" id="cad-aceite" required>
            <span>
              Entendo que o LICITA+ encontra e analisa oportunidades, mas
              <b>não envia propostas</b> — o envio é feito por mim, na plataforma do
              órgão, com certificado digital.
            </span>
          </label>

          <button class="btn -gradiente -lg -cheio" type="submit" id="btn-cadastrar" style="margin-top: var(--e-2)">
            Criar conta
          </button>
        </form>`,

      rodape: `
        <p class="suave" style="text-align: center; margin-top: var(--e-6); font-size: var(--t-corpo-sm)">
          Já tem conta? <a href="#/entrar" style="font-weight: var(--p-semi)">Entrar</a>
        </p>`,
    });
  },

  ativar(raiz) {
    const form = $('#form-cadastro', raiz);
    const botao = $('#btn-cadastrar', raiz);
    const aviso = $('#aviso-cadastro', raiz);
    const campoCnpj = $('#cad-cnpj', raiz);

    ligarOlhoDeSenha(raiz, aoClicarEm);

    ao(campoCnpj, 'input', () => {
      const posicaoNoFim = campoCnpj.selectionStart === campoCnpj.value.length;
      campoCnpj.value = mascararCnpj(campoCnpj.value);
      if (posicaoNoFim) campoCnpj.setSelectionRange(campoCnpj.value.length, campoCnpj.value.length);
    });

    ao(form, 'submit', async (evento) => {
      evento.preventDefault();

      const dados = {
        nome: $('#cad-nome', raiz).value.trim(),
        email: $('#cad-email', raiz).value.trim(),
        senha: $('#cad-senha', raiz).value,
        razaoSocial: $('#cad-razao', raiz).value.trim(),
        nomeFantasia: $('#cad-fantasia', raiz).value.trim() || undefined,
        cnpj: soDigitos(campoCnpj.value),
        uf: $('#cad-uf', raiz).value,
        municipio: $('#cad-municipio', raiz).value.trim(),
      };

      const problema = validar(dados, $('#cad-aceite', raiz).checked);
      if (problema) {
        aviso.innerHTML = avisoAuth(problema);
        return;
      }

      aviso.innerHTML = '';
      botao.classList.add('-carregando');
      botao.disabled = true;

      try {
        const { mensagem } = await cadastrarConta(dados);

        // Sucesso troca o formulário pela instrução. Deixar os
        // campos em tela convidaria a reenviar, e o segundo envio
        // invalidaria o link do primeiro.
        form.innerHTML = '';
        aviso.innerHTML = avisoAuth(
          `${mensagem} <br><br>Não achou? Verifique a caixa de spam — e confira se o
           endereço digitado está certo.`,
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

function validar(dados, aceitou) {
  if (dados.nome.length < 3) return 'Informe seu nome completo.';
  if (!dados.email.includes('@')) return 'Informe um e-mail válido.';
  if (senhaCurta(dados.senha)) return AJUDA_SENHA;
  if (dados.razaoSocial.length < 3) return 'Informe a razão social da empresa.';
  if (dados.cnpj.length !== 14) return 'O CNPJ precisa ter 14 dígitos.';
  if (dados.municipio.length < 2) return 'Informe a cidade onde a empresa está sediada.';
  if (!aceitou) return 'É preciso confirmar que o envio da proposta continua sendo seu.';
  return null;
}
