import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Flame,
  Percent,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { Cartao, CartaoCabecalho, CartaoCorpo, Selo, Botao, Avatar, Progresso } from '../components';
import {
  GraficoArea,
  GraficoRosca,
  Indicador,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
} from '../components/Charts';
import { Pagina, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import {
  CHAMADOS,
  CSAT,
  COMISSOES,
  DESEMPENHO_EQUIPE,
  FATURAS,
  HORA_DEMO,
  INSIGHTS,
  LEADS,
  ORIGEM_LEADS,
  SERIE_CONVERSAO,
  SERIE_LEADS,
  SERIE_MESES,
  SERIE_RECEITA,
  SERIE_VENDAS,
  TAREFAS,
  usuarioPorId,
} from '../data/base';

/**
 * Home executiva
 *
 * A pergunta que esta tela responde é "o que exige a minha atenção
 * agora?" — não "quantos registros existem". Por isso o número vem
 * sempre com o que fazer a respeito: leads quentes trazem o link para a
 * fila, contas vencidas trazem o valor, SLA violado traz o protocolo.
 */
export function Dashboard() {
  const { usuario, versaoDados } = useSessao();

  /* Os agregados do mês vêm das séries — as mesmas que alimentam os
     relatórios, a apresentação e o consumo no VEYRA Admin. A lista de
     leads carregada na tela é uma amostra da fila de trabalho, não o
     universo do mês: usá-la como denominador faria a conversão do
     dashboard divergir da do relatório, e número que diverge deixa de
     ser usado para decidir. */
  const metricas = useMemo(() => {
    const leadsMes = SERIE_LEADS.at(-1)!;
    const vendasMes = SERIE_VENDAS.at(-1)!;
    const receitaMes = SERIE_RECEITA.at(-1)!;

    const hoje = LEADS.filter((l) => l.createdAt.startsWith('2026-08-27'));
    const quentes = LEADS.filter((l) => l.temperatura === 'fervendo' || l.temperatura === 'quente');
    const emAtendimento = LEADS.filter((l) => ['em_qualificacao', 'qualificado', 'em_negociacao'].includes(l.status));
    const aReceber = FATURAS.filter((f) => f.status === 'pendente').reduce((s, f) => s + f.valor, 0);
    const vencidas = FATURAS.filter((f) => f.status === 'vencido');
    const comissaoAberta = COMISSOES.filter((c) => c.status !== 'paga' && c.status !== 'estornada').reduce((s, c) => s + c.valor, 0);
    const csatMedio = CSAT.reduce((s, c) => s + c.nota, 0) / CSAT.length;
    const slaViolado = CHAMADOS.filter((t) => t.slaViolado && !['resolvido', 'encerrado'].includes(t.status));

    return {
      leadsHoje: hoje.length,
      leadsMes,
      quentes: quentes.length,
      emAtendimento: emAtendimento.length,
      vendas: vendasMes,
      conversao: SERIE_CONVERSAO.at(-1)!,
      ticket: receitaMes / vendasMes,
      receitaMes,
      aReceber,
      vencidas,
      comissaoAberta,
      csatMedio,
      slaViolado,
    };
  }, [versaoDados]);

  const minhasTarefas = useMemo(
    () => TAREFAS.filter((t) => !t.concluida).slice(0, 5),
    [versaoDados],
  );

  /* A saudação segue a hora da demonstração, não a do servidor: em UTC
     a tela abriria "boa noite" para quem está apresentando às nove da
     manhã. */
  const saudacao = HORA_DEMO < 12 ? 'Bom dia' : HORA_DEMO < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <Pagina
      titulo={`${saudacao}, ${usuario.nome.split(' ')[0]}.`}
      subtitulo="Aqui está o que está acontecendo na sua operação — e o que ainda não foi resolvido."
      acoes={
        <>
          <Botao variante="secundario" icone={TrendingUp}>
            Relatório do mês
          </Botao>
          <Link to="/app/intelligence">
            <Botao variante="primario" icone={Sparkles}>
              Abrir Intelligence
            </Botao>
          </Link>
        </>
      }
    >
      {/* ---------- Indicadores ---------- */}
      <div className="vy-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Indicador
          rotulo="Receita reconhecida no mês"
          valor={formatarMoeda(metricas.receitaMes, true)}
          delta={8.6}
          contexto="vs. julho"
          icone={Wallet}
          serie={SERIE_RECEITA.slice(-8)}
          corSerie="var(--chart-1)"
        />
        <Indicador
          rotulo="Leads no mês"
          valor={formatarNumero(metricas.leadsMes)}
          delta={9.1}
          contexto={`${metricas.leadsHoje} entraram hoje`}
          icone={Users}
          serie={SERIE_VENDAS.slice(-8)}
          corSerie="var(--chart-5)"
        />
        <Indicador
          rotulo="Conversão lead → venda"
          valor={formatarPercentual(metricas.conversao)}
          delta={3.4}
          contexto="média do setor: 3,1%"
          icone={Target}
        />
        <Indicador
          rotulo="Ticket médio"
          valor={formatarMoeda(metricas.ticket, true)}
          delta={-2.1}
          contexto="puxado por seguro auto"
          icone={Percent}
        />
      </div>

      {/* ---------- O que trava agora ----------
          Três cartões de exceção. Se todos estiverem zerados, a operação
          está em dia — e a ausência de vermelho é a própria informação. */}
      <div className="vy-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <CartaoExcecao
          icone={Flame}
          tom="atencao"
          titulo={`${metricas.quentes} leads quentes`}
          detalhe="Score acima de 65 aguardando próximo contato."
          rota="/app/leads"
        />
        <CartaoExcecao
          icone={TriangleAlert}
          tom="perigo"
          titulo={formatarMoeda(metricas.vencidas.reduce((s, f) => s + f.valor, 0))}
          detalhe={`${metricas.vencidas.length} faturas vencidas na régua de cobrança.`}
          rota="/app/financeiro"
        />
        <CartaoExcecao
          icone={Clock}
          tom={metricas.slaViolado.length ? 'perigo' : 'sucesso'}
          titulo={`${metricas.slaViolado.length} SLA violados`}
          detalhe={metricas.slaViolado[0]?.protocolo ?? 'Nenhum chamado fora do prazo.'}
          rota="/app/suporte"
        />
      </div>

      {/* ---------- VEYRA Intelligence ---------- */}
      <Cartao destaque className="vy-enter" style={{ marginBottom: 'var(--space-6)' }}>
        <CartaoCabecalho
          titulo={
            <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
              <Sparkles size={16} color="var(--vy-violet-400)" />
              VEYRA Intelligence
              <Selo tom="marca" ponto>
                ao vivo
              </Selo>
            </span>
          }
          descricao="Gerado a partir do histórico da sua operação — não de médias de mercado."
          acao={
            <Link to="/app/intelligence">
              <Botao variante="fantasma" tamanho="pequeno">
                Ver tudo <ArrowRight size={14} />
              </Botao>
            </Link>
          }
        />
        <CartaoCorpo>
          <ul className="vy-stack" style={{ gap: 'var(--space-3)' }}>
            {INSIGHTS.slice(0, 4).map((insight) => (
              <li key={insight.id} className="vy-row" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span
                  style={{
                    marginTop: 5,
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: corDaSeveridade(insight.severidade),
                  }}
                />
                <div className="vy-grow">
                  <div className="vy-row-between" style={{ gap: 'var(--space-3)' }}>
                    <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{insight.titulo}</strong>
                    {insight.metrica && <span className="vy-mono vy-muted">{insight.metrica}</span>}
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{insight.detalhe}</p>
                </div>
                {insight.acao && (
                  <Link to={insight.acao.rota}>
                    <Botao variante="fantasma" tamanho="pequeno">
                      {insight.acao.rotulo}
                    </Botao>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CartaoCorpo>
      </Cartao>

      {/* ---------- Gráficos ---------- */}
      <div className="vy-grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        <Cartao>
          <CartaoCabecalho titulo="Receita e vendas nos últimos 12 meses" descricao="Receita reconhecida por competência." />
          <CartaoCorpo>
            <GraficoArea
              rotulos={SERIE_MESES}
              series={[{ nome: 'Receita (R$)', valores: SERIE_RECEITA }]}
              formatar={(v) => formatarMoeda(v, true)}
              altura={220}
            />
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="De onde vieram os leads" descricao="Mês corrente, por origem de captura." />
          <CartaoCorpo>
            <GraficoRosca
              dados={ORIGEM_LEADS}
              centroValor={formatarNumero(ORIGEM_LEADS.reduce((s, o) => s + o.valor, 0))}
              centroRotulo="leads"
            />
          </CartaoCorpo>
        </Cartao>
      </div>

      {/* ---------- Equipe e tarefas ---------- */}
      <div className="vy-grid-2">
        <Cartao>
          <CartaoCabecalho titulo="Desempenho da equipe" descricao="Mês corrente, por vendedor." />
          <div className="vy-tabela-wrap">
            <table className="vy-tabela">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="vy-tabela__numero">Leads</th>
                  <th className="vy-tabela__numero">Vendas</th>
                  <th className="vy-tabela__numero">Conversão</th>
                  <th className="vy-tabela__numero">Receita</th>
                </tr>
              </thead>
              <tbody>
                {DESEMPENHO_EQUIPE.map((pessoa) => (
                  <tr key={pessoa.nome}>
                    <td>
                      <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                        <Avatar nome={pessoa.nome} tamanho={26} />
                        <span>
                          <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)' }}>{pessoa.nome}</span>
                          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                            resposta em {pessoa.tempoResposta}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="vy-tabela__numero vy-numeric">{formatarNumero(pessoa.leads)}</td>
                    <td className="vy-tabela__numero vy-numeric">{pessoa.vendas}</td>
                    <td className="vy-tabela__numero">
                      <span style={{ display: 'inline-block', width: 64 }}>
                        <Progresso valor={pessoa.conversao * 10} />
                      </span>{' '}
                      <span className="vy-numeric">{formatarPercentual(pessoa.conversao)}</span>
                    </td>
                    <td className="vy-tabela__numero vy-numeric">{formatarMoeda(pessoa.receita, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="Suas próximas ações"
            descricao={`${minhasTarefas.length} tarefas abertas`}
            acao={
              <Link to="/app/tarefas">
                <Botao variante="fantasma" tamanho="pequeno">
                  Ver todas
                </Botao>
              </Link>
            }
          />
          <CartaoCorpo>
            <ul className="vy-stack" style={{ gap: 'var(--space-3)' }}>
              {minhasTarefas.map((tarefa) => {
                const atrasada = new Date(tarefa.vence) < new Date('2026-08-27T09:00:00-03:00');
                return (
                  <li key={tarefa.id} className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        marginTop: 4,
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: '1.5px solid var(--border-strong)',
                        flexShrink: 0,
                      }}
                    />
                    <div className="vy-grow">
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)' }}>{tarefa.titulo}</div>
                      <div className="vy-row" style={{ gap: 'var(--space-2)', marginTop: 3 }}>
                        <span style={{ fontSize: 'var(--text-2xs)', color: atrasada ? 'var(--danger)' : 'var(--text-subtle)' }}>
                          {atrasada ? 'Atrasada · ' : ''}
                          {tempoRelativo(tarefa.vence)}
                        </span>
                        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                          {usuarioPorId(tarefa.responsavelId)?.nome.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                    {tarefa.prioridade === 'critica' && <Selo tom="perigo">crítica</Selo>}
                  </li>
                );
              })}
            </ul>
          </CartaoCorpo>
        </Cartao>
      </div>

      {/* ---------- Pós-venda ---------- */}
      <div className="vy-grid" style={{ marginTop: 'var(--space-4)' }}>
        <Indicador rotulo="CSAT médio" valor={formatarNumero(metricas.csatMedio, 1)} contexto={`${CSAT.length} avaliações`} icone={BadgeCheck} />
        <Indicador rotulo="Contas a receber" valor={formatarMoeda(metricas.aReceber, true)} contexto="em aberto, no prazo" icone={Wallet} />
        <Indicador rotulo="Comissão a pagar" valor={formatarMoeda(metricas.comissaoAberta, true)} contexto="pendente e aprovada" icone={Percent} />
        <Indicador rotulo="Em atendimento" valor={formatarNumero(metricas.emAtendimento)} contexto="leads com conversa aberta" icone={Users} />
      </div>
    </Pagina>
  );
}

function corDaSeveridade(severidade: string): string {
  switch (severidade) {
    case 'risco':
      return 'var(--danger)';
    case 'atencao':
      return 'var(--warning)';
    case 'conquista':
      return 'var(--success)';
    default:
      return 'var(--vy-cyan)';
  }
}

function CartaoExcecao({
  icone: Icone,
  tom,
  titulo,
  detalhe,
  rota,
}: {
  icone: typeof Flame;
  tom: 'atencao' | 'perigo' | 'sucesso';
  titulo: string;
  detalhe: string;
  rota: string;
}) {
  const cor = tom === 'perigo' ? 'var(--danger)' : tom === 'atencao' ? 'var(--warning)' : 'var(--success)';
  return (
    <Link to={rota} style={{ textDecoration: 'none' }}>
      <Cartao preenchido interativo className="vy-row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-lg)',
            background: `color-mix(in srgb, ${cor} 14%, transparent)`,
            color: cor,
            flexShrink: 0,
          }}
        >
          <Icone size={19} strokeWidth={2} />
        </span>
        <span className="vy-grow" style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 'var(--text-lg)', color: 'var(--text-strong)' }}>{titulo}</strong>
          <span className="vy-truncate" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {detalhe}
          </span>
        </span>
        <ArrowRight size={16} color="var(--text-subtle)" />
      </Cartao>
    </Link>
  );
}
