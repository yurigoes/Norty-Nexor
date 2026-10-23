/* Tarifas por categoria e filial, serviços adicionais e simulador de cotação (calculado no servidor). */
import { useState } from 'react';
import { BadgeDollarSign, Calculator, Plus } from 'lucide-react';
import type { Quote } from '@nortycar/shared';
import { Alert, Badge, Button, Card, Page, PageHeader, Tabs } from '../../components/ui';
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select } from '../../components/form';
import { DataTable } from '../../components/table';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { fromLocalInput, int, money, toLocalInput } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useCategories } from '../fleet/shared';

interface Rate {
  id: string; categoryId: string; branchId: string | null; name: string; dailyRate: number; weeklyRate: number | null; monthlyRate: number | null;
  includedKmPerDay: number | null; extraKmRate: number | null; additionalDriverDaily: number; lateGraceMinutes: number; depositAmount: number;
  longTermMonthly: number | null; longTermKmPerMonth: number | null; publicVisible: boolean; active: boolean; category: { name: string };
}
interface Extra { id: string; name: string; description: string | null; pricing: 'PER_DAY' | 'FIXED'; price: number; publicVisible: boolean; active: boolean }

type Tab = 'rates' | 'extras' | 'quote';

export function RatesPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>('rates');
  const rates = useApi(() => api.get<Rate[]>('/pricing/rates'), []);
  const extras = useApi(() => api.get<Extra[]>('/pricing/extras'), []);
  const [rate, setRate] = useState<Rate | 'new' | null>(null);
  const [extra, setExtra] = useState<Extra | 'new' | null>(null);
  const { session } = useSession();
  const branchName = (id: string | null) => (id ? session?.context.branches.find((b) => b.id === id)?.name ?? 'Outra filial' : 'Todas as filiais');
  const manage = can('pricing.manage');

  return (
    <Page>
      <PageHeader title="Tarifas" description="Regras comerciais por categoria. A tarifa da filial, quando existe, prevalece sobre a geral. O preço é sempre calculado pelo servidor."
        actions={manage && (tab === 'extras'
          ? <Button variant="primary" icon={Plus} onClick={() => setExtra('new')}>Novo serviço</Button>
          : <Button variant="primary" icon={Plus} onClick={() => setRate('new')}>Nova tarifa</Button>)} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'rates', label: 'Tarifas', count: rates.data?.length }, { value: 'extras', label: 'Serviços adicionais', count: extras.data?.length }, { value: 'quote', label: 'Simulador' }]} />
      {tab === 'rates' && (
        <Card flush>
          <DataTable rows={rates.data} loading={rates.loading} error={rates.error} onRetry={rates.reload} onRowClick={manage ? setRate : undefined}
            empty={{ title: 'Nenhuma tarifa configurada', icon: BadgeDollarSign, description: 'Sem tarifa, a categoria não pode ser cotada nem reservada.' }} columns={[
              { key: 'cat', header: 'Categoria', render: (r) => <div><div className="strong">{r.category.name}</div><div className="xsmall muted">{r.name}</div></div> },
              { key: 'branch', header: 'Filial', render: (r) => branchName(r.branchId) },
              { key: 'daily', header: 'Diária', align: 'right', render: (r) => money(r.dailyRate) },
              { key: 'weekly', header: 'Semana', align: 'right', render: (r) => money(r.weeklyRate) },
              { key: 'monthly', header: '30 dias', align: 'right', render: (r) => money(r.monthlyRate) },
              { key: 'km', header: 'Km incluídos/dia', align: 'right', render: (r) => (r.includedKmPerDay ? int(r.includedKmPerDay) : 'Livre') },
              { key: 'deposit', header: 'Caução', align: 'right', render: (r) => money(r.depositAmount) },
              { key: 'status', header: '', render: (r) => <div className="row" style={{ gap: 4 }}>{!r.active && <Badge>Inativa</Badge>}{r.publicVisible && <Badge tone="info">Site</Badge>}</div> },
            ]} />
        </Card>
      )}
      {tab === 'extras' && (
        <Card flush>
          <DataTable rows={extras.data} loading={extras.loading} error={extras.error} onRetry={extras.reload} onRowClick={manage ? setExtra : undefined}
            empty={{ title: 'Nenhum serviço adicional' }} columns={[
              { key: 'name', header: 'Serviço', render: (e) => <div><div className="strong">{e.name}</div>{e.description && <div className="xsmall muted">{e.description}</div>}</div> },
              { key: 'pricing', header: 'Cobrança', render: (e) => (e.pricing === 'PER_DAY' ? 'Por dia' : 'Valor fixo') },
              { key: 'price', header: 'Preço', align: 'right', render: (e) => money(e.price) },
              { key: 'status', header: '', render: (e) => <div className="row" style={{ gap: 4 }}>{!e.active && <Badge>Inativo</Badge>}{e.publicVisible && <Badge tone="info">Site</Badge>}</div> },
            ]} />
        </Card>
      )}
      {tab === 'quote' && <QuoteSimulator extras={extras.data ?? []} />}
      {rate && <RateModal rate={rate === 'new' ? null : rate} onClose={() => setRate(null)} onSaved={() => { setRate(null); rates.reload(); }} />}
      {extra && <ExtraModal extra={extra === 'new' ? null : extra} onClose={() => setExtra(null)} onSaved={() => { setExtra(null); extras.reload(); }} />}
    </Page>
  );
}

function RateModal({ rate, onClose, onSaved }: { rate: Rate | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { session } = useSession();
  const categories = useCategories();
  const [f, setF] = useState({
    categoryId: rate?.categoryId ?? '', branchId: rate?.branchId ?? '', name: rate?.name ?? 'Tarifa padrão',
    dailyRate: rate?.dailyRate ?? ('' as number | ''), weeklyRate: rate?.weeklyRate ?? ('' as number | ''), monthlyRate: rate?.monthlyRate ?? ('' as number | ''),
    includedKmPerDay: rate?.includedKmPerDay ? String(rate.includedKmPerDay) : '', extraKmRate: rate?.extraKmRate ?? ('' as number | ''),
    additionalDriverDaily: rate?.additionalDriverDaily ?? ('' as number | ''), lateGraceMinutes: String(rate?.lateGraceMinutes ?? 60),
    depositAmount: rate?.depositAmount ?? ('' as number | ''), longTermMonthly: rate?.longTermMonthly ?? ('' as number | ''),
    longTermKmPerMonth: rate?.longTermKmPerMonth ? String(rate.longTermKmPerMonth) : '', publicVisible: rate?.publicVisible ?? true, active: rate?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const m = (v: number | '') => (v === '' ? null : v);
  const weeklyTooHigh = f.weeklyRate !== '' && f.dailyRate !== '' && f.weeklyRate > f.dailyRate * 7;
  const save = async () => {
    setBusy(true);
    const body = {
      name: f.name.trim(), dailyRate: f.dailyRate, weeklyRate: m(f.weeklyRate), monthlyRate: m(f.monthlyRate),
      includedKmPerDay: f.includedKmPerDay ? Number(f.includedKmPerDay) : null, extraKmRate: m(f.extraKmRate),
      additionalDriverDaily: f.additionalDriverDaily === '' ? 0 : f.additionalDriverDaily, lateGraceMinutes: Number(f.lateGraceMinutes || 0),
      depositAmount: f.depositAmount === '' ? 0 : f.depositAmount, longTermMonthly: m(f.longTermMonthly),
      longTermKmPerMonth: f.longTermKmPerMonth ? Number(f.longTermKmPerMonth) : null, publicVisible: f.publicVisible, active: f.active,
    };
    try {
      if (rate) await api.patch(`/pricing/rates/${rate.id}`, body);
      else await api.post('/pricing/rates', { ...body, categoryId: f.categoryId, branchId: f.branchId || null });
      toast.success('Tarifa salva', 'Vale para as próximas cotações; reservas já confirmadas mantêm o valor cotado.');
      onSaved();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={rate ? `Tarifa · ${rate.category.name}` : 'Nova tarifa'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.dailyRate || (!rate && !f.categoryId) || weeklyTooHigh} onClick={save}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Categoria" required className="span-4"><Select value={f.categoryId} disabled={Boolean(rate)} onChange={(e) => setF({ ...f, categoryId: e.target.value })} placeholder="Selecione" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Filial" className="span-4"><Select value={f.branchId} disabled={Boolean(rate)} onChange={(e) => setF({ ...f, branchId: e.target.value })} placeholder="Todas as filiais" options={(session?.context.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>
        <Field label="Nome" className="span-4"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Diária" required className="span-4"><MoneyInput value={f.dailyRate} onChange={(v) => setF({ ...f, dailyRate: v })} /></Field>
        <Field label="Pacote semanal (7 dias)" className="span-4" error={weeklyTooHigh ? 'Não pode passar de 7 diárias.' : null}><MoneyInput value={f.weeklyRate} onChange={(v) => setF({ ...f, weeklyRate: v })} /></Field>
        <Field label="Pacote de 30 dias" className="span-4"><MoneyInput value={f.monthlyRate} onChange={(v) => setF({ ...f, monthlyRate: v })} /></Field>
        <Field label="Km incluídos por dia" className="span-4" hint="Vazio = quilometragem livre."><Input type="number" min={1} value={f.includedKmPerDay} onChange={(e) => setF({ ...f, includedKmPerDay: e.target.value })} /></Field>
        <Field label="Km excedente" className="span-4"><MoneyInput value={f.extraKmRate} onChange={(v) => setF({ ...f, extraKmRate: v })} /></Field>
        <Field label="Condutor adicional (por dia)" className="span-4"><MoneyInput value={f.additionalDriverDaily} onChange={(v) => setF({ ...f, additionalDriverDaily: v })} /></Field>
        <Field label="Tolerância na devolução (min)" className="span-4"><Input type="number" min={0} max={720} value={f.lateGraceMinutes} onChange={(e) => setF({ ...f, lateGraceMinutes: e.target.value })} /></Field>
        <Field label="Caução" className="span-4"><MoneyInput value={f.depositAmount} onChange={(v) => setF({ ...f, depositAmount: v })} /></Field>
        <Field label="Mensalidade de referência (contrato)" className="span-4"><MoneyInput value={f.longTermMonthly} onChange={(v) => setF({ ...f, longTermMonthly: v })} /></Field>
        <Field label="Km por mês (contrato)" className="span-4"><Input type="number" min={1} value={f.longTermKmPerMonth} onChange={(e) => setF({ ...f, longTermKmPerMonth: e.target.value })} /></Field>
        <div className="span-8 row">
          <Checkbox label="Exibir no site público" checked={f.publicVisible} onChange={(e) => setF({ ...f, publicVisible: e.target.checked })} />
          <Checkbox label="Tarifa ativa" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        </div>
      </FormGrid>
    </Modal>
  );
}

function ExtraModal({ extra, onClose, onSaved }: { extra: Extra | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: extra?.name ?? '', description: extra?.description ?? '', pricing: extra?.pricing ?? 'PER_DAY', price: extra?.price ?? ('' as number | ''), publicVisible: extra?.publicVisible ?? true, active: extra?.active ?? true });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={extra ? 'Editar serviço adicional' : 'Novo serviço adicional'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={f.name.trim().length < 2 || f.price === ''} onClick={async () => {
        setBusy(true);
        const body = { ...f, description: f.description || undefined };
        try {
          if (extra) await api.patch(`/pricing/extras/${extra.id}`, body); else await api.post('/pricing/extras', body);
          toast.success('Serviço salvo');
          onSaved();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>Salvar</Button></>}>
      <FormGrid>
        <Field label="Nome" required className="span-12"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Cadeirinha infantil" /></Field>
        <Field label="Descrição" className="span-12"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Cobrança" className="span-6"><Select value={f.pricing} onChange={(e) => setF({ ...f, pricing: e.target.value as 'PER_DAY' })} options={[{ value: 'PER_DAY', label: 'Por dia' }, { value: 'FIXED', label: 'Valor fixo' }]} /></Field>
        <Field label="Preço" required className="span-6"><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <div className="span-12 row">
          <Checkbox label="Exibir no site" checked={f.publicVisible} onChange={(e) => setF({ ...f, publicVisible: e.target.checked })} />
          <Checkbox label="Ativo" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        </div>
      </FormGrid>
    </Modal>
  );
}

function QuoteSimulator({ extras }: { extras: Extra[] }) {
  const { session, can } = useSession();
  const categories = useCategories();
  const [f, setF] = useState({ categoryId: '', branchId: '', start: toLocalInput(new Date(Date.now() + 86_400_000)), end: toLocalInput(new Date(Date.now() + 4 * 86_400_000)), drivers: '0', discount: '0' });
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!can('reservations.create')) return <Alert tone="info">O simulador exige a permissão de criar reservas e cotações.</Alert>;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setQuote(await api.post<Quote>('/pricing/quote', {
        categoryId: f.categoryId, branchId: f.branchId || undefined, startAt: fromLocalInput(f.start), endAt: fromLocalInput(f.end),
        additionalDrivers: Number(f.drivers), discountPercent: Number(f.discount),
        extras: Object.entries(chosen).filter(([, q]) => q > 0).map(([extraServiceId, quantity]) => ({ extraServiceId, quantity })),
      }));
    } catch (e) { setQuote(null); setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card title="Parâmetros" subtitle="Simulação: não reserva nem bloqueia veículo.">
        <FormGrid>
          <Field label="Categoria" required className="span-6"><Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} placeholder="Selecione" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Filial" className="span-6"><Select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} placeholder="Tarifa geral" options={(session?.context.branches ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field>
          <Field label="Retirada" className="span-6"><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Devolução" className="span-6"><Input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Condutores adicionais" className="span-6"><Input type="number" min={0} max={5} value={f.drivers} onChange={(e) => setF({ ...f, drivers: e.target.value })} /></Field>
          <Field label="Desconto (%)" className="span-6"><Input type="number" min={0} max={100} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
          {extras.filter((e) => e.active).map((e) => (
            <Field key={e.id} label={`${e.name} (${money(e.price)}${e.pricing === 'PER_DAY' ? '/dia' : ''})`} className="span-6">
              <Input type="number" min={0} max={20} value={chosen[e.id] ?? 0} onChange={(ev) => setChosen({ ...chosen, [e.id]: Number(ev.target.value) })} />
            </Field>
          ))}
        </FormGrid>
        <div style={{ marginTop: 'var(--space-4)' }}><Button variant="primary" icon={Calculator} loading={busy} disabled={!f.categoryId || !f.start || !f.end} onClick={run}>Calcular</Button></div>
      </Card>
      <Card title="Cotação">
        {error ? <Alert tone="danger">{error}</Alert> : !quote ? <p className="muted small">Preencha os parâmetros e calcule.</p> : (
          <div className="stack">
            <DataTable rows={quote.lines.map((l, i) => ({ ...l, id: String(i) }))} columns={[
              { key: 'label', header: 'Item', render: (l) => l.label },
              { key: 'qty', header: 'Qtd.', align: 'right', render: (l) => int(l.quantity) },
              { key: 'unit', header: 'Unitário', align: 'right', render: (l) => money(l.unitPrice) },
              { key: 'total', header: 'Total', align: 'right', render: (l) => money(l.total) },
            ]} />
            <dl className="nc-kv">
              <div><dt>Diárias cobradas</dt><dd>{quote.billableDays}</dd></div>
              <div><dt>Subtotal</dt><dd>{money(quote.subtotal)}</dd></div>
              <div><dt>Desconto</dt><dd>{money(quote.discount)}</dd></div>
              <div><dt>Total</dt><dd className="strong">{money(quote.total)}</dd></div>
              <div><dt>Caução</dt><dd>{money(quote.depositAmount)}</dd></div>
              <div><dt>Km incluídos</dt><dd>{quote.includedKm === null ? 'Livre' : int(quote.includedKm)}</dd></div>
            </dl>
          </div>
        )}
      </Card>
    </div>
  );
}
