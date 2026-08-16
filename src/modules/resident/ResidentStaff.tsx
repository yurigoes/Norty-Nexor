import { useMemo, useState } from 'react';
import { HardHat, Plus } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { saveStaff, staffOfUnit, unitLabel } from '../../services/directory';
import type { Staff } from '../../data/types';
import {
  Avatar, Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Switch, useToast,
} from '../../components/ui';
import { weekdays } from '../../lib/format';
import { formatDate, isoDate } from '../../lib/date';
import { STAFF_ROLES_UNIT } from '../../data/seed/random';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];

export function ResidentStaff() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const unitId = user.unitId!;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [role, setRole] = useState(STAFF_ROLES_UNIT[0]);
  const [phone, setPhone] = useState('');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:00');
  const [validUntil, setValidUntil] = useState('');
  const [active, setActive] = useState(true);

  const staff = useMemo(() => staffOfUnit(unitId), [unitId, dataVersion]);

  const openForm = (member?: Staff) => {
    setEditing(member ?? null);
    setName(member?.name ?? '');
    setDocument(member?.document ?? '');
    setRole(member?.role ?? STAFF_ROLES_UNIT[0]);
    setPhone(member?.phone ?? '');
    setDays(member?.workDays ?? [1, 3, 5]);
    setStart(member?.shiftStart ?? '08:00');
    setEnd(member?.shiftEnd ?? '16:00');
    setValidUntil(member?.accessValidUntil ?? '');
    setActive(member?.active ?? true);
    setFormOpen(true);
  };

  const submit = () => {
    if (name.trim().length < 3) { toast.error('Informe o nome completo'); return; }
    saveStaff({
      id: editing?.id,
      condominiumId: condominium.id,
      unitId,
      name: name.trim(),
      document: document.trim() || '—',
      role,
      phone: phone.trim() || '—',
      kind: 'funcionario_unidade',
      workDays: days,
      shiftStart: start,
      shiftEnd: end,
      accessValidUntil: validUntil || undefined,
      active,
      admittedAt: editing?.admittedAt ?? isoDate(new Date()),
    });
    setFormOpen(false);
    toast.success(editing ? 'Cadastro atualizado' : 'Funcionário cadastrado', 'O acesso recorrente já está liberado na portaria.');
  };

  return (
    <>
      <PageHeader
        icon={<HardHat size={22} />}
        title="Funcionários e prestadores"
        subtitle={`Pessoas com acesso recorrente autorizado para ${unitLabel(unitId)}`}
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => openForm()}>Cadastrar</Button>}
      />

      {staff.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<HardHat size={24} />}
            title="Nenhum funcionário cadastrado"
            description="Cadastre funcionários domésticos, cuidadores e prestadores para liberar a entrada nos dias e horários definidos."
            action={<Button variant="primary" onClick={() => openForm()}>Cadastrar funcionário</Button>}
          />
        </Card>
      ) : (
        <div className="nx-grid-auto-lg">
          {staff.map((member) => (
            <Card key={member.id} padding="md">
              <div className="nx-row nx-gap-3">
                <Avatar name={member.name} size="lg" />
                <div className="nx-grow">
                  <h3 className="nx-card__title">{member.name}</h3>
                  <p className="nx-text-sm nx-text-muted">{member.role}</p>
                </div>
                <Badge tone={member.active ? 'success' : 'neutral'} size="sm" dot>
                  {member.active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>

              <div className="nx-staff-schedule">
                {WEEKDAY_OPTIONS.map((d) => (
                  <span key={d.value} className={member.workDays.includes(d.value) ? 'is-on' : ''}>{d.label}</span>
                ))}
              </div>

              <div className="nx-row nx-between nx-wrap nx-gap-3" style={{ marginTop: 'var(--space-3)' }}>
                <span className="nx-text-sm nx-text-muted">
                  {member.shiftStart}–{member.shiftEnd} · {weekdays(member.workDays)}
                </span>
                <Button variant="ghost" size="sm" onClick={() => openForm(member)}>Editar</Button>
              </div>

              {member.accessValidUntil && (
                <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-2)' }}>
                  Acesso válido até {formatDate(member.accessValidUntil)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar cadastro' : 'Cadastrar funcionário'}
        subtitle="O acesso é liberado automaticamente nos dias e horários definidos"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submit}>{editing ? 'Salvar' : 'Cadastrar'}</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <div className="nx-grid-2">
            <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            <Input label="CPF / documento" value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="nx-grid-2">
            <Select
              label="Função"
              options={STAFF_ROLES_UNIT.map((r) => ({ value: r, label: r }))}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" />
          </div>

          <div className="nx-field">
            <label className="nx-field__label">Dias de trabalho</label>
            <div className="nx-row nx-gap-2 nx-wrap">
              {WEEKDAY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`nx-daychip ${days.includes(d.value) ? 'is-active' : ''}`}
                  onClick={() => setDays((prev) => prev.includes(d.value) ? prev.filter((x) => x !== d.value) : [...prev, d.value])}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="nx-grid-3">
            <Input label="Entrada" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input label="Saída" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Input label="Acesso válido até" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>

          <Switch checked={active} onChange={setActive} label="Cadastro ativo" description="Desative para bloquear a entrada temporariamente." />
        </div>
      </Modal>
    </>
  );
}
