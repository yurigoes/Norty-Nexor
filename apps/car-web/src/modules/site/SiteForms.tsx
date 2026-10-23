/* Formulários do site: busca por período, pedido (com LGPD) e cotação do servidor. */
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import type { LeadKind } from '@nortycar/shared';
import { api, errorMessage } from '../../lib/api';
import { fromLocalInput, money, toLocalInput } from '../../lib/format';
import { Alert, Button } from '../../components/ui';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/form';
import { useSite } from './site-lib';

export interface PeriodValue { startAt: string; endAt: string; categoryId: string; branchId: string }

/** Retirada amanhã às 10h e devolução três dias depois: o ponto de partida mais comum. */
export function defaultPeriod(): { startAt: string; endAt: string } {
  const start = new Date(Date.now() + 86_400_000);
  start.setUTCHours(13, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 86_400_000);
  return { startAt: toLocalInput(start), endAt: toLocalInput(end) };
}

export function PeriodSearch({ value, onSubmit, compact }: { value: PeriodValue; onSubmit: (v: PeriodValue) => void; compact?: boolean }) {
  const { site } = useSite();
  const [v, setV] = useState(value);
  const invalid = Boolean(v.startAt && v.endAt && v.endAt <= v.startAt);
  return (
    <form className={`site-search${compact ? ' site-search--compact' : ''}`} onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit(v); }}>
      {site.branches.length > 1 && (
        <Field label="Retirada em">
          <Select value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })} placeholder="Qualquer loja" options={site.branches.map((b) => ({ value: b.id, label: `${b.name}${b.city ? ` · ${b.city}` : ''}` }))} />
        </Field>
      )}
      <Field label="Retirada"><Input type="datetime-local" value={v.startAt} onChange={(e) => setV({ ...v, startAt: e.target.value })} required /></Field>
      <Field label="Devolução" error={invalid ? 'Depois da retirada.' : null}><Input type="datetime-local" value={v.endAt} onChange={(e) => setV({ ...v, endAt: e.target.value })} required /></Field>
      <Field label="Categoria">
        <Select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })} placeholder="Todas" options={site.categories.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Button type="submit" variant="primary" icon={Search} disabled={invalid}>Ver disponibilidade</Button>
    </form>
  );
}

export function LeadForm({ kind, context, title, submitLabel = 'Enviar pedido' }: {
  kind: LeadKind;
  context?: { categoryId?: string; modelId?: string; branchId?: string; startAt?: string; endAt?: string };
  title?: string;
  submitLabel?: string;
}) {
  const { site, base } = useSite();
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/public/sites/${site.slug}/leads`, {
        kind, name: f.name, email: f.email || undefined, phone: f.phone || undefined, message: f.message || undefined, consent: f.consent,
        website: f.website || undefined,
        ...(context?.categoryId ? { categoryId: context.categoryId } : {}),
        ...(context?.modelId ? { modelId: context.modelId } : {}),
        ...(context?.branchId ? { branchId: context.branchId } : {}),
        ...(context?.startAt && context.endAt ? { startAt: fromLocalInput(context.startAt), endAt: fromLocalInput(context.endAt) } : {}),
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <Alert tone="success" title="Pedido recebido">
        {kind === 'RESERVATION_REQUEST'
          ? 'A equipe vai conferir a disponibilidade e entrar em contato para confirmar. A reserva só vale depois dessa confirmação.'
          : 'Obrigado! Responderemos em breve pelo contato informado.'}
      </Alert>
    );
  }
  return (
    <form className="stack" onSubmit={submit}>
      {title && <h3>{title}</h3>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
      <div className="grid-2">
        <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label="Telefone / WhatsApp"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
      </div>
      <Field label="Mensagem"><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={2000} /></Field>
      {/* Campo-isca para robôs: fora da tela e fora da navegação por teclado. */}
      <div className="site-hp" aria-hidden>
        <label>Site<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label>
      </div>
      <Checkbox checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })}
        label={<span className="small">Autorizo o uso destes dados pela {site.name} para responder ao meu pedido, conforme a <a href={`${base}/privacidade`} target="_blank" rel="noreferrer">política de privacidade</a>.</span>} />
      <div><Button type="submit" variant="primary" icon={CheckCircle2} loading={busy} disabled={!f.name || (!f.email && !f.phone) || !f.consent}>{submitLabel}</Button></div>
    </form>
  );
}

interface QuoteResult { billableDays: number; lines: { label: string; quantity: number; unitPrice: number; total: number }[]; subtotal: number; discount: number; total: number; depositAmount: number; includedKm: number | null; extraKmRate: number | null }

/** Cotação calculada pela API com as tarifas públicas — o navegador só exibe. */
export function QuoteBox({ categoryId, branchId, startAt, endAt }: { categoryId: string; branchId?: string; startAt: string; endAt: string }) {
  const { site } = useSite();
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [drivers, setDrivers] = useState(0);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setQuote(await api.post<QuoteResult>(`/public/sites/${site.slug}/quote`, {
        categoryId, branchId: branchId || undefined, startAt: fromLocalInput(startAt), endAt: fromLocalInput(endAt),
        extras: Object.entries(extras).filter(([, q]) => q > 0).map(([extraServiceId, quantity]) => ({ extraServiceId, quantity })),
        additionalDrivers: drivers,
      }));
    } catch (e) {
      setQuote(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      {site.extras.length > 0 && (
        <div className="stack-sm">
          <span className="nc-label">Adicionais</span>
          {site.extras.map((x) => (
            <Checkbox key={x.id} checked={(extras[x.id] ?? 0) > 0} onChange={(e) => setExtras({ ...extras, [x.id]: e.target.checked ? 1 : 0 })}
              label={<span>{x.name} <span className="muted small">· {money(x.price)}{x.pricing === 'PER_DAY' ? '/dia' : ''}</span></span>} />
          ))}
        </div>
      )}
      <Field label="Condutores adicionais">
        <Select value={String(drivers)} onChange={(e) => setDrivers(Number(e.target.value))} options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? String(n) : 'Nenhum' }))} />
      </Field>
      <div><Button onClick={run} loading={busy} disabled={!startAt || !endAt}>Calcular valor</Button></div>
      {error && <Alert tone="warning">{error}</Alert>}
      {quote && (
        <div className="site-quote">
          {quote.lines.map((l) => (
            <div key={l.label} className="row-between small"><span>{l.label} × {l.quantity}</span><span className="tnum">{money(l.total)}</span></div>
          ))}
          <div className="row-between strong"><span>Total estimado ({quote.billableDays} {quote.billableDays === 1 ? 'diária' : 'diárias'})</span><span className="tnum">{money(quote.total)}</span></div>
          <div className="xsmall muted">
            {quote.depositAmount > 0 && <>Caução de {money(quote.depositAmount)}, devolvido ao final. </>}
            {quote.includedKm !== null ? <>Inclui {quote.includedKm.toLocaleString('pt-BR')} km{quote.extraKmRate ? `; km adicional ${money(quote.extraKmRate)}` : ''}. </> : 'Quilometragem livre. '}
            Valor sujeito à confirmação de disponibilidade pela equipe.
          </div>
        </div>
      )}
    </div>
  );
}
