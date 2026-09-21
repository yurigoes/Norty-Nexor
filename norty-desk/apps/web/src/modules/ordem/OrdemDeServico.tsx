import { useCallback, useEffect, useState } from 'react';
import { ROTULO_ORDEM, ordemEditavel, type ServiceOrderView, type TicketDetail } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  abrirOrdem,
  cancelarOrdem,
  concluirOrdem,
  editarItemDaOrdem,
  incluirItemDaOrdem,
  listarOrdens,
  removerItemDaOrdem,
  urlDaOrdemEmPdf,
} from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';
import { Assinatura } from './Assinatura';

/**
 * A ordem de serviço do atendimento em campo.
 *
 * Um cartão na coluna do chamado, como tarefas e custos — não uma aba
 * com mecanismo próprio, que nesta tela não existe para mais nada.
 *
 * A regra que decide o desenho inteiro é a mesma da API: **ordem
 * assinada não muda**. Depois de assinada, a tela não mostra campo, não
 * mostra botão de apagar e não mostra caixa para marcar. Mostrar
 * controle que a API vai recusar é prometer o que não se cumpre.
 */
export function OrdensDoChamado({
  chamado,
  aoMudar,
}: {
  chamado: TicketDetail;
  aoMudar: () => void;
}) {
  const { can } = useAutenticacao();
  const [ordens, setOrdens] = useState<ServiceOrderView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  const recarregar = useCallback(async () => {
    setOrdens(await listarOrdens(chamado.id));
  }, [chamado.id]);

  useEffect(() => {
    if (!can('ordem:ler')) return;
    void recarregar().catch(() => setOrdens([]));
  }, [recarregar, can]);

  if (!ordens || !can('ordem:ler')) return null;

  const podeGerenciar = can('ordem:gerenciar') && chamado.status !== 'FECHADO';
  if (ordens.length === 0 && !podeGerenciar) return null;

  async function tentar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      await recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir a ação.');
    }
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">Ordem de serviço</h2>
          <p className="card-sub">O que foi feito em campo, com assinatura.</p>
        </div>

        {podeGerenciar ? (
          <button
            type="button"
            className="btn -secundario -sm"
            disabled={abrindo}
            onClick={() => {
              setAbrindo(true);
              void tentar(() => abrirOrdem(chamado.id)).finally(() => setAbrindo(false));
            }}
          >
            Abrir ordem
          </button>
        ) : null}
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro" role="status">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {ordens.length === 0 ? (
          <p className="campo-ajuda">Nenhuma ordem aberta neste chamado.</p>
        ) : (
          ordens.map((ordem) => (
            <Ordem
              key={ordem.id}
              ordem={ordem}
              podeGerenciar={podeGerenciar}
              aoAgir={tentar}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Ordem({
  ordem,
  podeGerenciar,
  aoAgir,
}: {
  ordem: ServiceOrderView;
  podeGerenciar: boolean;
  aoAgir: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  const editavel = podeGerenciar && ordemEditavel(ordem.status);
  const [novoItem, setNovoItem] = useState('');
  const [assinando, setAssinando] = useState(false);

  const feitos = ordem.items.filter((i) => i.done).length;

  return (
    <article className="ordem">
      <header className="linha-entre">
        <div>
          <strong>Ordem nº {ordem.number}</strong>
          <p className="campo-ajuda">
            {ordem.technician?.name ?? 'Sem técnico'} ·{' '}
            {feitos} de {ordem.items.length} {ordem.items.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
        <span className={`selo ${ordem.status === 'CONCLUIDA' ? '-sucesso' : '-neutro'}`}>
          {ROTULO_ORDEM[ordem.status]}
        </span>
      </header>

      <ul className="ordem-itens">
        {ordem.items.map((item) => (
          <li key={item.id} className="ordem-item">
            <label className="ordem-item-marca">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editavel}
                onChange={(e) =>
                  void aoAgir(() =>
                    editarItemDaOrdem(ordem.id, item.id, {
                      description: item.description,
                      notes: item.notes ?? undefined,
                      done: e.target.checked,
                    }),
                  )
                }
              />
              <span className={item.done ? '' : 'suave'}>{item.description}</span>
            </label>

            {item.notes ? <p className="campo-ajuda">{item.notes}</p> : null}

            {editavel ? (
              <button
                type="button"
                className="btn -fantasma -sm"
                aria-label={`Remover ${item.description}`}
                onClick={() => void aoAgir(() => removerItemDaOrdem(ordem.id, item.id))}
              >
                Remover
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {editavel ? (
        <form
          className="linha"
          style={{ gap: 'var(--e-2)' }}
          onSubmit={(e) => {
            e.preventDefault();
            const descricao = novoItem.trim();
            if (!descricao) return;
            setNovoItem('');
            void aoAgir(() => incluirItemDaOrdem(ordem.id, { description: descricao }));
          }}
        >
          <input
            className="input"
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            placeholder="O que há para fazer"
            maxLength={500}
          />
          <button type="submit" className="btn -secundario" disabled={!novoItem.trim()}>
            Incluir
          </button>
        </form>
      ) : null}

      {ordem.report ? <p className="ordem-relato">{ordem.report}</p> : null}

      {ordem.status === 'CONCLUIDA' ? (
        <p className="campo-ajuda">
          Assinada por <strong>{ordem.signedByName}</strong>
          {ordem.signedByRole ? ` · ${ordem.signedByRole}` : ''}
          {ordem.signedAt
            ? ` em ${new Date(ordem.signedAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}`
            : ''}
        </p>
      ) : null}

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        {ordem.status === 'CONCLUIDA' ? (
          <a
            className="btn -secundario -sm"
            href={urlDaOrdemEmPdf(ordem.id)}
            download={`ordem-${ordem.number}.pdf`}
          >
            Baixar PDF
          </a>
        ) : null}

        {editavel && ordem.items.length > 0 ? (
          <button
            type="button"
            className="btn -primario -sm"
            onClick={() => setAssinando((a) => !a)}
          >
            {assinando ? 'Cancelar assinatura' : 'Concluir e assinar'}
          </button>
        ) : null}

        {editavel ? (
          <button
            type="button"
            className="btn -fantasma -sm"
            onClick={() => void aoAgir(() => cancelarOrdem(ordem.id))}
          >
            Cancelar ordem
          </button>
        ) : null}
      </div>

      {assinando && editavel ? (
        <Concluir
          ordem={ordem}
          aoConcluir={(corpo) =>
            aoAgir(() => concluirOrdem(ordem.id, corpo)).then(() => setAssinando(false))
          }
        />
      ) : null}
    </article>
  );
}

/**
 * O passo de concluir.
 *
 * O aviso de irreversibilidade vem **antes** do botão, não depois: a
 * pessoa precisa saber que assinar fecha o documento enquanto ainda
 * está decidindo, e não ao ler a mensagem de erro que a API devolveria.
 */
function Concluir({
  ordem,
  aoConcluir,
}: {
  ordem: ServiceOrderView;
  aoConcluir: (corpo: {
    signature: string;
    signedByName: string;
    signedByRole?: string;
    report?: string;
  }) => Promise<void>;
}) {
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [nome, setNome] = useState(ordem.technician?.name ?? '');
  const [papel, setPapel] = useState('');
  const [relato, setRelato] = useState(ordem.report ?? '');
  const [enviando, setEnviando] = useState(false);

  const podeAssinar = Boolean(assinatura) && nome.trim().length >= 2 && !enviando;

  return (
    <form
      className="pilha-sm ordem-assinar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!assinatura || !podeAssinar) return;
        setEnviando(true);
        void aoConcluir({
          signature: assinatura,
          signedByName: nome.trim(),
          signedByRole: papel.trim() || undefined,
          report: relato.trim() || undefined,
        }).finally(() => setEnviando(false));
      }}
    >
      <div className="alerta-bloco -aviso">
        <span aria-hidden="true">!</span>
        <span>
          Depois de assinada, a ordem não muda mais — a assinatura vale para os itens como
          estão agora.
        </span>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={`relato-${ordem.id}`}>
          Relato do atendimento
        </label>
        <textarea
          id={`relato-${ordem.id}`}
          className="textarea"
          rows={3}
          maxLength={5000}
          value={relato}
          onChange={(e) => setRelato(e.target.value)}
        />
      </div>

      <div className="campo-grupo">
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`nome-${ordem.id}`}>
            Quem assina
          </label>
          <input
            id={`nome-${ordem.id}`}
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor={`papel-${ordem.id}`}>
            Função (opcional)
          </label>
          <input
            id={`papel-${ordem.id}`}
            className="input"
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            placeholder="Técnico de campo"
            maxLength={120}
          />
        </div>
      </div>

      <Assinatura aoMudar={setAssinatura} />

      <button type="submit" className="btn -primario" disabled={!podeAssinar}>
        {enviando ? 'Concluindo…' : 'Concluir e assinar'}
      </button>
    </form>
  );
}
