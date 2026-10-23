/* Documentos a vencer: CNH, licenciamento, IPVA, anexos com validade e apólices. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderClock } from 'lucide-react';
import type { ExpiringDocument, ExpiringDocumentType } from '@nortycar/shared';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader, Segmented, StatCard } from '../../components/ui';
import { DataTable } from '../../components/table';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date } from '../../lib/format';
import '../fleet/fleet.css';

const TYPE_LABEL: Record<ExpiringDocumentType, string> = {
  CNH: 'CNH de motoristas', LICENSING: 'Licenciamento', IPVA: 'IPVA', FILE: 'Documentos anexados', INSURANCE: 'Apólices de seguro',
};
const ORDER: ExpiringDocumentType[] = ['CNH', 'LICENSING', 'IPVA', 'INSURANCE', 'FILE'];

export function ExpiringDocumentsPage() {
  const [days, setDays] = useState<'15' | '30' | '60' | '90'>('30');
  const list = useApi(() => api.get<{ days: number; items: ExpiringDocument[] }>('/documents/expiring', { days }), [days]);
  const groups = useMemo(() => {
    const map = new Map<ExpiringDocumentType, ExpiringDocument[]>();
    for (const item of list.data?.items ?? []) map.set(item.type, [...(map.get(item.type) ?? []), item]);
    return ORDER.filter((t) => map.has(t)).map((t) => ({ type: t, items: map.get(t)! }));
  }, [list.data]);
  const items = list.data?.items ?? [];
  const expired = items.filter((i) => i.daysLeft < 0).length;

  return (
    <Page>
      <PageHeader title="Documentos a vencer" description="Vencidos aparecem primeiro. Cada perfil vê só as fontes que pode consultar."
        actions={<Segmented label="Prazo" value={days} onChange={setDays} options={[{ value: '15', label: '15 dias' }, { value: '30', label: '30 dias' }, { value: '60', label: '60 dias' }, { value: '90', label: '90 dias' }]} />} />
      <div className="grid-3">
        <StatCard label="Vencidos" value={expired} tone={expired ? 'danger' : undefined} />
        <StatCard label={`Vencem em até ${days} dias`} value={items.length - expired} tone="warning" />
        <StatCard label="Fontes com pendência" value={groups.length} />
      </div>
      {list.loading && !list.data ? <LoadingBlock /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !items.length ? (
        <Card><EmptyState icon={FolderClock} title="Nada vencendo no período" description="Cadastre as datas de licenciamento, IPVA, CNH e a validade dos anexos para acompanhar aqui." /></Card>
      ) : groups.map((g) => (
        <div key={g.type} className="doc-group">
          <Card title={TYPE_LABEL[g.type]} subtitle={`${g.items.length} item(ns)`} flush>
            <DataTable rows={g.items.map((i, n) => ({ ...i, id: `${i.entityId}-${n}` }))} columns={[
              { key: 'label', header: 'Documento', render: (i) => <span className="strong">{i.label}</span> },
              { key: 'ref', header: 'Referência', render: (i) => i.reference },
              { key: 'due', header: 'Vencimento', render: (i) => date(i.dueDate) },
              { key: 'left', header: 'Prazo', render: (i) => i.daysLeft < 0 ? <Badge tone="danger">Vencido há {-i.daysLeft} dia(s)</Badge> : i.daysLeft === 0 ? <Badge tone="danger">Vence hoje</Badge> : <Badge tone={i.daysLeft <= 7 ? 'warning' : 'info'}>{i.daysLeft} dia(s)</Badge> },
              { key: 'actions', header: '', render: (i) => <Link className="small" to={i.link}>Abrir</Link> },
            ]} />
          </Card>
        </div>
      ))}
    </Page>
  );
}
