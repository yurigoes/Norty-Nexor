import { useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, PlayCircle, CheckCircle2 } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  MAINTENANCE_STATUS_LABEL, RECURRENCE_LABEL, advanceMaintenance, maintenanceOrders,
  maintenanceTone,
} from '../../services/maintenance';
import type { MaintenanceOrder } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, PageHeader, SearchInput, Select, StatCard,
  useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { currency, number } from '../../lib/format';
import { daysUntil, formatDate } from '../../lib/date';

export function ManagementMaintenance() {
  const { user, condominium, can, dataVersion } = useAuthenticated();
  const toast = useToast();
  const canManage = can('maintenance.manage');

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');

  const all = useMemo(() => maintenanceOrders(condominium.id), [condominium.id, dataVersion]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((m) =>
      (!q || [m.asset, m.description, m.supplier].some((f) => f.toLowerCase().includes(q)))
      && (!status || m.status === status));
  }, [all, term, status]);

  const columns: Column<MaintenanceOrder>[] = [
    { key: 'asset', header: 'Ativo', render: (m) => <CellStack title={m.asset} meta={m.description} /> },
    { key: 'supplier', header: 'Fornecedor', hideOnMobile: true, render: (m) => m.supplier },
    {
      key: 'scheduled',
      header: 'Agendada para',
      render: (m) => {
        const days = daysUntil(m.scheduledFor);
        return (
          <CellStack
            title={formatDate(m.scheduledFor)}
            meta={days === 0 ? 'Hoje' : days > 0 ? `em ${days} dias` : `há ${Math.abs(days)} dias`}
          />
        );
      },
    },
    { key: 'recurrence', header: 'Recorrência', hideOnMobile: true, render: (m) => <Badge tone="neutral" size="sm">{RECURRENCE_LABEL[m.recurrence]}</Badge> },
    { key: 'cost', header: 'Custo', hideOnMobile: true, render: (m) => currency(m.cost) },
    { key: 'status', header: 'Status', render: (m) => <Badge tone={maintenanceTone(m.status)} size="sm">{MAINTENANCE_STATUS_LABEL[m.status]}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '190px',
      render: (m) => (
        canManage && m.status !== 'concluida' ? (
          <span className="nx-row nx-gap-2 nx-end">
            {m.status !== 'em_execucao' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<PlayCircle size={15} />}
                onClick={() => { advanceMaintenance(m.id, 'em_execucao', user.name); toast.info('Manutenção iniciada', m.asset); }}
              >
                Iniciar
              </Button>
            )}
            <Button
              variant="success"
              size="sm"
              icon={<CheckCircle2 size={15} />}
              onClick={() => { advanceMaintenance(m.id, 'concluida', user.name); toast.success('Manutenção concluída', m.asset); }}
            >
              Concluir
            </Button>
          </span>
        ) : null
      ),
    },
  ];

  const totalCost = all.reduce((s, m) => s + m.cost, 0);

  return (
    <>
      <PageHeader
        icon={<ClipboardList size={22} />}
        title="Manutenção"
        subtitle="Plano preventivo e corretivo dos ativos do condomínio"
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Ordens ativas" value={number(all.filter((m) => m.status !== 'concluida').length)} icon={<ClipboardList size={17} />} tone="brand" />
        <StatCard label="Em execução" value={number(all.filter((m) => m.status === 'em_execucao').length)} icon={<PlayCircle size={17} />} tone="cyan" />
        <StatCard label="Atrasadas" value={number(all.filter((m) => m.status === 'atrasada').length)} icon={<CalendarClock size={17} />} tone="danger" />
        <StatCard label="Custo planejado" value={currency(totalCost)} icon={<ClipboardList size={17} />} tone="neutral" hint="Ciclo completo" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por ativo, serviço ou fornecedor..." />
          <Select
            options={Object.entries(MAINTENANCE_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          keyOf={(m) => m.id}
          empty={<EmptyState icon={<ClipboardList size={24} />} title="Nenhuma ordem encontrada" description="Ajuste os filtros para ampliar a busca." />}
          mobileCard={(m) => (
            <div className="nx-stack nx-gap-2">
              <div className="nx-row nx-between nx-gap-2">
                <span className="nx-medium">{m.asset}</span>
                <Badge tone={maintenanceTone(m.status)} size="sm">{MAINTENANCE_STATUS_LABEL[m.status]}</Badge>
              </div>
              <span className="nx-text-xs nx-text-subtle">{m.supplier} · {formatDate(m.scheduledFor)} · {currency(m.cost)}</span>
            </div>
          )}
        />
      </Card>
    </>
  );
}
