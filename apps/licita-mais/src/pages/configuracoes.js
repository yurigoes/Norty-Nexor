/* =========================================================
   LICITA+ — Configurações
   ---------------------------------------------------------
   Preferências de conta, alertas e aparência. O interruptor
   de tema é real: o Design System já resolve o modo escuro no
   nível dos tokens, então ligar aqui não exige tocar em
   nenhum componente.
   ========================================================= */

import { html, raw, aoClicarEm } from '../lib/dom.js';
import { icone } from '../lib/icons.js';
import { cabecalhoPagina } from '../ui/domain.js';
import { campo, seletor, switchCampo, toast, alerta, abas, ativarAbas } from '../ui/primitives.js';
import { empresa } from '../data/mock.js';
import { obter, alternarTema } from '../lib/store.js';

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

  render() {
    const escuro = obter().tema === 'escuro';

    return html`
<div class="pilha-lg" style="max-width: 860px">
  ${raw(cabecalhoPagina({
    titulo: 'Configurações',
    subtitulo: 'Conta, alertas e aparência da plataforma.',
  }))}

  ${raw(bloco('Conta', 'Seus dados de acesso.', `
    <div class="grade grade-2" style="gap: var(--e-4)">
      ${campo({ rotulo: 'Nome', id: 'c-nome', valor: empresa.usuario.nome })}
      ${campo({ rotulo: 'Cargo', id: 'c-cargo', valor: empresa.usuario.cargo })}
      ${campo({ rotulo: 'E-mail', id: 'c-email', tipo: 'email', valor: empresa.usuario.email })}
      ${campo({ rotulo: 'Telefone', id: 'c-tel', valor: '(71) 99999-0000' })}
    </div>`))}

  ${raw(bloco('Alertas', 'Quando e como o LICITA+ avisa você.', `
    <div class="pilha">
      ${switchCampo({ id: 'a-nova', rotulo: 'Nova oportunidade com alta compatibilidade', ligado: true })}
      ${switchCampo({ id: 'a-prazo', rotulo: 'Prazo de favorito se aproximando', ligado: true })}
      ${switchCampo({ id: 'a-monitor', rotulo: 'Resultados novos nos meus monitoramentos', ligado: true })}
      ${switchCampo({ id: 'a-retifica', rotulo: 'Retificação de edital que eu acompanho', ligado: true })}
      ${switchCampo({ id: 'a-resumo', rotulo: 'Resumo semanal por e-mail', ligado: false })}

      <div style="max-width: 300px; margin-top: var(--e-3)">
        ${seletor({
          rotulo: 'Frequência dos alertas', id: 'a-freq', valor: 'diario',
          opcoes: [
            { valor: 'imediato', rotulo: 'Imediato' },
            { valor: 'diario', rotulo: 'Resumo diário — 7h' },
            { valor: 'semanal', rotulo: 'Resumo semanal — segunda' },
          ],
        })}
      </div>
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

  ${raw(bloco('Plano', 'Sua assinatura atual.', `
    <div class="linha-entre">
      <div>
        <div class="linha" style="gap: var(--e-2)">
          <span style="font-size: var(--t-h4); font-weight: var(--p-bold)">Profissional</span>
          <span class="selo -sucesso">Ativo</span>
        </div>
        <p class="suave" style="font-size: var(--t-corpo-sm); margin-top: 4px">
          Monitoramentos ilimitados · 3 usuários · relatórios completos
        </p>
      </div>
      <button class="btn -secundario">Gerenciar plano</button>
    </div>`))}

  ${raw(alerta({
    variante: 'info', nomeIcone: 'escudo',
    texto: `O LICITA+ é uma plataforma privada e independente. Não somos vinculados a
      nenhum órgão público, e o envio de propostas continua sendo feito por você,
      na plataforma oficial do certame.`,
  }))}

  <div class="linha" style="gap: var(--e-2)">
    <button class="btn -primario" data-acao="salvar-config">Salvar configurações</button>
    <button class="btn -fantasma">Cancelar</button>
  </div>
</div>`;
  },

  ativar(raiz) {
    aoClicarEm(raiz, '[data-acao="alternar-tema"]', () => {
      const novo = alternarTema();
      toast(novo === 'escuro' ? 'Modo escuro ativado' : 'Modo claro ativado', { variante: 'info' });
    });

    aoClicarEm(raiz, '[data-acao="salvar-config"]', () => {
      toast('Configurações salvas', { variante: 'sucesso' });
    });
  },
};
