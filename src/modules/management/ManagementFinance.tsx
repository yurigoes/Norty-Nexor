import { useMemo, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Download, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import {
  INVOICE_STATUS_LABEL, expensesByCategory, financialSummary, invoiceTone, ledger,
  monthlySeries, overdueInvoices,
} from '../../services/finance';
import { unitLabel, units } from '../../services/directory';
import type { Invoice, LedgerEntry } from '../../data/types';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Pagination, ProgressBar,
  SearchInput, Select, StatCard, Tabs, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { AreaChart, BarChart, DonutChart, RankBars } from '../../components/charts/Charts';
import { currency, currencyCompact, number, percent } from '../../lib/format';
import { formatDate, isoDate } from '../../lib/date';
import './management.css';

const PAGE_SIZE = 15;

const CATEGORY_COLORS = [
  'var(--mh-gold)', 'var(--mh-ink)', '#7A4E20', 'var(--success)', 'var(--warning)',
  '#2F4761', 'var(--danger)', '#1F5A52', 'var(--text-subtle)', '#B98A3E', '#4F5A22', '#5C4A8A',
];

export function ManagementFinance() {
  const { condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const today = isoDate(new Date());
  const monthPrefix = today.slice(0, 7);

  const [tab, setTab] = useState('visao');
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);

  const data = useMemo(() => {
    const allUnits = units(condominium.id);
    return {
      summary: financialSummary(condominium.id, allUnits, monthPrefix),
      series: monthlySeries(condominium.id, 8),
      entries: ledger(condominium.id),
      expenses: expensesByCategory(condominium.id, monthPrefix),
      overdue: overdueInvoices(condominium.id),
      allUnits,
    };
  }, [condominium.id, monthPrefix, dataVersion]);

  const { summary } = data;

  const filteredLedger = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.entries
      .filter((e) => (!q || [e.description, e.category, e.supplier ?? ''].some((f) => f.toLowerCase().includes(q))) && (!kind || e.kind === kind))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.entries, term, kind]);

  const pagedLedger = filteredLedger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filteredOverdue = useMemo(() => {
    const q = term.trim().toLowerCase();
    return data.overdue.filter((i) => !q || unitLabel(i.unitId).toLowerCase().includes(q) || i.reference.includes(q));
  }, [data.overdue, term]);

  const pagedOverdue = filteredOverdue.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const ledgerColumns: Column<LedgerEntry>[] = [
    {
      key: 'description',
      header: 'Lançamento',
      render: (e) => (
        <span className="nx-ledger-row">
          <span className={`nx-ledger-row__icon ${e.kind === 'receita' ? 'is-revenue' : 'is-expense'}`}>
            {e.kind === 'receita' ? <ArrowUpCircle size={17} /> : <ArrowDownCircle size={17} />}
          </span>
          <CellStack title={e.description} meta={e.supplier} />
        </span>
      ),
    },
    { key: 'category', header: 'Categoria', hideOnMobile: true, render: (e) => <Badge tone="neutral" size="sm">{e.category}</Badge> },
    { key: 'date', header: 'Data', hideOnMobile: true, render: (e) => formatDate(e.date) },
    { key: 'status', header: 'Situação', hideOnMobile: true, render: (e) => <Badge tone={e.status === 'pago' ? 'success' : e.status === 'atrasado' ? 'danger' : 'warning'} size="sm">{e.status}</Badge> },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (e) => (
        <strong className={`nx-nums ${e.kind === 'receita' ? 'nx-amount-positive' : 'nx-amount-negative'}`}>
          {e.kind === 'receita' ? '+' : '−'} {currency(e.amount)}
        </strong>
      ),
    },
  ];

  const overdueColumns: Column<Invoice>[] = [
    { key: 'unit', header: 'Unidade', render: (i) => unitLabel(i.unitId) },
    { key: 'reference', header: 'Competência', render: (i) => <CellStack title={i.reference} meta={`Venceu em ${formatDate(i.dueDate)}`} /> },
    { key: 'amount', header: 'Valor', render: (i) => <strong className="nx-nums">{currency(i.amount)}</strong> },
    { key: 'status', header: 'Status', align: 'right', render: (i) => <Badge tone={invoiceTone(i.status)} size="sm">{INVOICE_STATUS_LABEL[i.status]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        icon={<Wallet size={22} />}
        title="Financeiro"
        subtitle={`Receitas, despesas e inadimplência do ${condominium.shortName}`}
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => toast.info('Exportação simulada', 'O balancete em PDF/XLSX é gerado na versão de produção.')}
          >
            Exportar balancete
          </Button>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={(id) => { setTab(id); setPage(1); }}
            items={[
              { id: 'visao', label: 'Visão geral' },
              { id: 'lancamentos', label: 'Lançamentos', count: data.entries.length },
              { id: 'inadimplencia', label: 'Inadimplência', count: data.overdue.length },
            ]}
          />
        }
      />

      <div className="nx-fin-hero">
        <StatCard label="Receitas do mês" value={currency(summary.revenue)} icon={<TrendingUp size={17} />} tone="success" trend={{ value: '+3,1%', direction: 'up' }} />
        <StatCard label="Despesas do mês" value={currency(summary.expenses)} icon={<TrendingDown size={17} />} tone="danger" trend={{ value: '+1,8%', direction: 'up', positive: false }} />
        <StatCard label="Saldo" value={currency(summary.balance)} icon={<Wallet size={17} />} tone={summary.balance >= 0 ? 'brand' : 'danger'} />
        <StatCard label="Fundo de reserva" value={currency(summary.reserveFund)} icon={<PiggyBank size={17} />} tone="gold" hint="Acumulado" />
      </div>

      {tab === 'visao' && (
        <>
          <div className="nx-dash-charts">
            <Card padding="md">
              <CardHeader title="Receitas x despesas" subtitle="Evolução dos últimos 8 meses" />
              <BarChart
                height={250}
                formatValue={currencyCompact}
                series={[
                  { name: 'Receitas', color: 'var(--success)', points: data.series.map((s) => ({ label: s.label, value: s.revenue })) },
                  { name: 'Despesas', color: 'var(--mh-ink)', points: data.series.map((s) => ({ label: s.label, value: s.expenses })) },
                ]}
              />
            </Card>

            <Card padding="md">
              <CardHeader title="Saldo mensal" subtitle="Resultado acumulado por competência" />
              <AreaChart
                height={250}
                formatValue={currencyCompact}
                series={[{
                  name: 'Saldo',
                  color: 'var(--mh-gold)',
                  points: data.series.map((s) => ({ label: s.label, value: Math.max(0, s.revenue - s.expenses) })),
                }]}
              />
            </Card>
          </div>

          <div className="nx-dash-grid">
            <Card padding="md">
              <CardHeader title="Despesas por categoria" subtitle="Competência atual" />
              <div className="nx-row nx-gap-5 nx-wrap nx-center">
                <DonutChart
                  size={190}
                  thickness={22}
                  centerValue={currencyCompact(summary.expenses)}
                  centerLabel="despesas"
                  data={data.expenses.slice(0, 8).map((e, i) => ({ label: e.label, value: e.value, color: CATEGORY_COLORS[i] }))}
                />
                <div className="nx-stack nx-gap-2 nx-grow" style={{ minWidth: 200 }}>
                  {data.expenses.slice(0, 8).map((e, i) => (
                    <div key={e.label} className="nx-row nx-between nx-gap-3">
                      <span className="nx-row nx-gap-2 nx-text-sm nx-truncate">
                        <i style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLORS[i], display: 'block', flexShrink: 0 }} />
                        {e.label}
                      </span>
                      <strong className="nx-nums nx-text-sm">{currencyCompact(e.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card padding="md">
              <CardHeader title="Inadimplência" subtitle="Situação atual da carteira" />
              <div className="nx-stack nx-gap-4">
                <ProgressBar
                  label={`${number(summary.delinquentUnits)} unidades inadimplentes`}
                  value={summary.delinquencyRate}
                  max={15}
                  tone={summary.delinquencyRate > 6 ? 'danger' : 'warning'}
                  showValue
                />
                <div className="nx-fin-summary">
                  <div><span>Taxa</span><strong>{percent(summary.delinquencyRate)}</strong></div>
                  <div><span>Valor em aberto</span><strong className="is-negative">{currency(summary.delinquentAmount)}</strong></div>
                  <div><span>Contas a pagar</span><strong>{currency(summary.payable)}</strong></div>
                  <div><span>Unidades faturadas</span><strong>{number(data.allUnits.filter((u) => u.status !== 'vaga').length)}</strong></div>
                </div>
                <Button variant="secondary" block onClick={() => setTab('inadimplencia')}>Ver unidades inadimplentes</Button>
              </div>
            </Card>

            <Card padding="md">
              <CardHeader title="Maiores despesas do mês" />
              <RankBars data={data.expenses.slice(0, 6)} formatValue={currencyCompact} />
            </Card>
          </div>
        </>
      )}

      {tab === 'lancamentos' && (
        <Card padding="none">
          <FilterBar>
            <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar lançamento, categoria ou fornecedor..." />
            <Select
              options={[{ value: 'receita', label: 'Receitas' }, { value: 'despesa', label: 'Despesas' }]}
              placeholder="Receitas e despesas"
              value={kind}
              onChange={(e) => { setKind(e.target.value); setPage(1); }}
              selectSize="sm"
            />
          </FilterBar>
          <DataTable
            columns={ledgerColumns}
            rows={pagedLedger}
            keyOf={(e) => e.id}
            empty={<EmptyState icon={<Receipt size={24} />} title="Nenhum lançamento encontrado" />}
            mobileCard={(e) => (
              <div className="nx-row nx-gap-3">
                <span className={`nx-ledger-row__icon ${e.kind === 'receita' ? 'is-revenue' : 'is-expense'}`}>
                  {e.kind === 'receita' ? <ArrowUpCircle size={17} /> : <ArrowDownCircle size={17} />}
                </span>
                <div className="nx-stack nx-grow nx-gap-1">
                  <span className="nx-medium nx-truncate">{e.description}</span>
                  <span className="nx-text-xs nx-text-subtle">{formatDate(e.date)} · {e.category}</span>
                </div>
                <strong className={`nx-nums nx-text-sm ${e.kind === 'receita' ? 'nx-amount-positive' : 'nx-amount-negative'}`}>
                  {currencyCompact(e.amount)}
                </strong>
              </div>
            )}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={filteredLedger.length} onPageChange={setPage} />
        </Card>
      )}

      {tab === 'inadimplencia' && (
        <Card padding="none">
          <FilterBar>
            <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por unidade ou competência..." />
          </FilterBar>
          <DataTable
            columns={overdueColumns}
            rows={pagedOverdue}
            keyOf={(i) => i.id}
            empty={<EmptyState icon={<Receipt size={24} />} title="Nenhuma unidade inadimplente" description="Toda a carteira está em dia." />}
            mobileCard={(i) => (
              <div className="nx-row nx-gap-3">
                <div className="nx-stack nx-grow nx-gap-1">
                  <span className="nx-medium">{unitLabel(i.unitId)}</span>
                  <span className="nx-text-xs nx-text-subtle">{i.reference} · venceu em {formatDate(i.dueDate)}</span>
                </div>
                <strong className="nx-nums">{currency(i.amount)}</strong>
              </div>
            )}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={filteredOverdue.length} onPageChange={setPage} />
        </Card>
      )}
    </>
  );
}
