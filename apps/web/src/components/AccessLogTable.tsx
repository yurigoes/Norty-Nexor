import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, DoorOpen } from 'lucide-react';
import { METHOD_LABEL, SUBJECT_LABEL, accessLogs, gates } from '../services/access';
import { unitLabel } from '../services/directory';
import type { AccessLog } from '../data/types';
import { Badge, Card, DataTable, EmptyState, Input, Pagination, SearchInput, Select, type Column } from './ui';
import { CellStack, FilterBar } from './PageBits';
import { formatDate, formatTime, isoDate } from '../lib/date';

const PAGE_SIZE = 20;

/** Histórico de acessos compartilhado entre portaria e gestão. */
export function AccessLogTable({ condominiumId, dataVersion }: { condominiumId: string; dataVersion: number }) {
  const [term, setTerm] = useState('');
  const [type, setType] = useState('');
  const [direction, setDirection] = useState('');
  const [gateId, setGateId] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);

  const logs = useMemo(() => accessLogs(condominiumId), [condominiumId, dataVersion]);
  const gateList = useMemo(() => gates(condominiumId), [condominiumId, dataVersion]);
  const today = isoDate(new Date());

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return logs.filter((l) =>
      (!q || [l.subjectName, l.plate ?? '', l.gateName, l.registeredBy].some((f) => f.toLowerCase().includes(q)))
      && (!type || l.subjectType === type)
      && (!direction || l.direction === direction)
      && (!gateId || l.gateId === gateId)
      && (!date || l.at.slice(0, 10) === date));
  }, [logs, term, type, direction, gateId, date]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reset = () => setPage(1);

  const columns: Column<AccessLog>[] = [
    {
      key: 'time',
      header: 'Horário',
      width: '124px',
      render: (l) => (
        <CellStack
          title={<span className="nx-mono">{formatTime(l.at)}</span>}
          meta={l.at.slice(0, 10) === today ? 'Hoje' : formatDate(l.at.slice(0, 10))}
        />
      ),
    },
    { key: 'subject', header: 'Pessoa / veículo', render: (l) => <CellStack title={l.subjectName} meta={l.plate ? `Placa ${l.plate}` : SUBJECT_LABEL[l.subjectType]} /> },
    { key: 'type', header: 'Tipo', hideOnMobile: true, render: (l) => <Badge tone="neutral" size="sm">{SUBJECT_LABEL[l.subjectType]}</Badge> },
    { key: 'unit', header: 'Unidade', hideOnMobile: true, render: (l) => (l.unitId ? unitLabel(l.unitId) : '—') },
    { key: 'gate', header: 'Portaria', hideOnMobile: true, render: (l) => <CellStack title={l.gateName} meta={METHOD_LABEL[l.method]} /> },
    { key: 'by', header: 'Registrado por', hideOnMobile: true, render: (l) => <span className="nx-text-sm nx-text-muted">{l.registeredBy}</span> },
    {
      key: 'direction',
      header: 'Movimento',
      align: 'right',
      render: (l) => (
        <Badge tone={l.direction === 'entrada' ? 'success' : 'neutral'} size="sm" icon={l.direction === 'entrada' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}>
          {l.direction === 'entrada' ? 'Entrada' : 'Saída'}
        </Badge>
      ),
    },
  ];

  return (
    <Card padding="none">
      <FilterBar>
        <SearchInput value={term} onChange={(v) => { setTerm(v); reset(); }} placeholder="Buscar por nome, placa ou responsável..." />
        <Select
          options={Object.entries(SUBJECT_LABEL).map(([value, label]) => ({ value, label }))}
          placeholder="Todos os tipos"
          value={type}
          onChange={(e) => { setType(e.target.value); reset(); }}
          selectSize="sm"
        />
        <Select
          options={[{ value: 'entrada', label: 'Entradas' }, { value: 'saida', label: 'Saídas' }]}
          placeholder="Entradas e saídas"
          value={direction}
          onChange={(e) => { setDirection(e.target.value); reset(); }}
          selectSize="sm"
        />
        <Select
          options={gateList.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="Todas as portarias"
          value={gateId}
          onChange={(e) => { setGateId(e.target.value); reset(); }}
          selectSize="sm"
        />
        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); reset(); }} inputSize="sm" />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={paged}
        keyOf={(l) => l.id}
        dense
        empty={<EmptyState icon={<DoorOpen size={24} />} title="Nenhum acesso encontrado" description="Ajuste os filtros para ampliar o período consultado." />}
        mobileCard={(l) => (
          <div className="nx-row nx-gap-3">
            <span className={`nx-list__icon ${l.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}><DoorOpen size={16} /></span>
            <div className="nx-stack nx-grow nx-gap-1">
              <span className="nx-medium">{l.subjectName}</span>
              <span className="nx-text-xs nx-text-subtle">{l.unitId ? unitLabel(l.unitId) : l.gateName} · {METHOD_LABEL[l.method]}</span>
            </div>
            <div className="nx-stack" style={{ alignItems: 'flex-end' }}>
              <span className="nx-mono nx-text-sm">{formatTime(l.at)}</span>
              <span className="nx-text-2xs nx-text-subtle">{l.direction === 'entrada' ? 'Entrada' : 'Saída'}</span>
            </div>
          </div>
        )}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
    </Card>
  );
}
