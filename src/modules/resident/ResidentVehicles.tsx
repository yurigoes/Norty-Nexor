import { useMemo, useState } from 'react';
import { Car, Plus, ShieldOff, ShieldCheck } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  OWNER_KIND_LABEL, VEHICLE_KIND_LABEL, VehicleError, saveVehicle, toggleVehicleAuthorization,
  vehiclesOfUnit,
} from '../../services/vehicles';
import { accessLogsOfUnit } from '../../services/access';
import { unit as findUnit } from '../../services/directory';
import type { Vehicle } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, EmptyState, Input, Modal, PageHeader, Select, useToast,
} from '../../components/ui';
import { plateMask } from '../../lib/format';
import { formatDateTime } from '../../lib/date';
import { COLORS } from '../../data/seed/random';

export function ResidentVehicles() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const unitId = user.unitId!;
  const unit = findUnit(unitId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('Prata');
  const [kind, setKind] = useState<Vehicle['kind']>('carro');
  const [ownerKind, setOwnerKind] = useState<Vehicle['ownerKind']>('morador');
  const [spot, setSpot] = useState('');

  const vehicles = useMemo(() => vehiclesOfUnit(unitId), [unitId, dataVersion]);
  const plateAccesses = useMemo(
    () => accessLogsOfUnit(unitId).filter((a) => a.plate).slice(0, 6),
    [unitId, dataVersion],
  );

  const openForm = (vehicle?: Vehicle) => {
    setEditing(vehicle ?? null);
    setPlate(vehicle?.plate ?? '');
    setBrand(vehicle?.brand ?? '');
    setModel(vehicle?.model ?? '');
    setColor(vehicle?.color ?? 'Prata');
    setKind(vehicle?.kind ?? 'carro');
    setOwnerKind(vehicle?.ownerKind ?? 'morador');
    setSpot(vehicle?.parkingSpot ?? unit?.parkingSpots[0] ?? '');
    setFormOpen(true);
  };

  const submit = () => {
    try {
      saveVehicle({
        id: editing?.id,
        condominiumId: condominium.id,
        unitId,
        ownerId: user.residentId,
        ownerName: user.name,
        ownerKind,
        plate,
        brand: brand.trim() || 'Não informado',
        model: model.trim() || 'Não informado',
        color,
        kind,
        parkingSpot: spot || undefined,
        actorName: user.name,
      });
      setFormOpen(false);
      toast.success(
        editing ? 'Veículo atualizado' : 'Veículo cadastrado',
        `A placa ${plateMask(plate)} já é reconhecida na entrada da garagem.`,
      );
    } catch (err) {
      toast.error('Não foi possível salvar', err instanceof VehicleError ? err.message : 'Tente novamente.');
    }
  };

  return (
    <>
      <PageHeader
        icon={<Car size={22} />}
        title="Veículos"
        subtitle={`Vagas da unidade: ${unit?.parkingSpots.join(' · ') ?? '—'}`}
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openForm()}>Cadastrar veículo</Button>}
      />

      {vehicles.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<Car size={24} />}
            title="Nenhum veículo cadastrado"
            description="Cadastre a placa para que o veículo seja reconhecido automaticamente na entrada da garagem."
            action={<Button variant="primary" onClick={() => openForm()}>Cadastrar veículo</Button>}
          />
        </Card>
      ) : (
        <div className="nx-grid-auto-lg">
          {vehicles.map((v) => (
            <Card key={v.id} padding="md">
              <div className="nx-vehicle">
                <div className="nx-vehicle__plate">
                  <span>BRASIL</span>
                  <strong>{v.plate}</strong>
                </div>
                <div className="nx-grow">
                  <h3 className="nx-card__title">{v.brand} {v.model}</h3>
                  <p className="nx-text-sm nx-text-muted">
                    {VEHICLE_KIND_LABEL[v.kind]} · {v.color} · vaga {v.parkingSpot ?? '—'}
                  </p>
                </div>
                <Badge tone={v.authorized ? 'success' : 'danger'} size="sm">
                  {v.authorized ? 'Autorizado' : 'Suspenso'}
                </Badge>
              </div>

              <div className="nx-row nx-gap-2 nx-wrap" style={{ marginTop: 'var(--space-4)' }}>
                <Button variant="secondary" size="sm" onClick={() => openForm(v)}>Editar</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={v.authorized ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                  onClick={() => {
                    toggleVehicleAuthorization(v.id, user.name);
                    toast.info(v.authorized ? 'Veículo suspenso' : 'Veículo reativado', `Placa ${v.plate}`);
                  }}
                >
                  {v.authorized ? 'Suspender acesso' : 'Reativar acesso'}
                </Button>
                <span className="nx-text-xs nx-text-subtle" style={{ marginLeft: 'auto' }}>
                  {OWNER_KIND_LABEL[v.ownerKind]}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card padding="md" style={{ marginTop: 'var(--space-5)' }}>
        <CardHeader title="Últimas leituras de placa" subtitle="Registradas automaticamente pela câmera da garagem" />
        {plateAccesses.length === 0 ? (
          <EmptyState compact title="Nenhuma leitura registrada" description="As passagens pela garagem aparecerão aqui." />
        ) : (
          <ul className="nx-list">
            {plateAccesses.map((a) => (
              <li key={a.id} className="nx-list__item">
                <span className="nx-list__icon"><Car size={16} /></span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium nx-mono">{a.plate}</span>
                  <span className="nx-text-xs nx-text-subtle">{a.subjectName} · {a.gateName}</span>
                </span>
                <span className="nx-stack" style={{ alignItems: 'flex-end' }}>
                  <span className="nx-text-xs nx-text-muted">{formatDateTime(a.at)}</span>
                  <Badge tone={a.direction === 'entrada' ? 'success' : 'neutral'} size="sm">
                    {a.direction === 'entrada' ? 'Entrada' : 'Saída'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar veículo' : 'Cadastrar veículo'}
        subtitle="A placa é usada no reconhecimento automático da garagem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit}>{editing ? 'Salvar' : 'Cadastrar'}</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input
            label="Placa"
            value={plate}
            onChange={(e) => setPlate(plateMask(e.target.value))}
            placeholder="ABC1D23"
            hint="Padrão Mercosul, 7 caracteres."
            autoFocus
            required
          />
          <div className="nx-grid-2">
            <Input label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Toyota" />
            <Input label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex.: Corolla Cross" />
          </div>
          <div className="nx-grid-3">
            <Select
              label="Cor"
              options={COLORS.map((c) => ({ value: c, label: c }))}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <Select
              label="Tipo"
              options={Object.entries(VEHICLE_KIND_LABEL).map(([value, label]) => ({ value, label }))}
              value={kind}
              onChange={(e) => setKind(e.target.value as Vehicle['kind'])}
            />
            <Select
              label="Vínculo"
              options={Object.entries(OWNER_KIND_LABEL).map(([value, label]) => ({ value, label }))}
              value={ownerKind}
              onChange={(e) => setOwnerKind(e.target.value as Vehicle['ownerKind'])}
            />
          </div>
          <Select
            label="Vaga"
            options={(unit?.parkingSpots ?? []).map((s) => ({ value: s, label: s }))}
            placeholder="Sem vaga vinculada"
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
