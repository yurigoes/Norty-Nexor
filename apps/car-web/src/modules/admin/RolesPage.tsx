import { useMemo, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { MODULE_LABEL, PERMISSIONS, type Permission } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, Input, Textarea } from '../../components/form';
import { Modal, useConfirm } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';

interface Role { id: string; key: string; name: string; description: string | null; permissions: string[]; templateKey: string | null; _count: { memberships: number } }

const GROUPS = Object.entries(PERMISSIONS).reduce<Record<string, Permission[]>>((acc, [key, def]) => {
  (acc[def.group] ??= []).push(key as Permission);
  return acc;
}, {});

export function RolesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasModule } = useSession();
  const roles = useApi(() => api.get<Role[]>('/roles'), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = useMemo(() => roles.data?.find((r) => r.id === (selectedId ?? roles.data?.[0]?.id)) ?? null, [roles.data, selectedId]);
  const current = draft ?? new Set(selected?.permissions ?? []);
  const dirty = draft !== null;

  const toggle = (p: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(p); else next.delete(p);
    setDraft(next);
  };

  const save = async () => {
    if (!selected) return;
    try {
      await api.patch(`/roles/${selected.id}`, { permissions: [...current] });
      toast.success('Permissões salvas', 'A mudança vale na próxima ação de cada usuário.');
      setDraft(null);
      roles.reload();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  if (roles.loading && !roles.data) return <LoadingBlock />;
  if (roles.error) return <ErrorState message={roles.error} onRetry={roles.reload} />;

  return (
    <Page>
      <PageHeader title="Perfis e permissões" description="Os perfis-modelo são pontos de partida editáveis. A permissão vale no menu e no servidor."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo perfil</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 'var(--space-5)' }} className="roles-layout">
        <Card flush>
          <ul className="nc-list">
            {roles.data?.map((r) => (
              <li key={r.id} style={{ cursor: 'pointer', background: r.id === selected?.id ? 'var(--brand-softer)' : undefined }}
                onClick={() => { setSelectedId(r.id); setDraft(null); }} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && (setSelectedId(r.id), setDraft(null))}>
                <div className="grow">
                  <div className="strong">{r.name}</div>
                  <div className="xsmall muted">{r.permissions.length} permissões · {r._count.memberships} usuário(s)</div>
                </div>
                {r.templateKey ? <Badge>Modelo</Badge> : <Badge tone="brand">Personalizado</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        {selected ? (
          <Card title={selected.name} subtitle={selected.description ?? undefined}
            actions={<>
              {!selected.templateKey && <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => {
                const r = await confirm({ title: 'Excluir perfil', message: `O perfil "${selected.name}" será excluído.`, confirmLabel: 'Excluir' });
                if (r.confirmed) api.del(`/roles/${selected.id}`).then(() => { toast.success('Perfil excluído'); setSelectedId(null); roles.reload(); }).catch((e) => toast.error(errorMessage(e)));
              }}>Excluir</Button>}
              <Button size="sm" onClick={() => setDraft(null)} disabled={!dirty}>Descartar</Button>
              <Button size="sm" variant="primary" icon={Save} onClick={save} disabled={!dirty}>Salvar</Button>
            </>}>
            <div className="stack-lg">
              {dirty && <Alert tone="warning">Alterações não salvas.</Alert>}
              {Object.entries(GROUPS).map(([group, perms]) => (
                <fieldset key={group} className="nc-fieldset">
                  <legend>{group}</legend>
                  <div className="grid-2" style={{ gap: 'var(--space-2) var(--space-4)' }}>
                    {perms.map((p) => {
                      const def = PERMISSIONS[p];
                      const moduleOff = !hasModule(def.module);
                      return (
                        <Checkbox key={p} checked={current.has(p)} onChange={(e) => toggle(p, e.target.checked)}
                          label={<span>{def.label}{moduleOff && <span className="xsmall muted"> · módulo {MODULE_LABEL[def.module]} fora do plano</span>}</span>} />
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>
        ) : <EmptyState title="Selecione um perfil" />}
      </div>
      {creating && <NewRoleModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelectedId(id); roles.reload(); }} />}
      <style>{`@media (max-width: 860px) { .roles-layout { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </Page>
  );
}

function NewRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Novo perfil" description="Comece vazio e marque as permissões em seguida."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={name.length < 2} onClick={async () => {
        setBusy(true);
        try { const r = await api.post<{ id: string }>('/roles', { name, description: description || undefined, permissions: ['dashboard.view', 'notifications.view'] }); toast.success('Perfil criado'); onCreated(r.id); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Criar</Button></>}>
      <div className="stack">
        <Field label="Nome" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Descrição"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
