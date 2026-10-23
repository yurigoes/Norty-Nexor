import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Alert, Button, Card, KeyValue, Page, PageHeader, Segmented, Steps } from '../../components/ui';
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { EntityPicker } from '../../components/picker';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { loadCustomers, loadDrivers, loadVehicles } from '../../lib/pickers';
import { fromLocalInput, money } from '../../lib/format';
import { useSession } from '../../lib/session';

interface Rate { id: string; categoryId: string; branchId: string | null; longTermMonthly: number | null; longTermKmPerMonth: number | null; extraKmRate: number | null; depositAmount: number; dailyRate: number; category: { name: string } }

const STEPS = ['Cliente', 'Veículo e prazo', 'Condições', 'Revisão'];

export function NewContractPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { session, can } = useSession();
  const branches = session?.context.branches ?? [];
  const rates = useApi(() => api.get<Rate[]>('/pricing/rates'), []);
  const [kind, setKind] = useState<'LONG_TERM' | 'PERIOD'>('LONG_TERM');
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLabel, setCustomerLabel] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverLabel, setDriverLabel] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [vehicleUnitId, setVehicleUnitId] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [termMonths, setTermMonths] = useState(12);
  const [billingDay, setBillingDay] = useState(10);
  const [monthly, setMonthly] = useState<number | ''>('');
  const [kmAllowance, setKmAllowance] = useState<number | ''>('');
  const [extraKmRate, setExtraKmRate] = useState<number | ''>('');
  const [deposit, setDeposit] = useState<number | ''>('');
  const [adjustmentIndex, setAdjustmentIndex] = useState('IPCA');
  const [services, setServices] = useState('');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vehicleUnitId) { setCategoryId(null); return; }
    api.get<{ category?: { id: string }; categoryId?: string }>(`/vehicles/${vehicleUnitId}`)
      .then((v) => setCategoryId(v.category?.id ?? v.categoryId ?? null)).catch(() => setCategoryId(null));
  }, [vehicleUnitId]);

  const rate = useMemo(() => {
    const list = rates.data ?? [];
    return list.find((r) => r.categoryId === categoryId && r.branchId === branchId) ?? list.find((r) => r.categoryId === categoryId && !r.branchId) ?? null;
  }, [rates.data, categoryId, branchId]);

  // Valores de referência da tabela preenchem a proposta; mudar exige permissão.
  useEffect(() => {
    if (!rate) return;
    setMonthly((m) => (m === '' ? rate.longTermMonthly ?? '' : m));
    setKmAllowance((k) => (k === '' ? rate.longTermKmPerMonth ?? '' : k));
    setExtraKmRate((x) => (x === '' ? rate.extraKmRate ?? '' : x));
    setDeposit((d) => (d === '' ? rate.depositAmount : d));
  }, [rate]);

  const override = can('contracts.price_override');
  const priceChanged = rate?.longTermMonthly && monthly !== '' && monthly !== rate.longTermMonthly;
  const period = { startAt: fromLocalInput(startAt), endAt: fromLocalInput(endAt) };
  const canNext = [
    Boolean(customerId && driverId),
    Boolean(branchId && vehicleUnitId && period.startAt && (kind === 'LONG_TERM' ? termMonths >= 1 : period.endAt && period.endAt > period.startAt)),
    kind === 'PERIOD' || Boolean(monthly && (!priceChanged || override)),
    true,
  ][step];

  const save = async () => {
    setBusy(true);
    try {
      const body = kind === 'LONG_TERM'
        ? {
            kind, branchId, customerId, driverId, vehicleUnitId, startAt: period.startAt, termMonths, billingDay,
            monthlyAmount: monthly === '' ? undefined : monthly, kmAllowance: kmAllowance === '' ? undefined : kmAllowance,
            extraKmRate: extraKmRate === '' ? undefined : extraKmRate, depositRequired: deposit === '' ? undefined : deposit,
            adjustmentIndex: adjustmentIndex || undefined, includedServices: services.split('\n').map((s) => s.trim()).filter(Boolean), terms: terms || undefined,
          }
        : {
            kind, branchId, customerId, driverId, vehicleUnitId, startAt: period.startAt, endAt: period.endAt,
            depositRequired: deposit === '' ? undefined : deposit, includedServices: services.split('\n').map((s) => s.trim()).filter(Boolean), terms: terms || undefined,
          };
      const c = await api.post<{ id: string; number: string }>('/contracts', body);
      toast.success(`Proposta ${c.number} criada`, 'O veículo fica reservado na agenda enquanto a proposta estiver em análise.');
      navigate(`/locacoes/contratos/${c.id}`);
    } catch (e) {
      toast.error('Não foi possível criar o contrato', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title="Novo contrato" breadcrumb={<a href="/locacoes/contratos" onClick={(e) => { e.preventDefault(); navigate('/locacoes/contratos'); }}><ArrowLeft size={12} /> Contratos</a>}
        description="A proposta nasce em rascunho, passa por aprovação e só vira contrato em vigor na entrega do veículo, com vistoria." />
      <Card>
        <div className="stack-lg">
          <div className="row-between">
            <Steps steps={STEPS} current={step} />
            {step === 0 && <Segmented label="Tipo" value={kind} onChange={setKind} options={[{ value: 'LONG_TERM', label: 'Mensal / longo prazo' }, { value: 'PERIOD', label: 'Por período' }]} />}
          </div>
          {step === 0 && (
            <FormGrid>
              <Field label="Cliente (locatário)" required className="span-6">
                <EntityPicker value={customerId} initialLabel={customerLabel} onChange={(id, o) => { setCustomerId(id); setCustomerLabel(o?.label ?? ''); setDriverId(null); }} load={loadCustomers()} />
              </Field>
              <Field label="Motorista principal" required className="span-6" hint="A CNH precisa valer até o fim do contrato.">
                <EntityPicker value={driverId} initialLabel={driverLabel} onChange={(id, o) => { setDriverId(id); setDriverLabel(o?.label ?? ''); }} load={loadDrivers(customerId ? { customerId } : {})} disabled={!customerId} />
              </Field>
            </FormGrid>
          )}
          {step === 1 && (
            <FormGrid>
              <Field label="Filial" required className="span-4"><Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setVehicleUnitId(null); }} options={branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
              <Field label="Veículo" required className="span-8" hint="A disponibilidade no período é conferida pelo servidor ao salvar.">
                <EntityPicker value={vehicleUnitId} initialLabel={vehicleLabel} onChange={(id, o) => { setVehicleUnitId(id); setVehicleLabel(o?.label ?? ''); }} load={loadVehicles({ branchId })} placeholder="Placa ou modelo" />
              </Field>
              <Field label="Início" required className="span-4"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
              {kind === 'LONG_TERM' ? <>
                <Field label="Prazo (meses)" required className="span-4"><Input type="number" min={1} max={60} value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))} /></Field>
                <Field label="Dia de vencimento" required className="span-4"><Input type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(Number(e.target.value))} /></Field>
              </> : (
                <Field label="Devolução" required className="span-4"><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
              )}
            </FormGrid>
          )}
          {step === 2 && (
            <div className="stack">
              {!rate && <Alert tone="warning">Não há tarifa ativa para a categoria deste veículo. {kind === 'PERIOD' ? 'Cadastre a tarifa para cotar.' : 'Informe a mensalidade manualmente.'}</Alert>}
              {kind === 'PERIOD' && <Alert tone="info">O valor da locação por período é calculado pelo servidor com a tarifa da categoria ({rate ? `${money(rate.dailyRate)}/dia` : 'sem tarifa'}).</Alert>}
              <FormGrid>
                {kind === 'LONG_TERM' && <>
                  <Field label="Mensalidade" required className="span-4" hint={rate?.longTermMonthly ? `Tabela: ${money(rate.longTermMonthly)}` : undefined}
                    error={priceChanged && !override ? 'Seu perfil não pode alterar o valor da tabela.' : null}>
                    <MoneyInput value={monthly} onChange={setMonthly} disabled={Boolean(rate?.longTermMonthly) && !override} />
                  </Field>
                  <Field label="Km por mês" className="span-4" hint="Vazio = quilometragem livre."><Input type="number" min={1} value={kmAllowance} onChange={(e) => setKmAllowance(e.target.value === '' ? '' : Number(e.target.value))} disabled={!override && Boolean(rate)} /></Field>
                  <Field label="Km excedente (R$/km)" className="span-4"><MoneyInput value={extraKmRate} onChange={setExtraKmRate} disabled={!override && Boolean(rate)} /></Field>
                  <Field label="Índice de reajuste" className="span-4"><Input value={adjustmentIndex} onChange={(e) => setAdjustmentIndex(e.target.value)} /></Field>
                </>}
                <Field label="Caução" className="span-4" hint="Reduzir o valor da tabela exige permissão."><MoneyInput value={deposit} onChange={setDeposit} /></Field>
                <Field label="Serviços incluídos (um por linha)" className="span-12"><Textarea value={services} onChange={(e) => setServices(e.target.value)} placeholder={'Manutenção preventiva\nSeguro com franquia\nCarro reserva'} /></Field>
                <Field label="Cláusulas específicas" className="span-12"><Textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
              </FormGrid>
            </div>
          )}
          {step === 3 && (
            <KeyValue items={[
              { label: 'Tipo', value: kind === 'LONG_TERM' ? 'Mensal / longo prazo' : 'Por período' },
              { label: 'Cliente', value: customerLabel },
              { label: 'Motorista', value: driverLabel },
              { label: 'Veículo', value: vehicleLabel },
              { label: 'Início', value: startAt.replace('T', ' ') },
              { label: kind === 'LONG_TERM' ? 'Prazo' : 'Devolução', value: kind === 'LONG_TERM' ? `${termMonths} meses, vencimento dia ${billingDay}` : endAt.replace('T', ' ') },
              { label: 'Mensalidade', value: money(monthly === '' ? null : monthly), hidden: kind !== 'LONG_TERM' },
              { label: 'Caução', value: money(deposit === '' ? null : deposit) },
            ]} />
          )}
          <div className="row-between">
            <Button onClick={() => (step === 0 ? navigate('/locacoes/contratos') : setStep(step - 1))}>{step === 0 ? 'Cancelar' : 'Voltar'}</Button>
            {step < 3 ? <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continuar</Button>
              : <Button variant="primary" icon={Save} loading={busy} onClick={save}>Criar proposta</Button>}
          </div>
        </div>
      </Card>
    </Page>
  );
}
