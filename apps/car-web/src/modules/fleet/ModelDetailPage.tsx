/* Ficha do modelo: visualizador, fotos, arquivo 3D, versões e unidades reais. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Box, Image as ImageIcon, Pencil, Plus, Star } from 'lucide-react';
import { FUEL_TYPE_LABEL, TRANSMISSION_LABEL, type FileRef } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal } from '../../components/overlay';
import { Dropzone, SecureImage, uploadFile } from '../../components/files';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { Vehicle3DViewer } from '../../components/viewer3d/Vehicle3DViewer';
import { API_ORIGIN, api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { km } from '../../lib/format';
import { useSession } from '../../lib/session';
import { FUEL_OPTIONS, TRANSMISSION_OPTIONS, useCategories, type VersionRow } from './shared';
import './fleet.css';

interface ModelDetail {
  id: string; name: string; categoryId: string; bodyType: string | null; seats: number | null; doors: number | null; trunkLiters: number | null;
  tankLiters: number | null; description: string | null; specs: Record<string, unknown>; hotspots: { key: string; label: string; description?: string; position: [number, number, number] }[];
  coverFileId: string | null; model3dFileId: string | null; publicVisible: boolean; active: boolean;
  make: { name: string }; category: { name: string }; versions: VersionRow[];
  units: { id: string; plate: string; internalCode: string; color: string; yearModel: number; commercialStatus: string; operationalStatus: string; odometerKm: number }[];
  photos: FileRef[]; model3d: FileRef | null; colors: string[];
}

/** Links temporários (assinados) para exibir arquivos protegidos. */
function useSignedUrls(ids: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => api.get<{ url: string }>(`/files/${id}/url`).then((r) => [id, `${API_ORIGIN}${r.url}`] as const).catch(() => null)))
      .then((list) => alive && setUrls(Object.fromEntries(list.filter(Boolean) as [string, string][])));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

export function ModelDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const toast = useToast();
  const m = useApi(() => api.get<ModelDetail>(`/catalog/models/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState<VersionRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const photoIds = (m.data?.photos ?? []).map((p) => p.id);
  const ordered = m.data?.coverFileId ? [m.data.coverFileId, ...photoIds.filter((p) => p !== m.data!.coverFileId)] : photoIds;
  const urls = useSignedUrls([...ordered, ...(m.data?.model3dFileId ? [m.data.model3dFileId] : [])]);
  const manage = can('catalog.manage');

  if (m.loading && !m.data) return <LoadingBlock />;
  if (m.error || !m.data) return <ErrorState message={m.error ?? 'Modelo não encontrado.'} onRetry={m.reload} />;
  const d = m.data;
  const live = d.units.filter((u) => u.commercialStatus !== 'SOLD');
  const available = live.filter((u) => u.commercialStatus === 'AVAILABLE' && u.operationalStatus === 'RELEASED').length;

  const upload = async (files: File[], category: 'photo' | 'model3d') => {
    setBusy(true);
    try {
      let last: FileRef | null = null;
      for (const f of files) last = await uploadFile(f, { entityType: 'VehicleModel', entityId: id, category });
      if (category === 'model3d' && last) await api.patch(`/catalog/models/${id}`, { model3dFileId: last.id });
      if (category === 'photo' && last && !d.coverFileId) await api.patch(`/catalog/models/${id}`, { coverFileId: last.id });
      toast.success(category === 'model3d' ? 'Arquivo 3D enviado' : 'Foto(s) enviada(s)');
      m.reload();
    } catch (e) { toast.error('Falha no envio', errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader breadcrumb={<><Link to="/frota/modelos">Modelos</Link><span>/</span><span>{d.make.name} {d.name}</span></>}
        title={`${d.make.name} ${d.name}`} description={`${d.category.name}${d.bodyType ? ` · ${d.bodyType}` : ''}`}
        actions={manage && <Button icon={Pencil} onClick={() => setEditing(true)}>Editar ficha</Button>} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Vehicle3DViewer title={`${d.make.name} ${d.name}`} photos={ordered.map((p) => urls[p]).filter(Boolean)}
            modelUrl={d.model3dFileId ? urls[d.model3dFileId] ?? null : null} unavailable={live.length > 0 && available === 0} hotspots={d.hotspots} height={360} />
          {!d.model3dFileId && <Alert tone="neutral">Sem arquivo 3D: o site mostra as fotos. Envie um .glb licenciado para habilitar a visualização em 360°.</Alert>}
        </div>
        <Card title="Ficha técnica">
          <KeyValue items={[
            { label: 'Lugares', value: d.seats }, { label: 'Portas', value: d.doors },
            { label: 'Porta-malas', value: d.trunkLiters ? `${d.trunkLiters} L` : null }, { label: 'Tanque', value: d.tankLiters ? `${d.tankLiters} L` : null },
            { label: 'No site público', value: d.publicVisible ? 'Sim' : 'Não' }, { label: 'Unidades em frota', value: `${live.length} (${available} disponíveis agora)` },
          ]} />
          {d.description && <p className="small" style={{ marginTop: 'var(--space-4)', whiteSpace: 'pre-wrap' }}>{d.description}</p>}
          <div className="stack-sm" style={{ marginTop: 'var(--space-4)' }}>
            <span className="nc-section-title">Cores na frota</span>
            {d.colors.length ? <div className="row" style={{ gap: 6 }}>{d.colors.map((c) => <span key={c} className="color-chip">{c}</span>)}</div> : <span className="small muted">Nenhuma unidade cadastrada.</span>}
          </div>
        </Card>
      </div>

      <Card title="Fotos" subtitle="A foto marcada como capa abre o catálogo e o site." actions={busy && <span className="nc-spinner" aria-hidden />}>
        <div className="stack">
          {d.photos.length ? (
            <div className="nc-thumbs">
              {d.photos.map((p) => (
                <div key={p.id} className="nc-thumb">
                  <SecureImage fileId={p.id} alt={p.name} />
                  {manage && (
                    <button type="button" className="nc-btn nc-btn--secondary nc-btn--sm" style={{ position: 'absolute', bottom: 4, right: 4 }}
                      aria-label={d.coverFileId === p.id ? 'Capa atual' : 'Usar como capa'} disabled={d.coverFileId === p.id}
                      onClick={() => api.patch(`/catalog/models/${id}`, { coverFileId: p.id }).then(() => m.reload()).catch((e) => toast.error(errorMessage(e)))}>
                      <Star size={14} aria-hidden />{d.coverFileId === p.id ? 'Capa' : ''}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : <EmptyState icon={ImageIcon} title="Sem fotos" />}
          {manage && <Dropzone onFiles={(f) => upload(f, 'photo')} accept="image/jpeg,image/png,image/webp" label="Enviar fotos do modelo" />}
        </div>
      </Card>

      {manage && (
        <Card title="Arquivo 3D" subtitle="Formato .glb (glTF binário). Use apenas arquivos com licença de uso.">
          <div className="stack">
            {d.model3d ? <div className="row"><Box size={18} aria-hidden /><span className="strong">{d.model3d.name}</span><Badge tone="success">Em uso</Badge></div> : <span className="small muted">Nenhum arquivo enviado.</span>}
            <Dropzone onFiles={(f) => upload(f.slice(0, 1), 'model3d')} accept=".glb,model/gltf-binary" multiple={false} label="Enviar arquivo .glb" />
          </div>
        </Card>
      )}

      <Card title="Versões" actions={manage && <Button size="sm" icon={Plus} onClick={() => setVersion('new')}>Nova versão</Button>} flush>
        <DataTable rows={d.versions} onRowClick={manage ? setVersion : undefined} empty={{ title: 'Nenhuma versão cadastrada' }} columns={[
          { key: 'name', header: 'Versão', render: (v) => <span className="strong">{v.name}</span> },
          { key: 'engine', header: 'Motor', render: (v) => v.engine ?? '—' },
          { key: 'fuel', header: 'Combustível', render: (v) => (v.fuel ? FUEL_TYPE_LABEL[v.fuel as keyof typeof FUEL_TYPE_LABEL] : '—') },
          { key: 'transmission', header: 'Câmbio', render: (v) => (v.transmission ? TRANSMISSION_LABEL[v.transmission as keyof typeof TRANSMISSION_LABEL] : '—') },
        ]} />
      </Card>

      <Card title="Unidades deste modelo" flush>
        <DataTable rows={d.units} onRowClick={(u) => navigate(`/frota/veiculos/${u.id}`)} empty={{ title: 'Nenhuma unidade cadastrada', description: 'Cadastre veículos em Frota › Veículos.' }} columns={[
          { key: 'plate', header: 'Placa', render: (u) => <Plate value={u.plate} /> },
          { key: 'code', header: 'Código', render: (u) => <span className="mono small">{u.internalCode}</span> },
          { key: 'color', header: 'Cor', render: (u) => u.color },
          { key: 'year', header: 'Ano-modelo', render: (u) => u.yearModel },
          { key: 'km', header: 'Quilometragem', align: 'right', render: (u) => km(u.odometerKm) },
          { key: 'c', header: 'Comercial', render: (u) => <Status kind="commercial" value={u.commercialStatus} /> },
          { key: 'o', header: 'Operacional', render: (u) => <Status kind="operational" value={u.operationalStatus} /> },
        ]} />
      </Card>
      {editing && <EditModelModal model={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); m.reload(); }} />}
      {version && <VersionModal modelId={id} version={version === 'new' ? null : version} onClose={() => setVersion(null)} onSaved={() => { setVersion(null); m.reload(); }} />}
    </Page>
  );
}

function EditModelModal({ model, onClose, onSaved }: { model: ModelDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const categories = useCategories();
  const s = (v: number | null) => (v === null ? '' : String(v));
  const [f, setF] = useState({
    name: model.name, categoryId: model.categoryId, bodyType: model.bodyType ?? '', seats: s(model.seats), doors: s(model.doors),
    trunkLiters: s(model.trunkLiters), tankLiters: s(model.tankLiters), description: model.description ?? '', publicVisible: model.publicVisible, active: model.active,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const n = (v: string) => (v ? Number(v) : null);
  return (
    <Modal open onClose={onClose} size="lg" title="Editar ficha do modelo"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={async () => {
        setBusy(true);
        try {
          await api.patch(`/catalog/models/${model.id}`, {
            name: f.name, categoryId: f.categoryId, bodyType: f.bodyType || null, seats: n(f.seats), doors: n(f.doors), trunkLiters: n(f.trunkLiters),
            tankLiters: n(f.tankLiters), description: f.description || null, publicVisible: f.publicVisible, active: f.active,
          });
          toast.success('Ficha atualizada');
          onSaved();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Nome" required className="span-6"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Categoria" required className="span-6"><Select value={f.categoryId} onChange={set('categoryId')} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Carroceria" className="span-6"><Input value={f.bodyType} onChange={set('bodyType')} /></Field>
        <Field label="Lugares" className="span-3"><Input type="number" value={f.seats} onChange={set('seats')} /></Field>
        <Field label="Portas" className="span-3"><Input type="number" value={f.doors} onChange={set('doors')} /></Field>
        <Field label="Porta-malas (L)" className="span-6"><Input type="number" value={f.trunkLiters} onChange={set('trunkLiters')} /></Field>
        <Field label="Tanque (L)" className="span-6"><Input type="number" value={f.tankLiters} onChange={set('tankLiters')} /></Field>
        <Field label="Descrição" className="span-12"><Textarea value={f.description} onChange={set('description')} maxLength={3000} /></Field>
        <div className="span-12 row">
          <Checkbox label="Exibir no site público" checked={f.publicVisible} onChange={set('publicVisible')} />
          <Checkbox label="Modelo ativo no catálogo" checked={f.active} onChange={set('active')} />
        </div>
      </FormGrid>
    </Modal>
  );
}

function VersionModal({ modelId, version, onClose, onSaved }: { modelId: string; version: VersionRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: version?.name ?? '', engine: version?.engine ?? '', fuel: version?.fuel ?? '', transmission: version?.transmission ?? '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={version ? 'Editar versão' : 'Nova versão'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={async () => {
        setBusy(true);
        const body = { name: f.name.trim(), engine: f.engine || (version ? null : undefined), fuel: f.fuel || (version ? null : undefined), transmission: f.transmission || (version ? null : undefined) };
        try {
          if (version) await api.patch(`/catalog/versions/${version.id}`, body);
          else await api.post(`/catalog/models/${modelId}/versions`, body);
          toast.success('Versão salva');
          onSaved();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Nome da versão" required className="span-6"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="LT 1.0" /></Field>
        <Field label="Motor" className="span-6"><Input value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value })} placeholder="1.0 turbo" /></Field>
        <Field label="Combustível" className="span-6"><Select value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })} placeholder="Não definido" options={FUEL_OPTIONS} /></Field>
        <Field label="Câmbio" className="span-6"><Select value={f.transmission} onChange={(e) => setF({ ...f, transmission: e.target.value })} placeholder="Não definido" options={TRANSMISSION_OPTIONS} /></Field>
      </FormGrid>
    </Modal>
  );
}
