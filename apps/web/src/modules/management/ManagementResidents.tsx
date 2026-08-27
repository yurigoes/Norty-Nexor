import { useMemo, useState } from 'react';
import { Car, HardHat, Mail, Phone, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { residents, residentsOfUnit, staffOfUnit, towers, unitLabel, unit as findUnit } from '../../services/directory';
import { vehiclesOfUnit } from '../../services/vehicles';
import type { Resident } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, DetailList, Drawer, EmptyState, PageHeader,
  Pagination, SearchInput, Select, StatCard, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDate } from '../../lib/date';
import { number } from '../../lib/format';
import './management.css';

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<Resident['type'], string> = {
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
  dependente: 'Dependente',
};

export function ManagementResidents() {
  const { condominium, dataVersion } = useAuthenticated();
  const [term, setTerm] = useState('');
  const [tower, setTower] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Resident | null>(null);

  const all = useMemo(() => residents(condominium.id), [condominium.id, dataVersion]);
  const towerList = useMemo(() => towers(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((r) => {
      const u = findUnit(r.unitId);
      return (!q || [r.name, r.document, r.email, r.phone, u?.label ?? ''].some((f) => f.toLowerCase().includes(q)))
        && (!tower || u?.towerId === tower)
        && (!type || r.type === type)
        && (!status || (status === 'ativo' ? r.active : !r.active));
    });
  }, [all, term, tower, type, status, dataVersion]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reset = () => setPage(1);

  const columns: Column<Resident>[] = [
    {
      key: 'name',
      header: 'Morador',
      render: (r) => (
        <span className="nx-row nx-gap-3">
          <Avatar name={r.name} size="sm" />
          <CellStack title={r.name} meta={r.document} />
        </span>
      ),
    },
    { key: 'unit', header: 'Unidade', render: (r) => unitLabel(r.unitId) },
    { key: 'type', header: 'Vínculo', hideOnMobile: true, render: (r) => <Badge tone="neutral" size="sm">{TYPE_LABEL[r.type]}</Badge> },
    { key: 'contact', header: 'Contato', hideOnMobile: true, render: (r) => <CellStack title={r.phone} meta={r.email} /> },
    { key: 'since', header: 'Desde', hideOnMobile: true, render: (r) => formatDate(r.since) },
    { key: 'status', header: 'Status', align: 'right', render: (r) => <Badge tone={r.active ? 'success' : 'neutral'} size="sm" dot>{r.active ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<Users size={22} />}
        title="Moradores"
        subtitle={`${number(all.length)} pessoas cadastradas no ${condominium.shortName}`}
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Total de moradores" value={number(all.length)} icon={<Users size={17} />} tone="brand" />
        <StatCard label="Proprietários" value={number(all.filter((r) => r.type === 'proprietario').length)} icon={<Users size={17} />} tone="gold" />
        <StatCard label="Inquilinos" value={number(all.filter((r) => r.type === 'inquilino').length)} icon={<Users size={17} />} tone="neutral" />
        <StatCard label="Cadastros inativos" value={number(all.filter((r) => !r.active).length)} icon={<Users size={17} />} tone="warning" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); reset(); }} placeholder="Buscar por nome, CPF, e-mail, telefone ou unidade..." />
          <Select options={towerList.map((t) => ({ value: t.id, label: t.name }))} placeholder="Todas as torres" value={tower} onChange={(e) => { setTower(e.target.value); reset(); }} selectSize="sm" />
          <Select options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} placeholder="Todos os vínculos" value={type} onChange={(e) => { setType(e.target.value); reset(); }} selectSize="sm" />
          <Select options={[{ value: 'ativo', label: 'Ativos' }, { value: 'inativo', label: 'Inativos' }]} placeholder="Todos os status" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} selectSize="sm" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(r) => r.id}
          onRowClick={setSelected}
          empty={<EmptyState icon={<Users size={24} />} title="Nenhum morador encontrado" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(r) => (
            <div className="nx-row nx-gap-3">
              <Avatar name={r.name} size="md" />
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{r.name}</span>
                <span className="nx-text-xs nx-text-subtle">{unitLabel(r.unitId)} · {TYPE_LABEL[r.type]}</span>
              </div>
              <Badge tone={r.active ? 'success' : 'neutral'} size="sm">{r.active ? 'Ativo' : 'Inativo'}</Badge>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected ? unitLabel(selected.unitId) : undefined}
        width={480}
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-3">
              <Avatar name={selected.name} size="xl" />
              <div>
                <p className="nx-semibold" style={{ fontSize: 'var(--text-lg)' }}>{selected.name}</p>
                <div className="nx-row nx-gap-2 nx-wrap" style={{ marginTop: 'var(--space-2)' }}>
                  <Badge tone="brand" size="sm">{TYPE_LABEL[selected.type]}</Badge>
                  <Badge tone={selected.active ? 'success' : 'neutral'} size="sm">{selected.active ? 'Ativo' : 'Inativo'}</Badge>
                  {selected.isMainContact && <Badge tone="gold" size="sm">Contato principal</Badge>}
                </div>
              </div>
            </div>

            <DetailList
              columns={2}
              items={[
                { label: 'Documento', value: selected.document },
                { label: 'Morador desde', value: formatDate(selected.since) },
                { label: 'Telefone', value: <span className="nx-row nx-gap-2"><Phone size={13} /> {selected.phone}</span> },
                { label: 'E-mail', value: <span className="nx-row nx-gap-2"><Mail size={13} /> {selected.email}</span> },
              ]}
            />

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Outros moradores da unidade</p>
              <ul className="nx-list">
                {residentsOfUnit(selected.unitId).filter((r) => r.id !== selected.id).map((r) => (
                  <li key={r.id} className="nx-list__item">
                    <Avatar name={r.name} size="sm" />
                    <span className="nx-stack nx-grow">
                      <span className="nx-medium">{r.name}</span>
                      <span className="nx-text-xs nx-text-subtle">{TYPE_LABEL[r.type]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Veículos da unidade</p>
              {vehiclesOfUnit(selected.unitId).length === 0
                ? <p className="nx-text-sm nx-text-subtle">Nenhum veículo cadastrado.</p>
                : (
                  <ul className="nx-list">
                    {vehiclesOfUnit(selected.unitId).map((v) => (
                      <li key={v.id} className="nx-list__item">
                        <span className="nx-list__icon"><Car size={16} /></span>
                        <span className="nx-stack nx-grow">
                          <span className="nx-medium nx-mono">{v.plate}</span>
                          <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <section>
              <p className="nx-uppercase nx-text-subtle nx-mb-4">Funcionários autorizados</p>
              {staffOfUnit(selected.unitId).length === 0
                ? <p className="nx-text-sm nx-text-subtle">Nenhum funcionário cadastrado.</p>
                : (
                  <ul className="nx-list">
                    {staffOfUnit(selected.unitId).map((s) => (
                      <li key={s.id} className="nx-list__item">
                        <span className="nx-list__icon"><HardHat size={16} /></span>
                        <span className="nx-stack nx-grow">
                          <span className="nx-medium">{s.name}</span>
                          <span className="nx-text-xs nx-text-subtle">{s.role}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}
