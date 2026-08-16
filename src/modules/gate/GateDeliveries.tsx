import { useMemo, useState } from 'react';
import { Package, PackageCheck, Plus } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  DELIVERY_STATUS_LABEL, deliveries, deliveryTone, pickUpDelivery, receiveDelivery,
} from '../../services/deliveries';
import { residentsOfUnit, unitLabel, units } from '../../services/directory';
import type { Delivery } from '../../data/types';
import {
  Badge, Button, Card, DataTable, EmptyState, Input, Modal, PageHeader, SearchInput, Select,
  StatCard, Switch, Tabs, Textarea, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDateTime, isoDate, timeAgo } from '../../lib/date';
import { CARRIERS } from '../../data/seed/random';

const SHELVES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'D1', 'D2'];

export function GateDeliveries() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const today = isoDate(new Date());

  const [tab, setTab] = useState('pendentes');
  const [term, setTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [pickup, setPickup] = useState<Delivery | null>(null);
  const [pickupBy, setPickupBy] = useState('');

  const [unitQuery, setUnitQuery] = useState('');
  const [unitId, setUnitId] = useState('');
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [tracking, setTracking] = useState('');
  const [size, setSize] = useState<Delivery['size']>('media');
  const [shelf, setShelf] = useState('A1');
  const [signature, setSignature] = useState(false);
  const [notes, setNotes] = useState('');

  const all = useMemo(() => deliveries(condominium.id), [condominium.id, dataVersion]);
  const pending = all.filter((d) => d.status === 'recebida' || d.status === 'notificada');
  const pickedToday = all.filter((d) => d.pickedUpAt?.slice(0, 10) === today);

  const unitOptions = useMemo(() => {
    const list = units(condominium.id);
    const q = unitQuery.trim().toLowerCase();
    return (q ? list.filter((u) => `${u.block}${u.label}`.toLowerCase().includes(q) || u.label.includes(q)) : list)
      .slice(0, 40)
      .map((u) => ({ value: u.id, label: `Torre ${u.block} · Apto ${u.label} — ${u.ownerName}` }));
  }, [condominium.id, unitQuery, dataVersion]);

  const rows = useMemo(() => {
    const base = tab === 'pendentes' ? pending : all;
    const q = term.trim().toLowerCase();
    if (!q) return base.slice(0, 200);
    return base.filter((d) =>
      [d.carrier, d.trackingCode, d.shelf, unitLabel(d.unitId)].some((f) => f.toLowerCase().includes(q))).slice(0, 200);
  }, [tab, pending, all, term]);

  const submit = () => {
    if (!unitId) { toast.error('Selecione a unidade'); return; }
    receiveDelivery({
      condominiumId: condominium.id,
      unitId,
      carrier,
      trackingCode: tracking.trim() || `SEM-CODIGO-${Date.now().toString().slice(-5)}`,
      size,
      shelf,
      requiresSignature: signature,
      notes: notes.trim() || undefined,
      receivedBy: user.name,
    });
    setFormOpen(false);
    setUnitId(''); setUnitQuery(''); setTracking(''); setNotes(''); setSignature(false);
    setTab('pendentes');
    toast.success('Encomenda registrada', 'O morador foi notificado automaticamente.');
  };

  const columns: Column<Delivery>[] = [
    { key: 'unit', header: 'Unidade', render: (d) => <CellStack title={unitLabel(d.unitId)} meta={`Prateleira ${d.shelf}`} /> },
    { key: 'carrier', header: 'Transportadora', render: (d) => <CellStack title={d.carrier} meta={d.trackingCode} /> },
    { key: 'received', header: 'Recebida', hideOnMobile: true, render: (d) => <CellStack title={timeAgo(d.receivedAt)} meta={d.receivedBy} /> },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '170px',
      render: (d) => (
        d.status === 'retirada' || d.status === 'devolvida'
          ? <span className="nx-text-xs nx-text-subtle">{d.pickedUpAt ? formatDateTime(d.pickedUpAt) : '—'}</span>
          : (
            <Button
              variant="primary"
              size="sm"
              icon={<PackageCheck size={15} />}
              onClick={() => { setPickup(d); setPickupBy(residentsOfUnit(d.unitId)[0]?.name ?? ''); }}
            >
              Registrar retirada
            </Button>
          )
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Package size={22} />}
        title="Encomendas"
        subtitle="Recebimento e retirada na portaria"
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setFormOpen(true)}>Nova encomenda</Button>}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'pendentes', label: 'Aguardando retirada', count: pending.length },
              { id: 'todas', label: 'Todas', count: all.length },
            ]}
          />
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Na portaria" value={pending.length} icon={<Package size={17} />} tone="warning" />
        <StatCard label="Retiradas hoje" value={pickedToday.length} icon={<PackageCheck size={17} />} tone="success" />
        <StatCard label="Recebidas hoje" value={all.filter((d) => d.receivedAt.slice(0, 10) === today).length} icon={<Package size={17} />} tone="cyan" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por unidade, transportadora ou código..." size="lg" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(d) => d.id}
          empty={<EmptyState icon={<Package size={24} />} title="Nenhuma encomenda" description="Registre a chegada de encomendas para notificar os moradores." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Nova encomenda</Button>} />}
          mobileCard={(d) => (
            <div className="nx-stack nx-gap-3">
              <div className="nx-row nx-gap-3">
                <span className="nx-list__icon nx-list__icon--cyan"><Package size={16} /></span>
                <div className="nx-stack nx-grow">
                  <span className="nx-medium">{unitLabel(d.unitId)}</span>
                  <span className="nx-text-xs nx-text-subtle">{d.carrier} · prateleira {d.shelf}</span>
                </div>
                <Badge tone={deliveryTone(d.status)} size="sm">{DELIVERY_STATUS_LABEL[d.status]}</Badge>
              </div>
              {(d.status === 'recebida' || d.status === 'notificada') && (
                <Button variant="primary" size="sm" block onClick={() => { setPickup(d); setPickupBy(residentsOfUnit(d.unitId)[0]?.name ?? ''); }}>
                  Registrar retirada
                </Button>
              )}
            </div>
          )}
        />
      </Card>

      {/* ---------- Nova encomenda ---------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nova encomenda"
        subtitle="O morador recebe a notificação imediatamente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit}>Registrar encomenda</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input
            label="Buscar unidade"
            value={unitQuery}
            onChange={(e) => setUnitQuery(e.target.value)}
            placeholder="Ex.: 1204 ou A1204"
            autoFocus
          />
          <Select
            label="Unidade"
            options={unitOptions}
            placeholder="Selecione a unidade"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            required
          />
          <div className="nx-grid-2">
            <Select label="Transportadora" options={CARRIERS.map((c) => ({ value: c, label: c }))} value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            <Input label="Código de rastreio" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex.: ML123456" />
          </div>
          <div className="nx-grid-2">
            <Select
              label="Volume"
              options={[{ value: 'pequena', label: 'Pequena' }, { value: 'media', label: 'Média' }, { value: 'grande', label: 'Grande' }]}
              value={size}
              onChange={(e) => setSize(e.target.value as Delivery['size'])}
            />
            <Select label="Prateleira" options={SHELVES.map((s) => ({ value: s, label: s }))} value={shelf} onChange={(e) => setShelf(e.target.value)} />
          </div>
          <Textarea label="Observações" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Switch checked={signature} onChange={setSignature} label="Exige assinatura na retirada" />
        </div>
      </Modal>

      {/* ---------- Retirada ---------- */}
      <Modal
        open={pickup !== null}
        onClose={() => setPickup(null)}
        title="Registrar retirada"
        subtitle={pickup ? `${pickup.carrier} · ${unitLabel(pickup.unitId)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPickup(null)}>Cancelar</Button>
            <Button
              variant="success"
              icon={<PackageCheck size={16} />}
              disabled={pickupBy.trim().length < 3}
              onClick={() => {
                if (!pickup) return;
                pickUpDelivery(pickup.id, pickupBy.trim(), user.name);
                setPickup(null);
                toast.success('Retirada registrada', `${pickup.carrier} entregue a ${pickupBy}.`);
              }}
            >
              Confirmar retirada
            </Button>
          </>
        }
      >
        {pickup && (
          <div className="nx-stack nx-gap-4">
            <div className="nx-callout">
              <p className="nx-medium">{pickup.carrier} · {pickup.trackingCode}</p>
              <p className="nx-text-sm nx-text-muted">
                Prateleira {pickup.shelf} · recebida em {formatDateTime(pickup.receivedAt)}
                {pickup.requiresSignature && ' · exige assinatura'}
              </p>
            </div>
            <Select
              label="Retirada por"
              options={residentsOfUnit(pickup.unitId).map((r) => ({ value: r.name, label: `${r.name} — ${r.type}` }))}
              placeholder="Selecione o morador"
              value={pickupBy}
              onChange={(e) => setPickupBy(e.target.value)}
            />
            <Input label="Ou informe outro nome" value={pickupBy} onChange={(e) => setPickupBy(e.target.value)} placeholder="Nome de quem está retirando" />
          </div>
        )}
      </Modal>
    </>
  );
}
