import { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, LifeBuoy, Plus, Star, ThumbsDown, Timer } from 'lucide-react';
import { SLA_MINUTOS, type Ticket, type TicketPriority } from '@veyra/core';
import { Abas, Botao, Cartao, CartaoCabecalho, CartaoCorpo, EstadoVazio, Progresso, Selo, useAvisos } from '../components';
import { GraficoArea, GraficoBarras, Indicador, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_PRIORIDADE } from '../app/rotulos';
import { CHAMADOS, CONHECIMENTO, CSAT, clientePorId, usuarioPorId } from '../data/base';

function tomDaPrioridade(p: TicketPriority) {
  return p === 'critica' ? ('perigo' as const) : p === 'alta' ? ('atencao' as const) : ('neutro' as const);
}

type AbaSuporte = 'chamados' | 'sla' | 'csat' | 'conhecimento';

/**
 * Suporte
 *
 * Todo atendimento vira protocolo. O protocolo é o que o cliente cita ao
 * ligar de novo e o que a auditoria segue depois — sem ele, "eu já pedi
 * isso semana passada" não tem como ser verificado.
 *
 * O SLA está no domínio, não na configuração da tela: prioridade crítica
 * são 15 minutos em qualquer organização, e a exceção precisa ser uma
 * decisão explícita, não um campo que alguém esvaziou sem querer.
 */
export function Suporte() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [aba, setAba] = useState<AbaSuporte>('chamados');

  const metricas = useMemo(() => {
    const abertos = CHAMADOS.filter((t) => !['resolvido', 'encerrado'].includes(t.status));
    const violados = CHAMADOS.filter((t) => t.slaViolado);
    const csatMedio = CSAT.reduce((s, c) => s + c.nota, 0) / CSAT.length;
    const satisfeitos = CSAT.filter((c) => c.nota >= 4).length;
    const insatisfeitos = CSAT.filter((c) => c.nota <= 2).length;
    return {
      abertos: abertos.length,
      violados: violados.length,
      cumprimento: ((CHAMADOS.length - violados.length) / CHAMADOS.length) * 100,
      csatMedio,
      satisfeitos,
      neutros: CSAT.length - satisfeitos - insatisfeitos,
      insatisfeitos,
    };
  }, [versaoDados]);

  return (
    <Pagina
      titulo="VEYRA Support"
      subtitulo="Protocolo, SLA por prioridade e avaliação ao encerrar. O pós-venda deixa de ser conversa solta e vira registro."
      acoes={
        pode('suporte.criar') ? (
          <Botao variante="primario" icone={Plus} onClick={() => avisar({ tom: 'info', titulo: 'Novo chamado', texto: 'O protocolo é gerado na abertura.' })}>
            Abrir chamado
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Chamados abertos" valor={formatarNumero(metricas.abertos)} icone={LifeBuoy} />
        <Indicador rotulo="SLA cumprido" valor={formatarPercentual(metricas.cumprimento, 0)} delta={-2.4} contexto={`${metricas.violados} violações`} icone={Timer} />
        <Indicador rotulo="CSAT médio" valor={formatarNumero(metricas.csatMedio, 1)} delta={1.8} contexto={`${CSAT.length} avaliações`} icone={Star} />
        <Indicador rotulo="Tempo médio de resolução" valor="6 h 12 min" delta={-8.4} contexto="da abertura ao encerramento" icone={Clock} />
      </div>

      <Abas
        opcoes={[
          { valor: 'chamados' as const, rotulo: 'Chamados' },
          { valor: 'sla' as const, rotulo: 'SLA' },
          { valor: 'csat' as const, rotulo: 'CSAT' },
          { valor: 'conhecimento' as const, rotulo: 'Base de conhecimento' },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      <div style={{ marginTop: 'var(--space-5)' }}>
        {aba === 'chamados' && <ListaChamados />}
        {aba === 'sla' && <PainelSla />}
        {aba === 'csat' && <PainelCsat metricas={metricas} />}
        {aba === 'conhecimento' && <PainelConhecimento />}
      </div>
    </Pagina>
  );
}

function ListaChamados() {
  const abertos = CHAMADOS.filter((t) => !['resolvido', 'encerrado'].includes(t.status));
  const fechados = CHAMADOS.filter((t) => ['resolvido', 'encerrado'].includes(t.status));

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <Cartao>
        <CartaoCabecalho titulo="Em aberto" descricao={`${abertos.length} chamados aguardando ação`} />
        {abertos.length === 0 ? (
          <EstadoVazio icone={CheckCircle2} titulo="Fila vazia" texto="Nenhum chamado aguardando. Bom sinal." />
        ) : (
          <div className="vy-tabela-wrap">
            <table className="vy-tabela">
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Cliente</th>
                  <th>Assunto</th>
                  <th>Categoria</th>
                  <th>Prioridade</th>
                  <th>SLA</th>
                  <th>Responsável</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {abertos.map((chamado) => (
                  <LinhaChamado key={chamado.id} chamado={chamado} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Resolvidos" descricao="Com a solução registrada — é dela que a base de conhecimento cresce." />
        <div className="vy-tabela-wrap">
          <table className="vy-tabela">
            <thead>
              <tr>
                <th>Protocolo</th>
                <th>Cliente</th>
                <th>Assunto</th>
                <th>Solução</th>
                <th>Encerrado</th>
              </tr>
            </thead>
            <tbody>
              {fechados.map((chamado) => (
                <tr key={chamado.id}>
                  <td className="vy-mono">{chamado.protocolo}</td>
                  <td style={{ color: 'var(--text-strong)' }}>{clientePorId(chamado.clienteId)?.nome}</td>
                  <td>{chamado.assunto}</td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: 340 }}>{chamado.solucao}</td>
                  <td>{formatarData(chamado.fechadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}

function LinhaChamado({ chamado }: { chamado: Ticket }) {
  return (
    <tr>
      <td className="vy-mono">{chamado.protocolo}</td>
      <td style={{ color: 'var(--text-strong)' }}>{clientePorId(chamado.clienteId)?.nome}</td>
      <td>{chamado.assunto}</td>
      <td>
        <Selo tom="neutro">{chamado.categoria}</Selo>
      </td>
      <td>
        <Selo tom={tomDaPrioridade(chamado.prioridade)}>{ROTULO_PRIORIDADE[chamado.prioridade]}</Selo>
      </td>
      <td>
        {chamado.slaViolado ? (
          <Selo tom="perigo">
            <AlertTriangle size={10} /> violado
          </Selo>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>vence {tempoRelativo(chamado.slaVenceEm)}</span>
        )}
      </td>
      <td>{usuarioPorId(chamado.responsavelId)?.nome.split(' ')[0] ?? '—'}</td>
      <td>
        <Selo tom={chamado.status === 'novo' ? 'atencao' : 'info'}>{chamado.status.replace(/_/g, ' ')}</Selo>
      </td>
    </tr>
  );
}

function PainelSla() {
  const porPrioridade = (['critica', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((p) => {
    const doTipo = CHAMADOS.filter((t) => t.prioridade === p);
    const violados = doTipo.filter((t) => t.slaViolado).length;
    return {
      prioridade: p,
      minutos: SLA_MINUTOS[p],
      total: doTipo.length,
      violados,
      cumprimento: doTipo.length ? ((doTipo.length - violados) / doTipo.length) * 100 : 100,
    };
  });

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <Cartao>
        <CartaoCabecalho
          titulo="Prazo de primeira resposta por prioridade"
          descricao="O prazo é regra de negócio e vive no domínio compartilhado — a API e a interface leem o mesmo número."
        />
        <CartaoCorpo>
          <div className="vy-grid">
            {porPrioridade.map((linha) => (
              <Cartao key={linha.prioridade} preenchido style={{ background: 'var(--surface-sunken)' }}>
                <div className="vy-row-between">
                  <Selo tom={tomDaPrioridade(linha.prioridade)}>{ROTULO_PRIORIDADE[linha.prioridade]}</Selo>
                  <span className="vy-mono vy-muted">
                    {linha.minutos < 60 ? `${linha.minutos} min` : `${linha.minutos / 60} h`}
                  </span>
                </div>
                <div className="vy-numeric" style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-strong)', marginTop: 'var(--space-3)' }}>
                  {formatarPercentual(linha.cumprimento, 0)}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginBottom: 'var(--space-2)' }}>
                  {linha.violados} de {linha.total} fora do prazo
                </div>
                <Progresso
                  valor={linha.cumprimento}
                  cor={linha.cumprimento >= 90 ? 'var(--success)' : linha.cumprimento >= 70 ? 'var(--warning)' : 'var(--danger)'}
                />
              </Cartao>
            ))}
          </div>
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Cumprimento de SLA ao longo do tempo" descricao="Percentual de chamados respondidos dentro do prazo." />
        <CartaoCorpo>
          <GraficoArea
            rotulos={['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']}
            series={[{ nome: 'SLA cumprido (%)', valores: [88, 91, 89, 93, 95, 92] }]}
            formatar={(v) => formatarPercentual(v, 0)}
            altura={200}
          />
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}

function PainelCsat({ metricas }: { metricas: { csatMedio: number; satisfeitos: number; neutros: number; insatisfeitos: number } }) {
  const distribuicao = [5, 4, 3, 2, 1].map((nota) => ({
    rotulo: `${nota} ★`,
    valor: CSAT.filter((c) => c.nota === nota).length,
    cor: nota >= 4 ? 'var(--chart-3)' : nota === 3 ? 'var(--chart-4)' : 'var(--danger)',
  }));

  const comComentario = CSAT.filter((c) => c.comentario);

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <div className="vy-grid-2">
        <Cartao>
          <CartaoCabecalho titulo="Distribuição das notas" descricao="Enviada automaticamente ao encerrar o atendimento." />
          <CartaoCorpo>
            <GraficoBarras dados={distribuicao} formatar={(v) => `${v} avaliações`} altura={200} />
            <div className="vy-row" style={{ gap: 'var(--space-6)', marginTop: 'var(--space-4)', justifyContent: 'center' }}>
              {(
                [
                  ['Satisfeitos', metricas.satisfeitos, 'var(--success)'],
                  ['Neutros', metricas.neutros, 'var(--warning)'],
                  ['Insatisfeitos', metricas.insatisfeitos, 'var(--danger)'],
                ] as [string, number, string][]
              ).map(([rotulo, valor, cor]) => (
                <div key={rotulo} style={{ textAlign: 'center' }}>
                  <div className="vy-numeric" style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: cor }}>
                    {valor}
                  </div>
                  <div className="vy-eyebrow">{rotulo}</div>
                </div>
              ))}
            </div>
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho
            titulo="O que os clientes escreveram"
            descricao="Comentário de nota baixa vira chamado de retenção automaticamente."
          />
          <CartaoCorpo>
            <ul className="vy-stack" style={{ gap: 'var(--space-4)' }}>
              {comComentario.map((avaliacao) => (
                <li key={avaliacao.id}>
                  <div className="vy-row-between" style={{ gap: 'var(--space-3)' }}>
                    <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                      <span style={{ color: avaliacao.nota >= 4 ? 'var(--warning)' : 'var(--danger)', letterSpacing: 1 }}>
                        {'★'.repeat(avaliacao.nota)}
                        <span style={{ color: 'var(--border-strong)' }}>{'★'.repeat(5 - avaliacao.nota)}</span>
                      </span>
                      <span className="vy-mono vy-muted">{avaliacao.protocolo}</span>
                    </span>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{tempoRelativo(avaliacao.respondidoEm)}</span>
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 5, fontStyle: 'italic' }}>
                    “{avaliacao.comentario}”
                  </p>
                  {avaliacao.nota <= 3 && (
                    <div style={{ marginTop: 6 }}>
                      <Selo tom="perigo">
                        <ThumbsDown size={10} /> retenção acionada
                      </Selo>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CartaoCorpo>
        </Cartao>
      </div>
    </div>
  );
}

function PainelConhecimento() {
  return (
    <div className="vy-grid-2">
      {CONHECIMENTO.map((artigo) => (
        <Cartao key={artigo.id} preenchido>
          <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <div>
              <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
                <BookOpen size={14} color="var(--text-subtle)" />
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{artigo.titulo}</strong>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                {artigo.categoria} · {artigo.autor} · atualizado {tempoRelativo(artigo.atualizadoEm)}
              </div>
            </div>
            <Selo tom={artigo.aprovado ? 'sucesso' : 'atencao'}>{artigo.aprovado ? 'aprovado' : 'rascunho'}</Selo>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>{artigo.conteudo}</p>
          <div className="vy-row-between" style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <span className="vy-eyebrow">Consultado pela IA</span>
            <strong className="vy-numeric" style={{ color: 'var(--vy-violet-400)' }}>
              {formatarNumero(artigo.usosPelaIa)}×
            </strong>
          </div>
        </Cartao>
      ))}
    </div>
  );
}
