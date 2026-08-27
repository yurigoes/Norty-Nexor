import { useMemo, useState } from 'react';
import { UserCheck, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  AUTHORIZATION_LABEL, VISITOR_STATUS_LABEL, statusTone, visitorsOfCondominium,
} from '../../services/visitors';
import { unitLabel } from '../../services/directory';
import type { Visitor } from '../../data/types';
import {
  Avatar, Badge, Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput, Select,
  StatCard, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDate, formatDateTime, isoDate } from '../../lib/date';
import { number } from '../../lib/format';

const PAGE_SIZE = 20;

export function ManagementVisitors() {
  const { condominium, dataVersion } = useAuthenticated();
  const today = isoDate(new Date());
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => visitorsOfCondominium(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((v) =>
      (!q || [v.name, v.document, v.code, v.createdBy, v.companyName ?? ''].some((f) => f.toLowerCase().includes(q)))
      && (!status || v.status === status)
      && (!kind || v.kind === kind));
  }, [all, term, status, kind]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<Visitor>[] = [
    {
      key: 'name',
      header: 'Visitante',
      render: (v) => (
        <span className="nx-row nx-gap-3">
          <Avatar name={v.name} size="sm" />
          <CellStack title={v.name} meta={v.companyName ?? v.document} />
        </span>
      ),
    },
    { key: 'unit', header: 'Unidade', render: (v) => unitLabel(v.unitId) },
    { key: 'kind', header: 'Autorização', hideOnMobile: true, render: (v) => <Badge tone="brand" size="sm">{AUTHORIZATION_LABEL[v.kind]}</Badge> },
    { key: 'expected', header: 'Previsto', hideOnMobile: true, render: (v) => <CellStack title={v.expectedDate === today ? 'Hoje' : formatDate(v.expectedDate)} meta={v.expectedTime} /> },
    { key: 'author', header: 'Autorizado por', hideOnMobile: true, render: (v) => <span className="nx-text-sm nx-text-muted">{v.createdBy}</span> },
    { key: 'checkin', header: 'Entrada', hideOnMobile: true, render: (v) => (v.checkInAt ? formatDateTime(v.checkInAt) : '—') },
    { key: 'status', header: 'Status', align: 'right', render: (v) => <Badge tone={statusTone(v.status)} size="sm">{VISITOR_STATUS_LABEL[v.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<UserCheck size={22} />}
        title="Visitantes"
        subtitle="Todas as autorizações emitidas pelos moradores do condomínio"
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Esperados hoje" value={number(all.filter((v) => v.expectedDate === today && v.status === 'aguardando').length)} icon={<UserCheck size={17} />} tone="gold" />
        <StatCard label="No condomínio" value={number(all.filter((v) => v.status === 'no_local').length)} icon={<Users size={17} />} tone="success" />
        <StatCard label="Autorizações recorrentes" value={number(all.filter((v) => v.kind === 'recorrente' || v.kind === 'permanente').length)} icon={<UserCheck size={17} />} tone="brand" />
        <StatCard label="Revogadas / recusadas" value={number(all.filter((v) => v.status === 'revogado' || v.status === 'recusado').length)} icon={<UserCheck size={17} />} tone="warning" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por nome, documento, código ou autorizador..." />
          <Select
            options={Object.entries(VISITOR_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            selectSize="sm"
          />
          <Select
            options={Object.entries(AUTHORIZATION_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os tipos"
            value={kind}
            onChange={(e) => { setKind(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(v) => v.id}
          empty={<EmptyState icon={<UserCheck size={24} />} title="Nenhum visitante encontrado" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(v) => (
            <div className="nx-row nx-gap-3">
              <Avatar name={v.name} size="md" />
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{v.name}</span>
                <span className="nx-text-xs nx-text-subtle">{unitLabel(v.unitId)} · {formatDate(v.expectedDate)}</span>
              </div>
              <Badge tone={statusTone(v.status)} size="sm">{VISITOR_STATUS_LABEL[v.status]}</Badge>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </>
  );
}
