import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, MapPin } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import type { Condominium } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, PageHeader, SearchInput, SegmentedControl,
  Select, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { currencyCompact, number, percent } from '../../lib/format';
import './portfolio.css';

export function PortfolioCondominiums() {
  const { condominiums, switchCondominium } = useAuthenticated();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [city, setCity] = useState('');
  const [view, setView] = useState('cards');

  const cities = useMemo(
    () => [...new Set(condominiums.map((c) => c.city))].sort().map((c) => ({ value: c, label: c })),
    [condominiums],
  );

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return condominiums.filter((c) =>
      (!q || [c.name, c.city, c.managerName, c.document].some((f) => f.toLowerCase().includes(q)))
      && (!city || c.city === city));
  }, [condominiums, term, city]);

  const open = (condo: Condominium) => {
    switchCondominium(condo.id);
    navigate('/gestao');
  };

  const columns: Column<Condominium>[] = [
    { key: 'name', header: 'Condomínio', render: (c) => <CellStack title={c.name} meta={`${c.address} — ${c.city}/${c.state}`} /> },
    { key: 'units', header: 'Unidades', align: 'right', render: (c) => number(c.unitsCount) },
    { key: 'residents', header: 'Moradores', hideOnMobile: true, align: 'right', render: (c) => number(c.residentsCount) },
    { key: 'manager', header: 'Síndico(a)', hideOnMobile: true, render: (c) => c.managerName },
    { key: 'revenue', header: 'Receita', hideOnMobile: true, align: 'right', render: (c) => currencyCompact(c.metrics.monthlyRevenue) },
    { key: 'tickets', header: 'Chamados', hideOnMobile: true, align: 'right', render: (c) => number(c.metrics.openTickets) },
    {
      key: 'delinquency',
      header: 'Inadimplência',
      align: 'right',
      render: (c) => (
        <Badge tone={c.metrics.delinquencyRate > 8 ? 'danger' : c.metrics.delinquencyRate > 5 ? 'warning' : 'success'} size="sm">
          {percent(c.metrics.delinquencyRate)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '110px',
      render: (c) => <Button variant="ghost" size="sm" iconRight={<ArrowRight size={14} />} onClick={() => open(c)}>Abrir</Button>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Building2 size={22} />}
        title="Condomínios"
        subtitle={`${number(condominiums.length)} condomínios administrados`}
        actions={
          <SegmentedControl
            value={view}
            onChange={setView}
            items={[{ id: 'cards', label: 'Cards' }, { id: 'table', label: 'Tabela' }]}
          />
        }
      />

      <Card padding="none" className="nx-mb-4">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por nome, cidade, síndico ou CNPJ..." />
          <Select options={cities} placeholder="Todas as cidades" value={city} onChange={(e) => setCity(e.target.value)} selectSize="sm" />
        </FilterBar>

        {view === 'table' && (
          <DataTable
            columns={columns}
            rows={filtered}
            keyOf={(c) => c.id}
            onRowClick={open}
            empty={<EmptyState icon={<Building2 size={24} />} title="Nenhum condomínio encontrado" />}
            mobileCard={(c) => (
              <div className="nx-row nx-gap-3">
                <span className="nx-condo-card__badge">{c.shortName.slice(0, 2).toUpperCase()}</span>
                <div className="nx-stack nx-grow nx-gap-1">
                  <span className="nx-medium">{c.name}</span>
                  <span className="nx-text-xs nx-text-subtle">{c.city} · {number(c.unitsCount)} unidades</span>
                </div>
                <Badge tone={c.metrics.delinquencyRate > 8 ? 'danger' : 'success'} size="sm">{percent(c.metrics.delinquencyRate)}</Badge>
              </div>
            )}
          />
        )}
      </Card>

      {view === 'cards' && (
        filtered.length === 0 ? (
          <Card padding="md"><EmptyState icon={<Building2 size={24} />} title="Nenhum condomínio encontrado" description="Ajuste os filtros para ampliar a busca." /></Card>
        ) : (
          <div className="nx-grid-auto-lg">
            {filtered.map((c) => (
              <Card key={c.id} padding="md" interactive onClick={() => open(c)}>
                <div className="nx-row nx-gap-3">
                  <span className="nx-condo-card__badge">{c.shortName.slice(0, 2).toUpperCase()}</span>
                  <div className="nx-grow">
                    <h3 className="nx-card__title nx-truncate">{c.name}</h3>
                    <p className="nx-text-xs nx-text-subtle nx-row nx-gap-1">
                      <MapPin size={12} /> {c.city}/{c.state}
                    </p>
                  </div>
                  <Badge tone={c.metrics.delinquencyRate > 8 ? 'danger' : c.metrics.delinquencyRate > 5 ? 'warning' : 'success'} size="sm">
                    {percent(c.metrics.delinquencyRate)}
                  </Badge>
                </div>

                <div className="nx-condo-metrics">
                  <div><span>Unidades</span><strong>{number(c.unitsCount)}</strong></div>
                  <div><span>Moradores</span><strong>{number(c.residentsCount)}</strong></div>
                  <div><span>Veículos</span><strong>{number(c.vehiclesCount)}</strong></div>
                  <div><span>Torres</span><strong>{c.towersCount}</strong></div>
                  <div><span>Acessos hoje</span><strong>{number(c.metrics.accessesToday)}</strong></div>
                  <div><span>Chamados</span><strong>{c.metrics.openTickets}</strong></div>
                </div>

                <div className="nx-row nx-between" style={{ marginTop: 'var(--space-4)' }}>
                  <span className="nx-text-sm nx-text-muted">{c.managerName}</span>
                  <Button variant="outline" size="sm" iconRight={<ArrowRight size={14} />}>Abrir gestão</Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </>
  );
}
