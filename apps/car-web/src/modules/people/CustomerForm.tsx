/* Cadastro e edição de cliente PF/PJ, com máscara e validação de documento. */
import { useState } from 'react';
import { PAYMENT_METHOD_LABEL, isValidEmail, isValidPersonDocument, onlyDigits, type PersonType } from '@nortycar/shared';
import { Alert, Button, Segmented } from '../../components/ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';

export interface CustomerFormValue {
  id?: string; type: PersonType; name: string; tradeName: string | null; document: string; birthDate: string | null; email: string | null;
  phone: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null;
  state: string | null; zip: string | null; emergencyContact: { name: string; phone: string; relationship?: string } | null;
  preferredPayment: string | null; internalNotes: string | null;
}

/** Máscara de digitação: CPF 000.000.000-00, CNPJ 00.000.000/0000-00. */
export function maskDocumentInput(type: PersonType, value: string): string {
  const d = onlyDigits(value).slice(0, type === 'PF' ? 11 : 14);
  if (type === 'PF') return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

const PAYMENT_OPTIONS = (['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'] as const).map((k) => ({ value: k, label: PAYMENT_METHOD_LABEL[k] }));

export function CustomerForm({ customer, onClose, onSaved }: { customer: CustomerFormValue | null; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [type, setType] = useState<PersonType>(customer?.type ?? 'PF');
  const [f, setF] = useState({
    name: customer?.name ?? '', tradeName: customer?.tradeName ?? '',
    // Na edição o documento só é reenviado se for alterado (quem não tem acesso sensível vê mascarado).
    document: '', birthDate: customer?.birthDate?.slice(0, 10) ?? '', email: customer?.email ?? '', phone: customer?.phone ?? '',
    zip: customer?.zip ?? '', street: customer?.street ?? '', number: customer?.number ?? '', complement: customer?.complement ?? '',
    district: customer?.district ?? '', city: customer?.city ?? '', state: customer?.state ?? '', preferredPayment: customer?.preferredPayment ?? '',
    internalNotes: customer?.internalNotes ?? '', ecName: customer?.emergencyContact?.name ?? '', ecPhone: customer?.emergencyContact?.phone ?? '',
    ecRelationship: customer?.emergencyContact?.relationship ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const docRequired = !customer;
  const docError = f.document && !isValidPersonDocument(type, f.document) ? (type === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.') : null;
  const emailError = f.email && !isValidEmail(f.email) ? 'E-mail inválido.' : null;
  const ecIncomplete = (f.ecName || f.ecPhone) && !(f.ecName.trim().length >= 2 && f.ecPhone.trim().length >= 8);
  const valid = f.name.trim().length >= 2 && (!docRequired || (f.document && !docError)) && !docError && !emailError && !ecIncomplete;

  const save = async () => {
    setBusy(true);
    setError(null);
    const v = (s: string) => (s.trim() ? s.trim() : customer ? null : undefined);
    const body: Record<string, unknown> = {
      name: f.name.trim(), tradeName: v(f.tradeName), birthDate: f.birthDate || (customer ? null : undefined), email: v(f.email), phone: v(f.phone),
      zip: v(f.zip), street: v(f.street), number: v(f.number), complement: v(f.complement), district: v(f.district), city: v(f.city),
      state: f.state.trim() ? f.state.trim().toUpperCase() : customer ? null : undefined, preferredPayment: f.preferredPayment || (customer ? null : undefined),
      internalNotes: v(f.internalNotes),
      emergencyContact: f.ecName.trim() ? { name: f.ecName.trim(), phone: f.ecPhone.trim(), relationship: f.ecRelationship.trim() || undefined } : customer ? null : undefined,
      ...(f.document ? { document: onlyDigits(f.document) } : {}),
    };
    try {
      if (customer?.id) {
        await api.patch(`/customers/${customer.id}`, body);
        toast.success('Cliente atualizado');
        onSaved(customer.id);
      } else {
        const r = await api.post<{ id: string }>('/customers', { ...body, type });
        toast.success('Cliente cadastrado');
        onSaved(r.id);
      }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title={customer ? `Editar ${customer.name}` : 'Novo cliente'}
      description="Colete só o necessário para a locação (LGPD). Observações internas não aparecem para o cliente."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={save}>Salvar</Button></>}>
      <div className="stack-lg">
        {error && <Alert tone="danger">{error}</Alert>}
        {!customer && <Segmented label="Tipo de pessoa" value={type} onChange={(t) => { setType(t); setF({ ...f, document: '' }); }} options={[{ value: 'PF', label: 'Pessoa física' }, { value: 'PJ', label: 'Pessoa jurídica' }]} />}
        <FormGrid>
          <Field label={type === 'PF' ? 'Nome completo' : 'Razão social'} required className="span-6"><Input value={f.name} onChange={set('name')} maxLength={160} autoFocus /></Field>
          {type === 'PJ' && <Field label="Nome fantasia" className="span-6"><Input value={f.tradeName} onChange={set('tradeName')} maxLength={160} /></Field>}
          <Field label={type === 'PF' ? 'CPF' : 'CNPJ'} required={docRequired} className="span-3" error={docError} hint={customer ? `Atual: ${customer.document}. Preencha só para corrigir.` : undefined}>
            <Input value={f.document} inputMode="numeric" onChange={(e) => setF({ ...f, document: maskDocumentInput(type, e.target.value) })} />
          </Field>
          <Field label={type === 'PF' ? 'Data de nascimento' : 'Data de abertura'} className="span-3"><Input type="date" value={f.birthDate} onChange={set('birthDate')} /></Field>
          <Field label="E-mail" className="span-6" error={emailError} hint="Necessário para o acesso ao portal do cliente."><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Telefone" className="span-3"><Input type="tel" value={f.phone} onChange={set('phone')} maxLength={30} /></Field>
          <Field label="Forma de pagamento preferida" className="span-3"><Select value={f.preferredPayment} onChange={set('preferredPayment')} placeholder="Não informada" options={PAYMENT_OPTIONS} /></Field>
        </FormGrid>
        <fieldset className="nc-fieldset">
          <legend>Endereço</legend>
          <FormGrid>
            <Field label="CEP" className="span-3"><Input value={f.zip} inputMode="numeric" onChange={(e) => setF({ ...f, zip: onlyDigits(e.target.value).slice(0, 8) })} /></Field>
            <Field label="Logradouro" className="span-6"><Input value={f.street} onChange={set('street')} /></Field>
            <Field label="Número" className="span-3"><Input value={f.number} onChange={set('number')} /></Field>
            <Field label="Complemento" className="span-4"><Input value={f.complement} onChange={set('complement')} /></Field>
            <Field label="Bairro" className="span-4"><Input value={f.district} onChange={set('district')} /></Field>
            <Field label="Cidade" className="span-3"><Input value={f.city} onChange={set('city')} /></Field>
            <Field label="UF" className="span-1"><Input value={f.state} onChange={set('state')} maxLength={2} /></Field>
          </FormGrid>
        </fieldset>
        <fieldset className="nc-fieldset">
          <legend>Contato de emergência (opcional)</legend>
          <FormGrid>
            <Field label="Nome" className="span-6"><Input value={f.ecName} onChange={set('ecName')} /></Field>
            <Field label="Telefone" className="span-3" error={ecIncomplete ? 'Informe nome e telefone.' : null}><Input value={f.ecPhone} onChange={set('ecPhone')} /></Field>
            <Field label="Parentesco" className="span-3"><Input value={f.ecRelationship} onChange={set('ecRelationship')} /></Field>
          </FormGrid>
        </fieldset>
        <Field label="Observações internas"><Textarea value={f.internalNotes} onChange={set('internalNotes')} maxLength={3000} /></Field>
      </div>
    </Modal>
  );
}
