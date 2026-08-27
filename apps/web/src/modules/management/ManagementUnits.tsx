import { useMemo, useState } from 'react';
import { Building2, Car, DoorOpen, Home, Receipt, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { residentsOfUnit, towers, unitLabel, units } from '../../services/directory';
import { vehiclesOfUnit } from '../../services/vehicles';
import { invoicesOfUnit } from '../../services/finance';
import { accessLogsOfUnit } from '../../services/access';
import type { Unit } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DetailList, Drawer, EmptyState, PageHeader, Pagination,
  SearchInput, SegmentedControl, Select, StatCard,
} from '../../components/ui';
import { FilterBar } from '../../components/PageBits';
import { currency, number, percent } from '../../lib/format';
import { formatDate, formatDateTime } from '../../lib/date';
import './management.css';

const PAGE_SIZE = 48;

export function ManagementUnits() {
  const { condominium, dataVersion } = useAuthenticated();
  const [term, setTerm] = useState('');
  const [tower, setTower] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Unit | null>(null);

  const all = useMemo(() => units(condominium.id), [condominium.id, dataVersion]);
  const towerList = useMemo(() => towers(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((u) =>
      (!q || [u.label, `${u.block}-${u.label}`, u.ownerName, ...u.parkingSpots].some((f) => f.toLowerCase().includes(q)))
      && (!tower || u.towerId === tower)
      && (!status || u.status === status));
  }, [all, term, tower, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const occupied = all.filter((u) => u.status !== 'vaga').length;
  const delinquent = all.filter((u) => u.delinquent).length;

  return (
    <>
      <PageHeader
        icon={<Building2 size={22} />}
        title="Unidades"
        subtitle={`${number(all.length)} unidades distribuídas em ${towerList.length} torres`}
        actions={
          <SegmentedControl
            value={view}
            onChange={setView}
            items={[{ id: 'grid', label: 'Grade' }, { id: 'list', label: 'Lista' }]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Total de unidades" value={number(all.length)} icon={<Home size={17} />} tone="brand" />
        <StatCard label="Ocupação" value={percent((occupied / all.length) * 100)} icon={<Users size={17} />} tone="success" hint={`${number(occupied)} ocupadas`} />
        <StatCard label="Unidades vagas" value={number(all.filter((u) => u.status === 'vaga').length)} icon={<Home size={17} />} tone="neutral" />
        <StatCard label="Em inadimplência" value={number(delinquent)} icon={<Receipt size={17} />} tone={delinquent > 40 ? 'danger' : 'warning'} />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por unidade, responsável ou vaga..." />
          <Select options={towerList.map((t) => ({ value: t.id, label: t.name }))} placeholder="Todas as torres" value={tower} onChange={(e) => { setTower(e.target.value); setPage(1); }} selectSize="sm" />
          <Select
            options={[
              { value: 'ocupada', label: 'Ocupadas' },
              { value: 'alugada', label: 'Alugadas' },
              { value: 'vaga', label: 'Vagas' },
              { value: 'reformando', label: 'Em reforma' },
            ]}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>

        <div style={{ padding: 'var(--space-4)' }}>
          {paged.length === 0 ? (
            <EmptyState icon={<Building2 size={24} />} title="Nenhuma unidade encontrada" description="Ajuste os filtros para ampliar a busca." />
          ) : view === 'grid' ? (
            <div className="nx-unit-grid">
              {paged.map((u) => (
                <button key={u.id} className="nx-unit-tile" onClick={() => setSelected(u)}>
                  <div className="nx-row nx-between">
                    <span className="nx-unit-tile__label">{u.block}-{u.label}</span>
                    <Badge tone={u.delinquent ? 'danger' : u.status === 'vaga' ? 'neutral' : 'success'} size="sm" dot>
                      {u.delinquent ? 'Inadimplente' : u.status}
                    </Badge>
                  </div>
                  <p className="nx-unit-tile__owner nx-truncate">{u.ownerName}</p>
                  <div className="nx-unit-tile__meta">
                    <span className="nx-audit-badge">{u.bedrooms} dorm</span>
                    <span className="nx-audit-badge">{u.area} m²</span>
                    <span className="nx-audit-badge">{u.parkingSpots.length} vaga(s)</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="nx-stack nx-gap-2">
              {paged.map((u) => (
                <button key={u.id} className="nx-unit-tile nx-row nx-gap-4" onClick={() => setSelected(u)} style={{ width: '100%' }}>
                  <span className="nx-unit-tile__label" style={{ minWidth: 80 }}>{u.block}-{u.label}</span>
                  <span className="nx-grow nx-truncate" style={{ textAlign: 'left' }}>{u.ownerName}</span>
                  <span className="nx-text-sm nx-text-subtle nx-hide-mobile">{u.bedrooms} dorm · {u.area} m²</span>
                  <span className="nx-text-sm nx-text-muted nx-hide-mobile">{currency(u.monthlyFee)}</span>
                  <Badge tone={u.delinquent ? 'danger' : u.status === 'vaga' ? 'neutral' : 'success'} size="sm">
                    {u.delinquent ? 'Inadimplente' : u.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? unitLabel(selected.id) : undefined}
        subtitle={selected ? `${selected.bedrooms} dormitórios · ${selected.area} m²` : undefined}
        width={500}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-2 nx-wrap">
              <Badge tone={selected.status === 'vaga' ? 'neutral' : 'success'}>{selected.status}</Badge>
              {selected.delinquent && <Badge tone="danger">Inadimplente</Badge>}
              <Badge tone="brand">{currency(selected.monthlyFee)}/mês</Badge>
            </div>

            <DetailList
              columns={2}
              items={[
                { label: 'Responsável', value: selected.ownerName },
                { label: 'Andar', value: `${selected.floor}º` },
                { label: 'Área privativa', value: `${selected.area} m²` },
                { label: 'Dormitórios', value: selected.bedrooms },
                { label: 'Vagas', value: selected.parkingSpots.join(', ') },
                { label: 'Taxa condominial', value: currency(selected.monthlyFee) },
              ]}
            />

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Moradores ({residentsOfUnit(selected.id).length})</p>
              <ul className="nx-list">
                {residentsOfUnit(selected.id).map((r) => (
                  <li key={r.id} className="nx-list__item">
                    <Avatar name={r.name} size="sm" />
                    <span className="nx-stack nx-grow">
                      <span className="nx-medium">{r.name}</span>
                      <span className="nx-text-xs nx-text-subtle">{r.type} · {r.phone}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Veículos</p>
              {vehiclesOfUnit(selected.id).length === 0
                ? <p className="nx-text-sm nx-text-subtle">Nenhum veículo cadastrado.</p>
                : (
                  <ul className="nx-list">
                    {vehiclesOfUnit(selected.id).map((v) => (
                      <li key={v.id} className="nx-list__item">
                        <span className="nx-list__icon"><Car size={16} /></span>
                        <span className="nx-stack nx-grow">
                          <span className="nx-medium nx-mono">{v.plate}</span>
                          <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model} · vaga {v.parkingSpot ?? '—'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Últimos boletos</p>
              <ul className="nx-list">
                {invoicesOfUnit(selected.id).slice(0, 4).map((i) => (
                  <li key={i.id} className="nx-list__item">
                    <span className="nx-list__icon"><Receipt size={16} /></span>
                    <span className="nx-stack nx-grow">
                      <span className="nx-medium">{i.reference}</span>
                      <span className="nx-text-xs nx-text-subtle">Vence em {formatDate(i.dueDate)}</span>
                    </span>
                    <span className="nx-stack" style={{ alignItems: 'flex-end' }}>
                      <strong className="nx-nums nx-text-sm">{currency(i.amount)}</strong>
                      <Badge tone={i.status === 'pago' ? 'success' : i.status === 'vencido' ? 'danger' : 'info'} size="sm">{i.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Últimos acessos</p>
              <ul className="nx-list">
                {accessLogsOfUnit(selected.id).slice(0, 5).map((a) => (
                  <li key={a.id} className="nx-list__item">
                    <span className={`nx-list__icon ${a.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}><DoorOpen size={16} /></span>
                    <span className="nx-stack nx-grow">
                      <span className="nx-medium">{a.subjectName}</span>
                      <span className="nx-text-xs nx-text-subtle">{a.gateName}</span>
                    </span>
                    <span className="nx-text-xs nx-text-muted">{formatDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}
