import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Eye, GitCompare } from 'lucide-react';
import {
  INSPECTION_ITEM_STATUS_LABEL, INSPECTION_TYPE_LABEL, VEHICLE_REGIONS,
  type InspectionComparison, type InspectionDetail,
} from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, KeyValue, LoadingBlock, Page, PageHeader, Plate } from '../../components/ui';
import { Modal, useConfirm } from '../../components/overlay';
import { SecureImage } from '../../components/files';
import { Status } from '../../components/status';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dateTime, km } from '../../lib/format';
import { useSession } from '../../lib/session';
import { DamageMap } from './DamageMap';
import './operations.css';

const REGION_LABEL = Object.fromEntries(VEHICLE_REGIONS.map((r) => [r.key, r.label])) as Record<string, string>;

export function InspectionDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useSession();
  const detail = useApi(() => api.get<InspectionDetail>(`/inspections/${id}`), [id]);
  const previous = useApi(() => api.get<{ id: string; number: string } | null>(`/inspections/${id}/previous`), [id]);
  const [comparing, setComparing] = useState(false);

  if (detail.loading && !detail.data) return <LoadingBlock />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error ?? 'Vistoria não encontrada'} onRetry={detail.reload} />;
  const i = detail.data;
  const issues = i.items.filter((x) => x.status !== 'OK');

  const act = async (path: string, title: string, message: string, success: string) => {
    const r = await confirm({ title, message, tone: 'primary', confirmLabel: 'Confirmar' });
    if (!r.confirmed) return;
    api.post<InspectionDetail>(`/inspections/${id}/${path}`).then((d) => { detail.setData(d); toast.success(success); }).catch((e) => toast.error(errorMessage(e)));
  };

  return (
    <Page>
      <PageHeader
        breadcrumb={<><Link to="/operacao/vistorias">Vistorias</Link> / {i.number}</>}
        eyebrow={INSPECTION_TYPE_LABEL[i.type]}
        title={<span className="row"><Plate value={i.vehicle.plate} /> {i.vehicle.model.make.name} {i.vehicle.model.name}</span>}
        description={i.status === 'DRAFT' ? 'Em preenchimento.' : `Concluída em ${dateTime(i.completedAt)}.`}
        actions={<>
          {i.status === 'DRAFT' && <Link className="nc-btn nc-btn--primary" to={`/operacao/vistorias/nova?id=${i.id}`}>Continuar preenchimento</Link>}
          {previous.data && i.status !== 'DRAFT' && <Button icon={GitCompare} onClick={() => setComparing(true)}>Comparar com {previous.data.number}</Button>}
          {i.status === 'COMPLETED' && can('inspections.approve') && <Button variant="primary" icon={CheckCircle2} onClick={() => act('approve', 'Aprovar vistoria', 'A vistoria passa a constar como aprovada.', 'Vistoria aprovada')}>Aprovar</Button>}
          {i.status !== 'DRAFT' && i.contractId && !i.visibleToCustomer && can('inspections.approve') && (
            <Button icon={Eye} onClick={() => act('release-to-customer', 'Liberar ao cliente', 'O cliente do contrato verá esta vistoria e as fotos no portal.', 'Liberada no portal do cliente')}>Liberar ao cliente</Button>
          )}
        </>}
      />
      <Card title="Dados" actions={<div className="row" style={{ gap: 4 }}><Status kind="inspection" value={i.status} />{i.visibleToCustomer && <Badge tone="info">No portal</Badge>}</div>}>
        <KeyValue items={[
          { label: 'Número', value: <span className="mono">{i.number}</span> },
          { label: 'Quilometragem', value: km(i.odometerKm) },
          { label: 'Combustível', value: i.fuelEighths === null ? '—' : `${i.fuelEighths}/8` },
          { label: 'Contrato', value: i.contract ? <Link to={`/locacoes/contratos/${i.contract.id}`}>{i.contract.number}</Link> : '—' },
          { label: 'Cliente', value: i.contract?.customer.name ?? '—' },
          { label: 'Motorista', value: i.driver?.name ?? '—' },
          { label: 'Vistoriador', value: i.inspectorName ?? '—' },
          { label: 'Confirmação', value: i.confirmationType === 'SIGNATURE_DRAWN' ? `Assinatura de ${i.signerName}` : i.confirmationType ? `Ciência presencial de ${i.signerName}` : '—' },
          { label: 'Aprovada em', value: dateTime(i.approvedAt), hidden: !i.approvedAt },
        ]} />
      </Card>
      <div className="grid-2">
        <Card title="Mapa de avarias">
          <div className="stack">
            <DamageMap damaged={i.damages.map((d) => d.region)} label="Avarias registradas" />
            {i.damages.length ? (
              <ul className="nc-list">{i.damages.map((d) => <li key={d.id} style={{ padding: '8px 0' }}><div className="grow"><div className="strong small">{d.regionLabel}</div><div className="xsmall muted">{d.description}</div></div></li>)}</ul>
            ) : <span className="small muted">Sem avarias registradas no mapa.</span>}
          </div>
        </Card>
        <Card title="Checklist" subtitle={issues.length ? `${issues.length} item(ns) fora do normal` : 'Todos os itens normais'}>
          <table className="nc-table">
            <tbody>
              {i.items.map((x) => (
                <tr key={x.id}>
                  <td><div className="small strong">{x.label}</div><div className="xsmall muted">{x.area}</div></td>
                  <td><Badge tone={x.status === 'OK' ? 'success' : x.status === 'DAMAGED' ? 'danger' : x.status === 'MISSING' ? 'warning' : 'neutral'}>{INSPECTION_ITEM_STATUS_LABEL[x.status]}</Badge>{x.notes && <div className="xsmall muted">{x.notes}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title={`Fotos (${i.photos.length})`}>
        {!i.photos.length ? <EmptyState title="Nenhuma foto" /> : (
          <div className="op-gallery">
            {i.photos.map((p) => (
              <figure key={p.id}>
                <div><SecureImage fileId={p.fileId} alt={p.caption ?? 'Foto da vistoria'} /></div>
                <figcaption>{p.itemKey ? i.items.find((x) => x.key === p.itemKey)?.label : p.region ? REGION_LABEL[p.region] : 'Geral'}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
      {i.signatureFileId && (
        <Card title="Assinatura"><div style={{ maxWidth: 360, background: 'var(--surface-card)' }}><SecureImage fileId={i.signatureFileId} alt={`Assinatura de ${i.signerName}`} /></div></Card>
      )}
      {(i.notes || i.pendencies) && (
        <Card title="Observações">
          <div className="stack-sm">{i.notes && <p>{i.notes}</p>}{i.pendencies && <Alert tone="warning" title="Pendências">{i.pendencies}</Alert>}</div>
        </Card>
      )}
      {comparing && previous.data && <CompareModal baseId={previous.data.id} currentId={i.id} onClose={() => setComparing(false)} />}
    </Page>
  );
}

function CompareModal({ baseId, currentId, onClose }: { baseId: string; currentId: string; onClose: () => void }) {
  const cmp = useApi(() => api.get<InspectionComparison>('/inspections/compare', { base: baseId, current: currentId }), [baseId, currentId]);
  const c = cmp.data;
  return (
    <Modal open onClose={onClose} size="xl" title="Comparação de vistorias" description={c ? `${c.base.number} (anterior) × ${c.current.number} (atual)` : undefined}>
      {cmp.loading && !c ? <LoadingBlock /> : cmp.error || !c ? <ErrorState message={cmp.error ?? 'Sem dados'} /> : (
        <div className="stack">
          <Alert tone="warning" title="Diferenças para revisão humana">{c.notice}</Alert>
          <div className="row small">
            <span>Quilometragem: <strong className="tnum">{c.odometerDelta === null ? '—' : `${c.odometerDelta >= 0 ? '+' : ''}${c.odometerDelta.toLocaleString('pt-BR')} km`}</strong></span>
            <span>Combustível: <strong>{c.fuelDelta === null ? '—' : `${c.fuelDelta >= 0 ? '+' : ''}${c.fuelDelta}/8`}</strong></span>
            <span className="muted">{c.aiVisualComparison.message}</span>
          </div>
          <div className="op-compare">
            <Card title={`Anterior · ${c.base.number}`}><DamageMap damaged={[...c.damages.onlyInBase, ...c.damages.inBoth].map((d) => d.region)} label="Avarias na vistoria anterior" /></Card>
            <Card title={`Atual · ${c.current.number}`} subtitle="Em destaque: regiões sem registro na anterior">
              <DamageMap damaged={c.damages.inBoth.map((d) => d.region)} newRegions={c.damages.newInCurrent.map((d) => d.region)} label="Avarias na vistoria atual" />
            </Card>
          </div>
          {c.damages.newInCurrent.length > 0 && (
            <Card title="Regiões sem registro na vistoria anterior">
              <ul className="nc-list">{c.damages.newInCurrent.map((d) => <li key={d.id} style={{ padding: '8px 0' }}><div className="grow"><div className="strong small">{d.regionLabel}</div><div className="xsmall muted">{d.description}</div></div><Badge tone="warning">Revisar</Badge></li>)}</ul>
            </Card>
          )}
          <Card title="Itens do checklist que mudaram" subtitle={`${c.unchangedItems} item(ns) sem mudança`} flush>
            {!c.items.length ? <EmptyState title="Nenhum item mudou de situação" /> : (
              <table className="nc-table">
                <thead><tr><th>Item</th><th>Anterior</th><th>Atual</th></tr></thead>
                <tbody>
                  {c.items.map((x) => (
                    <tr key={x.key} className={x.worsened ? 'op-diff-row' : undefined}>
                      <td><div className="strong small">{x.label}</div><div className="xsmall muted">{x.area}</div></td>
                      <td className="small">{x.baseLabel ?? '—'}{x.baseNotes && <div className="xsmall muted">{x.baseNotes}</div>}</td>
                      <td className="small">{x.currentLabel ?? '—'}{x.currentNotes && <div className="xsmall muted">{x.currentNotes}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </Modal>
  );
}
