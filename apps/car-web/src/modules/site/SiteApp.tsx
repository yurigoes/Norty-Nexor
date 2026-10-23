/* =========================================================
   Site público da locadora.
   Funciona em dois endereços: /site/<slug> dentro do
   aplicativo (pré-visualização e subdomínio) e na raiz de um
   domínio próprio, resolvido pela API a partir do host.
   ========================================================= */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useInRouterContext, useParams } from 'react-router-dom';
import { Menu, MessageCircle, Phone, X } from 'lucide-react';
import type { PublicSite } from '@nortycar/shared';
import { api, errorMessage } from '../../lib/api';
import { EmptyState, LoadingBlock } from '../../components/ui';
import { SiteContext, fileUrl, shade, textOn, useSite, whatsappLink } from './site-lib';
import { SiteHome } from './SiteHome';
import { SiteCatalog } from './SiteCatalog';
import { SiteModel } from './SiteModel';
import { SiteMonthly, SiteContact, SiteTextPage, SiteFaq } from './SitePages';
import './site.css';

export function SiteApp() {
  const inRouter = useInRouterContext();
  if (inRouter) return <SlugSite />;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<HostSite />} />
      </Routes>
    </BrowserRouter>
  );
}

function SlugSite() {
  const { slug = '' } = useParams();
  return <SiteLoader slug={slug} base={`/site/${slug}`} />;
}

function HostSite() {
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ slug: string }>('/public/sites/resolve', { host: window.location.hostname })
      .then((r) => setSlug(r.slug))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <NotPublished />;
  if (!slug) return <div className="site-loading"><LoadingBlock /></div>;
  return <SiteLoader slug={slug} base="" />;
}

function NotPublished() {
  return <div className="site-loading"><EmptyState title="Site indisponível" description="Este endereço não tem um site publicado no momento." /></div>;
}

function SiteLoader({ slug, base }: { slug: string; base: string }) {
  const [site, setSite] = useState<PublicSite | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSite(null);
    setFailed(false);
    api.get<PublicSite>(`/public/sites/${slug}`).then(setSite).catch(() => setFailed(true));
  }, [slug]);
  if (failed) return <NotPublished />;
  if (!site) return <div className="site-loading"><LoadingBlock /></div>;
  return (
    <SiteContext.Provider value={{ site, base }}>
      <SiteShell />
    </SiteContext.Provider>
  );
}

function SiteShell() {
  const { site, base } = useSite();
  const [open, setOpen] = useState(false);
  // A identidade da locadora redefine só os tokens de marca, e só dentro do site.
  const style = useMemo(() => ({
    '--brand': site.primaryColor,
    '--brand-hover': shade(site.primaryColor, 0.08),
    '--brand-active': shade(site.primaryColor, 0.16),
    '--text-on-brand': textOn(site.primaryColor),
    '--site-accent': site.accentColor,
    '--site-on-accent': textOn(site.accentColor),
  }) as CSSProperties, [site.primaryColor, site.accentColor]);
  const logo = fileUrl(site.slug, site.logoFileId);
  const wa = whatsappLink(site.whatsapp, `Olá! Vim pelo site da ${site.name}.`);
  const links = [
    { to: `${base}/veiculos`, label: 'Veículos' },
    { to: `${base}/mensal`, label: 'Carro por assinatura' },
    { to: `${base}/sobre`, label: 'Sobre' },
    { to: `${base}/perguntas`, label: 'Dúvidas' },
    { to: `${base}/contato`, label: 'Contato' },
  ];
  return (
    <div className="site" style={style}>
      <a href="#site-conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="site-header">
        <div className="site-wrap site-header__inner">
          <Link to={base || '/'} className="site-brand" aria-label={`${site.name} — início`}>
            {logo ? <img src={logo} alt={site.name} /> : <span className="site-brand__name">{site.name}</span>}
          </Link>
          <nav className="site-nav" aria-label="Menu do site" data-open={open || undefined}>
            {links.map((l) => <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</NavLink>)}
            {wa && <a className="nc-btn nc-btn--primary nc-btn--sm" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> WhatsApp</a>}
          </nav>
          <button type="button" className="nc-btn nc-btn--ghost nc-btn--icon site-menu-btn" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="site-conteudo" tabIndex={-1}>
        <Routes>
          <Route index element={<SiteHome />} />
          <Route path="veiculos" element={<SiteCatalog />} />
          <Route path="modelos/:id" element={<SiteModel />} />
          <Route path="mensal" element={<SiteMonthly />} />
          <Route path="contato" element={<SiteContact />} />
          <Route path="sobre" element={<SiteTextPage kind="about" />} />
          <Route path="perguntas" element={<SiteFaq />} />
          <Route path="termos" element={<SiteTextPage kind="terms" />} />
          <Route path="privacidade" element={<SiteTextPage kind="privacy" />} />
          <Route path="*" element={<div className="site-wrap site-section"><EmptyState title="Página não encontrada" action={<Link className="nc-btn nc-btn--secondary" to={base || '/'}>Ir para o início</Link>} /></div>} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="site-wrap site-footer__grid">
          <div className="stack-sm">
            <strong>{site.name}</strong>
            {site.legalName && <span className="small">{site.legalName}{site.document ? ` · CNPJ ${site.document}` : ''}</span>}
            {site.citiesServed.length > 0 && <span className="small">Atendemos: {site.citiesServed.join(', ')}</span>}
          </div>
          <div className="stack-sm">
            {site.phone && <a href={`tel:${site.phone.replace(/\D/g, '')}`} className="row small"><Phone size={14} aria-hidden /> {site.phone}</a>}
            {site.email && <a href={`mailto:${site.email}`} className="small">{site.email}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="small">WhatsApp comercial</a>}
          </div>
          <div className="stack-sm">
            <Link to={`${base}/termos`} className="small">Termos de locação</Link>
            <Link to={`${base}/privacidade`} className="small">Privacidade e LGPD</Link>
            <span className="xsmall subtle">Site operado com Norty Car</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
