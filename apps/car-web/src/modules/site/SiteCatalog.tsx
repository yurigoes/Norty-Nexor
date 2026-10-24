import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Users, DoorOpen } from 'lucide-react';
import { CarIllustration, bodyKindFor } from '../../components/viewer3d/CarIllustration';
import type { PublicModel } from '@nortycar/shared';
import { api, errorMessage } from '../../lib/api';
import { fromLocalInput, money } from '../../lib/format';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/ui';
import { fileUrl, usePageMeta, useSite } from './site-lib';
import { PeriodSearch, defaultPeriod, type PeriodValue } from './SiteForms';

export function ModelCard({ model, query }: { model: PublicModel; query?: string }) {
  const { site, base } = useSite();
  const cover = fileUrl(site.slug, model.coverFileId);
  const unavailable = model.available === false;
  return (
    <Link to={`${base}/modelos/${model.id}${query ? `?${query}` : ''}`} className="site-card" data-unavailable={unavailable || undefined}>
      <div className="site-card__media">
        {cover ? <img src={cover} alt={`${model.make} ${model.name}`} loading="lazy" /> : (
          <CarIllustration title={`${model.make} ${model.name}`} color={model.colors.find((c) => c.available !== false)?.color ?? model.colors[0]?.color}
            kind={bodyKindFor(model.category.name, model.bodyType)} animate={false} height="100%" />
        )}
        {unavailable && <span className="site-card__badge">Indisponível</span>}
        {model.available && <span className="site-card__badge site-card__badge--ok">Disponível</span>}
      </div>
      <div className="site-card__body">
        <span className="xsmall muted">{model.category.name}</span>
        <strong>{model.make} {model.name}</strong>
        <div className="row xsmall muted" style={{ gap: 12 }}>
          {model.seats && <span className="row" style={{ gap: 4 }}><Users size={13} aria-hidden /> {model.seats} lugares</span>}
          {model.doors && <span className="row" style={{ gap: 4 }}><DoorOpen size={13} aria-hidden /> {model.doors} portas</span>}
        </div>
        {model.colors.length > 0 && (
          <div className="row" style={{ gap: 4 }}>
            {model.colors.map((c) => <span key={c.color} className="site-color" data-off={c.available === false || undefined}>{c.color}</span>)}
          </div>
        )}
        {model.fromDaily !== null && <span className="site-card__price">a partir de <strong className="tnum">{money(model.fromDaily)}</strong>/dia</span>}
      </div>
    </Link>
  );
}

export function SiteCatalog() {
  const { site } = useSite();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fallback = defaultPeriod();
  const value: PeriodValue = {
    startAt: params.get('retirada') ?? fallback.startAt,
    endAt: params.get('devolucao') ?? fallback.endAt,
    categoryId: params.get('categoria') ?? '',
    branchId: params.get('loja') ?? '',
  };
  const [models, setModels] = useState<PublicModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageMeta(`Veículos para alugar — ${site.name}`, `Consulte os carros disponíveis para locação na ${site.name} por período.`);

  const key = params.toString();
  useEffect(() => {
    setModels(null);
    setError(null);
    api.get<PublicModel[]>(`/public/sites/${site.slug}/models`, {
      startAt: params.get('retirada') ? fromLocalInput(value.startAt) : undefined,
      endAt: params.get('devolucao') ? fromLocalInput(value.endAt) : undefined,
      categoryId: value.categoryId || undefined,
      branchId: value.branchId || undefined,
    }).then(setModels).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.slug, key]);

  const search = (v: PeriodValue) => {
    const q = new URLSearchParams({ retirada: v.startAt, devolucao: v.endAt, ...(v.categoryId ? { categoria: v.categoryId } : {}), ...(v.branchId ? { loja: v.branchId } : {}) });
    navigate(`?${q.toString()}`);
  };
  const withPeriod = Boolean(params.get('retirada'));
  const sorted = models ? [...models.filter((m) => m.fleetSize)].sort((a, b) => Number(b.available ?? 0) - Number(a.available ?? 0)) : null;

  return (
    <div className="site-wrap site-section stack-lg">
      <div className="stack-sm">
        <h1>Nossos veículos</h1>
        <p className="muted">{withPeriod ? 'Disponibilidade calculada para o período escolhido. A reserva é confirmada pela equipe.' : 'Escolha o período para ver o que está livre.'}</p>
      </div>
      <PeriodSearch value={value} onSubmit={search} compact />
      {error ? <ErrorState message={error} /> : !sorted ? <SkeletonRows rows={3} cols={3} /> : !sorted.length ? (
        <EmptyState icon={Car} title="Nenhum veículo publicado nesta categoria" description="Fale com a equipe pelo contato para outras opções." />
      ) : (
        <div className="site-grid">{sorted.map((m) => <ModelCard key={m.id} model={m} query={key} />)}</div>
      )}
    </div>
  );
}
