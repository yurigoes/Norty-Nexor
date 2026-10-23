import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck2, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import type { PublicModel } from '@nortycar/shared';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { fileUrl, usePageMeta, useSite } from './site-lib';
import { PeriodSearch, defaultPeriod, type PeriodValue } from './SiteForms';
import { ModelCard } from './SiteCatalog';

export function SiteHome() {
  const { site, base } = useSite();
  const navigate = useNavigate();
  const [models, setModels] = useState<PublicModel[]>([]);
  usePageMeta(site.seoTitle ?? `${site.name} — aluguel de carros`, site.seoDescription ?? site.heroSubtitle ?? `Aluguel de carros por diária, semana ou mês com ${site.name}.`);
  useEffect(() => { api.get<PublicModel[]>(`/public/sites/${site.slug}/models`).then(setModels).catch(() => setModels([])); }, [site.slug]);

  const banner = fileUrl(site.slug, site.bannerFileId);
  const featured = (site.featuredModelIds.length ? site.featuredModelIds.map((id) => models.find((m) => m.id === id)).filter(Boolean) as PublicModel[] : models.filter((m) => m.fleetSize)).slice(0, 6);
  const start = defaultPeriod();
  const search = (v: PeriodValue) => {
    const q = new URLSearchParams({ retirada: v.startAt, devolucao: v.endAt, ...(v.categoryId ? { categoria: v.categoryId } : {}), ...(v.branchId ? { loja: v.branchId } : {}) });
    navigate(`${base}/veiculos?${q.toString()}`);
  };
  const priced = site.categories.filter((c) => c.fromDaily !== null);

  return (
    <>
      <section className="site-hero" style={banner ? { backgroundImage: `url(${banner})` } : undefined} data-banner={banner ? true : undefined}>
        <div className="site-wrap site-hero__inner">
          <div className="stack-sm site-hero__text">
            <h1>{site.heroTitle ?? `Alugue com a ${site.name}`}</h1>
            <p>{site.heroSubtitle ?? 'Escolha o período e veja na hora os carros disponíveis.'}</p>
          </div>
          <div className="site-hero__search">
            <PeriodSearch value={{ ...start, categoryId: '', branchId: '' }} onSubmit={search} />
          </div>
        </div>
      </section>

      <section className="site-wrap site-section">
        <div className="site-perks">
          <div><CalendarCheck2 aria-hidden /><strong>Disponibilidade real</strong><span>Consultada na agenda da frota no momento da busca.</span></div>
          <div><ShieldCheck aria-hidden /><strong>Preço calculado pela locadora</strong><span>As tarifas e regras publicadas são as mesmas do balcão.</span></div>
          <div><Sparkles aria-hidden /><strong>Também por assinatura</strong><span><Link to={`${base}/mensal`}>Planos mensais</Link> para quem precisa do carro todo dia.</span></div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="site-wrap site-section stack">
          <div className="row-between"><h2>Destaques da frota</h2><Link to={`${base}/veiculos`}>Ver todos</Link></div>
          <div className="site-grid">{featured.map((m) => <ModelCard key={m.id} model={m} />)}</div>
        </section>
      )}

      {priced.length > 0 && (
        <section className="site-wrap site-section stack">
          <h2>Categorias</h2>
          <div className="site-grid site-grid--small">
            {priced.map((c) => (
              <Link key={c.id} to={`${base}/veiculos?categoria=${c.id}`} className="site-tile">
                <strong>{c.name}</strong>
                <span className="small muted">a partir de <span className="tnum strong">{money(c.fromDaily)}</span>/dia</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {site.branches.length > 0 && (
        <section className="site-wrap site-section stack">
          <h2>Onde retirar</h2>
          <div className="site-grid site-grid--small">
            {site.branches.map((b) => (
              <div key={b.id} className="site-tile">
                <strong className="row" style={{ gap: 6 }}><MapPin size={16} aria-hidden /> {b.name}</strong>
                <span className="small muted">{[b.street && `${b.street}${b.number ? `, ${b.number}` : ''}`, b.district, b.city && `${b.city}${b.state ? `/${b.state}` : ''}`].filter(Boolean).join(' · ') || 'Endereço sob consulta'}</span>
                {b.phone && <span className="small">{b.phone}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
