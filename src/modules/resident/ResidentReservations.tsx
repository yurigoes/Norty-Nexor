import { useMemo, useState } from 'react';
import { CalendarDays, Check, Clock, Info, Users, X } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  RESERVATION_STATUS_LABEL, areaName, availability, cancelReservation, commonAreas,
  createReservation, monthAvailability, reservationTone, reservationsOfUnit, ReservationError,
} from '../../services/reservations';
import type { CommonArea, Reservation } from '../../data/types';
import {
  Badge, Button, Calendar, Card, CardHeader, ConfirmDialog, EmptyState, Input, Modal,
  PageHeader, Tabs, Textarea, useToast,
} from '../../components/ui';
import { currency } from '../../lib/format';
import { formatDate, formatLongDate, isoDate, startOfMonth } from '../../lib/date';
import './reservations.css';

export function ResidentReservations() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const unitId = user.unitId!;
  const today = isoDate(new Date());

  const areas = useMemo(() => commonAreas(condominium.id), [condominium.id, dataVersion]);
  const mine = useMemo(() => reservationsOfUnit(unitId), [unitId, dataVersion]);

  const [tab, setTab] = useState('nova');
  const [selectedArea, setSelectedArea] = useState<CommonArea | null>(null);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState('');
  const [guests, setGuests] = useState('10');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);

  const slots = selectedArea ? availability(selectedArea.id, date) : [];
  const monthMeta = selectedArea ? monthAvailability(selectedArea.id, startOfMonth(date)) : {};

  const upcoming = mine
    .filter((r) => r.date >= today && r.status !== 'cancelada' && r.status !== 'concluida')
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = mine.filter((r) => r.date < today || r.status === 'cancelada' || r.status === 'concluida');

  const openArea = (area: CommonArea) => {
    setSelectedArea(area);
    setDate(today);
    setSlot('');
    setGuests(String(Math.min(10, area.capacity)));
    setNotes('');
  };

  const confirm = () => {
    if (!selectedArea || !slot) return;
    try {
      const created = createReservation({
        condominiumId: condominium.id,
        areaId: selectedArea.id,
        unitId,
        residentId: user.residentId ?? 'res-demo-carlos',
        residentName: user.name,
        date,
        slot,
        guests: Number(guests) || 1,
        notes: notes.trim() || undefined,
      });
      setConfirmOpen(false);
      setSelectedArea(null);
      setTab('minhas');
      toast.success(
        created.status === 'confirmada' ? 'Reserva confirmada' : 'Reserva enviada',
        created.status === 'confirmada'
          ? `${areaName(created.areaId)} · ${formatDate(created.date)} · ${created.slot}`
          : 'A administração vai analisar sua solicitação.',
      );
    } catch (err) {
      toast.error('Não foi possível reservar', err instanceof ReservationError ? err.message : 'Tente novamente.');
    }
  };

  return (
    <>
      <PageHeader
        icon={<CalendarDays size={22} />}
        title="Reservas"
        subtitle="Áreas comuns do Residencial Parque Central"
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'nova', label: 'Reservar área' },
              { id: 'minhas', label: 'Minhas reservas', count: upcoming.length },
              { id: 'historico', label: 'Histórico', count: past.length },
            ]}
          />
        }
      />

      {tab === 'nova' && (
        <div className="nx-areas">
          {areas.map((area) => (
            <Card key={area.id} padding="md" interactive onClick={() => openArea(area)}>
              <div className={`nx-area__cover nx-area__cover--${area.kind}`}>
                <span className="nx-area__badge">{area.autoApprove ? 'Aprovação automática' : 'Sujeita a aprovação'}</span>
              </div>
              <h3 className="nx-card__title" style={{ marginTop: 'var(--space-4)' }}>{area.name}</h3>
              <div className="nx-row nx-gap-3 nx-wrap nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-2)' }}>
                <span className="nx-row nx-gap-1"><Users size={14} /> {area.capacity} pessoas</span>
                <span className="nx-row nx-gap-1"><Clock size={14} /> {area.slots.length} horários</span>
              </div>
              <div className="nx-row nx-between" style={{ marginTop: 'var(--space-4)' }}>
                <strong className="nx-text-lg">{area.fee ? currency(area.fee) : 'Sem taxa'}</strong>
                <Button variant="outline" size="sm">Reservar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'minhas' && (
        <ReservationList
          reservations={upcoming}
          onCancel={setCancelling}
          empty="Você não possui reservas futuras."
        />
      )}

      {tab === 'historico' && (
        <ReservationList reservations={past} empty="Nenhuma reserva anterior registrada." />
      )}

      {/* ---------- Seleção de data e horário ---------- */}
      <Modal
        open={selectedArea !== null}
        onClose={() => setSelectedArea(null)}
        title={selectedArea?.name}
        subtitle={selectedArea ? `Capacidade de ${selectedArea.capacity} pessoas · ${selectedArea.fee ? currency(selectedArea.fee) : 'sem taxa'}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelectedArea(null)}>Cancelar</Button>
            <Button variant="primary" disabled={!slot} onClick={() => setConfirmOpen(true)}>Continuar</Button>
          </>
        }
      >
        {selectedArea && (
          <div className="nx-reserve">
            <div>
              <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-3)' }}>1. Escolha a data</p>
              <Calendar value={date} onChange={(d) => { setDate(d); setSlot(''); }} minDate={today} meta={monthMeta} />
              <div className="nx-legend">
                <span><i className="is-free" /> Livre</span>
                <span><i className="is-partial" /> Parcial</span>
                <span><i className="is-full" /> Lotado</span>
              </div>
            </div>

            <div className="nx-stack nx-gap-5">
              <div>
                <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-3)' }}>2. Escolha o horário</p>
                <p className="nx-text-sm nx-text-muted" style={{ marginBottom: 'var(--space-3)' }}>{formatLongDate(date)}</p>
                <div className="nx-slots">
                  {slots.map((s) => (
                    <button
                      key={s.slot}
                      className={`nx-slot ${slot === s.slot ? 'is-selected' : ''} ${s.available ? '' : 'is-taken'}`}
                      disabled={!s.available}
                      onClick={() => setSlot(s.slot)}
                    >
                      <span>{s.slot}</span>
                      <span className="nx-slot__status">{s.available ? 'Disponível' : 'Reservado'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label="Número de convidados"
                type="number"
                min={1}
                max={selectedArea.capacity}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                hint={`Capacidade máxima: ${selectedArea.capacity} pessoas`}
              />

              <Textarea label="Observações (opcional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div className="nx-rules">
                <p className="nx-row nx-gap-2 nx-medium"><Info size={15} /> Regras da área</p>
                <ul>
                  {selectedArea.rules.map((rule) => <li key={rule}>{rule}</li>)}
                  {selectedArea.deposit > 0 && <li>Caução de {currency(selectedArea.deposit)}, devolvida após vistoria.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Confirmação ---------- */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar reserva"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Voltar</Button>
            <Button variant="brand" icon={<Check size={16} />} onClick={confirm}>Confirmar reserva</Button>
          </>
        }
      >
        {selectedArea && (
          <div className="nx-stack nx-gap-3">
            <div className="nx-confirm-row"><span>Área</span><strong>{selectedArea.name}</strong></div>
            <div className="nx-confirm-row"><span>Data</span><strong>{formatDate(date)}</strong></div>
            <div className="nx-confirm-row"><span>Horário</span><strong>{slot}</strong></div>
            <div className="nx-confirm-row"><span>Convidados</span><strong>{guests}</strong></div>
            <div className="nx-confirm-row"><span>Taxa</span><strong>{selectedArea.fee ? currency(selectedArea.fee) : 'Isenta'}</strong></div>
            {selectedArea.deposit > 0 && (
              <div className="nx-confirm-row"><span>Caução</span><strong>{currency(selectedArea.deposit)}</strong></div>
            )}
            <p className="nx-text-xs nx-text-subtle">
              {selectedArea.autoApprove
                ? 'Esta área tem aprovação automática: a reserva é confirmada imediatamente.'
                : 'Esta área exige aprovação da administração. Você será notificado quando houver decisão.'}
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancelReservation(cancelling.id, user.name);
          toast.info('Reserva cancelada', `${areaName(cancelling.areaId)} · ${formatDate(cancelling.date)}`);
        }}
        title="Cancelar reserva"
        message="Deseja realmente cancelar esta reserva? O horário será liberado para outros moradores."
        confirmLabel="Cancelar reserva"
      />
    </>
  );
}

function ReservationList({
  reservations, onCancel, empty,
}: {
  reservations: Reservation[];
  onCancel?: (r: Reservation) => void;
  empty: string;
}) {
  if (reservations.length === 0) {
    return <Card padding="md"><EmptyState icon={<CalendarDays size={24} />} title={empty} description="As reservas aparecem aqui após a confirmação." /></Card>;
  }
  return (
    <div className="nx-grid-auto-lg">
      {reservations.map((r) => (
        <Card key={r.id} padding="md">
          <CardHeader
            title={areaName(r.areaId)}
            subtitle={`${formatDate(r.date)} · ${r.slot}`}
            action={<Badge tone={reservationTone(r.status)} size="sm">{RESERVATION_STATUS_LABEL[r.status]}</Badge>}
          />
          <div className="nx-row nx-between nx-wrap nx-gap-3">
            <div className="nx-row nx-gap-4 nx-text-sm nx-text-muted">
              <span className="nx-row nx-gap-1"><Users size={14} /> {r.guests} pessoas</span>
              <span>{r.fee ? currency(r.fee) : 'Sem taxa'}</span>
            </div>
            {onCancel && (r.status === 'confirmada' || r.status === 'pendente') && (
              <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={() => onCancel(r)}>Cancelar</Button>
            )}
          </div>
          {r.notes && <p className="nx-text-sm nx-text-muted" style={{ marginTop: 'var(--space-3)' }}>{r.notes}</p>}
        </Card>
      ))}
    </div>
  );
}
