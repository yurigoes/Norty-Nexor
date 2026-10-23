import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { PublicModelDetail } from '@nortycar/shared';
import { FUEL_TYPE_LABEL, TRANSMISSION_LABEL, type FuelType, type Transmission } from '@nortycar/shared';
import { api, errorMessage } from '../../lib/api';
import { fromLocalInput, money } from '../../lib/format';
import { Alert, ErrorState, KeyValue, LoadingBlock } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { Vehicle3DViewer } from '../../components/viewer3d/Vehicle3DViewer';
import { fileUrl, usePageMeta, useSite } from './site-lib';
import { LeadForm, QuoteBox, defaultPeriod } from './SiteForms';

export function SiteModel() {
  const { id = '' } = useParams();
  const { site, base } = useSite();
  const [params] = useSearchParams();
  const fallback = defaultPeriod();
  const [startAt, setStartAt] = useState(params.get('retirada') ?? fallback.startAt);
  const [endAt, setEndAt] = useState(params.get('devolucao') ?? fallback.endAt);
  const branchId = params.get('loja') ?? '';
  const [model, setModel] = useState<PublicModelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean(startAt && endAt && endAt > startAt);

  useEffect(() => {
    if (!valid) return;
    setError(null);
    api.get<PublicModelDetail>(`/public/sites/${site.slug}/models/${id}`, { startAt: fromLocalInput(startAt), endAt: fromLocalInput(endAt), branchId: branchId || undefined })
      .then(setModel).catch((e) => setError(errorMessage(e)));
  }, [site.slug, id, startAt, endAt, branchId, valid]);

  const title = model ? `${model.make} ${model.name}` : 'Veículo';
  usePageMeta(`${title} — ${site.name}`, model?.description ?? `Alugue o ${title} com ${site.name}.`);
  const photos = useMemo(() => (model?.photoFileIds ?? []).map((f) => fileUrl(site.slug, f)!), [model, site.slug]);
  const category = site.categories.find((c) => c.id === model?.category.id);

  if (error) return <div className="site-wrap site-section"><ErrorState message={error} /></div>;
  if (!model) return <div className="site-wrap site-section"><LoadingBlock /></div>;

  return (
    <div className="site-wrap site-section stack-lg">
      <Link to={`${base}/veiculos${params.toString() ? `?${params}` : ''}`} className="row small"><ArrowLeft size={14} aria-hidden /> Voltar ao catálogo</Link>
      <div className="site-model">
        <div className="stack">
          <Vehicle3DViewer title={title} photos={photos} modelUrl={fileUrl(site.slug, model.model3dFileId)} hotspots={model.hotspots} unavailable={model.available === false} height={380} />
          <div className="stack-sm">
            <span className="xsmall muted">{model.category.name}</span>
            <h1>{title}</h1>
            {model.description && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{model.description}</p>}
          </div>
          <KeyValue items={[
            { label: 'Lugares', value: model.seats, hidden: !model.seats },
            { label: 'Portas', value: model.doors, hidden: !model.doors },
            { label: 'Porta-malas', value: model.trunkLiters ? `${model.trunkLiters} L` : null, hidden: !model.trunkLiters },
            { label: 'Tanque', value: model.tankLiters ? `${model.tankLiters} L` : null, hidden: !model.tankLiters },
            { label: 'Carroceria', value: model.bodyType, hidden: !model.bodyType },
          ]} />
          {model.versions.length > 0 && (
            <div className="stack-sm">
              <span className="nc-section-title">Versões</span>
              {model.versions.map((v) => (
                <div key={v.id} className="small">{v.name}{[v.engine, v.fuel && FUEL_TYPE_LABEL[v.fuel as FuelType], v.transmission && TRANSMISSION_LABEL[v.transmission as Transmission]].filter(Boolean).map((x) => ` · ${x}`).join('')}</div>
              ))}
            </div>
          )}
          {model.colors.length > 0 && (
            <div className="stack-sm">
              <span className="nc-section-title">Cores na frota</span>
              <div className="row" style={{ gap: 6 }}>
                {model.colors.map((c) => <span key={c.color} className="site-color" data-off={c.available === false || undefined}>{c.color}{c.available === false ? ' · indisponível no período' : ''}</span>)}
              </div>
            </div>
          )}
          {category && (
            <div className="stack-sm">
              <span className="nc-section-title">Condições</span>
              <ul className="small site-list">
                {category.fromDaily !== null && <li>Diária a partir de {money(category.fromDaily)}{category.weekly ? `; pacote semanal ${money(category.weekly)}` : ''}.</li>}
                <li>{category.includedKmPerDay ? `${category.includedKmPerDay} km por dia incluídos${category.extraKmRate ? `; km adicional ${money(category.extraKmRate)}` : ''}.` : 'Quilometragem livre.'}</li>
                {category.depositAmount ? <li>Caução de {money(category.depositAmount)}, devolvido ao final da locação.</li> : null}
                {category.lateGraceMinutes ? <li>Tolerância de {category.lateGraceMinutes} minutos na devolução.</li> : null}
              </ul>
            </div>
          )}
        </div>
        <aside className="site-panel stack">
          <h2>Simule e peça sua reserva</h2>
          <div className="grid-2">
            <Field label="Retirada"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
            <Field label="Devolução" error={!valid ? 'Depois da retirada.' : null}><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
          </div>
          {model.available === false && <Alert tone="warning">Sem unidade livre deste modelo no período. Você ainda pode enviar o pedido: a equipe oferece alternativas.</Alert>}
          {model.available && <Alert tone="success">Há {model.availableCount === 1 ? 'uma unidade livre' : `${model.availableCount} unidades livres`} no período.</Alert>}
          {valid && <QuoteBox categoryId={model.category.id} branchId={branchId} startAt={startAt} endAt={endAt} />}
          <hr />
          <LeadForm kind="RESERVATION_REQUEST" title="Pedido de reserva" submitLabel="Pedir reserva"
            context={{ categoryId: model.category.id, modelId: model.id, branchId: branchId || undefined, startAt, endAt }} />
        </aside>
      </div>
    </div>
  );
}
