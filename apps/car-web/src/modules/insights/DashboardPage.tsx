/* =========================================================
   Dashboard da locadora. Números reais do servidor; cada bloco
   só aparece se o perfil puder vê-lo (a API nem calcula o que
   o usuário não pode ver). Empresa sem dados ganha um roteiro
   de primeiros passos, não gráficos vazios.
   ========================================================= */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Boxes, Building2, Car, CircleDollarSign, ClipboardList, FileWarning, Gauge, KeyRound, Landmark,
  ReceiptText, Rocket, ScrollText, TrendingUp, Undo2, Users, Wrench,
} from 'lucide-react';
import { COMMERCIAL_STATUS_LABEL, OPERATIONAL_STATUS_LABEL, type DashboardData } from '@nortycar/shared';
import { Badge, Card, EmptyState, ErrorState, Page, PageHeader, Segmented, Skeleton, StatCard } from '../../components/ui';
import { BarChart, Donut } from '../../components/charts';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, int, money, pct, plate } from '../../lib/format';
import { useBranchFilter } from '../../app/branch-filter';
import { useSession } from '../../lib/session';
import './insights.css';

type Range = 'month' | '30d' | '90d' | 'year';
const RANGES: { value: Range; label: string }[] = [
  { value: 'month', label: 'Este mês' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'year', label: '12 meses' },
];

function periodOf(range: Range): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (range === 'month') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3)).toISOString(), to };
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COMMERCIAL_COLORS: Record<string, string> = {
  AVAILABLE: 'var(--chart-2)', RESERVED: 'var(--chart-5)', RENTED: 'var(--chart-1)', FOR_SALE: 'var(--chart-4)', SOLD: 'var(--chart-3)',
};

export function DashboardPage() {
  const { session } = useSession();
  const { branchId } = useBranchFilter();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('month');
  const period = useMemo(() => periodOf(range), [range]);
  const { data, loading, error, reload } = useApi(
    (signal) => api.get<DashboardData>('/dashboard', { ...period, branchId: branchId || undefined }, signal),
    [period.from, branchId],
  );

  const isEmpty = data && (data.fleet?.total ?? 0) === 0 && !(data.rentals?.activeContracts) && !(data.finance?.revenue);

  return (
    <Page>
      <PageHeader
        eyebrow={session?.context.organizationName}
        title="Visão geral"
        description="Indicadores calculados agora, com os dados das filiais que você pode ver."
        actions={<Segmented label="Período" options={RANGES} value={range} onChange={setRange} />}
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <DashboardSkeleton /> : data && isEmpty ? <FirstSteps /> : data ? (
        <div className="stack-lg">
          <Kpis data={data} go={navigate} />
          <div className="dash-grid">
            {data.finance && (
              <Card title="Receita prevista × recebida" subtitle="Títulos de locação e mensalidade por mês de vencimento, e pagamentos confirmados por mês.">
                <BarChart
                  labels={data.finance.series.map((s) => MONTHS[Number(s.month.slice(5)) - 1]!)}
                  series={[
                    { name: 'Previsto', values: data.finance.series.map((s) => s.forecast), color: 'var(--chart-5)' },
                    { name: 'Recebido', values: data.finance.series.map((s) => s.received), color: 'var(--chart-1)' },
                  ]}
                  format={(v) => (v >= 1000 ? `R$ ${Math.round(v / 1000)} mil` : `R$ ${Math.round(v)}`)}
                />
              </Card>
            )}
            {data.fleet && (
              <Card title="Frota por situação" subtitle={`${int(data.fleet.total)} veículos ativos`}>
                {data.fleet.total ? (
                  <div className="stack">
                    <Donut
                      data={Object.entries(data.fleet.byCommercial).filter(([k, v]) => v > 0 && k !== 'SOLD').map(([k, v]) => ({ label: COMMERCIAL_STATUS_LABEL[k as keyof typeof COMMERCIAL_STATUS_LABEL], value: v, color: COMMERCIAL_COLORS[k] }))}
                      center={<div><div className="stat-value strong" style={{ fontSize: 'var(--text-2xl)' }}>{pct(data.fleet.occupancyRate)}</div><div className="xsmall muted">ocupação</div></div>}
                    />
                    <div className="row" style={{ gap: 6 }}>
                      {Object.entries(data.fleet.byOperational).filter(([k, v]) => v > 0 && k !== 'RELEASED').map(([k, v]) => (
                        <Badge key={k} tone={k === 'BLOCKED' ? 'danger' : 'warning'}>{OPERATIONAL_STATUS_LABEL[k as keyof typeof OPERATIONAL_STATUS_LABEL]}: {v}</Badge>
                      ))}
                    </div>
                  </div>
                ) : <EmptyState icon={Car} title="Nenhum veículo cadastrado" />}
              </Card>
            )}
          </div>
          <Attention data={data} />
          {data.vehicles && (
            <div className="grid-2">
              <VehicleRanking title="Veículos mais rentáveis" rows={data.vehicles.mostProfitable} field="operatingResult" />
              <VehicleRanking title="Veículos com maior custo" rows={data.vehicles.highestCost} field="costs" />
            </div>
          )}
        </div>
      ) : null}
    </Page>
  );
}

function Kpis({ data, go }: { data: DashboardData; go: (to: string) => void }) {
  const cards: React.ReactNode[] = [];
  if (data.fleet) {
    cards.push(<StatCard key="fleet" label="Veículos disponíveis" icon={Car} value={int(data.fleet.byCommercial.AVAILABLE ?? 0)}
      foot={`${int(data.fleet.byCommercial.RENTED ?? 0)} alugados · ${int(data.fleet.byCommercial.RESERVED ?? 0)} reservados`} onClick={() => go('/frota/veiculos')} />);
    cards.push(<StatCard key="occ" label="Taxa de ocupação" icon={Gauge} value={pct(data.fleet.occupancyRate)}
      foot={`${int(data.fleet.byOperational.IN_MAINTENANCE ?? 0)} em manutenção · ${int(data.fleet.byCommercial.FOR_SALE ?? 0)} à venda`} onClick={() => go('/frota/disponibilidade')} />);
  }
  if (data.rentals?.activeContracts !== undefined) {
    cards.push(<StatCard key="ctr" label="Contratos ativos" icon={ScrollText} value={int(data.rentals.activeContracts)}
      foot={`${int(data.rentals.expiringContracts ?? 0)} vencem em 30 dias`} onClick={() => go('/locacoes/contratos')} />);
  }
  if (data.rentals?.futureReservations !== undefined) {
    cards.push(<StatCard key="res" label="Reservas futuras" icon={KeyRound} value={int(data.rentals.futureReservations)}
      foot={`${int(data.rentals.pickupsToday?.length ?? 0)} retiradas hoje`} onClick={() => go('/locacoes/reservas')} />);
  }
  if (data.finance) {
    cards.push(<StatCard key="rev" label="Receita do período" icon={TrendingUp} size="md" value={money(data.finance.revenue)}
      foot={`Recebido ${money(data.finance.received)} · pendente ${money(data.finance.pending)}`} onClick={() => go('/financeiro')} />);
    cards.push(<StatCard key="del" label="Inadimplência" icon={ReceiptText} size="md" tone={data.finance.overdue > 0 ? 'danger' : undefined}
      value={pct(data.finance.delinquencyRate)} foot={`${money(data.finance.overdue)} vencidos em aberto`} onClick={() => go('/financeiro/receber')} />);
  }
  if (data.deposits) {
    cards.push(<StatCard key="dep" label="Cauções retidos" icon={Landmark} size="md" value={money(data.deposits.held)}
      foot={data.deposits.pendingRefundCount ? `${data.deposits.pendingRefundCount} a devolver (${money(data.deposits.pendingRefund)})` : 'Nenhuma devolução pendente'}
      tone={data.deposits.pendingRefundCount ? 'warning' : undefined} onClick={() => go('/financeiro/caucoes')} />);
  }
  if (data.infractions) {
    cards.push(<StatCard key="inf" label="Multas a vencer (30 dias)" icon={FileWarning} value={int(data.infractions.dueSoon)}
      foot={`${money(data.infractions.dueSoonAmount)} · ${int(data.infractions.awaitingDriver)} aguardando condutor`} tone={data.infractions.dueSoon ? 'warning' : undefined} onClick={() => go('/regularizacao/infracoes')} />);
  }
  if (data.maintenance) {
    cards.push(<StatCard key="mnt" label="Manutenções próximas" icon={Wrench} value={int(data.maintenance.dueSoon + data.maintenance.overdue)}
      foot={`${int(data.maintenance.overdue)} vencidas · ${int(data.maintenance.openOrders)} OS abertas`} tone={data.maintenance.overdue ? 'danger' : undefined} onClick={() => go('/operacao/manutencao')} />);
  }
  if (data.inventory) {
    cards.push(<StatCard key="inv" label="Estoque crítico" icon={Boxes} value={int(data.inventory.critical)} foot="Produtos abaixo do mínimo"
      tone={data.inventory.critical ? 'warning' : undefined} onClick={() => go('/operacao/estoque')} />);
  }
  return <div className="grid-4">{cards}</div>;
}

function Attention({ data }: { data: DashboardData }) {
  const r = data.rentals;
  const blocks: React.ReactNode[] = [];
  if (r?.pickupsToday || r?.deliveriesToday) {
    const items = [
      ...(r.pickupsToday ?? []).map((p) => ({ id: p.id, title: `Reserva ${p.code}`, sub: `${p.customer} · ${dateTime(p.startAt)}`, link: `/locacoes/reservas?id=${p.id}` })),
      ...(r.deliveriesToday ?? []).map((c) => ({ id: c.id, title: `Entrega ${c.number}`, sub: `${c.customer} · ${dateTime(c.startAt)}`, link: `/locacoes/contratos/${c.id}` })),
    ];
    blocks.push(<AttentionList key="pick" icon={KeyRound} title="Retiradas e entregas de hoje" empty="Nenhuma retirada prevista para hoje." items={items} more="/locacoes/retiradas" />);
  }
  if (r?.returnsToday) {
    blocks.push(<AttentionList key="ret" icon={Undo2} title="Devoluções de hoje" empty="Nenhuma devolução prevista para hoje."
      badge={r.overdueReturns ? `${r.overdueReturns} atrasada(s)` : undefined}
      items={r.returnsToday.map((c) => ({ id: c.id, title: c.number, sub: `${c.customer} · ${dateTime(c.endAt)}`, link: `/locacoes/contratos/${c.id}` }))} more="/locacoes/devolucoes" />);
  }
  if (r?.expiring) {
    blocks.push(<AttentionList key="exp" icon={ScrollText} title="Contratos vencendo" empty="Nenhum contrato vence nos próximos 30 dias."
      items={r.expiring.map((c) => ({ id: c.id, title: c.number, sub: `${c.customer} · termina ${dateTime(c.endAt)}`, link: `/locacoes/contratos/${c.id}` }))} more="/locacoes/renovacoes" />);
  }
  if (data.maintenance) {
    blocks.push(<AttentionList key="mnt" icon={Wrench} title="Manutenção preventiva" empty="Nenhum plano vencendo."
      items={data.maintenance.upcoming.map((m) => ({
        id: m.planId, title: `${plate(m.plate)} · ${m.name}`, tone: m.state === 'OVERDUE' ? 'danger' as const : undefined,
        sub: [m.kmRemaining !== null ? `${int(m.kmRemaining)} km` : null, m.daysRemaining !== null ? `${m.daysRemaining} dia(s)` : null].filter(Boolean).join(' · ') || 'Vencida',
        link: '/operacao/manutencao',
      }))} more="/operacao/manutencao" />);
  }
  if (data.inventory) {
    blocks.push(<AttentionList key="inv" icon={Boxes} title="Estoque crítico" empty="Todos os produtos acima do mínimo."
      items={data.inventory.items.map((p) => ({ id: p.id, title: p.description, sub: `Saldo ${p.balance} ${p.unit} · mínimo ${p.minStock}`, link: '/operacao/estoque', tone: p.balance <= 0 ? 'danger' as const : undefined }))} more="/operacao/estoque" />);
  }
  if (!blocks.length) return null;
  return <div className="dash-attention">{blocks}</div>;
}

interface AttentionItem { id: string; title: string; sub: string; link: string; tone?: 'danger' }

function AttentionList({ icon: Icon, title, items, empty, more, badge }: { icon: typeof Car; title: string; items: AttentionItem[]; empty: string; more: string; badge?: string }) {
  return (
    <Card flush title={<span className="row" style={{ gap: 8 }}><Icon size={16} aria-hidden />{title}</span>} actions={badge ? <Badge tone="danger">{badge}</Badge> : undefined}>
      {items.length ? (
        <ul className="nc-list">
          {items.slice(0, 6).map((i) => (
            <li key={i.id}>
              {i.tone === 'danger' && <AlertTriangle size={16} className="text-danger" aria-hidden />}
              <Link to={i.link} className="grow" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="strong ellipsis">{i.title}</div>
                <div className="xsmall muted ellipsis">{i.sub}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="small muted" style={{ padding: 'var(--space-5)' }}>{empty}</p>}
      <div className="nc-card__footer"><Link to={more} className="small row" style={{ gap: 4 }}>Ver tudo <ArrowRight size={14} aria-hidden /></Link></div>
    </Card>
  );
}

function VehicleRanking({ title, rows, field }: { title: string; rows: NonNullable<DashboardData['vehicles']>['mostProfitable']; field: 'operatingResult' | 'costs' }) {
  return (
    <Card flush title={title} subtitle="No período selecionado" actions={<Link to="/relatorios/rentabilidade" className="small">Rentabilidade</Link>}>
      {rows.length ? (
        <ul className="nc-list">
          {rows.map((r) => (
            <li key={r.vehicleUnitId}>
              <Link to={`/frota/veiculos/${r.vehicleUnitId}`} className="grow" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="strong">{plate(r.plate)}</div>
                <div className="xsmall muted">{r.model}</div>
              </Link>
              <span className={`strong tnum ${field === 'operatingResult' && r.operatingResult < 0 ? 'text-danger' : ''}`}>{money(r[field])}</span>
            </li>
          ))}
        </ul>
      ) : <p className="small muted" style={{ padding: 'var(--space-5)' }}>Sem receitas ou custos atribuídos a veículos no período.</p>}
    </Card>
  );
}

function FirstSteps() {
  const steps = [
    { icon: Building2, title: 'Confira suas filiais', text: 'Endereço, contato e tempo de preparo entre locações.', to: '/admin/filiais' },
    { icon: CircleDollarSign, title: 'Defina as tarifas', text: 'Diária, semanal, mensal, km incluído e caução por categoria.', to: '/locacoes/tarifas' },
    { icon: Car, title: 'Cadastre os veículos', text: 'Placa, RENAVAM, chassi, documentos e quilometragem.', to: '/frota/veiculos' },
    { icon: Users, title: 'Cadastre os clientes', text: 'Pessoas físicas e jurídicas, motoristas e CNH.', to: '/pessoas/clientes' },
    { icon: ClipboardList, title: 'Faça a primeira reserva', text: 'Cotação pelo servidor, sem risco de dupla reserva.', to: '/locacoes/reservas' },
  ];
  return (
    <Card>
      <div className="stack-lg">
        <div className="row" style={{ gap: 'var(--space-4)' }}>
          <span className="nc-empty__icon" aria-hidden><Rocket /></span>
          <div>
            <h2>Sua locadora ainda não tem movimento</h2>
            <p className="muted">Os indicadores aparecem aqui assim que houver veículos, contratos e lançamentos. Comece por estes passos:</p>
          </div>
        </div>
        <ol className="first-steps">
          {steps.map((s, i) => (
            <li key={s.to}>
              <Link to={s.to}>
                <span className="first-steps__n">{i + 1}</span>
                <s.icon size={18} aria-hidden />
                <span className="grow"><span className="strong" style={{ display: 'block' }}>{s.title}</span><span className="small muted">{s.text}</span></span>
                <ArrowRight size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="stack-lg" aria-busy="true" aria-label="Carregando indicadores">
      <div className="grid-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="nc-card nc-stat"><Skeleton width="50%" /><Skeleton height={30} width="70%" /><Skeleton width="80%" /></div>)}</div>
      <div className="dash-grid"><div className="nc-card" style={{ height: 300 }} /><div className="nc-card" style={{ height: 300 }} /></div>
    </div>
  );
}
