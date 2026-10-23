/* Cadastro de motorista (condutor). CNH é obrigatória e tem validade controlada. */
import { useState } from 'react';
import { isValidCpf, onlyDigits } from '@nortycar/shared';
import { Alert, Button } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { EntityPicker } from '../../components/picker';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { loadCustomers } from '../../lib/pickers';
import { maskDocumentInput } from './CustomerForm';

export const CNH_OPTIONS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'].map((c) => ({ value: c, label: c }));

export interface DriverFormValue {
  id: string; name: string; cpf: string; customerId: string | null; customer: { id: string; name: string } | null; email: string | null; phone: string | null;
  cnhNumber: string; cnhCategory: string; cnhExpiresAt: string; cnhFirstIssueAt?: string | null; birthDate?: string | null; notes?: string | null; active: boolean;
}

export function DriverForm({ driver, customer, onClose, onSaved }: {
  driver: DriverFormValue | null; customer?: { id: string; name: string } | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    name: driver?.name ?? '', cpf: '', customerId: driver?.customerId ?? customer?.id ?? null, email: driver?.email ?? '', phone: driver?.phone ?? '',
    cnhNumber: '', cnhCategory: driver?.cnhCategory ?? 'B', cnhExpiresAt: driver?.cnhExpiresAt?.slice(0, 10) ?? '',
    cnhFirstIssueAt: driver?.cnhFirstIssueAt?.slice(0, 10) ?? '', birthDate: driver?.birthDate?.slice(0, 10) ?? '', notes: driver?.notes ?? '', active: driver?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const cpfError = f.cpf && !isValidCpf(f.cpf) ? 'CPF inválido.' : null;
  const cnhError = f.cnhNumber && !/^\d{9,11}$/.test(f.cnhNumber) ? 'De 9 a 11 dígitos.' : null;
  const expired = f.cnhExpiresAt && new Date(f.cnhExpiresAt) < new Date();
  const valid = f.name.trim().length >= 2 && f.cnhExpiresAt && !cpfError && !cnhError && (driver ? true : f.cpf && f.cnhNumber);

  const save = async () => {
    setBusy(true);
    setError(null);
    const opt = (v: string) => (v.trim() ? v.trim() : driver ? null : undefined);
    const body: Record<string, unknown> = {
      name: f.name.trim(), customerId: f.customerId ?? (driver ? null : undefined), email: opt(f.email), phone: opt(f.phone),
      cnhCategory: f.cnhCategory, cnhExpiresAt: f.cnhExpiresAt, cnhFirstIssueAt: f.cnhFirstIssueAt || (driver ? null : undefined),
      birthDate: f.birthDate || (driver ? null : undefined), notes: opt(f.notes),
      ...(f.cnhNumber ? { cnhNumber: f.cnhNumber } : {}),
    };
    try {
      if (driver) await api.patch(`/drivers/${driver.id}`, { ...body, active: f.active });
      else await api.post('/drivers', { ...body, cpf: onlyDigits(f.cpf) });
      toast.success(driver ? 'Motorista atualizado' : 'Motorista cadastrado');
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={driver ? `Editar ${driver.name}` : 'Novo motorista'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Salvar</Button></>}>
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}
        {expired && <Alert tone="warning">A CNH informada está vencida. A retirada de veículo pode ser recusada, conforme a regra da empresa.</Alert>}
        <FormGrid>
          <Field label="Nome completo" required className="span-8"><Input value={f.name} onChange={set('name')} autoFocus /></Field>
          {!driver && <Field label="CPF" required className="span-4" error={cpfError}><Input value={f.cpf} inputMode="numeric" onChange={(e) => setF({ ...f, cpf: maskDocumentInput('PF', e.target.value) })} /></Field>}
          {driver && <Field label="CPF" className="span-4"><Input value={driver.cpf} disabled /></Field>}
          <Field label="Cliente vinculado" className="span-6" hint="Empresa ou pessoa que indicou o condutor.">
            <EntityPicker value={f.customerId} onChange={(id) => setF({ ...f, customerId: id })} load={loadCustomers()} initialLabel={driver?.customer?.name ?? customer?.name} disabled={Boolean(customer)} />
          </Field>
          <Field label="Data de nascimento" className="span-3"><Input type="date" value={f.birthDate} onChange={set('birthDate')} /></Field>
          <Field label="Telefone" className="span-3"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="E-mail" className="span-6"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Número da CNH" required={!driver} className="span-6" error={cnhError} hint={driver ? `Atual: ${driver.cnhNumber}. Preencha só para trocar.` : undefined}>
            <Input value={f.cnhNumber} inputMode="numeric" onChange={(e) => setF({ ...f, cnhNumber: onlyDigits(e.target.value).slice(0, 11) })} />
          </Field>
          <Field label="Categoria" required className="span-2"><Select value={f.cnhCategory} onChange={set('cnhCategory')} options={CNH_OPTIONS} /></Field>
          <Field label="Validade da CNH" required className="span-4"><Input type="date" value={f.cnhExpiresAt} onChange={set('cnhExpiresAt')} /></Field>
          <Field label="Primeira habilitação" className="span-6"><Input type="date" value={f.cnhFirstIssueAt} onChange={set('cnhFirstIssueAt')} /></Field>
          <Field label="Observações" className="span-12"><Textarea value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
          {driver && <div className="span-12"><Checkbox label="Motorista ativo" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /></div>}
        </FormGrid>
      </div>
    </Modal>
  );
}
