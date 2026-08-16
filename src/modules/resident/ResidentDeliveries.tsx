import { useMemo, useState } from 'react';
import { Package, PackageCheck, Truck } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { DELIVERY_STATUS_LABEL, deliveriesOfUnit, deliveryTone } from '../../services/deliveries';
import type { Delivery } from '../../data/types';
import {
  Badge, Button, Card, DataTable, DetailList, Drawer, EmptyState, PageHeader, SearchInput,
  StatCard, Tabs, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDateTime, timeAgo } from '../../lib/date';

export function ResidentDeliveries() {
  const { user, dataVersion } = useAuthenticated();
  const unitId = user.unitId!;
  const [tab, setTab] = useState('pendentes');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Delivery | null>(null);

  const all = useMemo(() => deliveriesOfUnit(unitId), [unitId, dataVersion]);
  const pending = all.filter((d) => d.status === 'recebida' || d.status === 'notificada');
  const history = all.filter((d) => d.status === 'retirada' || d.status === 'devolvida');

  const rows = useMemo(() => {
    const base = tab === 'pendentes' ? pending : history;
    const q = term.trim().toLowerCase();
    if (!q) return base;
    return base.filter((d) => [d.carrier, d.trackingCode, d.shelf].some((f) => f.toLowerCase().includes(q)));
  }, [tab, pending, history, term]);

  const columns: Column<Delivery>[] = [
    {
      key: 'carrier',
      header: 'Transportadora',
      render: (d) => <CellStack title={d.carrier} meta={d.trackingCode} />,
    },
    { key: 'size', header: 'Volume', hideOnMobile: true, render: (d) => <Badge tone="neutral" size="sm">{d.size}</Badge> },
    { key: 'shelf', header: 'Prateleira', hideOnMobile: true, render: (d) => <span className="nx-mono">{d.shelf}</span> },
    {
      key: 'received',
      header: 'Recebida em',
      render: (d) => <CellStack title={formatDateTime(d.receivedAt)} meta={`por ${d.receivedBy}`} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (d) => <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Package size={22} />}
        title="Encomendas"
        subtitle="Tudo que chega à portaria para a sua unidade"
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'pendentes', label: 'Aguardando retirada', count: pending.length },
              { id: 'historico', label: 'Histórico', count: history.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto" style={{ marginBottom: 'var(--space-5)' }}>
        <StatCard label="Aguardando retirada" value={pending.length} icon={<Package size={17} />} tone="warning" hint="Disponíveis na portaria" />
        <StatCard label="Retiradas no total" value={history.length} icon={<PackageCheck size={17} />} tone="success" />
        <StatCard
          label="Última chegada"
          value={all[0] ? timeAgo(all[0].receivedAt) : '—'}
          icon={<Truck size={17} />}
          tone="cyan"
          hint={all[0]?.carrier}
        />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por transportadora ou código..." />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(d) => d.id}
          onRowClick={setSelected}
          empty={
            <EmptyState
              icon={<Package size={24} />}
              title={tab === 'pendentes' ? 'Nenhuma encomenda aguardando' : 'Nenhuma retirada registrada'}
              description="Você recebe uma notificação assim que a portaria registrar uma encomenda."
            />
          }
          mobileCard={(d) => (
            <div className="nx-row nx-gap-3">
              <span className="nx-list__icon nx-list__icon--cyan"><Package size={16} /></span>
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{d.carrier}</span>
                <span className="nx-text-xs nx-text-subtle">{d.trackingCode} · prateleira {d.shelf}</span>
              </div>
              <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge>
            </div>
          )}
        />
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.carrier}
        subtitle="Detalhes da encomenda"
        footer={<Button variant="ghost" block onClick={() => setSelected(null)}>Fechar</Button>}
      >
        {selected && (
          <div className="nx-stack nx-gap-5">
            <Badge tone={deliveryTone(selected.status)}>{DELIVERY_STATUS_LABEL[selected.status]}</Badge>
            <DetailList
              columns={2}
              items={[
                { label: 'Código de rastreio', value: <span className="nx-mono">{selected.trackingCode}</span> },
                { label: 'Prateleira', value: selected.shelf },
                { label: 'Volume', value: selected.size },
                { label: 'Assinatura', value: selected.requiresSignature ? 'Obrigatória' : 'Não exigida' },
                { label: 'Recebida em', value: formatDateTime(selected.receivedAt) },
                { label: 'Recebida por', value: selected.receivedBy },
                ...(selected.pickedUpAt ? [
                  { label: 'Retirada em', value: formatDateTime(selected.pickedUpAt) },
                  { label: 'Retirada por', value: selected.pickedUpBy ?? '—' },
                ] : []),
              ]}
            />
            {selected.status !== 'retirada' && (
              <div className="nx-callout">
                <p className="nx-medium">Como retirar</p>
                <p className="nx-text-sm nx-text-muted">
                  Dirija-se à portaria e informe a unidade. A retirada é registrada pelo porteiro
                  e o histórico fica disponível aqui.
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
