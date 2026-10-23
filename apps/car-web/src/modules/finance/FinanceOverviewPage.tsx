import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Landmark, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import type { Cashflow, FinanceSummary } from '@nortycar/shared';
import { Alert, Card, ErrorState, LoadingBlock, Page, PageHeader, StatCard } from '../../components/ui';
import { BarChart, LineChart } from '../../components/charts';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { money, pct } from '../../lib/format';
import { useBranchFilter } from '../../app/branch-filter';

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Eixo dos gráficos: valor compacto (R$ 2,5 mil) para caber na margem. */
const compactMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const axis = (v: number) => compactMoney.format(v);

export function FinanceOverviewPage() {
  const navigate = useNavigate();
  const { branchId } = useBranchFilter();
  const summary = useApi(() => api.get<FinanceSummary>('/finance/summary', { branchId }), [branchId]);
  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { from: iso(from), to: iso(to) };
  }, []);
  const monthly = useApi(() => api.get<Cashflow>('/finance/cashflow', { ...range, groupBy: 'month', branchId }), [branchId, range]);
  const daily = useApi(() => api.get<Cashflow>('/finance/cashflow', { groupBy: 'day', branchId }), [branchId]);

  if (summary.error) return <ErrorState message={summary.error} onRetry={summary.reload} />;
  const s = summary.data;
  const monthLabel = (k: string) => `${k.slice(5, 7)}/${k.slice(2, 4)}`;
  return (
    <Page>
      <PageHeader title="Receitas e caixa" description="Previsto, recebido, conciliado e em atraso no mês corrente. Caução aparece à parte: não é receita." />
      {!s ? <LoadingBlock /> : (
        <>
          <div className="grid-4">
            <StatCard label="Previsto no mês" icon={ReceiptText} value={money(s.revenue.expected)} foot={`${money(s.revenue.paidOfExpected)} já recebido destes títulos`} onClick={() => navigate('/financeiro/receber')} />
            <StatCard label="Recebido no mês" icon={CheckCircle2} tone="success" value={money(s.revenue.received)} foot={`Conciliado: ${money(s.revenue.reconciled)}`} onClick={() => navigate('/financeiro/conciliacao')} />
            <StatCard label="A vencer no mês" icon={Clock} value={money(s.revenue.pending)} foot={s.revenue.collectionRate === null ? 'Sem títulos no período' : `Taxa de recebimento: ${pct(s.revenue.collectionRate)}`} />
            <StatCard label="Em atraso" icon={AlertTriangle} tone={s.revenue.overdue > 0 ? 'danger' : undefined} value={money(s.revenue.overdue)}
              foot={`${s.revenue.overdueCount} título(s) · ${s.revenue.overdueCustomers} cliente(s) · inadimplência ${pct(s.revenue.delinquencyRate)}`} onClick={() => navigate('/financeiro/receber?overdue=1')} />
          </div>
          <div className="grid-3">
            <StatCard label="Despesas pagas no mês" icon={Wallet} value={money(s.expenses.paid)} size="md" />
            <StatCard label="Contas a pagar em aberto" icon={Wallet} tone={s.expenses.open > 0 ? 'warning' : undefined} value={money(s.expenses.open)} size="md" foot={`${s.expenses.openCount} título(s)`} onClick={() => navigate('/financeiro/pagar')} />
            <StatCard label="Cauções retidos" icon={Landmark} value={money(s.deposits.held)} size="md" foot={`A devolver: ${money(s.deposits.pendingRefund)} · a receber: ${money(s.deposits.pendingReceipt)}`} onClick={() => navigate('/financeiro/caucoes')} />
          </div>
        </>
      )}
      <div className="grid-2">
        <Card title="Receita prevista × recebida" subtitle="Últimos 6 meses">
          {monthly.loading || !monthly.data ? <LoadingBlock /> : monthly.data.series.every((b) => !b.expectedIn && !b.realizedIn)
            ? <Alert tone="neutral">Sem títulos nem recebimentos no período.</Alert>
            : <BarChart labels={monthly.data.series.map((b) => monthLabel(b.key))} format={axis} series={[
                { name: 'Previsto', values: monthly.data.series.map((b) => b.expectedIn) },
                { name: 'Recebido', values: monthly.data.series.map((b) => b.realizedIn) },
              ]} />}
        </Card>
        <Card title="Fluxo de caixa do mês" subtitle="Entradas e saídas realizadas, saldo acumulado">
          {daily.loading || !daily.data ? <LoadingBlock /> : daily.data.series.every((b) => !b.realizedIn && !b.realizedOut)
            ? <Alert tone="neutral">Nenhuma movimentação realizada no mês.</Alert>
            : <LineChart labels={daily.data.series.map((b) => b.key.slice(8, 10))} format={axis} series={[
                { name: 'Entradas', values: daily.data.series.map((b) => b.realizedIn) },
                { name: 'Saídas', values: daily.data.series.map((b) => b.realizedOut) },
                { name: 'Saldo acumulado', values: daily.data.series.map((b) => b.cumulativeRealized) },
              ]} />}
        </Card>
      </div>
      <Card title="Previsto × realizado por mês" flush>
        {!monthly.data ? <LoadingBlock /> : (
          <table className="nc-table">
            <thead><tr><th>Mês</th><th className="num">Entradas previstas</th><th className="num">Entradas realizadas</th><th className="num">Saídas previstas</th><th className="num">Saídas realizadas</th><th className="num">Resultado de caixa</th></tr></thead>
            <tbody>{monthly.data.series.map((b) => (
              <tr key={b.key}><td>{monthLabel(b.key)}</td><td className="num">{money(b.expectedIn)}</td><td className="num">{money(b.realizedIn)}</td>
                <td className="num">{money(b.expectedOut)}</td><td className="num">{money(b.realizedOut)}</td>
                <td className={`num ${b.netRealized < 0 ? 'text-danger' : ''}`}>{money(b.netRealized)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <p className="xsmall muted"><TrendingUp size={12} /> Previsto = títulos por vencimento. Realizado = pagamentos confirmados por data. Recebimentos de caução ficam fora da receita.</p>
    </Page>
  );
}
