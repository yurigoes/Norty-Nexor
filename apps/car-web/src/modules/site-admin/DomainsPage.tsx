import { useState } from 'react';
import { Copy, Globe, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import type { DomainRow } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { Modal, useConfirm } from '../../components/overlay';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { relative } from '../../lib/format';

/** Domínio próprio em três passos: cadastrar, provar a propriedade pelo DNS e apontar. */
export function DomainsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useApi(() => api.get<DomainRow[]>('/domains'), []);
  const [adding, setAdding] = useState(false);
  const [host, setHost] = useState('');
  const [checking, setChecking] = useState<string | null>(null);
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success('Copiado'));

  const verify = async (d: DomainRow) => {
    setChecking(d.id);
    try {
      const r = await api.post<DomainRow>(`/domains/${d.id}/verify`);
      if (r.status === 'ACTIVE') toast.success('Domínio ativo', 'O certificado HTTPS é emitido no primeiro acesso.');
      else toast.info('Ainda não está pronto', r.lastCheckError ?? undefined);
      list.reload();
    } catch (e) { toast.error(errorMessage(e)); } finally { setChecking(null); }
  };

  return (
    <Page>
      <PageHeader title="Domínios" description="Endereços do site público. Cada domínio serve somente a sua empresa, depois da verificação de propriedade."
        actions={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Adicionar domínio</Button>} />
      {list.loading && !list.data ? <LoadingBlock /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.length ? (
        <Card><EmptyState icon={Globe} title="Nenhum domínio" description="O subdomínio Norty é criado ao publicar o site. Para usar um domínio próprio, adicione-o aqui." /></Card>
      ) : list.data.map((d) => (
        <Card key={d.id}
          title={<span className="row"><span className="mono">{d.hostname}</span>{d.isPrimary && <Badge tone="brand">Principal</Badge>}{d.kind === 'SUBDOMAIN' && <Badge>Subdomínio Norty</Badge>}</span>}
          subtitle={d.lastCheckedAt ? `Última verificação ${relative(d.lastCheckedAt)}` : undefined}
          actions={<>
            <Status kind="domain" value={d.status} />
            {d.kind === 'CUSTOM' && <Button size="sm" icon={RefreshCw} loading={checking === d.id} onClick={() => verify(d)}>Verificar agora</Button>}
            {d.status === 'ACTIVE' && !d.isPrimary && <Button size="sm" icon={Star} onClick={() => api.post(`/domains/${d.id}/primary`).then(() => { toast.success('Domínio principal definido'); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Tornar principal</Button>}
            <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover domínio" onClick={async () => {
              const r = await confirm({ title: 'Remover domínio', message: `${d.hostname} deixa de abrir o site e fica livre para outro uso.`, requireReason: true, confirmLabel: 'Remover' });
              if (r.confirmed) api.del(`/domains/${d.id}`, { reason: r.reason }).then(() => { toast.success('Domínio removido'); list.reload(); }).catch((e) => toast.error(errorMessage(e)));
            }} />
          </>}>
          {d.instructions ? (
            <div className="stack">
              {d.lastCheckError && d.status !== 'ACTIVE' && <Alert tone={d.status === 'MISCONFIGURED' ? 'danger' : 'warning'}>{d.lastCheckError}</Alert>}
              <p className="small muted">No painel de DNS do seu provedor de domínio, crie os dois registros abaixo. A propagação pode levar de minutos a algumas horas.</p>
              <div className="nc-table-wrap">
                <table className="nc-table">
                  <thead><tr><th>Passo</th><th>Tipo</th><th>Nome</th><th>Valor</th><th /></tr></thead>
                  <tbody>
                    <tr><td>1. Provar a propriedade</td><td className="mono">{d.instructions.txt.type}</td><td className="mono small">{d.instructions.txt.name}</td><td className="mono small">{d.instructions.txt.value}</td><td className="actions"><Button size="sm" variant="ghost" icon={Copy} aria-label="Copiar valor TXT" onClick={() => copy(d.instructions!.txt.value)} /></td></tr>
                    <tr><td>2. Apontar para a Norty</td><td className="mono">{d.instructions.pointer.type}</td><td className="mono small">{d.instructions.pointer.name}</td><td className="mono small">{d.instructions.pointer.value}</td><td className="actions"><Button size="sm" variant="ghost" icon={Copy} aria-label="Copiar destino" onClick={() => copy(d.instructions!.pointer.value)} /></td></tr>
                  </tbody>
                </table>
              </div>
              <p className="xsmall muted">{d.instructions.pointer.note} O HTTPS é emitido automaticamente quando o domínio fica ativo.</p>
            </div>
          ) : <p className="small muted">Subdomínio gerenciado pela Norty, já com HTTPS.</p>}
        </Card>
      ))}
      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar domínio próprio" description="Use um domínio que a empresa controla. Recomendamos um subdomínio, como www.sualocadora.com.br."
        footer={<><Button onClick={() => setAdding(false)}>Cancelar</Button><Button variant="primary" disabled={host.trim().length < 4} onClick={() => api.post('/domains', { hostname: host }).then(() => { toast.success('Domínio cadastrado', 'Siga as instruções de DNS.'); setAdding(false); setHost(''); list.reload(); }).catch((e) => toast.error(errorMessage(e)))}>Adicionar</Button></>}>
        <Field label="Domínio" required hint="Sem https:// e sem barra no fim."><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="www.sualocadora.com.br" autoFocus /></Field>
      </Modal>
    </Page>
  );
}
