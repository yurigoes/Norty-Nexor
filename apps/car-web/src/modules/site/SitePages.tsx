import { MessageCircle, Phone } from 'lucide-react';
import { money } from '../../lib/format';
import { EmptyState } from '../../components/ui';
import { usePageMeta, useSite, whatsappLink } from './site-lib';
import { LeadForm } from './SiteForms';

export function SiteMonthly() {
  const { site } = useSite();
  usePageMeta(`Carro por assinatura — ${site.name}`, `Planos mensais de locação de veículos com ${site.name}.`);
  const plans = site.categories.filter((c) => c.longTermMonthly !== null);
  return (
    <div className="site-wrap site-section stack-lg">
      <div className="stack-sm">
        <h1>Carro por assinatura</h1>
        <p className="muted">Contratos mensais com manutenção acompanhada pela locadora. Os valores abaixo são de referência; a proposta final depende de análise cadastral, prazo e quilometragem.</p>
      </div>
      {plans.length ? (
        <div className="site-grid site-grid--small">
          {plans.map((c) => (
            <div key={c.id} className="site-tile">
              <strong>{c.name}</strong>
              <span className="tnum"><strong>{money(c.longTermMonthly)}</strong>/mês</span>
              {c.longTermKmPerMonth && <span className="small muted">{c.longTermKmPerMonth.toLocaleString('pt-BR')} km por mês</span>}
            </div>
          ))}
        </div>
      ) : <EmptyState title="Planos sob consulta" description="Envie seu pedido e a equipe prepara uma proposta." />}
      <div className="site-panel"><LeadForm kind="MONTHLY" title="Quero uma proposta" submitLabel="Pedir proposta" /></div>
    </div>
  );
}

export function SiteContact() {
  const { site } = useSite();
  usePageMeta(`Contato — ${site.name}`, `Fale com a ${site.name}.`);
  const wa = whatsappLink(site.whatsapp, `Olá! Vim pelo site da ${site.name}.`);
  return (
    <div className="site-wrap site-section site-model">
      <div className="stack">
        <h1>Fale com a gente</h1>
        {wa && <a className="nc-btn nc-btn--primary nc-btn--lg" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> Conversar pelo WhatsApp</a>}
        {site.phone && <a className="row" href={`tel:${site.phone.replace(/\D/g, '')}`}><Phone size={16} aria-hidden /> {site.phone}</a>}
        {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
        {site.branches.map((b) => (
          <div key={b.id} className="site-tile">
            <strong>{b.name}</strong>
            <span className="small muted">{[b.street && `${b.street}${b.number ? `, ${b.number}` : ''}`, b.district, b.city && `${b.city}${b.state ? `/${b.state}` : ''}`].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
      <div className="site-panel"><LeadForm kind="CONTACT" title="Envie uma mensagem" submitLabel="Enviar mensagem" /></div>
    </div>
  );
}

export function SiteFaq() {
  const { site } = useSite();
  usePageMeta(`Perguntas frequentes — ${site.name}`, `Dúvidas sobre locação na ${site.name}.`);
  return (
    <div className="site-wrap site-section stack" style={{ maxWidth: 820 }}>
      <h1>Perguntas frequentes</h1>
      {site.faq.length ? site.faq.map((f) => (
        <details key={f.question} className="site-faq">
          <summary>{f.question}</summary>
          <p style={{ whiteSpace: 'pre-wrap' }}>{f.answer}</p>
        </details>
      )) : <EmptyState title="Sem perguntas cadastradas" description="Fale com a equipe pelo contato." />}
    </div>
  );
}

export function SiteTextPage({ kind }: { kind: 'about' | 'terms' | 'privacy' }) {
  const { site } = useSite();
  const map = {
    about: { title: `Sobre a ${site.name}`, text: site.about },
    terms: { title: 'Termos de locação', text: site.terms },
    privacy: { title: 'Privacidade e proteção de dados', text: site.privacy },
  } as const;
  const page = map[kind];
  usePageMeta(`${page.title} — ${site.name}`, page.text?.slice(0, 160));
  return (
    <div className="site-wrap site-section stack" style={{ maxWidth: 820 }}>
      <h1>{page.title}</h1>
      {page.text ? <div className="site-prose">{page.text}</div> : <EmptyState title="Conteúdo ainda não publicado" description="A locadora ainda não publicou este texto. Em caso de dúvida, use o contato." />}
    </div>
  );
}
