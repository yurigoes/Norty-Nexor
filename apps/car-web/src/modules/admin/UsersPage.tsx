import { useMemo, useState } from 'react';
import { Copy, KeyRound, Plus, UserPlus } from 'lucide-react';
import { Alert, Badge, Button, Card, Page, PageHeader } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select } from '../../components/form';
import { DataTable, SearchInput, type Column } from '../../components/table';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, money } from '../../lib/format';
import { useSession } from '../../lib/session';

export interface Member {
  id: string; userId: string; name: string; email: string; active: boolean; title: string | null;
  role: { id: string; name: string }; allBranches: boolean; branches: { id: string; name: string }[];
  approvalLimit: number | null; mfaEnabled: boolean; lastLoginAt: string | null; mustChangePassword: boolean;
}
interface Role { id: string; name: string; key: string }
interface Branch { id: string; name: string; code: string }

export function UsersPage() {
  const toast = useToast();
  const { session } = useSession();
  const members = useApi(() => api.get<Member[]>('/members'), []);
  const roles = useApi(() => api.get<Role[]>('/roles'), []);
  const branches = useApi(() => api.get<Branch[]>('/branches', { all: 'true' }), []);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const rows = useMemo(() => (members.data ?? []).filter((m) => !q || `${m.name} ${m.email} ${m.role.name}`.toLowerCase().includes(q.toLowerCase())), [members.data, q]);

  const columns: Column<Member>[] = [
    { key: 'name', header: 'Usuário', render: (m) => <div><div className="strong">{m.name}</div><div className="xsmall muted">{m.email}</div></div> },
    { key: 'role', header: 'Perfil', render: (m) => <div>{m.role.name}{m.title && <div className="xsmall muted">{m.title}</div>}</div> },
    { key: 'branches', header: 'Filiais', render: (m) => m.allBranches ? <Badge tone="brand">Todas</Badge> : <span className="small">{m.branches.map((b) => b.name).join(', ') || '—'}</span> },
    { key: 'limit', header: 'Alçada', align: 'right', render: (m) => m.approvalLimit === null ? <span className="muted">Sem limite próprio</span> : money(m.approvalLimit) },
    { key: 'security', header: 'Segurança', render: (m) => <div className="row" style={{ gap: 4 }}>{m.mfaEnabled ? <Badge tone="success">MFA</Badge> : <Badge>Sem MFA</Badge>}{m.mustChangePassword && <Badge tone="warning">Senha pendente</Badge>}</div> },
    { key: 'last', header: 'Último acesso', render: (m) => <span className="small">{dateTime(m.lastLoginAt)}</span> },
    { key: 'status', header: 'Situação', render: (m) => m.active ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge> },
  ];

  return (
    <Page>
      <PageHeader title="Usuários" description="Quem acessa a empresa, com qual perfil, em quais filiais e com qual alçada de aprovação."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>Convidar usuário</Button>} />
      {link && (
        <Alert tone="warning" title="Entregue este link ao usuário" action={<Button size="sm" icon={Copy} onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado'))}>Copiar</Button>}>
          O envio de e-mail não está configurado. O link abaixo permite definir a senha por 60 minutos e não será exibido de novo:
          <div className="mono small" style={{ wordBreak: 'break-all', marginTop: 6 }}>{link}</div>
        </Alert>
      )}
      <Card flush>
        <DataTable columns={columns} rows={rows} loading={members.loading} error={members.error} onRetry={members.reload}
          onRowClick={(m) => setEditing(m)} toolbar={<SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, e-mail ou perfil" />}
          empty={{ title: 'Nenhum usuário', description: 'Convide a equipe da locadora.', icon: Plus }} />
      </Card>
      {editing && (
        <MemberModal member={editing === 'new' ? null : editing} roles={roles.data ?? []} branches={branches.data ?? []} selfId={session?.user.id}
          onClose={() => setEditing(null)}
          onSaved={(accessLink) => { setEditing(null); members.reload(); if (accessLink) setLink(accessLink); }}
          onLink={setLink} />
      )}
    </Page>
  );
}

function MemberModal({ member, roles, branches, selfId, onClose, onSaved, onLink }: {
  member: Member | null; roles: Role[]; branches: Branch[]; selfId?: string; onClose: () => void; onSaved: (link?: string | null) => void; onLink: (l: string) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(member?.role.id ?? '');
  const [title, setTitle] = useState(member?.title ?? '');
  const [allBranches, setAll] = useState(member?.allBranches ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(member?.branches.map((b) => b.id) ?? []);
  const [limit, setLimit] = useState<number | ''>(member?.approvalLimit ?? '');
  const [active, setActive] = useState(member?.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (member) {
        await api.patch(`/members/${member.id}`, { roleId, title: title || undefined, allBranches, branchIds: allBranches ? [] : branchIds, approvalLimit: limit === '' ? null : limit, active });
        toast.success('Usuário atualizado');
        onSaved();
      } else {
        const r = await api.post<{ accessLink: string | null; emailStatus: string; isNewUser: boolean }>('/members', { email, name, roleId, title: title || undefined, allBranches, branchIds: allBranches ? [] : branchIds, approvalLimit: limit === '' ? null : limit });
        toast.success('Usuário convidado', r.isNewUser ? (r.emailStatus === 'SENT' ? 'O convite foi enviado por e-mail.' : 'Copie o link de acesso exibido.') : 'A conta já existia e recebeu acesso a esta empresa.');
        onSaved(r.accessLink);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = roleId && (allBranches || branchIds.length) && (member || (email && name));
  return (
    <Modal open onClose={onClose} size="lg" title={member ? member.name : 'Convidar usuário'} description={member?.email ?? 'Se o e-mail já tiver conta no Norty Car, ela ganha acesso a esta empresa.'}
      footer={<>
        {member && <Button icon={KeyRound} onClick={() => api.post<{ link: string }>(`/members/${member.id}/reset-link`).then((r) => { onLink(r.link); onClose(); }).catch((e) => toast.error(errorMessage(e)))}>Gerar link de senha</Button>}
        <span className="grow" />
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!valid} onClick={save}>{member ? 'Salvar' : 'Convidar'}</Button>
      </>}>
      <FormGrid>
        {!member && <Field label="Nome" required className="span-6"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        {!member && <Field label="E-mail" required className="span-6"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
        <Field label="Perfil" required className="span-6"><Select value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="Selecione" options={roles.map((r) => ({ value: r.id, label: r.name }))} /></Field>
        <Field label="Cargo (opcional)" className="span-6"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Alçada de aprovação" className="span-6" hint="Valor máximo que pode aprovar sozinho. Vazio = limitado só pela permissão."><MoneyInput value={limit} onChange={setLimit} /></Field>
        <div className="span-6 stack-sm">
          <span className="nc-label">Filiais</span>
          <Checkbox label="Todas as filiais (visão consolidada)" checked={allBranches} onChange={(e) => setAll(e.target.checked)} />
          {!allBranches && branches.map((b) => (
            <Checkbox key={b.id} label={`${b.name} (${b.code})`} checked={branchIds.includes(b.id)}
              onChange={(e) => setBranchIds((ids) => (e.target.checked ? [...ids, b.id] : ids.filter((i) => i !== b.id)))} />
          ))}
        </div>
        {member && member.userId !== selfId && (
          <div className="span-12"><Checkbox label="Acesso ativo (desmarcar encerra as sessões na hora)" checked={active} onChange={(e) => setActive(e.target.checked)} /></div>
        )}
      </FormGrid>
    </Modal>
  );
}
