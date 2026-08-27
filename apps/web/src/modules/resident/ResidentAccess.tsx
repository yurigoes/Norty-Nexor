import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, DoorOpen } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { METHOD_LABEL, SUBJECT_LABEL, accessLogsOfUnit } from '../../services/access';
import { unitLabel } from '../../services/directory';
import type { AccessLog } from '../../data/types';
import {
  Badge, Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput, Select,
  type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDate, formatTime, isoDate } from '../../lib/date';

const PAGE_SIZE = 15;

export function ResidentAccess() {
  const { user, dataVersion } = useAuthenticated();
  const unitId = user.unitId!;
  const [term, setTerm] = useState('');
  const [type, setType] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);

  const logs = useMemo(() => accessLogsOfUnit(unitId), [unitId, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return logs.filter((l) =>
      (!q || [l.subjectName, l.plate ?? '', l.gateName].some((f) => f.toLowerCase().includes(q)))
      && (!type || l.subjectType === type)
      && (!direction || l.direction === direction));
  }, [logs, term, type, direction]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const today = isoDate(new Date());

  const columns: Column<AccessLog>[] = [
    {
      key: 'time',
      header: 'Horário',
      width: '120px',
      render: (l) => (
        <CellStack
          title={<span className="nx-mono">{formatTime(l.at)}</span>}
          meta={l.at.slice(0, 10) === today ? 'Hoje' : formatDate(l.at.slice(0, 10))}
        />
      ),
    },
    {
      key: 'subject',
      header: 'Pessoa / veículo',
      render: (l) => <CellStack title={l.subjectName} meta={l.plate ? `Placa ${l.plate}` : SUBJECT_LABEL[l.subjectType]} />,
    },
    { key: 'type', header: 'Tipo', hideOnMobile: true, render: (l) => <Badge tone="neutral" size="sm">{SUBJECT_LABEL[l.subjectType]}</Badge> },
    { key: 'gate', header: 'Local', hideOnMobile: true, render: (l) => <CellStack title={l.gateName} meta={METHOD_LABEL[l.method]} /> },
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
    <>
      <PageHeader
        icon={<DoorOpen size={22} />}
        title="Acessos"
        subtitle={`Histórico completo de entradas e saídas de ${unitLabel(unitId)}`}
      />

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por nome, placa ou portaria..." />
          <Select
            options={[
              { value: 'morador', label: 'Moradores' },
              { value: 'visitante', label: 'Visitantes' },
              { value: 'veiculo', label: 'Veículos' },
              { value: 'funcionario', label: 'Funcionários' },
              { value: 'prestador', label: 'Prestadores' },
              { value: 'entrega', label: 'Entregas' },
            ]}
            placeholder="Todos os tipos"
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            selectSize="sm"
          />
          <Select
            options={[{ value: 'entrada', label: 'Entradas' }, { value: 'saida', label: 'Saídas' }]}
            placeholder="Entradas e saídas"
            value={direction}
            onChange={(e) => { setDirection(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(l) => l.id}
          empty={<EmptyState icon={<DoorOpen size={24} />} title="Nenhum acesso registrado" description="Os acessos da sua unidade aparecerão aqui automaticamente." />}
          mobileCard={(l) => (
            <div className="nx-row nx-gap-3">
              <span className={`nx-list__icon ${l.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}><DoorOpen size={16} /></span>
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{l.subjectName}</span>
                <span className="nx-text-xs nx-text-subtle">{l.gateName} · {METHOD_LABEL[l.method]}</span>
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
    </>
  );
}
