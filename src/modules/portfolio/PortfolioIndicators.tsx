import { useMemo } from 'react';
import { Building2, Car, DoorOpen, LayoutDashboard, Receipt, Users, Wrench } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { portfolioSnapshot } from '../../services/analytics';
import { byId } from '../../data/repositories';
import type { Tenant } from '../../data/types';
import { AreaChart, BarChart, DonutChart, RankBars } from '../../components/charts/Charts';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { currency, currencyCompact, number, percent } from '../../lib/format';
import './portfolio.css';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function PortfolioIndicators() {
  const { user, condominiums, dataVersion } = useAuthenticated();
  const tenant = useMemo(() => byId('tenants', user.tenantId) as Tenant | undefined, [user.tenantId, dataVersion]);
  const snapshot = useMemo(() => (tenant ? portfolioSnapshot(tenant, condominiums) : null), [tenant, condominiums]);

  const charts = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
      return MONTHS[d.getMonth()];
    });

    // Séries derivadas dos indicadores consolidados da carteira.
    const baseRevenue = condominiums.reduce((s, c) => s + c.metrics.monthlyRevenue, 0);
    const baseDelinquency = condominiums.length
      ? condominiums.reduce((s, c) => s + c.metrics.delinquencyRate, 0) / condominiums.length
      : 0;

    return {
      revenue: months.map((label, i) => ({ label, value: Math.round(baseRevenue * (0.9 + i * 0.016)) })),
      delinquency: months.map((label, i) => ({ label, value: Number((baseDelinquency * (1.14 - i * 0.019)).toFixed(2)) })),
      tickets: months.map((label, i) => ({ label, value: Math.round(snapshot ? snapshot.openTickets * (1.2 - i * 0.03) : 0) })),
      byCity: (() => {
        const map = new Map<string, number>();
        condominiums.forEach((c) => map.set(c.city, (map.get(c.city) ?? 0) + c.unitsCount));
        return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      })(),
      bySize: [
        { label: 'Até 300 unidades', value: condominiums.filter((c) => c.unitsCount <= 300).length, color: 'var(--mh-ink)' },
        { label: '301 a 600', value: condominiums.filter((c) => c.unitsCount > 300 && c.unitsCount <= 600).length, color: 'var(--mh-gold)' },
        { label: '601 a 900', value: condominiums.filter((c) => c.unitsCount > 600 && c.unitsCount <= 900).length, color: '#7A4E20' },
        { label: 'Acima de 900', value: condominiums.filter((c) => c.unitsCount > 900).length, color: 'var(--success)' },
      ],
      topRevenue: [...condominiums]
        .sort((a, b) => b.metrics.monthlyRevenue - a.metrics.monthlyRevenue)
        .slice(0, 8)
        .map((c) => ({ label: c.shortName, value: c.metrics.monthlyRevenue })),
      topTickets: [...condominiums]
        .sort((a, b) => b.metrics.openTickets - a.metrics.openTickets)
        .slice(0, 8)
        .map((c) => ({ label: c.shortName, value: c.metrics.openTickets, color: 'var(--warning)' })),
    };
  }, [condominiums, snapshot]);

  if (!snapshot) return <EmptyState title="Sem dados de portfólio" />;

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard size={22} />}
        title="Indicadores do portfólio"
        subtitle="Desempenho consolidado da carteira de condomínios"
      />

      <div className="nx-dash-stats">
        <StatCard label="Condomínios" value={number(snapshot.condominiums)} icon={<Building2 size={17} />} tone="brand" />
        <StatCard label="Unidades" value={number(snapshot.units)} icon={<Building2 size={17} />} tone="gold" />
        <StatCard label="Moradores" value={number(snapshot.residents)} icon={<Users size={17} />} tone="success" />
        <StatCard label="Veículos" value={number(snapshot.vehicles)} icon={<Car size={17} />} tone="neutral" />
        <StatCard label="Acessos hoje" value={number(snapshot.accessesToday)} icon={<DoorOpen size={17} />} tone="brand" trend={{ value: '+5,7%', direction: 'up' }} />
        <StatCard label="Receita mensal" value={currencyCompact(snapshot.monthlyRevenue)} icon={<Receipt size={17} />} tone="success" />
        <StatCard label="Inadimplência média" value={percent(snapshot.averageDelinquency)} icon={<Receipt size={17} />} tone={snapshot.averageDelinquency > 6 ? 'danger' : 'warning'} trend={{ value: '-0,6 p.p.', direction: 'down', positive: true }} />
        <StatCard label="Chamados abertos" value={number(snapshot.openTickets)} icon={<Wrench size={17} />} tone="warning" />
      </div>

      <div className="nx-dash-charts">
        <Card padding="md">
          <CardHeader title="Receita consolidada" subtitle="Últimos 8 meses da carteira" />
          <AreaChart
            height={250}
            formatValue={currencyCompact}
            series={[{ name: 'Receita', color: 'var(--success)', points: charts.revenue }]}
          />
        </Card>

        <Card padding="md">
          <CardHeader title="Inadimplência média" subtitle="Evolução percentual" />
          <AreaChart
            height={250}
            formatValue={(v) => percent(v)}
            series={[{ name: 'Inadimplência', color: 'var(--danger)', points: charts.delinquency }]}
          />
        </Card>
      </div>

      <div className="nx-dash-grid">
        <Card padding="md">
          <CardHeader title="Receita por condomínio" subtitle="Top 8 da carteira" />
          <RankBars data={charts.topRevenue} formatValue={currencyCompact} />
        </Card>

        <Card padding="md">
          <CardHeader title="Chamados abertos" subtitle="Condomínios com maior demanda" />
          <RankBars data={charts.topTickets} />
        </Card>

        <Card padding="md">
          <CardHeader title="Distribuição por porte" />
          <div className="nx-row nx-gap-5 nx-wrap nx-center">
            <DonutChart
              size={180}
              thickness={22}
              data={charts.bySize}
              centerValue={number(snapshot.condominiums)}
              centerLabel="condomínios"
            />
            <div className="nx-stack nx-gap-2 nx-grow" style={{ minWidth: 180 }}>
              {charts.bySize.map((s) => (
                <div key={s.label} className="nx-row nx-between nx-gap-3">
                  <span className="nx-row nx-gap-2 nx-text-sm">
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'block' }} />
                    {s.label}
                  </span>
                  <strong className="nx-nums nx-text-sm">{s.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card padding="md">
          <CardHeader title="Unidades por cidade" />
          <RankBars data={charts.byCity} />
        </Card>

        <Card padding="md">
          <CardHeader title="Chamados por mês" subtitle="Tendência da carteira" />
          <BarChart
            height={200}
            series={[{ name: 'Chamados', color: 'var(--warning)', points: charts.tickets }]}
          />
        </Card>

        <Card padding="md">
          <CardHeader title="Resumo executivo" />
          <div className="nx-stack nx-gap-3">
            <div className="nx-inforow"><span>Ticket médio por unidade</span><strong>{currency(snapshot.monthlyRevenue / Math.max(snapshot.units, 1))}</strong></div>
            <div className="nx-inforow"><span>Moradores por unidade</span><strong>{(snapshot.residents / Math.max(snapshot.units, 1)).toFixed(1).replace('.', ',')}</strong></div>
            <div className="nx-inforow"><span>Veículos por unidade</span><strong>{(snapshot.vehicles / Math.max(snapshot.units, 1)).toFixed(2).replace('.', ',')}</strong></div>
            <div className="nx-inforow"><span>Acessos por unidade/dia</span><strong>{(snapshot.accessesToday / Math.max(snapshot.units, 1)).toFixed(1).replace('.', ',')}</strong></div>
            <div className="nx-inforow"><span>Chamados por 100 unidades</span><strong>{((snapshot.openTickets / Math.max(snapshot.units, 1)) * 100).toFixed(1).replace('.', ',')}</strong></div>
          </div>
        </Card>
      </div>
    </>
  );
}
