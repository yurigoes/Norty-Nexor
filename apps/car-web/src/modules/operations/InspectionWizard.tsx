/* =========================================================
   Assistente de vistoria — pensado para o celular no pátio.
   Cada marcação vai para o servidor na hora: se o sinal cair
   no meio, o que já foi registrado está salvo e a vistoria
   pode ser retomada pela lista (situação "Em preenchimento").
   ========================================================= */
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  INSPECTION_ITEM_STATUS_LABEL, INSPECTION_TYPE_LABEL, VEHICLE_REGIONS,
  type InspectionDetail, type InspectionItemStatus, type InspectionType,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, ErrorState, LoadingBlock, Page, PageHeader, Plate, Segmented, Steps } from '../../components/ui';
import { Field, Input, Select, Textarea } from '../../components/form';
import { EntityPicker } from '../../components/picker';
import { SecureImage, uploadFile } from '../../components/files';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { loadContracts, loadDrivers, loadVehicles } from '../../lib/pickers';
import { DamageMap } from './DamageMap';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import './operations.css';

const STEPS = ['Veículo', 'Quilometragem', 'Checklist', 'Avarias', 'Observações', 'Confirmação'];
const STATUSES: InspectionItemStatus[] = ['OK', 'DAMAGED', 'MISSING', 'NA'];
const REGION_LABEL = Object.fromEntries(VEHICLE_REGIONS.map((r) => [r.key, r.label])) as Record<string, string>;
const TYPES = Object.keys(INSPECTION_TYPE_LABEL) as InspectionType[];

export function InspectionWizard() {
  const [params] = useSearchParams();
  const resumeId = params.get('id');
  const [id, setId] = useState<string | null>(resumeId);
  const detail = useApi(() => api.get<InspectionDetail>(`/inspections/${id}`), [id], Boolean(id));

  if (!id) return <StartStep params={params} onStarted={setId} />;
  if (detail.loading && !detail.data) return <LoadingBlock />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error ?? 'Vistoria não encontrada'} onRetry={detail.reload} />;
  return <FillSteps inspection={detail.data} onChange={detail.setData} reload={detail.reload} />;
}

/* ---------------- Etapa 0: o quê e qual carro ---------------- */

function StartStep({ params, onStarted }: { params: URLSearchParams; onStarted: (id: string) => void }) {
  const toast = useToast();
  const [type, setType] = useState<InspectionType>((TYPES.includes(params.get('type') as InspectionType) ? params.get('type') : 'PERIODIC') as InspectionType);
  const [vehicleUnitId, setVehicle] = useState<string | null>(params.get('vehicleUnitId'));
  const [contractId, setContract] = useState<string | null>(params.get('contractId'));
  const [driverId, setDriver] = useState<string | null>(params.get('driverId'));
  const [busy, setBusy] = useState(false);
  const prefilled = Boolean(params.get('contractId'));

  const start = async () => {
    setBusy(true);
    try {
      const created = await api.post<InspectionDetail>('/inspections', {
        type, vehicleUnitId, contractId: contractId || undefined, driverId: driverId || undefined,
      });
      window.history.replaceState(null, '', `/operacao/vistorias/nova?id=${created.id}`);
      onStarted(created.id);
    } catch (e) {
      toast.error('Não foi possível iniciar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <div className="op-wizard stack-lg">
        <PageHeader eyebrow="Nova vistoria" title="Qual vistoria você vai fazer?" description="Fotos e marcações são salvas no servidor a cada passo." />
        <Steps steps={STEPS} current={0} />
        <Card>
          <div className="stack">
            <Field label="Tipo" required>
              <Select value={type} onChange={(e) => setType(e.target.value as InspectionType)} options={TYPES.map((t) => ({ value: t, label: INSPECTION_TYPE_LABEL[t] }))} />
            </Field>
            <Field label="Veículo" required hint={prefilled ? 'Pré-preenchido a partir do contrato.' : 'Busque pela placa ou código interno.'}>
              <EntityPicker value={vehicleUnitId} onChange={(v) => setVehicle(v)} load={loadVehicles()} placeholder="Placa ou código" initialLabel={vehicleUnitId ? 'Veículo selecionado' : undefined} />
            </Field>
            <Field label="Contrato" hint={type === 'PERIODIC' ? 'Opcional na vistoria periódica.' : 'Entrega e devolução normalmente são ligadas ao contrato.'}>
              <EntityPicker value={contractId} onChange={(v) => setContract(v)} load={loadContracts()} placeholder="Número do contrato ou cliente" initialLabel={contractId ? 'Contrato selecionado' : undefined} />
            </Field>
            <Field label="Motorista" hint="Se ficar vazio, usamos o motorista principal do contrato.">
              <EntityPicker value={driverId} onChange={(v) => setDriver(v)} load={loadDrivers()} placeholder="Nome ou CPF" initialLabel={driverId ? 'Motorista selecionado' : undefined} />
            </Field>
            {(type === 'DELIVERY' || type === 'RETURN') && !contractId && (
              <Alert tone="warning">Sem contrato vinculado, esta vistoria não servirá para liberar a entrega ou a devolução do contrato.</Alert>
            )}
          </div>
        </Card>
        <div className="op-wizard__nav">
          <Button variant="primary" size="lg" icon={ChevronRight} loading={busy} disabled={!vehicleUnitId} onClick={start}>Iniciar vistoria</Button>
        </div>
      </div>
    </Page>
  );
}

/* ---------------- Etapas de preenchimento ---------------- */

function FillSteps({ inspection, onChange, reload }: { inspection: InspectionDetail; onChange: (d: InspectionDetail) => void; reload: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [odometer, setOdometer] = useState<string>(inspection.odometerKm?.toString() ?? '');
  const [fuel, setFuel] = useState<number | null>(inspection.fuelEighths);
  const [notes, setNotes] = useState(inspection.notes ?? '');
  const [pendencies, setPendencies] = useState(inspection.pendencies ?? '');
  const [saving, setSaving] = useState(false);

  if (inspection.status !== 'DRAFT') {
    return (
      <Page>
        <Alert tone="info" title="Vistoria já concluída" action={<Button onClick={() => navigate(`/operacao/vistorias/${inspection.id}`)}>Abrir</Button>}>
          As evidências de uma vistoria concluída não podem ser alteradas.
        </Alert>
      </Page>
    );
  }

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      onChange(await api.patch<InspectionDetail>(`/inspections/${inspection.id}`, body));
      return true;
    } catch (e) {
      toast.error('Não foi possível salvar', errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 1) {
      const km = Number(odometer);
      if (!odometer || Number.isNaN(km) || km < 0) return toast.error('Informe a quilometragem do painel.');
      if (fuel === null) return toast.error('Informe o nível de combustível.');
      if (km < inspection.vehicle.odometerKm) {
        toast.info('Quilometragem menor que a registrada', `O último registro do carro é ${inspection.vehicle.odometerKm.toLocaleString('pt-BR')} km. Confira o painel.`);
      }
      if (!(await patch({ odometerKm: km, fuelEighths: fuel }))) return;
    }
    if (step === 4 && !(await patch({ notes: notes || undefined, pendencies: pendencies || undefined }))) return;
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0 });
  };

  return (
    <Page>
      <div className="op-wizard stack-lg">
        <PageHeader eyebrow={`${INSPECTION_TYPE_LABEL[inspection.type]} · ${inspection.number}`}
          title={<span className="row"><Plate value={inspection.vehicle.plate} /> {inspection.vehicle.model.make.name} {inspection.vehicle.model.name}</span>}
          description={[inspection.vehicle.color, inspection.contract ? `Contrato ${inspection.contract.number} · ${inspection.contract.customer.name}` : null, inspection.driver ? `Motorista ${inspection.driver.name}` : null].filter(Boolean).join(' · ')} />
        <Steps steps={STEPS} current={step} />

        {step === 1 && (
          <Card title="Quilometragem e combustível">
            <div className="stack">
              <Field label="Quilometragem no painel" required hint={`Último registro do carro: ${inspection.vehicle.odometerKm.toLocaleString('pt-BR')} km`}>
                <Input inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} autoFocus />
              </Field>
              <div className="stack-sm">
                <span className="nc-label">Combustível (oitavos do tanque)</span>
                <div className="op-fuel" role="group" aria-label="Nível de combustível">
                  {Array.from({ length: 9 }, (_, i) => (
                    <button key={i} type="button" aria-pressed={fuel === i} onClick={() => setFuel(i)}>
                      {i === 0 ? 'Vazio' : i === 8 ? 'Cheio' : `${i}/8`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {step === 2 && <ChecklistStep inspection={inspection} onChange={onChange} reload={reload} />}
        {step === 3 && <DamagesStep inspection={inspection} reload={reload} />}

        {step === 4 && (
          <Card title="Observações e pendências">
            <div className="stack">
              <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} /></Field>
              <Field label="Pendências" hint="O que precisa ser resolvido antes ou depois da entrega."><Textarea value={pendencies} onChange={(e) => setPendencies(e.target.value)} rows={3} /></Field>
            </div>
          </Card>
        )}

        {step === 5 && <ConfirmStep inspection={inspection} onDone={() => navigate(`/operacao/vistorias/${inspection.id}`)} />}

        <div className="op-wizard__nav">
          <Button size="lg" icon={ChevronLeft} disabled={step <= 1} onClick={() => setStep((s) => s - 1)}>Voltar</Button>
          {step < 5 && <Button size="lg" variant="primary" icon={ChevronRight} loading={saving} onClick={next}>Avançar</Button>}
        </div>
      </div>
    </Page>
  );
}

/* ---------------- Checklist ---------------- */

function ChecklistStep({ inspection, onChange, reload }: { inspection: InspectionDetail; onChange: (d: InspectionDetail) => void; reload: () => void }) {
  const toast = useToast();
  const areas = useMemo(() => [...new Set(inspection.items.map((i) => i.area))], [inspection.items]);
  const [uploading, setUploading] = useState<string | null>(null);

  const setStatus = async (key: string, status: InspectionItemStatus, notes?: string | null) => {
    const item = inspection.items.find((i) => i.key === key)!;
    // Atualização otimista: o vistoriador não espera a rede para o próximo toque.
    onChange({ ...inspection, items: inspection.items.map((i) => (i.key === key ? { ...i, status, notes: notes === undefined ? i.notes : notes } : i)) });
    try {
      await api.put(`/inspections/${inspection.id}/items/${key}`, { status, notes: notes === undefined ? item.notes : notes });
    } catch (e) {
      toast.error('Não foi possível salvar o item', errorMessage(e));
      reload();
    }
  };

  const addPhoto = async (key: string, files: File[]) => {
    setUploading(key);
    try {
      for (const f of files) {
        const ref = await uploadFile(f, { entityType: 'Inspection', entityId: inspection.id, category: 'foto' });
        await api.post(`/inspections/${inspection.id}/photos`, { fileId: ref.id, itemKey: key });
      }
      toast.success(files.length > 1 ? `${files.length} fotos anexadas` : 'Foto anexada');
      reload();
    } catch (e) {
      toast.error('Falha ao enviar a foto', errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="stack">
      {areas.map((area) => (
        <Card key={area} title={area}>
          {inspection.items.filter((i) => i.area === area).map((item) => {
            const photos = inspection.photos.filter((p) => p.itemKey === item.key);
            return (
              <div className="op-item" key={item.key}>
                <div className="row-between">
                  <span className="strong">{item.label}</span>
                  {photos.length > 0 && <Badge tone="info">{photos.length} foto(s)</Badge>}
                </div>
                <div className="op-item__status" role="group" aria-label={`Situação de ${item.label}`}>
                  {STATUSES.map((s) => (
                    <button key={s} type="button" data-s={s} aria-pressed={item.status === s} onClick={() => setStatus(item.key, s)}>{INSPECTION_ITEM_STATUS_LABEL[s]}</button>
                  ))}
                </div>
                {(item.status === 'DAMAGED' || item.status === 'MISSING' || item.notes) && (
                  <Input placeholder={item.status === 'DAMAGED' ? 'Descreva a avaria (ou anexe foto)' : 'Observação'} defaultValue={item.notes ?? ''}
                    onBlur={(e) => e.target.value !== (item.notes ?? '') && setStatus(item.key, item.status, e.target.value || null)} aria-label={`Observação de ${item.label}`} />
                )}
                <PhotoButton busy={uploading === item.key} onFiles={(f) => addPhoto(item.key, f)} label={`Foto de ${item.label}`} />
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

function PhotoButton({ onFiles, busy, label }: { onFiles: (f: File[]) => void; busy: boolean; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Button size="sm" icon={Camera} loading={busy} onClick={() => input.current?.click()} aria-label={label}>Foto</Button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) onFiles(f); }} />
    </div>
  );
}

/* ---------------- Mapa de avarias ---------------- */

function DamagesStep({ inspection, reload }: { inspection: InspectionDetail; reload: () => void }) {
  const toast = useToast();
  const [region, setRegion] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'LIGHT' | 'MEDIUM' | 'SEVERE'>('LIGHT');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const add = async () => {
    if (!region) return;
    setBusy(true);
    try {
      await api.post(`/inspections/${inspection.id}/damages`, { region, severity, description });
      setDescription('');
      toast.success('Avaria registrada');
      reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const photo = async (files: File[]) => {
    if (!region) return;
    setUploading(true);
    try {
      for (const f of files) {
        const ref = await uploadFile(f, { entityType: 'Inspection', entityId: inspection.id, category: 'avaria' });
        await api.post(`/inspections/${inspection.id}/photos`, { fileId: ref.id, region });
      }
      reload();
    } catch (e) { toast.error('Falha ao enviar a foto', errorMessage(e)); } finally { setUploading(false); }
  };

  return (
    <div className="stack">
      <Card title="Mapa de avarias" subtitle="Toque na região do carro para registrar uma avaria.">
        <div className="stack">
          <DamageMap damaged={inspection.damages.map((d) => d.region)} selected={region} onSelect={setRegion} />
          {region && (
            <div className="stack nc-card" style={{ padding: 'var(--space-4)' }}>
              <span className="strong">{REGION_LABEL[region]}</span>
              <Segmented label="Gravidade" value={severity} onChange={setSeverity} options={[{ value: 'LIGHT', label: 'Leve' }, { value: 'MEDIUM', label: 'Média' }, { value: 'SEVERE', label: 'Grave' }]} />
              <Field label="Descrição" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: risco de 10 cm, amassado" /></Field>
              <div className="row">
                <Button variant="primary" icon={Plus} loading={busy} disabled={description.trim().length < 3} onClick={add}>Registrar avaria</Button>
                <PhotoButton busy={uploading} onFiles={photo} label={`Foto de ${REGION_LABEL[region]}`} />
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card title="Avarias registradas" flush>
        {!inspection.damages.length ? <div className="nc-empty"><span className="muted">Nenhuma avaria registrada nesta vistoria.</span></div> : (
          <ul className="nc-list">
            {inspection.damages.map((d) => (
              <li key={d.id}>
                <div className="grow">
                  <div className="strong">{d.regionLabel} <Badge tone={d.severity === 'SEVERE' ? 'danger' : d.severity === 'MEDIUM' ? 'warning' : 'neutral'}>{d.severity === 'SEVERE' ? 'Grave' : d.severity === 'MEDIUM' ? 'Média' : 'Leve'}</Badge></div>
                  <div className="small muted">{d.description} · {inspection.photos.filter((p) => p.region === d.region).length} foto(s)</div>
                </div>
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover avaria" onClick={() => api.del(`/inspections/${inspection.id}/damages/${d.id}`).then(reload).catch((e) => toast.error(errorMessage(e)))} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {inspection.photos.length > 0 && (
        <Card title={`Fotos (${inspection.photos.length})`}>
          <div className="op-gallery">
            {inspection.photos.map((p) => (
              <figure key={p.id}>
                <div><SecureImage fileId={p.fileId} alt={p.caption ?? 'Foto da vistoria'} /></div>
                <figcaption>{p.itemKey ? inspection.items.find((i) => i.key === p.itemKey)?.label : p.region ? REGION_LABEL[p.region] : 'Geral'}</figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------------- Confirmação ---------------- */

function ConfirmStep({ inspection, onDone }: { inspection: InspectionDetail; onDone: () => void }) {
  const toast = useToast();
  const pad = useRef<SignaturePadHandle>(null);
  const [mode, setMode] = useState<'SIGNATURE_DRAWN' | 'ACKNOWLEDGED_IN_PERSON'>('SIGNATURE_DRAWN');
  const [signer, setSigner] = useState(inspection.driver?.name ?? inspection.contract?.customer.name ?? '');
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const issues = inspection.items.filter((i) => i.status === 'DAMAGED' || i.status === 'MISSING');

  const finish = async () => {
    setBusy(true);
    try {
      let signatureFileId: string | undefined;
      if (mode === 'SIGNATURE_DRAWN') {
        const blob = await pad.current?.toBlob();
        if (!blob) throw new Error('Colete a assinatura antes de concluir.');
        const ref = await uploadFile(new File([blob], 'assinatura.png', { type: 'image/png' }), { entityType: 'Inspection', entityId: inspection.id, category: 'assinatura' });
        signatureFileId = ref.id;
      }
      await api.post(`/inspections/${inspection.id}/complete`, { confirmationType: mode, signatureFileId, signerName: signer.trim() });
      toast.success('Vistoria concluída', 'As evidências foram registradas e não podem mais ser alteradas.');
      onDone();
    } catch (e) {
      toast.error('Não foi possível concluir', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card title="Resumo">
        <div className="stack-sm small">
          <span>Quilometragem: <strong className="tnum">{inspection.odometerKm?.toLocaleString('pt-BR') ?? '—'} km</strong> · combustível <strong>{inspection.fuelEighths ?? '—'}/8</strong></span>
          <span>{issues.length} item(ns) com ressalva · {inspection.damages.length} avaria(s) no mapa · {inspection.photos.length} foto(s)</span>
          {issues.length > 0 && <span className="muted">{issues.map((i) => `${i.label}: ${INSPECTION_ITEM_STATUS_LABEL[i.status]}`).join(' · ')}</span>}
        </div>
      </Card>
      <Card title="Confirmação">
        <div className="stack">
          <Segmented label="Forma de confirmação" value={mode} onChange={setMode} options={[{ value: 'SIGNATURE_DRAWN', label: 'Assinatura' }, { value: 'ACKNOWLEDGED_IN_PERSON', label: 'Ciência presencial' }]} />
          <Field label="Nome de quem confirma" required><Input value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
          {mode === 'SIGNATURE_DRAWN' ? <SignaturePad ref={pad} onChange={setHasInk} /> : (
            <Alert tone="neutral">A pessoa acompanhou a vistoria e confirmou verbalmente. O nome informado fica registrado com data, hora e o seu usuário.</Alert>
          )}
          <Alert tone="info">Ao concluir, itens, avarias e fotos ficam congelados. Para corrigir algo depois, abra uma nova vistoria.</Alert>
          <Button variant="success" size="lg" icon={Check} loading={busy} disabled={signer.trim().length < 3 || (mode === 'SIGNATURE_DRAWN' && !hasInk)} onClick={finish}>Concluir vistoria</Button>
        </div>
      </Card>
    </div>
  );
}
