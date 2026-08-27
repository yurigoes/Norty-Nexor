/* =========================================================
   LICITA+ — Configurações
   ---------------------------------------------------------
   Só aparece aqui o que de fato funciona.

   A versão anterior desta tela tinha cinco interruptores de
   alerta, uma frequência de resumo e um cartão de plano
   "Profissional · Ativo". Nenhum deles fazia nada. Um painel
   de configurações em que mexer não muda o comportamento é
   pior que não ter painel: ele ensina o usuário a desconfiar
   de todos os outros controles do produto.

   O que sobrou: tema (real, resolvido nos tokens), o alerta
   por e-mail que vive em cada monitoramento (real, e por isso
   apontado para lá), troca de senha pelo fluxo de e-mail
   (real) e encerramento de todas as sessões (real).
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cabecalhoPagina } from '../ui/domain.js';
import {
  campo, switchCampo, toast, alerta, abrirModal, fecharModal, skeletonCartao,
} from '../ui/primitives.js';
import { obter, alternarTema } from '../lib/store.js';
import { usuarioLogado, pedirRedefinicao, sairDaConta } from '../lib/sessao.js';
import { emDemonstracao } from '../lib/config.js';
import { pedir } from '../lib/http.js';
import { irPara } from '../lib/router.js';
import { listarMonitoramentos } from '../dados/index.js';

function bloco(titulo, descricao, conteudo) {
  return `<section class="card">
    <div class="card-topo">
      <div>
        <div class="card-titulo">${titulo}</div>
        <div class="card-sub">${descricao}</div>
      </div>
    </div>
    <div class="card-corpo">${conteudo}</div>
  </section>`;
}

export default {
  titulo: 'Configurações',
  trilha: ['Início', 'Configurações'],
  nav: 'configuracoes',

  esqueleto: () => skeletonCartao(3),

  async render() {
    const escuro = obter().tema === 'escuro';
    const usuario = usuarioLogado() ?? {};
    const monitores = await listarMonitoramentos().catch(() => []);
    const comAlerta = monitores.filter((m) => m.alertaEmail && m.ativo).length;

    return html`
<div class="pilha-lg" style="max-width: 860px">
  ${raw(cabecalhoPagina({
    titulo: 'Configurações',
    subtitulo: 'Conta, alertas e aparência da plataforma.',
  }))}

  ${raw(bloco('Conta', 'Quem está usando esta conta.', `
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${campo({ rotulo: 'Nome', id: 'c-nome', valor: usuario.nome ?? '', atributos: 'readonly' })}
      ${campo({ rotulo: 'E-mail', id: 'c-email', tipo: 'email', valor: usuario.email ?? '', atributos: 'readonly' })}
      ${campo({ rotulo: 'Empresa', id: 'c-empresa', valor: usuario.empresa?.razaoSocial ?? '', atributos: 'readonly' })}
      ${campo({ rotulo: 'Papel', id: 'c-papel', valor: usuario.papel === 'dono' ? 'Dono da conta' : 'Operador', atributos: 'readonly' })}
    </div>
    <p class="suave" style="font-size: var(--t-micro); line-height: 1.55; margin-top: var(--e-4)">
      Os dados da empresa são editados em
      <a href="#/empresa" style="font-weight: var(--p-semi)">Minha empresa</a>.
      O e-mail identifica a conta e trocá-lo exigiria confirmar o novo endereço —
      por isso ele não é editável aqui.
    </p>`))}

  ${raw(bloco('Segurança', 'Senha e sessões abertas.', `
    <div class="pilha">
      <div class="linha-entre" style="gap: var(--e-4); flex-wrap: wrap">
        <div style="min-width: 240px; flex: 1">
          <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm)">
            Trocar a senha
          </div>
          <p class="suave" style="font-size: var(--t-micro); line-height: 1.55; margin-top: 2px">
            Enviamos um link para o seu e-mail. Trocar a senha encerra todas as sessões abertas.
          </p>
        </div>
        <button class="btn -secundario" data-acao="trocar-senha">${icone('escudo')} Enviar link</button>
      </div>

      <div class="linha-entre" style="gap: var(--e-4); flex-wrap: wrap;
        border-top: 1px solid var(--borda-suave); padding-top: var(--e-4)">
        <div style="min-width: 240px; flex: 1">
          <div style="font-weight: var(--p-semi); color: var(--texto-forte); font-size: var(--t-corpo-sm)">
            Encerrar todas as sessões
          </div>
          <p class="suave" style="font-size: var(--t-micro); line-height: 1.55; margin-top: 2px">
            Desconecta este e todos os outros aparelhos. É o que fazer quando um celular
            com a conta aberta ficou para trás.
          </p>
        </div>
        <button class="btn -secundario" data-acao="sair-de-tudo">${icone('sair')} Encerrar tudo</button>
      </div>
    </div>`))}

  ${raw(bloco('Alertas', 'Quando o LICITA+ avisa você.', `
    <div class="pilha">
      <p style="line-height: 1.7; margin: 0">
        O aviso por e-mail é configurado <b>em cada monitoramento</b>, não num interruptor
        geral — porque interessa ser avisado de "notebooks em Salvador" e não de
        "qualquer coisa nova". Você tem
        <b>${comAlerta} monitoramento${comAlerta === 1 ? '' : 's'} ativo${comAlerta === 1 ? '' : 's'}
        com alerta ligado</b>.
      </p>
      <a class="btn -secundario" href="#/monitoramentos" style="align-self: flex-start">
        ${icone('sino_ativo')} Gerenciar monitoramentos
      </a>
      <p class="tenue" style="font-size: var(--t-micro); line-height: 1.55; margin: 0">
        A varredura dos portais roda uma vez por dia, de madrugada. Alerta de prazo de
        favorito aparece no sino do topo sempre que a oportunidade entra nos três dias
        finais.
      </p>
    </div>`))}

  ${raw(bloco('Aparência', 'Como a plataforma se apresenta.', `
    <div class="pilha">
      ${switchCampo({ id: 'tema-escuro', rotulo: 'Modo escuro', ligado: escuro, acao: 'alternar-tema' })}
      <p class="suave" style="font-size: var(--t-micro); line-height: 1.55; max-width: 62ch">
        O Design System define as duas paletas em tokens, então o modo escuro troca
        as cores sem mudar contraste de texto nem cor de gráfico — cada tema tem os
        seus próprios passos, escolhidos, não invertidos.
      </p>
    </div>`))}

  ${raw(alerta({
    variante: 'info', nomeIcone: 'escudo',
    texto: `O LICITA+ é uma plataforma privada e independente. Não somos vinculados a
      nenhum órgão público, e o envio de propostas continua sendo feito por você,
      na plataforma oficial do certame.`,
  }))}
</div>`;
  },

  ativar(raiz) {
    aoClicarEm(raiz, '[data-acao="alternar-tema"]', () => {
      const novo = alternarTema();
      toast(novo === 'escuro' ? 'Modo escuro ativado' : 'Modo claro ativado', { variante: 'info' });
    });

    aoClicarEm(raiz, '[data-acao="trocar-senha"]', async (_evento, alvo) => {
      const email = usuarioLogado()?.email;
      if (!email) return;

      alvo.disabled = true;
      try {
        const { mensagem } = await pedirRedefinicao(email);
        toast('Link enviado', { variante: 'sucesso', sub: mensagem });
      } catch (erro) {
        toast('Não foi possível enviar', { variante: 'erro', sub: erro.message });
      } finally {
        alvo.disabled = false;
      }
    });

    aoClicarEm(raiz, '[data-acao="sair-de-tudo"]', () => {
      abrirModal({
        titulo: 'Encerrar todas as sessões',
        subtitulo: 'Inclusive esta.',
        corpo: `<p style="line-height: 1.7">
          Todos os aparelhos com a conta aberta serão desconectados, e você precisará
          entrar de novo aqui mesmo. Sua senha não muda.
        </p>`,
        rodape: `<button class="btn -secundario" data-acao="fechar-modal">Cancelar</button>
                 <button class="btn -perigo" data-acao="confirmar-sair-tudo">Encerrar tudo</button>`,
      });
    });

    const desligar = [
      aoClicarEm(document.body, '[data-acao="confirmar-sair-tudo"]', async (_evento, alvo) => {
        alvo.disabled = true;

        if (emDemonstracao()) {
          fecharModal();
          await sairDaConta();
          irPara('/');
          toast('Sessão encerrada', { variante: 'info' });
          return;
        }

        try {
          const { encerradas } = await pedir('/auth/sair-de-tudo', { metodo: 'POST' });
          fecharModal();
          await sairDaConta();
          irPara('/entrar');
          toast(`${encerradas} sessão${encerradas === 1 ? '' : 'ões'} encerrada${encerradas === 1 ? '' : 's'}`, {
            variante: 'sucesso',
            sub: 'Entre novamente para continuar.',
          });
        } catch (erro) {
          alvo.disabled = false;
          toast('Não foi possível encerrar', { variante: 'erro', sub: erro.message });
        }
      }),
    ];

    return () => desligar.forEach((cancelar) => cancelar?.());
  },
};
