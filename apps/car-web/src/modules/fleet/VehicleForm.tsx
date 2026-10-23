/* =========================================================
   Cadastro e edição de veículo em etapas. A validação aqui é
   para orientar quem digita; a API valida tudo de novo.
   ========================================================= */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  FUEL_TYPE_LABEL, TRANSMISSION_LABEL, formatPlate, isValidPlate, isValidRenavam, isValidVin, normalizePlate, normalizeVin, onlyDigits,
  type DuplicateCheck, type VehicleDetail,
} from '@nortycar/shared';
import { Alert, Button, KeyValue, Steps } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from '../../components/form';
import { Modal } from '../../components/overlay';
import { EntityPicker } from '../../components/picker';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { loadSuppliers } from '../../lib/pickers';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import { date, km, money } from '../../lib/format';
import { FUEL_OPTIONS, TRANSMISSION_OPTIONS, dateInput, useModels, type VersionRow } from './shared';

interface FormState {
  branchId: string; modelId: string; versionId: string; categoryId: string; internalCode: string; plate: string; renavam: string;
  chassis: string; engineNumber: string; yearManufacture: string; yearModel: string; color: string; fuel: string; transmission: string;
  doors: string; tankCapacityLiters: string; odometerKm: string; location: string; acquiredAt: string; acquisitionValue: number | '';
  marketValue: number | ''; supplierId: string | null; licensingDueDate: string; ipvaDueDate: string; publicVisible: boolean; notes: string;
}

const STEPS = ['Identificação', 'Especificação', 'Aquisição e documentos', 'Revisão'];
const YEAR = new Date().getFullYear();

function initial(v: VehicleDetail | null, branchId: string): FormState {
  return {
    branchId: v?.branchId ?? branchId, modelId: v?.model.id ?? '', versionId: v?.version?.id ?? '', categoryId: v?.category.id ?? '',
    internalCode: v?.internalCode ?? '', plate: v ? formatPlate(v.plate) : '', renavam: v?.renavam ?? '', chassis: v?.chassis ?? '',
    engineNumber: v?.engineNumber ?? '', yearManufacture: String(v?.yearManufacture ?? YEAR), yearModel: String(v?.yearModel ?? YEAR),
    color: v?.color ?? '', fuel: v?.fuel ?? 'FLEX', transmission: v?.transmission ?? 'MANUAL', doors: v?.doors ? String(v.doors) : '',
    tankCapacityLiters: v?.tankCapacityLiters ? String(v.tankCapacityLiters) : '', odometerKm: String(v?.odometerKm ?? ''),
    location: v?.location ?? '', acquiredAt: dateInput(v?.acquiredAt), acquisitionValue: v?.acquisitionValue ?? '', marketValue: v?.marketValue ?? '',
    supplierId: v?.supplierId ?? null, licensingDueDate: dateInput(v?.licensingDueDate), ipvaDueDate: dateInput(v?.ipvaDueDate),
    publicVisible: v?.publicVisible ?? true, notes: v?.notes ?? '',
  };
}

export function VehicleForm({ vehicle, onClose, onSaved }: { vehicle: VehicleDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const { session, can } = useSession();
  const { branchId: filterBranch } = useBranchFilter();
  const branches = session?.context.branches ?? [];
  const [f, setF] = useState<FormState>(() => initial(vehicle, filterBranch || branches[0]?.id || ''));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const models = useModels();
  const versions = useApi(() => (f.modelId ? api.get<{ versions: VersionRow[] }>(`/catalog/models/${f.modelId}`).then((m) => m.versions) : Promise.resolve([] as VersionRow[])), [f.modelId]);
  const financial = can('fleet.financials');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  // Checagem de duplicidade enquanto digita: avisa antes do fim do cadastro.
  const dupKey = useDebounced(`${normalizePlate(f.plate)}|${onlyDigits(f.renavam)}|${normalizeVin(f.chassis)}|${f.internalCode.trim()}`, 400);
  const [dup, setDup] = useState<DuplicateCheck | null>(null);
  useEffect(() => {
    const [p, r, c, i] = dupKey.split('|');
    if (!p && !r && !c && !i) { setDup(null); return; }
    let alive = true;
    api.get<DuplicateCheck>('/vehicles/check-duplicates', {
      plate: p && isValidPlate(p) ? p : undefined, renavam: r && r.length >= 9 ? r : undefined, chassis: c?.length === 17 ? c : undefined,
      internalCode: i || undefined, excludeId: vehicle?.id,
    }).then((d) => alive && setDup(d)).catch(() => undefined);
    return () => { alive = false; };
  }, [dupKey, vehicle?.id]);

  const model = models.data?.find((m) => m.id === f.modelId);
  const errors = useMemo(() => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!f.branchId) e.branchId = 'Escolha a filial.';
    if (!f.modelId) e.modelId = 'Escolha o modelo.';
    if (!f.plate) e.plate = 'Informe a placa.';
    else if (!isValidPlate(f.plate)) e.plate = 'Placa inválida (ABC1234 ou ABC1D23).';
    else if (dup?.plate) e.plate = 'Já existe um veículo com esta placa.';
    if (f.renavam && !isValidRenavam(f.renavam)) e.renavam = 'RENAVAM inválido.';
    else if (dup?.renavam) e.renavam = 'Já existe um veículo com este RENAVAM.';
    if (f.chassis && !isValidVin(f.chassis)) e.chassis = 'Chassi: 17 caracteres, sem I, O e Q.';
    else if (dup?.chassis) e.chassis = 'Já existe um veículo com este chassi.';
    if (dup?.internalCode) e.internalCode = 'Código interno já usado.';
    const ym = Number(f.yearModel);
    const yf = Number(f.yearManufacture);
    if (!yf || yf < 1950 || yf > YEAR + 2) e.yearManufacture = 'Ano inválido.';
    if (!ym || ym < yf || ym > yf + 1) e.yearModel = 'Igual ao ano de fabricação ou o seguinte.';
    if (f.color.trim().length < 2) e.color = 'Informe a cor.';
    if (f.odometerKm === '' || Number(f.odometerKm) < 0) e.odometerKm = 'Informe a quilometragem atual.';
    else if (vehicle && Number(f.odometerKm) !== vehicle.odometerKm) e.odometerKm = undefined;
    return e;
  }, [f, dup, vehicle]);
  const stepFields: (keyof FormState)[][] = [
    ['branchId', 'modelId', 'plate', 'renavam', 'chassis', 'internalCode'],
    ['yearManufacture', 'yearModel', 'color', 'odometerKm'],
    [],
  ];
  const stepValid = (i: number) => (stepFields[i] ?? []).every((k) => !errors[k]);

  const submit = async () => {
    setBusy(true);
    setServerError(null);
    const num = (v: string) => (v === '' ? undefined : Number(v));
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    const body: Record<string, unknown> = {
      modelId: f.modelId, versionId: f.versionId || (vehicle ? null : undefined), categoryId: f.categoryId || undefined,
      internalCode: opt(f.internalCode), plate: normalizePlate(f.plate),
      renavam: f.renavam ? onlyDigits(f.renavam) : vehicle ? null : undefined, chassis: f.chassis ? normalizeVin(f.chassis) : vehicle ? null : undefined,
      engineNumber: opt(f.engineNumber) ?? (vehicle ? null : undefined), yearManufacture: Number(f.yearManufacture), yearModel: Number(f.yearModel),
      color: f.color.trim(), fuel: f.fuel, transmission: f.transmission, doors: num(f.doors), tankCapacityLiters: num(f.tankCapacityLiters),
      location: opt(f.location), acquiredAt: f.acquiredAt || undefined, supplierId: f.supplierId ?? undefined,
      licensingDueDate: f.licensingDueDate || undefined, ipvaDueDate: f.ipvaDueDate || undefined, publicVisible: f.publicVisible, notes: opt(f.notes),
      ...(financial ? { acquisitionValue: f.acquisitionValue === '' ? undefined : f.acquisitionValue, marketValue: f.marketValue === '' ? undefined : f.marketValue } : {}),
    };
    try {
      if (vehicle) {
        await api.patch(`/vehicles/${vehicle.id}`, body);
        toast.success('Veículo atualizado');
        onSaved(vehicle.id);
      } else {
        const created = await api.post<{ id: string; internalCode: string }>('/vehicles', { ...body, branchId: f.branchId, odometerKm: Number(f.odometerKm) });
        toast.success('Veículo cadastrado', `Código interno ${created.internalCode}.`);
        onSaved(created.id);
      }
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof FormState) => errors[k] ?? null;
  return (
    <Modal open onClose={onClose} size="xl" title={vehicle ? `Editar ${formatPlate(vehicle.plate)}` : 'Cadastrar veículo'}
      description="Placa, RENAVAM e chassi são conferidos contra toda a frota da empresa."
      footer={<>
        {step > 0 && <Button icon={ArrowLeft} onClick={() => setStep(step - 1)}>Voltar</Button>}
        <span className="grow" />
        <Button onClick={onClose}>Cancelar</Button>
        {step < STEPS.length - 1
          ? <Button variant="primary" icon={ArrowRight} disabled={!stepValid(step)} onClick={() => setStep(step + 1)}>Continuar</Button>
          : <Button variant="primary" icon={Check} loading={busy} disabled={![0, 1, 2].every(stepValid)} onClick={submit}>{vehicle ? 'Salvar alterações' : 'Cadastrar'}</Button>}
      </>}>
      <div className="stack-lg">
        <Steps steps={STEPS} current={step} />
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        {step === 0 && (
          <FormGrid>
            {!vehicle && (
              <Field label="Filial responsável" required className="span-6" error={err('branchId')}>
                <Select value={f.branchId} onChange={(e) => set('branchId', e.target.value)} placeholder="Selecione" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
              </Field>
            )}
            <Field label="Modelo" required className={vehicle ? 'span-6' : 'span-6'} error={err('modelId')}>
              <Select value={f.modelId} onChange={(e) => setF((s) => ({ ...s, modelId: e.target.value, versionId: '', categoryId: '' }))} placeholder={models.loading ? 'Carregando…' : 'Selecione'}
                options={(models.data ?? []).map((m) => ({ value: m.id, label: `${m.make.name} ${m.name}` }))} />
            </Field>
            <Field label="Versão" className="span-6" hint={model ? `Categoria: ${model.category.name}` : undefined}>
              <Select value={f.versionId} onChange={(e) => {
                const v = versions.data?.find((x) => x.id === e.target.value);
                setF((s) => ({ ...s, versionId: e.target.value, fuel: v?.fuel ?? s.fuel, transmission: v?.transmission ?? s.transmission }));
              }} placeholder="Sem versão definida" options={(versions.data ?? []).map((v) => ({ value: v.id, label: v.name }))} />
            </Field>
            <Field label="Placa" required className="span-3" error={err('plate')}>
              <Input value={f.plate} onChange={(e) => set('plate', e.target.value.toUpperCase())} maxLength={8} placeholder="ABC1D23" autoFocus />
            </Field>
            <Field label="Código interno" className="span-3" hint="Vazio gera automático." error={err('internalCode')}>
              <Input value={f.internalCode} onChange={(e) => set('internalCode', e.target.value)} maxLength={20} />
            </Field>
            <Field label="RENAVAM" className="span-4" error={err('renavam')}>
              <Input value={f.renavam} inputMode="numeric" onChange={(e) => set('renavam', onlyDigits(e.target.value))} maxLength={11} />
            </Field>
            <Field label="Chassi" className="span-4" error={err('chassis')}>
              <Input value={f.chassis} onChange={(e) => set('chassis', e.target.value.toUpperCase())} maxLength={17} className="nc-input mono" />
            </Field>
            <Field label="Número do motor" className="span-4">
              <Input value={f.engineNumber} onChange={(e) => set('engineNumber', e.target.value)} maxLength={30} />
            </Field>
          </FormGrid>
        )}
        {step === 1 && (
          <FormGrid>
            <Field label="Ano de fabricação" required className="span-3" error={err('yearManufacture')}>
              <Input type="number" value={f.yearManufacture} onChange={(e) => set('yearManufacture', e.target.value)} />
            </Field>
            <Field label="Ano-modelo" required className="span-3" error={err('yearModel')}>
              <Input type="number" value={f.yearModel} onChange={(e) => set('yearModel', e.target.value)} />
            </Field>
            <Field label="Cor" required className="span-6" error={err('color')}>
              <Input value={f.color} onChange={(e) => set('color', e.target.value)} maxLength={40} />
            </Field>
            <Field label="Combustível" required className="span-3"><Select value={f.fuel} onChange={(e) => set('fuel', e.target.value)} options={FUEL_OPTIONS} /></Field>
            <Field label="Câmbio" required className="span-3"><Select value={f.transmission} onChange={(e) => set('transmission', e.target.value)} options={TRANSMISSION_OPTIONS} /></Field>
            <Field label="Portas" className="span-3" hint={model?.doors ? `Modelo: ${model.doors}` : undefined}><Input type="number" min={1} max={6} value={f.doors} onChange={(e) => set('doors', e.target.value)} /></Field>
            <Field label="Tanque (litros)" className="span-3" hint={model?.tankLiters ? `Modelo: ${model.tankLiters} L` : undefined}><Input type="number" min={1} value={f.tankCapacityLiters} onChange={(e) => set('tankCapacityLiters', e.target.value)} /></Field>
            {!vehicle && (
              <Field label="Quilometragem atual" required className="span-6" error={err('odometerKm')}>
                <Input type="number" min={0} value={f.odometerKm} onChange={(e) => set('odometerKm', e.target.value)} />
              </Field>
            )}
            <Field label="Localização (pátio, vaga)" className="span-6"><Input value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={120} /></Field>
          </FormGrid>
        )}
        {step === 2 && (
          <FormGrid>
            <Field label="Data de aquisição" className="span-4"><Input type="date" value={f.acquiredAt} onChange={(e) => set('acquiredAt', e.target.value)} /></Field>
            {financial && <Field label="Valor de aquisição" className="span-4"><MoneyInput value={f.acquisitionValue} onChange={(v) => set('acquisitionValue', v)} /></Field>}
            {financial && <Field label="Valor de mercado" className="span-4"><MoneyInput value={f.marketValue} onChange={(v) => set('marketValue', v)} /></Field>}
            <Field label="Fornecedor" className="span-6">
              <EntityPicker value={f.supplierId} onChange={(id) => set('supplierId', id)} load={loadSuppliers()} placeholder="Buscar fornecedor" initialLabel={vehicle?.supplier?.name} />
            </Field>
            <Field label="Vencimento do licenciamento" className="span-3"><Input type="date" value={f.licensingDueDate} onChange={(e) => set('licensingDueDate', e.target.value)} /></Field>
            <Field label="Vencimento do IPVA" className="span-3"><Input type="date" value={f.ipvaDueDate} onChange={(e) => set('ipvaDueDate', e.target.value)} /></Field>
            <div className="span-12"><Checkbox label="Pode aparecer no site público (sem placa nem dados internos)" checked={f.publicVisible} onChange={(e) => set('publicVisible', e.target.checked)} /></div>
            <Field label="Observações" className="span-12"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} /></Field>
          </FormGrid>
        )}
        {step === 3 && (
          <KeyValue items={[
            { label: 'Filial', value: branches.find((b) => b.id === f.branchId)?.name, hidden: Boolean(vehicle) },
            { label: 'Modelo', value: model ? `${model.make.name} ${model.name}` : '—' },
            { label: 'Versão', value: versions.data?.find((v) => v.id === f.versionId)?.name ?? '—' },
            { label: 'Placa', value: formatPlate(normalizePlate(f.plate)) },
            { label: 'Código interno', value: f.internalCode || 'Automático' },
            { label: 'RENAVAM', value: f.renavam || '—' },
            { label: 'Chassi', value: f.chassis || '—' },
            { label: 'Ano', value: `${f.yearManufacture}/${f.yearModel}` },
            { label: 'Cor', value: f.color },
            { label: 'Combustível', value: FUEL_TYPE_LABEL[f.fuel as keyof typeof FUEL_TYPE_LABEL] },
            { label: 'Câmbio', value: TRANSMISSION_LABEL[f.transmission as keyof typeof TRANSMISSION_LABEL] },
            { label: 'Quilometragem', value: km(Number(f.odometerKm)), hidden: Boolean(vehicle) },
            { label: 'Aquisição', value: f.acquiredAt ? date(f.acquiredAt) : '—' },
            { label: 'Valor de aquisição', value: money(f.acquisitionValue === '' ? null : f.acquisitionValue), hidden: !financial },
            { label: 'Licenciamento', value: f.licensingDueDate ? date(f.licensingDueDate) : '—' },
            { label: 'IPVA', value: f.ipvaDueDate ? date(f.ipvaDueDate) : '—' },
          ]} />
        )}
      </div>
    </Modal>
  );
}
