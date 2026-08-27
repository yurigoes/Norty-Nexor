/* =========================================================
   LICITA+ — Entrar
   ---------------------------------------------------------
   Duas colunas: a esquerda carrega a marca e a promessa, a
   direita o formulário. Em tela estreita a arte sai inteira —
   num celular, o que importa é o campo de e-mail acima da
   dobra, não a composição geométrica.
   ========================================================= */

import { html, raw, $, ao, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { marcaHorizontal, textoMarca, simbolo } from '../ui/brand.js';
import { campo, toast } from '../ui/primitives.js';
import { comCarregamento } from '../ui/carregando.js';
import { irPara } from '../lib/router.js';
import { empresa } from '../data/mock.js';

const VANTAGENS = [
  'Oportunidades analisadas contra o perfil da sua empresa',
  'Compatibilidade com a conta aberta, critério por critério',
  'Alerta de prazo antes de a oportunidade fechar',
  'Histórico que ensina a calibrar o próximo preço',
];

export default {
  titulo: 'Entrar',
  shell: false,

  render() {
    return html`
<div class="login">

  <!-- Lado da marca -->
  <aside class="login-arte">
    <span class="login-geo-1" aria-hidden="true"></span>
    <span class="login-geo-2" aria-hidden="true"></span>
    <span class="login-geo-3" aria-hidden="true"></span>

    <a href="#/" style="position: relative; z-index: 1; display: inline-flex; align-items: center; gap: var(--e-3)">
      ${raw(simbolo({ tamanho: 38, comPontos: false }))}
      ${raw(textoMarca({ classe: '-inversa' }))}
    </a>

    <div style="position: relative; z-index: 1">
      <h2>Inteligência para encontrar oportunidades.</h2>
      <p>
        O LICITA+ analisa o que é publicado nos portais públicos e mostra o que
        realmente faz sentido para o seu negócio.
      </p>

      <div class="login-lista" style="margin-top: var(--e-8)">
        ${raw(VANTAGENS.map((v) => `
          <div class="login-lista-item">${icone('check_circulo')}<span>${v}</span></div>`).join(''))}
      </div>
    </div>

    <p style="position: relative; z-index: 1; font-size: var(--t-micro); color: rgba(255,255,255,.42)">
      Plataforma privada e independente, sem vínculo com órgãos públicos.
    </p>
  </aside>

  <!-- Formulário -->
  <main class="login-form">
    <div class="login-caixa">
      <div style="display: none" class="login-marca-mobile">${raw(marcaHorizontal({ tamanho: 34 }))}</div>

      <h1 style="font-size: var(--t-h2)">Bem-vindo de volta</h1>
      <p class="suave" style="margin-top: 6px; font-size: var(--t-corpo-sm)">
        Entre para continuar acompanhando suas oportunidades.
      </p>

      <form class="pilha" style="margin-top: var(--e-8)" id="form-login" novalidate>
        ${raw(campo({
          rotulo: 'E-mail', id: 'login-email', tipo: 'email',
          valor: empresa.usuario.email,
          placeholder: 'voce@suaempresa.com.br',
          atributos: 'autocomplete="email" required',
        }))}

        <div class="campo">
          <div class="linha-entre">
            <label class="campo-rotulo" for="login-senha">Senha</label>
            <a href="#/entrar" style="font-size: var(--t-micro); font-weight: var(--p-semi)"
              data-acao="esqueci">Esqueci minha senha</a>
          </div>
          <div style="position: relative">
            <input class="input" id="login-senha" type="password" value="demonstracao"
              placeholder="Sua senha" autocomplete="current-password" required
              style="padding-right: 44px">
            <button type="button" class="btn-icone" data-acao="ver-senha"
              aria-label="Mostrar senha" aria-pressed="false"
              style="position: absolute; right: 2px; top: 1px">${raw(icone('olho'))}</button>
          </div>
        </div>

        <label class="check" for="login-lembrar" style="margin-top: 2px">
          <input type="checkbox" id="login-lembrar" checked>
          <span>Manter conectado neste dispositivo</span>
        </label>

        <button class="btn -gradiente -lg -cheio" type="submit" id="btn-entrar" style="margin-top: var(--e-2)">
          Entrar
        </button>
      </form>

      <div class="divisor-ou">ou</div>

      <button class="btn -secundario -cheio" data-acao="gov">
        ${raw(icone('escudo'))} Entrar com gov.br
      </button>

      <p class="suave" style="text-align: center; margin-top: var(--e-8); font-size: var(--t-corpo-sm)">
        Não possui uma conta?
        <a href="#/onboarding" style="font-weight: var(--p-semi)">Criar conta</a>
      </p>
    </div>
  </main>
</div>`;
  },

  ativar(raiz) {
    const form = $('#form-login', raiz);
    const botao = $('#btn-entrar', raiz);

    ao(form, 'submit', (evento) => {
      evento.preventDefault();
      const email = $('#login-email', raiz).value.trim();

      if (!email.includes('@')) {
        toast('Informe um e-mail válido', { variante: 'erro', sub: 'O endereço precisa conter @.' });
        return;
      }

      // A marca se monta enquanto o texto diz o que está
      // acontecendo. As etapas são as reais do produto — entrar,
      // carregar o perfil, varrer, triar — para a espera informar
      // em vez de só ocupar tempo.
      botao.classList.add('-carregando');

      comCarregamento(
        {
          texto: 'Autenticando…',
          etapas: [
            'Carregando o perfil da empresa',
            'Varrendo os portais públicos',
            'Analisando compatibilidade',
          ],
          duracao: 2600,
        },
        () => {
          botao.classList.remove('-carregando');
          irPara('/painel');
          toast(`Bem-vindo de volta, ${empresa.usuario.nome.split(' ')[0]}`, {
            variante: 'sucesso',
            sub: '23 novas oportunidades desde a sua última visita.',
          });
        },
      );
    });

    aoClicarEm(raiz, '[data-acao="ver-senha"]', (_evento, alvo) => {
      const senha = $('#login-senha', raiz);
      const visivel = senha.type === 'text';
      senha.type = visivel ? 'password' : 'text';
      alvo.setAttribute('aria-pressed', String(!visivel));
      alvo.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    });

    aoClicarEm(raiz, '[data-acao="esqueci"]', (evento) => {
      evento.preventDefault();
      toast('Enviaríamos um link de redefinição', { variante: 'info', sub: 'Indisponível na demonstração.' });
    });

    aoClicarEm(raiz, '[data-acao="gov"]', () => {
      toast('Login gov.br', { variante: 'info', sub: 'Integração indisponível na demonstração.' });
    });
  },
};
