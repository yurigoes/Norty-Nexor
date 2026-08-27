import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, Copy, PartyPopper, QrCode, Share2, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  AUTHORIZATION_LABEL, VISITOR_STATUS_LABEL, addGuest, createEvent, createVisitor,
  eventsOfUnit, guestsOfEvent, revokeVisitor, statusTone, visitorsOfUnit,
} from '../../services/visitors';
import { commonAreas } from '../../services/reservations';
import { unitLabel } from '../../services/directory';
import type { AuthorizationKind, CondoEvent, Visitor } from '../../data/types';
import {
  Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, Input, Modal, PageHeader,
  QRCode, Select, Tabs, Textarea, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { SearchInput } from '../../components/ui';
import { formatDate, isoDate } from '../../lib/date';
import { plateMask } from '../../lib/format';

const KIND_OPTIONS = [
  { value: 'unica', label: 'Única — vale para uma visita' },
  { value: 'temporaria', label: 'Temporária — vale por um período' },
  { value: 'recorrente', label: 'Recorrente — dias fixos da semana' },
  { value: 'permanente', label: 'Permanente — sem prazo' },
];

const CATEGORY_OPTIONS = [
  { value: 'visita', label: 'Visita' },
  { value: 'prestador', label: 'Prestador de serviço' },
  { value: 'entrega', label: 'Entrega' },
];

const WEEKDAYS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];

export function ResidentVisitors() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const unitId = user.unitId!;
  const today = isoDate(new Date());

  const [tab, setTab] = useState('ativos');
  const [term, setTerm] = useState('');
  const [formOpen, setFormOpen] = useState(params.get('novo') === '1');
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [qrVisitor, setQrVisitor] = useState<Visitor | null>(null);
  const [revoking, setRevoking] = useState<Visitor | null>(null);
  const [activeEvent, setActiveEvent] = useState<CondoEvent | null>(null);
  const [guestName, setGuestName] = useState('');

  useEffect(() => {
    if (params.get('novo') === '1') {
      setFormOpen(true);
      params.delete('novo');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const all = useMemo(() => visitorsOfUnit(unitId), [unitId, dataVersion]);
  const events = useMemo(() => eventsOfUnit(unitId), [unitId, dataVersion]);

  const filtered = useMemo(() => {
    const byTab = all.filter((v) => {
      if (tab === 'ativos') return v.status === 'aguardando' || v.status === 'no_local' || v.status === 'liberado';
      if (tab === 'eventos') return v.category === 'convidado_evento';
      return v.status === 'finalizado' || v.status === 'revogado' || v.status === 'expirado' || v.status === 'recusado';
    });
    const q = term.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((v) => [v.name, v.document, v.code, v.companyName ?? ''].some((f) => f.toLowerCase().includes(q)));
  }, [all, tab, term]);

  const counts = useMemo(() => ({
    ativos: all.filter((v) => v.status === 'aguardando' || v.status === 'no_local' || v.status === 'liberado').length,
    eventos: all.filter((v) => v.category === 'convidado_evento').length,
    historico: all.filter((v) => ['finalizado', 'revogado', 'expirado', 'recusado'].includes(v.status)).length,
  }), [all]);

  const columns: Column<Visitor>[] = [
    {
      key: 'name',
      header: 'Visitante',
      render: (v) => <CellStack title={v.name} meta={`${v.document}${v.companyName ? ` · ${v.companyName}` : ''}`} />,
    },
    {
      key: 'kind',
      header: 'Autorização',
      hideOnMobile: true,
      render: (v) => <Badge tone="brand" size="sm">{AUTHORIZATION_LABEL[v.kind]}</Badge>,
    },
    {
      key: 'when',
      header: 'Previsto para',
      render: (v) => (
        <CellStack
          title={v.expectedDate === today ? 'Hoje' : formatDate(v.expectedDate)}
          meta={`${v.expectedTime}${v.validUntil ? ` · até ${formatDate(v.validUntil)}` : ''}`}
        />
      ),
    },
    {
      key: 'code',
      header: 'Código',
      hideOnMobile: true,
      render: (v) => <span className="nx-mono nx-text-sm">{v.code}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => <Badge tone={statusTone(v.status)} size="sm">{VISITOR_STATUS_LABEL[v.status]}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '132px',
      render: (v) => (
        <span className="nx-row nx-gap-1 nx-end">
          <Button variant="ghost" size="sm" icon={<QrCode size={15} />} onClick={() => setQrVisitor(v)} aria-label="Ver QR Code" />
          {(v.status === 'aguardando' || v.status === 'liberado') && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={() => setRevoking(v)} aria-label="Revogar" />
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<UserCheck size={22} />}
        title="Visitantes"
        subtitle={`Autorizações de acesso para ${unitLabel(unitId)}`}
        actions={
          <>
            <Button variant="secondary" icon={<PartyPopper size={17} />} onClick={() => setEventFormOpen(true)}>Criar evento</Button>
            <Button variant="primary" icon={<UserPlus size={17} />} onClick={() => setFormOpen(true)}>Autorizar visitante</Button>
          </>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'ativos', label: 'Ativas', count: counts.ativos },
              { id: 'eventos', label: 'Convidados de eventos', count: counts.eventos },
              { id: 'historico', label: 'Histórico', count: counts.historico },
            ]}
          />
        }
      />

      {tab === 'eventos' && events.length > 0 && (
        <div className="nx-grid-auto-lg" style={{ marginBottom: 'var(--space-5)' }}>
          {events.map((event) => {
            const guests = guestsOfEvent(event.id);
            return (
              <Card key={event.id} padding="md">
                <div className="nx-row nx-between nx-gap-3">
                  <div>
                    <h3 className="nx-card__title">{event.title}</h3>
                    <p className="nx-text-sm nx-text-muted">
                      {formatDate(event.date)} · {event.startTime} às {event.endTime}
                    </p>
                  </div>
                  <Badge tone="brand" size="sm">{guests.length}/{event.expectedGuests} convidados</Badge>
                </div>
                <div className="nx-row nx-gap-3 nx-wrap" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="nx-event-code">
                    <span className="nx-uppercase nx-text-subtle">Código do evento</span>
                    <strong className="nx-mono">{event.inviteCode}</strong>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={15} />}
                    onClick={() => {
                      navigator.clipboard?.writeText(`${window.location.origin}/convite/${event.inviteCode}`);
                      toast.success('Link de convite copiado', 'Compartilhe com seus convidados.');
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button variant="primary" size="sm" icon={<UserPlus size={15} />} onClick={() => setActiveEvent(event)}>
                    Adicionar convidado
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={setTerm} placeholder="Buscar por nome, documento ou código..." />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          keyOf={(v) => v.id}
          empty={
            <EmptyState
              icon={<UserCheck size={24} />}
              title="Nenhum visitante cadastrado"
              description="Autorize seus visitantes com antecedência: eles aparecem automaticamente na portaria."
              action={<Button variant="primary" onClick={() => setFormOpen(true)}>Cadastrar visitante</Button>}
            />
          }
          mobileCard={(v) => (
            <div className="nx-row nx-gap-3">
              <span className="nx-list__avatar">{v.name.charAt(0)}</span>
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{v.name}</span>
                <span className="nx-text-xs nx-text-subtle">
                  {v.expectedDate === today ? 'Hoje' : formatDate(v.expectedDate)} às {v.expectedTime} · {v.code}
                </span>
                <span className="nx-row nx-gap-2" style={{ marginTop: 4 }}>
                  <Badge tone={statusTone(v.status)} size="sm">{VISITOR_STATUS_LABEL[v.status]}</Badge>
                  <Badge tone="neutral" size="sm">{AUTHORIZATION_LABEL[v.kind]}</Badge>
                </span>
              </div>
              <Button variant="ghost" size="sm" icon={<QrCode size={16} />} onClick={() => setQrVisitor(v)} aria-label="QR Code" />
            </div>
          )}
        />
      </Card>

      <VisitorForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(payload) => {
          const created = createVisitor({
            condominiumId: condominium.id,
            unitId,
            residentId: user.residentId ?? 'res-demo-carlos',
            createdBy: user.name,
            ...payload,
          });
          setFormOpen(false);
          setQrVisitor(created);
          toast.success('Visitante autorizado', `${created.name} já aparece na lista da portaria.`);
        }}
      />

      <EventForm
        open={eventFormOpen}
        onClose={() => setEventFormOpen(false)}
        onSubmit={(payload) => {
          const created = createEvent({
            condominiumId: condominium.id,
            unitId,
            residentId: user.residentId ?? 'res-demo-carlos',
            createdBy: user.name,
            ...payload,
          });
          setEventFormOpen(false);
          setTab('eventos');
          setActiveEvent(created);
          toast.success('Evento criado', 'Agora adicione os convidados para gerar os convites.');
        }}
        areas={commonAreas(condominium.id).map((a) => ({ value: a.id, label: a.name }))}
      />

      {/* Adicionar convidado ao evento */}
      <Modal
        open={activeEvent !== null}
        onClose={() => { setActiveEvent(null); setGuestName(''); }}
        title="Adicionar convidado"
        subtitle={activeEvent?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setActiveEvent(null); setGuestName(''); }}>Fechar</Button>
            <Button
              variant="primary"
              disabled={guestName.trim().length < 3}
              onClick={() => {
                if (!activeEvent) return;
                addGuest(activeEvent, guestName.trim(), '—', user.name);
                setGuestName('');
                toast.success('Convite gerado', 'O convidado já pode ser validado na portaria pelo QR Code.');
              }}
            >
              Gerar convite
            </Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input
            label="Nome do convidado"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Nome completo"
            autoFocus
          />
          {activeEvent && (
            <div>
              <p className="nx-uppercase nx-text-subtle" style={{ marginBottom: 'var(--space-2)' }}>Convidados já cadastrados</p>
              <ul className="nx-list">
                {guestsOfEvent(activeEvent.id).map((g) => (
                  <li key={g.id} className="nx-list__item">
                    <span className="nx-list__avatar">{g.name.charAt(0)}</span>
                    <span className="nx-stack nx-grow">
                      <span className="nx-medium">{g.name}</span>
                      <span className="nx-text-xs nx-mono nx-text-subtle">{g.code}</span>
                    </span>
                    <Button variant="ghost" size="sm" icon={<QrCode size={15} />} onClick={() => setQrVisitor(g)} aria-label="QR" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* QR Code da autorização */}
      <Modal
        open={qrVisitor !== null}
        onClose={() => setQrVisitor(null)}
        title="Convite de acesso"
        subtitle={qrVisitor?.name}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<Share2 size={16} />}
              onClick={() => {
                navigator.clipboard?.writeText(qrVisitor?.code ?? '');
                toast.success('Código copiado', 'Envie para o visitante apresentar na portaria.');
              }}
            >
              Compartilhar
            </Button>
            <Button variant="primary" onClick={() => setQrVisitor(null)}>Concluir</Button>
          </>
        }
      >
        {qrVisitor && (
          <div className="nx-stack nx-center nx-gap-4" style={{ textAlign: 'center' }}>
            <QRCode value={qrVisitor.code} size={190} />
            <div>
              <p className="nx-mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '0.12em' }}>{qrVisitor.code}</p>
              <p className="nx-text-sm nx-text-muted">
                {unitLabel(qrVisitor.unitId)} · {formatDate(qrVisitor.expectedDate)} às {qrVisitor.expectedTime}
              </p>
            </div>
            <p className="nx-text-xs nx-text-subtle">
              Apresente este código na portaria. O porteiro valida em segundos e a entrada é registrada automaticamente.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          revokeVisitor(revoking.id, user.name);
          toast.info('Autorização revogada', `${revoking.name} não poderá mais entrar.`);
        }}
        title="Revogar autorização"
        message={`Deseja realmente revogar a autorização de ${revoking?.name}? A portaria será atualizada imediatamente.`}
        confirmLabel="Revogar"
      />
    </>
  );
}

/* ---------------- Formulário de visitante ---------------- */

interface VisitorFormPayload {
  name: string;
  document: string;
  phone?: string;
  kind: AuthorizationKind;
  expectedDate: string;
  expectedTime: string;
  validUntil?: string;
  recurrenceDays?: number[];
  notes?: string;
  vehiclePlate?: string;
  companyName?: string;
  category: Visitor['category'];
}

function VisitorForm({
  open, onClose, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: VisitorFormPayload) => void;
}) {
  const today = isoDate(new Date());
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<AuthorizationKind>('unica');
  const [category, setCategory] = useState<Visitor['category']>('visita');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('14:30');
  const [validUntil, setValidUntil] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [plate, setPlate] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setDocument(''); setPhone(''); setKind('unica'); setCategory('visita');
    setDate(today); setTime('14:30'); setValidUntil(''); setDays([]); setPlate('');
    setCompany(''); setNotes(''); setError(null);
  }, [open, today]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) { setError('Informe o nome completo do visitante.'); return; }
    if (kind === 'recorrente' && days.length === 0) { setError('Selecione os dias da semana da autorização recorrente.'); return; }
    onSubmit({
      name: name.trim(),
      document: document.trim() || '—',
      phone: phone.trim() || undefined,
      kind,
      category,
      expectedDate: date,
      expectedTime: time,
      validUntil: kind === 'unica' ? undefined : validUntil || undefined,
      recurrenceDays: kind === 'recorrente' ? days : undefined,
      vehiclePlate: plate ? plateMask(plate) : undefined,
      companyName: company.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Autorizar visitante"
      subtitle="A portaria recebe a autorização em tempo real"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit as never}>Gerar autorização</Button>
        </>
      }
    >
      <form onSubmit={submit} className="nx-stack nx-gap-4">
        <div className="nx-grid-2">
          <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: João da Silva" required autoFocus />
          <Input label="CPF / documento" value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
        </div>

        <div className="nx-grid-2">
          <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" />
          <Select
            label="Tipo de visitante"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => setCategory(e.target.value as Visitor['category'])}
          />
        </div>

        {category === 'prestador' && (
          <Input label="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nome da empresa prestadora" />
        )}

        <Select
          label="Tipo de autorização"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(e) => setKind(e.target.value as AuthorizationKind)}
          hint="Autorizações recorrentes liberam a entrada nos dias selecionados até a data de validade."
        />

        <div className="nx-grid-3">
          <Input label="Data prevista" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <Input label="Horário" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          {kind !== 'unica' && (
            <Input label="Válida até" type="date" value={validUntil} min={date} onChange={(e) => setValidUntil(e.target.value)} />
          )}
        </div>

        {kind === 'recorrente' && (
          <div className="nx-field">
            <label className="nx-field__label">Dias da semana</label>
            <div className="nx-row nx-gap-2 nx-wrap">
              {WEEKDAYS.map((d) => (
                <button
                  type="button"
                  key={d.value}
                  className={`nx-daychip ${days.includes(d.value) ? 'is-active' : ''}`}
                  onClick={() => setDays((prev) => prev.includes(d.value) ? prev.filter((x) => x !== d.value) : [...prev, d.value])}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input
          label="Placa do veículo (opcional)"
          value={plate}
          onChange={(e) => setPlate(plateMask(e.target.value))}
          placeholder="ABC1D23"
          hint="Se informada, o veículo é liberado automaticamente na leitura de placa."
        />

        <Textarea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex.: subir direto, deixar na portaria..." />

        {error && <p className="nx-login__error">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------- Formulário de evento ---------------- */

function EventForm({
  open, onClose, onSubmit, areas,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; date: string; startTime: string; endTime: string; expectedGuests: number; areaId?: string }) => void;
  areas: { value: string; label: string }[];
}) {
  const today = isoDate(new Date());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('00:00');
  const [guests, setGuests] = useState('30');
  const [areaId, setAreaId] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(''); setDate(today); setStartTime('19:00'); setEndTime('00:00'); setGuests('30'); setAreaId('');
  }, [open, today]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar evento"
      subtitle="O sistema gera convites com QR Code para cada convidado"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            icon={<CalendarPlus size={16} />}
            disabled={title.trim().length < 3}
            onClick={() => onSubmit({
              title: title.trim(),
              date,
              startTime,
              endTime,
              expectedGuests: Number(guests) || 0,
              areaId: areaId || undefined,
            })}
          >
            Criar evento
          </Button>
        </>
      }
    >
      <div className="nx-stack nx-gap-4">
        <Input label="Título do evento" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Festa de aniversário" autoFocus />
        <div className="nx-grid-3">
          <Input label="Data" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <Input label="Início" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="Término" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="nx-grid-2">
          <Input label="Convidados previstos" type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} />
          <Select label="Área comum (opcional)" options={areas} placeholder="Sem área reservada" value={areaId} onChange={(e) => setAreaId(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
