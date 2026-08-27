import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Building2, Car, DoorOpen, Network, Receipt, TrendingUp, Users, Wrench,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { portfolioSnapshot } from '../../services/analytics';
import { byId } from '../../data/repositories';
import type { Condominium, Tenant } from '../../data/types';
import { HomeMark } from '../../brand/HomeMark';
import {
  Badge, Button, Card, CardHeader, EmptyState, PageHeader, ProgressBar, SearchInput, StatCard,
} from '../../components/ui';
import { RankBars } from '../../components/charts/Charts';
import { currency, currencyCompact, number, percent } from '../../lib/format';
import { OperationsScene } from '../../brand/scenes/OperationsScene';
import '../../brand/scenes/scenes.css';
import './portfolio.css';

export function PortfolioOverview() {
  const { user, condominiums, switchCondominium, dataVersion } = useAuthenticated();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const tenant = useMemo(() => byId('tenants', user.tenantId) as Tenant | undefined, [user.tenantId, dataVersion]);
  const snapshot = useMemo(
    () => (tenant ? portfolioSnapshot(tenant, condominiums) : null),
    [tenant, condominiums],
  );

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return condominiums;
    return condominiums.filter((c) => [c.name, c.city, c.managerName].some((f) => f.toLowerCase().includes(q)));
  }, [condominiums, term]);

  const ranking = useMemo(
    () => [...condominiums]
      .sort((a, b) => b.metrics.delinquencyRate - a.metrics.delinquencyRate)
      .slice(0, 8)
      .map((c) => ({ label: c.shortName, value: c.metrics.delinquencyRate, color: c.metrics.delinquencyRate > 8 ? 'var(--danger)' : 'var(--gradient-brand)' })),
    [condominiums],
  );

  const open = (condo: Condominium) => {
    switchCondominium(condo.id);
    navigate('/gestao');
  };

  if (!tenant || !snapshot) return <EmptyState title="Administradora não encontrada" />;

  return (
    <>
      <PageHeader
        icon={<Network size={22} />}
        title="Portfólio"
        subtitle={`Visão consolidada da ${tenant.name}`}
        actions={<Button variant="secondary" to="/portfolio/indicadores" iconRight={<ArrowRight size={16} />}>Indicadores</Button>}
      />

      <section className="nx-portfolio-hero">
        <OperationsScene className="nx-portfolio-hero__scene" />
        <span className="nx-portfolio-hero__veil" />
        <div className="nx-portfolio-hero__brand">
          <HomeMark size={44} variant="light" />
          <div>
            <p className="nx-uppercase" style={{ color: 'var(--mh-gold)' }}>Minha administradora</p>
            <h2>{tenant.legalName}</h2>
            <p className="nx-text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {tenant.document} · {tenant.city}/{tenant.state} · plano {tenant.plan}
            </p>
          </div>
        </div>
        <div className="nx-portfolio-hero__stats">
          <div><Building2 size={18} /><strong>{number(snapshot.condominiums)}</strong><span>Condomínios</span></div>
          <div><Building2 size={18} /><strong>{number(snapshot.units)}</strong><span>Unidades</span></div>
          <div><Users size={18} /><strong>{number(snapshot.residents)}</strong><span>Moradores</span></div>
          <div><Car size={18} /><strong>{number(snapshot.vehicles)}</strong><span>Veículos</span></div>
          <div><DoorOpen size={18} /><strong>{number(snapshot.accessesToday)}</strong><span>Acessos hoje</span></div>
        </div>
      </section>

      <div className="nx-grid-auto nx-mb-4">
        <StatCard
          label="Receita mensal consolidada"
          value={currencyCompact(snapshot.monthlyRevenue)}
          hint={currency(snapshot.monthlyRevenue)}
          icon={<Receipt size={17} />}
          tone="success"
          trend={{ value: '+2,4%', direction: 'up' }}
        />
        <StatCard label="Inadimplência média" value={percent(snapshot.averageDelinquency)} icon={<TrendingUp size={17} />} tone={snapshot.averageDelinquency > 6 ? 'danger' : 'brand'} />
        <StatCard label="Chamados abertos" value={number(snapshot.openTickets)} icon={<Wrench size={17} />} tone="warning" hint="Somatório da carteira" />
        <StatCard label="Unidades por condomínio" value={number(Math.round(snapshot.units / snapshot.condominiums))} icon={<Building2 size={17} />} tone="gold" hint="Média" />
      </div>

      <div className="nx-portfolio-grid">
        <Card padding="none">
          <CardHeader title="Condomínios" subtitle={`${filtered.length} unidades de negócio`} compact />
          <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            <SearchInput value={term} onChange={setTerm} placeholder="Buscar condomínio, cidade ou síndico..." />
          </div>
          <div className="nx-condo-list">
            {filtered.map((condo) => (
              <button key={condo.id} className="nx-condo-card" onClick={() => open(condo)}>
                <span className="nx-condo-card__badge">{condo.shortName.slice(0, 2).toUpperCase()}</span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium">{condo.name}</span>
                  <span className="nx-text-xs nx-text-subtle">
                    {condo.city}/{condo.state} · {number(condo.unitsCount)} unidades · {condo.managerName}
                  </span>
                </span>
                <span className="nx-condo-card__metrics">
                  <span><strong>{number(condo.metrics.accessesToday)}</strong> acessos</span>
                  <span><strong>{condo.metrics.openTickets}</strong> chamados</span>
                  <Badge tone={condo.metrics.delinquencyRate > 8 ? 'danger' : condo.metrics.delinquencyRate > 5 ? 'warning' : 'success'} size="sm">
                    {percent(condo.metrics.delinquencyRate)}
                  </Badge>
                </span>
                <ArrowRight size={16} className="nx-text-subtle" />
              </button>
            ))}
          </div>
        </Card>

        <div className="nx-stack nx-gap-4">
          <Card padding="md">
            <CardHeader title="Maiores inadimplências" subtitle="Prioridade de atuação" />
            <RankBars data={ranking} formatValue={(v) => percent(v)} />
          </Card>

          <Card padding="md">
            <CardHeader title="Distribuição da carteira" />
            <div className="nx-stack nx-gap-3">
              {[...condominiums]
                .sort((a, b) => b.unitsCount - a.unitsCount)
                .slice(0, 6)
                .map((c) => (
                  <ProgressBar
                    key={c.id}
                    label={`${c.shortName} · ${number(c.unitsCount)} un.`}
                    value={c.unitsCount}
                    max={Math.max(...condominiums.map((x) => x.unitsCount))}
                    tone="brand"
                  />
                ))}
            </div>
            <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-4)' }}>
              Receita consolidada estimada: {currencyCompact(snapshot.monthlyRevenue)}/mês
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
