import { useMemo, useState } from 'react';
import { HardHat, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { staffOfCondominium, unitLabel } from '../../services/directory';
import type { Staff } from '../../data/types';
import {
  Avatar, Badge, Card, DataTable, DetailList, Drawer, EmptyState, PageHeader, Pagination,
  SearchInput, Select, StatCard, Tabs, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { number, weekdays } from '../../lib/format';
import { formatDate } from '../../lib/date';

const PAGE_SIZE = 20;

const KIND_LABEL: Record<Staff['kind'], string> = {
  funcionario_condominio: 'Funcionário do condomínio',
  funcionario_unidade: 'Funcionário de unidade',
  prestador: 'Prestador de serviço',
};

export function ManagementStaff() {
  const { condominium, dataVersion } = useAuthenticated();
  const [tab, setTab] = useState('funcionario_condominio');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Staff | null>(null);

  const all = useMemo(() => staffOfCondominium(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((s) =>
      s.kind === tab
      && (!q || [s.name, s.document, s.role, s.company ?? ''].some((f) => f.toLowerCase().includes(q)))
      && (!status || (status === 'ativo' ? s.active : !s.active)));
  }, [all, tab, term, status]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<Staff>[] = [
    {
      key: 'name',
      header: 'Pessoa',
      render: (s) => (
        <span className="nx-row nx-gap-3">
          <Avatar name={s.name} size="sm" />
          <CellStack title={s.name} meta={s.document} />
        </span>
      ),
    },
    { key: 'role', header: 'Função', render: (s) => <CellStack title={s.role} meta={s.company} /> },
    { key: 'unit', header: 'Unidade', hideOnMobile: true, render: (s) => (s.unitId ? unitLabel(s.unitId) : '—') },
    { key: 'schedule', header: 'Escala', hideOnMobile: true, render: (s) => <CellStack title={`${s.shiftStart}–${s.shiftEnd}`} meta={weekdays(s.workDays)} /> },
    { key: 'valid', header: 'Acesso até', hideOnMobile: true, render: (s) => (s.accessValidUntil ? formatDate(s.accessValidUntil) : 'Sem prazo') },
    { key: 'status', header: 'Status', align: 'right', render: (s) => <Badge tone={s.active ? 'success' : 'neutral'} size="sm" dot>{s.active ? 'Ativo' : 'Inativo'}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<HardHat size={22} />}
        title="Funcionários e prestadores"
        subtitle="Equipe do condomínio, funcionários de unidades e prestadores com acesso autorizado"
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => { setTab(id); setPage(1); }}
            items={[
              { id: 'funcionario_condominio', label: 'Condomínio', count: all.filter((s) => s.kind === 'funcionario_condominio').length },
              { id: 'funcionario_unidade', label: 'Unidades', count: all.filter((s) => s.kind === 'funcionario_unidade').length },
              { id: 'prestador', label: 'Prestadores', count: all.filter((s) => s.kind === 'prestador').length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Equipe do condomínio" value={number(all.filter((s) => s.kind === 'funcionario_condominio').length)} icon={<HardHat size={17} />} tone="brand" />
        <StatCard label="Funcionários de unidades" value={number(all.filter((s) => s.kind === 'funcionario_unidade').length)} icon={<Users size={17} />} tone="gold" />
        <StatCard label="Prestadores ativos" value={number(all.filter((s) => s.kind === 'prestador' && s.active).length)} icon={<HardHat size={17} />} tone="success" />
        <StatCard label="Cadastros inativos" value={number(all.filter((s) => !s.active).length)} icon={<HardHat size={17} />} tone="warning" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por nome, documento, função ou empresa..." />
          <Select
            options={[{ value: 'ativo', label: 'Ativos' }, { value: 'inativo', label: 'Inativos' }]}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(s) => s.id}
          onRowClick={setSelected}
          empty={<EmptyState icon={<HardHat size={24} />} title="Nenhum cadastro encontrado" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(s) => (
            <div className="nx-row nx-gap-3">
              <Avatar name={s.name} size="md" />
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{s.name}</span>
                <span className="nx-text-xs nx-text-subtle">{s.role}{s.company ? ` · ${s.company}` : ''}</span>
              </div>
              <Badge tone={s.active ? 'success' : 'neutral'} size="sm">{s.active ? 'Ativo' : 'Inativo'}</Badge>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={selected ? KIND_LABEL[selected.kind] : undefined}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <div className="nx-row nx-gap-3">
              <Avatar name={selected.name} size="xl" />
              <div>
                <p className="nx-semibold" style={{ fontSize: 'var(--text-lg)' }}>{selected.role}</p>
                <p className="nx-text-sm nx-text-muted">{selected.company ?? condominium.shortName}</p>
                <Badge tone={selected.active ? 'success' : 'neutral'} size="sm" className="nx-mt-2">{selected.active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
            </div>
            <DetailList
              columns={2}
              items={[
                { label: 'Documento', value: selected.document },
                { label: 'Telefone', value: selected.phone },
                { label: 'Escala', value: weekdays(selected.workDays) },
                { label: 'Horário', value: `${selected.shiftStart} – ${selected.shiftEnd}` },
                { label: 'Unidade', value: selected.unitId ? unitLabel(selected.unitId) : 'Áreas comuns' },
                { label: 'Admissão', value: formatDate(selected.admittedAt) },
                { label: 'Acesso válido até', value: selected.accessValidUntil ? formatDate(selected.accessValidUntil) : 'Sem prazo' },
              ]}
            />
          </div>
        )}
      </Drawer>
    </>
  );
}
