import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Calendar,
  CheckSquare,
  Clock,
  GitBranch,
  Mail,
  Megaphone,
  MessageSquare,
  Play,
  Plus,
  ShieldCheck,
  Split,
  Timer,
  Zap,
} from 'lucide-react';
import type { Automation, AutomationNode } from '@veyra/core';
import { Abas, Botao, Cartao, CartaoCabecalho, CartaoCorpo, EstadoVazio, Progresso, Segmentado, Selo, useAvisos } from '../components';
import { GraficoBarras, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { AUTOMACOES, BLACKLIST, CAMPANHAS, TAREFAS, clientePorId, leadPorId, usuarioPorId } from '../data/base';

/* =========================================================
   Campanhas
   ========================================================= */

export function Campanhas() {
  const { pode } = useSessao();
  const [aba, setAba] = useState<'campanhas' | 'blacklist'>('campanhas');

  const totais = useMemo(() => {
    const m = CAMPANHAS.reduce(
      (acc, c) => ({
        enviadas: acc.enviadas + c.metricas.enviadas,
        leads: acc.leads + c.metricas.leadsGerados,
        receita: acc.receita + c.metricas.receita,
        investimento: acc.investimento + c.metricas.investimento,
      }),
      { enviadas: 0, leads: 0, receita: 0, investimento: 0 },
    );
    return { ...m, roi: m.investimento ? ((m.receita - m.investimento) / m.investimento) * 100 : 0 };
  }, []);

  return (
    <Pagina
      titulo="Campanhas"
      subtitulo="Segmentação, disparo e ROI. Nenhum envio sai para quem está na blacklist — a checagem é do motor, não do operador."
      acoes={
        <>
          <Abas
            opcoes={[
              { valor: 'campanhas' as const, rotulo: 'Campanhas' },
              { valor: 'blacklist' as const, rotulo: `Não contatar (${BLACKLIST.length})` },
            ]}
            valor={aba}
            aoMudar={setAba}
          />
          {pode('campanhas.criar') && (
            <Botao variante="primario" icone={Plus}>
              Nova campanha
            </Botao>
          )}
        </>
      }
    >
      {aba === 'campanhas' ? (
        <>
          <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
            <Indicador rotulo="Mensagens enviadas" valor={formatarNumero(totais.enviadas)} icone={MessageSquare} />
            <Indicador rotulo="Leads gerados" valor={formatarNumero(totais.leads)} delta={14.6} icone={Megaphone} />
            <Indicador rotulo="Receita atribuída" valor={formatarMoeda(totais.receita, true)} icone={ArrowRight} />
            <Indicador rotulo="ROI" valor={formatarPercentual(totais.roi, 0)} contexto={`sobre ${formatarMoeda(totais.investimento, true)}`} icone={Zap} />
          </div>

          <div className="vy-stack">
            {CAMPANHAS.map((campanha) => {
              const m = campanha.metricas;
              const entrega = m.enviadas ? (m.entregues / m.enviadas) * 100 : 0;
              const resposta = m.entregues ? (m.respondidas / m.entregues) * 100 : 0;
              const roi = m.investimento ? ((m.receita - m.investimento) / m.investimento) * 100 : 0;
              return (
                <Cartao key={campanha.id}>
                  <CartaoCabecalho
                    titulo={
                      <span className="vy-row vy-wrap" style={{ gap: 'var(--space-3)' }}>
                        {campanha.nome}
                        <Selo
                          tom={
                            campanha.status === 'concluida'
                              ? 'sucesso'
                              : campanha.status === 'enviando'
                                ? 'info'
                                : campanha.status === 'agendada'
                                  ? 'atencao'
                                  : 'neutro'
                          }
                          ponto={campanha.status === 'enviando'}
                        >
                          {campanha.status}
                        </Selo>
                        <Selo tom="neutro">
                          {campanha.canal === 'email' ? <Mail size={10} /> : <MessageSquare size={10} />} {campanha.canal}
                        </Selo>
                      </span>
                    }
                    descricao={
                      campanha.agendadaPara
                        ? `Agendada para ${formatarData(campanha.agendadaPara, true)} · público de ${formatarNumero(m.publico)}`
                        : `Público de ${formatarNumero(m.publico)} contatos`
                    }
                    acao={
                      campanha.status === 'rascunho' && pode('campanhas.aprovar') ? (
                        <Botao variante="secundario" tamanho="pequeno" icone={Play}>
                          Disparar
                        </Botao>
                      ) : undefined
                    }
                  />
                  {m.enviadas > 0 && (
                    <CartaoCorpo>
                      <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-4)' }}>
                        {(
                          [
                            ['Enviadas', formatarNumero(m.enviadas)],
                            ['Entrega', formatarPercentual(entrega, 0)],
                            ['Resposta', formatarPercentual(resposta, 0)],
                            ['Leads', formatarNumero(m.leadsGerados)],
                            ['Vendas', formatarNumero(m.vendas)],
                            ['Receita', formatarMoeda(m.receita, true)],
                            ['ROI', m.investimento ? formatarPercentual(roi, 0) : '—'],
                          ] as [string, string][]
                        ).map(([rotulo, valor]) => (
                          <div key={rotulo}>
                            <span className="vy-eyebrow" style={{ display: 'block' }}>
                              {rotulo}
                            </span>
                            <strong className="vy-numeric" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                              {valor}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 'var(--space-4)' }}>
                        <Progresso valor={entrega} cor="var(--chart-3)" />
                      </div>
                    </CartaoCorpo>
                  )}
                </Cartao>
              );
            })}
          </div>
        </>
      ) : (
        <PainelBlacklist />
      )}
    </Pagina>
  );
}

/**
 * Não contatar
 *
 * O registro guarda quem pediu, quando, por qual canal e por quê. Isso
 * não é burocracia: sem a evidência do pedido, a empresa não consegue
 * demonstrar que respeitou a manifestação do titular — e a reativação
 * depende de nova manifestação dele, nunca de decisão interna.
 */
function PainelBlacklist() {
  return (
    <>
      <Cartao preenchido style={{ marginBottom: 'var(--space-4)', borderColor: 'rgb(240 74 86 / 0.28)' }}>
        <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <ShieldCheck size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
            Contatos nesta lista são excluídos de <strong style={{ color: 'var(--text-strong)' }}>toda</strong> campanha,
            automação comercial e disparo — a verificação acontece no motor de envio, não na tela de quem monta o público. A
            reativação só ocorre mediante nova solicitação do próprio titular, registrada com data e canal.
          </p>
        </div>
      </Cartao>

      <Cartao>
        <div className="vy-tabela-wrap">
          <table className="vy-tabela">
            <thead>
              <tr>
                <th>Contato</th>
                <th>Nome</th>
                <th>Canal bloqueado</th>
                <th>Motivo</th>
                <th>Origem do pedido</th>
                <th>Registrado por</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {BLACKLIST.map((entrada) => (
                <tr key={entrada.id}>
                  <td className="vy-mono">{entrada.contato}</td>
                  <td style={{ color: 'var(--text-strong)' }}>{entrada.nome ?? '—'}</td>
                  <td>
                    <Selo tom="perigo">
                      <Ban size={10} /> {entrada.canal}
                    </Selo>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: 280 }}>{entrada.motivo}</td>
                  <td style={{ textTransform: 'capitalize' }}>{entrada.origem}</td>
                  <td>{entrada.registradoPor}</td>
                  <td>{formatarData(entrada.solicitadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}

/* =========================================================
   Automações
   ========================================================= */

const ICONE_NO: Record<AutomationNode['tipo'], typeof Zap> = {
  gatilho: Zap,
  condicao: Split,
  acao: Play,
  espera: Timer,
};

export function Automacoes() {
  const { pode } = useSessao();
  const { avisar } = useAvisos();
  const [selecionada, setSelecionada] = useState<Automation>(AUTOMACOES[0]);

  const execucoes = AUTOMACOES.reduce((s, a) => s + a.execucoes30d, 0);
  const sucesso = AUTOMACOES.reduce((s, a) => s + a.sucesso30d, 0);

  return (
    <Pagina
      titulo="Automações"
      subtitulo="Quando acontecer X, se Y, então Z. O construtor é visual porque quem escreve a regra é quem conhece a operação, não quem programa."
      acoes={
        pode('automacoes.criar') ? (
          <Botao variante="primario" icone={Plus}>
            Nova automação
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Automações ativas" valor={formatarNumero(AUTOMACOES.filter((a) => a.ativa).length)} icone={GitBranch} />
        <Indicador rotulo="Execuções em 30 dias" valor={formatarNumero(execucoes)} icone={Zap} />
        <Indicador rotulo="Taxa de sucesso" valor={formatarPercentual((sucesso / execucoes) * 100)} icone={CheckSquare} />
        <Indicador rotulo="Horas poupadas (estimativa)" valor="412 h" contexto="a 2 min por execução manual" icone={Clock} />
      </div>

      <div className="vy-grid" style={{ gridTemplateColumns: 'minmax(260px, 320px) 1fr', alignItems: 'start' }}>
        <div className="vy-stack" style={{ gap: 'var(--space-2)' }}>
          {AUTOMACOES.map((automacao) => (
            <Cartao
              key={automacao.id}
              preenchido
              interativo
              onClick={() => setSelecionada(automacao)}
              style={{
                borderColor: selecionada.id === automacao.id ? 'var(--vy-cyan)' : undefined,
              }}
            >
              <div className="vy-row-between" style={{ gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{automacao.nome}</strong>
                <Selo tom={automacao.ativa ? 'sucesso' : 'neutro'} ponto={automacao.ativa}>
                  {automacao.ativa ? 'ativa' : 'pausada'}
                </Selo>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                {formatarNumero(automacao.execucoes30d)} execuções · {automacao.nos.length} passos
              </div>
            </Cartao>
          ))}
        </div>

        <Cartao>
          <CartaoCabecalho
            titulo={selecionada.nome}
            descricao={`Gatilho: ${selecionada.gatilho.replace(/_/g, ' ')} · ${formatarNumero(selecionada.execucoes30d)} execuções nos últimos 30 dias`}
            acao={
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={() => avisar({ tom: 'info', titulo: selecionada.ativa ? 'Automação pausada' : 'Automação ativada' })}
              >
                {selecionada.ativa ? 'Pausar' : 'Ativar'}
              </Botao>
            }
          />
          <CartaoCorpo>
            <ol className="vy-stack" style={{ gap: 0 }}>
              {selecionada.nos.map((no, i) => {
                const Icone = ICONE_NO[no.tipo];
                const ultimo = i === selecionada.nos.length - 1;
                const cor =
                  no.tipo === 'gatilho'
                    ? 'var(--vy-cyan)'
                    : no.tipo === 'condicao'
                      ? 'var(--chart-4)'
                      : no.tipo === 'espera'
                        ? 'var(--text-subtle)'
                        : 'var(--vy-violet-400)';
                return (
                  <li key={no.id}>
                    <div
                      className="vy-row"
                      style={{
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <span
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: 30,
                          height: 30,
                          borderRadius: 'var(--radius-md)',
                          background: `color-mix(in srgb, ${cor} 14%, transparent)`,
                          color: cor,
                          flexShrink: 0,
                        }}
                      >
                        <Icone size={15} />
                      </span>
                      <span className="vy-grow" style={{ minWidth: 0 }}>
                        <span className="vy-eyebrow" style={{ display: 'block' }}>
                          {no.tipo}
                        </span>
                        <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{no.rotulo}</strong>
                        {no.detalhe && (
                          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{no.detalhe}</span>
                        )}
                      </span>
                    </div>
                    {!ultimo && (
                      <div style={{ display: 'grid', placeItems: 'center', height: 20 }}>
                        <span style={{ width: 1, height: '100%', background: 'var(--border-default)' }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </CartaoCorpo>
        </Cartao>
      </div>
    </Pagina>
  );
}

/* =========================================================
   Tarefas e agenda
   ========================================================= */

export function Tarefas() {
  const { versaoDados } = useSessao();
  const [filtro, setFiltro] = useState<'abertas' | 'atrasadas' | 'todas'>('abertas');
  const agora = new Date('2026-08-27T09:00:00-03:00');

  const filtradas = useMemo(
    () =>
      TAREFAS.filter((t) => {
        if (filtro === 'abertas') return !t.concluida;
        if (filtro === 'atrasadas') return !t.concluida && new Date(t.vence) < agora;
        return true;
      }).sort((a, b) => (a.vence < b.vence ? -1 : 1)),
    [filtro, versaoDados],
  );

  const atrasadas = TAREFAS.filter((t) => !t.concluida && new Date(t.vence) < agora).length;

  return (
    <Pagina
      titulo="Tarefas"
      subtitulo="O que não tem próxima ação com dono e prazo não acontece. Esta é a lista que impede o lead de morrer de esquecimento."
      acoes={
        <Segmentado
          opcoes={[
            { valor: 'abertas' as const, rotulo: 'Abertas' },
            { valor: 'atrasadas' as const, rotulo: `Atrasadas (${atrasadas})` },
            { valor: 'todas' as const, rotulo: 'Todas' },
          ]}
          valor={filtro}
          aoMudar={setFiltro}
        />
      }
    >
      {filtradas.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={CheckSquare} titulo="Nada pendente" texto="Nenhuma tarefa neste recorte. Vale conferir se as automações estão criando follow-up." />
        </Cartao>
      ) : (
        <Cartao>
          <ul>
            {filtradas.map((tarefa) => {
              const atrasada = !tarefa.concluida && new Date(tarefa.vence) < agora;
              const alvo = clientePorId(tarefa.clienteId)?.nome ?? leadPorId(tarefa.leadId)?.nome;
              return (
                <li
                  key={tarefa.id}
                  className="vy-row"
                  style={{
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    borderBottom: '1px solid var(--border-subtle)',
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    style={{
                      marginTop: 3,
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      flexShrink: 0,
                      border: '1.5px solid var(--border-strong)',
                      background: tarefa.concluida ? 'var(--success)' : 'transparent',
                    }}
                  />
                  <div className="vy-grow" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: tarefa.concluida ? 'var(--text-subtle)' : 'var(--text-default)',
                        textDecoration: tarefa.concluida ? 'line-through' : 'none',
                      }}
                    >
                      {tarefa.titulo}
                    </div>
                    <div className="vy-row vy-wrap" style={{ gap: 'var(--space-3)', marginTop: 4 }}>
                      <span style={{ fontSize: 'var(--text-2xs)', color: atrasada ? 'var(--danger)' : 'var(--text-subtle)' }}>
                        {atrasada ? 'Atrasada · ' : ''}
                        {tempoRelativo(tarefa.vence)}
                      </span>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                        {usuarioPorId(tarefa.responsavelId)?.nome}
                      </span>
                      {alvo && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{alvo}</span>}
                    </div>
                  </div>
                  <span className="vy-row" style={{ gap: 'var(--space-2)', flexShrink: 0 }}>
                    <Selo tom="neutro">{tarefa.tipo}</Selo>
                    {tarefa.prioridade === 'critica' && <Selo tom="perigo">crítica</Selo>}
                    {tarefa.prioridade === 'alta' && <Selo tom="atencao">alta</Selo>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </Pagina>
  );
}

export function Agenda() {
  const dias = ['Seg 24', 'Ter 25', 'Qua 26', 'Qui 27', 'Sex 28', 'Sáb 29', 'Dom 30'];
  const compromissos = TAREFAS.filter((t) => !t.concluida).slice(0, 7);

  return (
    <Pagina titulo="Agenda" subtitulo="Compromissos, follow-ups e lembretes da semana, ligados ao cliente que os originou.">
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Compromissos na semana" valor={formatarNumero(compromissos.length)} icone={Calendar} />
        <Indicador rotulo="Follow-ups automáticos" valor="42" contexto="criados por automação" icone={Zap} />
        <Indicador rotulo="Reuniões marcadas" valor="6" icone={Clock} />
        <Indicador rotulo="Taxa de comparecimento" valor={formatarPercentual(78, 0)} delta={4.2} icone={CheckSquare} />
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Semana de 24 a 30 de agosto" descricao="Distribuição de compromissos por dia." />
        <CartaoCorpo>
          <GraficoBarras
            dados={dias.map((dia, i) => ({ rotulo: dia, valor: [3, 5, 4, 7, 6, 1, 0][i] }))}
            formatar={(v) => `${v} compromissos`}
            altura={180}
          />
        </CartaoCorpo>
      </Cartao>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <Cartao>
          <CartaoCabecalho titulo="Hoje" descricao="27 de agosto de 2026" />
          <CartaoCorpo>
            <ol className="vy-timeline">
              {compromissos.map((c) => (
                <li key={c.id} className="vy-timeline__item">
                  <span className="vy-timeline__ponto" />
                  <div className="vy-row-between" style={{ gap: 'var(--space-3)' }}>
                    <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{c.titulo}</strong>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', flexShrink: 0 }}>{tempoRelativo(c.vence)}</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {usuarioPorId(c.responsavelId)?.nome} · {c.tipo}
                  </span>
                </li>
              ))}
            </ol>
          </CartaoCorpo>
        </Cartao>
      </div>
    </Pagina>
  );
}
