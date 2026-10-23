/* Catálogo de modelos: o que a locadora oferece, separado das placas. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CarFront, Layers, Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Field, FormGrid, Input, Select, Textarea } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal } from '../../components/overlay';
import { SecureImage } from '../../components/files';
import { SearchInput } from '../../components/table';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { useCategories, useModels, type CategoryRow } from './shared';
import './fleet.css';

export function ModelsPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const models = useModels();
  const categories = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const rows = useMemo(() => (models.data ?? []).filter((m) =>
    (!categoryId || m.categoryId === categoryId) && (!q || `${m.make.name} ${m.name}`.toLowerCase().includes(q.toLowerCase()))), [models.data, categoryId, q]);

  return (
    <Page>
      <PageHeader title="Modelos" description="Catálogo de modelos com fotos, ficha técnica e visualização 3D. Várias placas compartilham o mesmo modelo."
        actions={can('catalog.manage') && <>
          <Button icon={Layers} onClick={() => setManaging(true)}>Categorias</Button>
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo modelo</Button>
        </>} />
      <div className="row-between">
        <div style={{ flex: 1, maxWidth: 360 }}><SearchInput value={q} onChange={setQ} placeholder="Buscar marca ou modelo" /></div>
        <div className="nc-filters" role="group" aria-label="Filtrar por categoria">
          <button type="button" className="nc-chip" aria-pressed={!categoryId} onClick={() => setCategoryId('')}>Todas</button>
          {categories.data?.map((c) => <button key={c.id} type="button" className="nc-chip" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</button>)}
        </div>
      </div>
      {models.loading && !models.data ? <LoadingBlock /> : models.error ? <ErrorState message={models.error} onRetry={models.reload} /> : !rows.length ? (
        <Card><EmptyState icon={CarFront} title="Nenhum modelo encontrado" description={q || categoryId ? 'Ajuste os filtros.' : 'Cadastre os modelos que a locadora oferece.'} /></Card>
      ) : (
        <div className="model-grid">
          {rows.map((m) => (
            <button key={m.id} type="button" className="nc-card model-card" onClick={() => navigate(`/frota/modelos/${m.id}`)}>
              <div className="model-card__media">
                {m.coverFileId ? <SecureImage fileId={m.coverFileId} alt={`${m.make.name} ${m.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CarFront size={48} aria-hidden />}
              </div>
              <div className="model-card__body">
                <div className="row-between">
                  <span className="strong">{m.make.name} {m.name}</span>
                  {!m.publicVisible && <Badge>Fora do site</Badge>}
                </div>
                <span className="small muted">{m.category.name}{m.seats ? ` · ${m.seats} lugares` : ''}{m._count.versions ? ` · ${m._count.versions} versão(ões)` : ''}</span>
                <div className="row" style={{ gap: 6 }}>
                  <Badge tone={m.unitCount ? 'brand' : 'neutral'}>{m.unitCount} unidade(s)</Badge>
                  {m.unitCount > 0 && <Badge tone={m.availableCount ? 'success' : 'warning'}>{m.availableCount} disponível(is)</Badge>}
                  {m.model3dFileId && <Badge tone="info">3D</Badge>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {creating && <ModelModal categories={categories.data ?? []} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/frota/modelos/${id}`)} />}
      {managing && <CategoriesModal onClose={() => { setManaging(false); categories.reload(); models.reload(); }} />}
    </Page>
  );
}

function ModelModal({ categories, onClose, onSaved }: { categories: CategoryRow[]; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const makes = useApi(() => api.get<{ id: string; name: string }[]>('/catalog/makes'), []);
  const [f, setF] = useState({ makeName: '', name: '', categoryId: '', bodyType: '', seats: '', doors: '', trunkLiters: '', tankLiters: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (v: string) => (v ? Number(v) : undefined);
  return (
    <Modal open onClose={onClose} size="lg" title="Novo modelo" description="Ficha de catálogo. Placas e cores reais são cadastradas nos veículos."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={f.makeName.trim().length < 2 || !f.name.trim() || !f.categoryId} onClick={async () => {
        setBusy(true);
        try {
          const r = await api.post<{ id: string }>('/catalog/models', {
            makeName: f.makeName.trim(), name: f.name.trim(), categoryId: f.categoryId, bodyType: f.bodyType || undefined, seats: n(f.seats), doors: n(f.doors),
            trunkLiters: n(f.trunkLiters), tankLiters: n(f.tankLiters), description: f.description || undefined,
          });
          toast.success('Modelo cadastrado');
          onSaved(r.id);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Cadastrar</Button></>}>
      <FormGrid>
        <Field label="Marca" required className="span-6" hint="Escolha da lista ou digite uma nova.">
          <Input list="nc-makes" value={f.makeName} onChange={set('makeName')} />
        </Field>
        <datalist id="nc-makes">{makes.data?.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <Field label="Modelo" required className="span-6"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Categoria" required className="span-6"><Select value={f.categoryId} onChange={set('categoryId')} placeholder="Selecione" options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Carroceria" className="span-6"><Input value={f.bodyType} onChange={set('bodyType')} placeholder="Hatch, sedã, SUV…" /></Field>
        <Field label="Lugares" className="span-3"><Input type="number" min={1} value={f.seats} onChange={set('seats')} /></Field>
        <Field label="Portas" className="span-3"><Input type="number" min={1} max={6} value={f.doors} onChange={set('doors')} /></Field>
        <Field label="Porta-malas (L)" className="span-3"><Input type="number" min={0} value={f.trunkLiters} onChange={set('trunkLiters')} /></Field>
        <Field label="Tanque (L)" className="span-3"><Input type="number" min={1} value={f.tankLiters} onChange={set('tankLiters')} /></Field>
        <Field label="Descrição" className="span-12"><Textarea value={f.description} onChange={set('description')} maxLength={3000} /></Field>
      </FormGrid>
    </Modal>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const list = useApi(() => api.get<CategoryRow[]>('/catalog/categories', { all: 'true' }), []);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <Modal open onClose={onClose} size="lg" title="Categorias" description="Tarifas e disponibilidade são calculadas por categoria.">
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Código"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="EXECUTIVO" /></Field>
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <Button variant="primary" icon={Plus} disabled={code.length < 2 || name.length < 2} onClick={() => api.post('/catalog/categories', { code, name })
            .then(() => { toast.success('Categoria criada'); setCode(''); setName(''); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Adicionar</Button>
        </div>
        <Card flush>
          <DataTable rows={list.data} loading={list.loading} error={list.error} columns={[
            { key: 'name', header: 'Categoria', render: (c) => <div><div className="strong">{c.name}</div><div className="xsmall mono muted">{c.code}</div></div> },
            { key: 'models', header: 'Modelos', align: 'right', render: (c) => c._count.models },
            { key: 'units', header: 'Veículos', align: 'right', render: (c) => c._count.units },
            { key: 'actions', header: '', render: (c) => (
              <Button size="sm" variant="ghost" onClick={() => api.patch(`/catalog/categories/${c.id}`, { active: !c.active })
                .then(() => list.reload()).catch((e) => toast.error(errorMessage(e)))}>{c.active ? 'Desativar' : 'Reativar'}</Button>
            ) },
          ]} />
        </Card>
      </div>
    </Modal>
  );
}
