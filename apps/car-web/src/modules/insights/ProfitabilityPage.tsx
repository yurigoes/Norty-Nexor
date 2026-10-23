/* Rentabilidade por veículo: ranking, decomposição de custos e aviso de dados faltantes. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { ProfitabilityResponse, ProfitabilityRow } from '@nortycar/shared';
import { Alert, Card, KeyValue, Page, PageHeader, Segmented, StatCard } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { DataTable, type Column, type SortState } from '../../components/table';
import { Drawer } from '../../components/overlay';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { int, km, money, pct, plate, todayIso } from '../../lib/format';
import { useBranchFilter } from '../../app/branch-filter';
import './insights.css';

const BREAKDOWN: [keyof ProfitabilityRow['breakdown'], string][] = [
  ['maintenance', 'Manutenção'], ['parts', 'Peças'], ['tires', 'Pneus'], ['insurance', 'Seguro'], ['taxes', 'Impostos'],
  ['documentation', 'Documentação'], ['fuel', 'Combustível'], ['other', 'Outros diretos'],
];

export function ProfitabilityPage() {
  const { branchId } = useBranchFilter();
  const [from, setFrom] = useState(() => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayIso());
  const [view, setView] = useState<'all' | 'negative' | 'incomplete'>('all');
  const [sort, setSort] = useState<SortState>({ sort: 'operatingResult', order: 'desc' });
  const [open, setOpen] = useState<ProfitabilityRow | null>(null);
  const query = { from: new Date(`${from}T00:00:00-03:00`).toISOString(), to: new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000).toISOString(), branchId: branchId || undefined };
  const data = useApi((signal) => api.get<ProfitabilityResponse>('/profitability', query, signal), [from, to, branchId]);

  const rows = useMemo(() => {
    let list = data.data?.vehicles ?? [];
    if (view === 'negative') list = list.filter((r) => r.operatingResult < 0);
    if (view === 'incomplete') list = list.filter((r) => r.missing.length);
    const key = (sort.sort ?? 'operatingResult') as keyof ProfitabilityRow;
    return [...list].map((r) => ({ ...r, id: r.vehicleUnitId })).sort((a, b) => {
      const av = (a[key] as number | null) ?? -Infinity;
      const bv = (b[key] as number | null) ?? -Infinity;
      return sort.order === 'asc' ? av - bv : bv - av;
    });
  }, [data.data, view, sort]);

  const columns: Column<ProfitabilityRow & { id: string }>[] = [
    { key: 'plate', header: 'Veículo', render: (r) => <div><div className="strong">{plate(r.plate)}</div><div className="xsmall muted">{r.model}</div></div> },
    { key: 'revenue', header: 'Receita', align: 'right', sortable: true, render: (r) => money(r.revenue) },
    { key: 'costs', header: 'Custos', align: 'right', sortable: true, render: (r) => money(r.costs) },
    { key: 'operatingResult', header: 'Resultado', align: 'right', sortable: true, render: (r) => <span className={r.operatingResult < 0 ? 'text-danger strong' : 'strong'}>{money(r.operatingResult)}</span> },
    { key: 'margin', header: 'Margem', align: 'right', sortable: true, render: (r) => pct(r.margin) },
    { key: 'occupancy', header: 'Ocupação', align: 'right', sortable: true, render: (r) => pct(r.occupancy) },
    { key: 'idleDays', header: 'Dias parado', align: 'right', sortable: true, render: (r) => int(r.idleDays) },
    { key: 'costPerKm', header: 'Custo/km', align: 'right', sortable: true, render: (r) => money(r.costPerKm) },
    { key: 'roi', header: 'ROI', align: 'right', sortable: true, render: (r) => pct(r.roi) },
    { key: 'missing', header: '', render: (r) => r.missing.length ? <span className="missing-note" title={`Faltando: ${r.missing.join(', ')}`}><AlertTriangle size={13} aria-hidden />{r.missing.length} dado(s) faltando</span> : null },
  ];

  return (
    <Page>
      <PageHeader title="Rentabilidade por veículo" description="Receita recebida contra custos diretos de cada carro no período. Indicador que depende de dado ausente aparece vazio, com o aviso do que falta."
        actions={<Segmented label="Mostrar" options={[{ value: 'all', label: 'Todos' }, { value: 'negative', label: 'Resultado negativo' }, { value: 'incomplete', label: 'Dados incompletos' }]} value={view} onChange={setView} />} />
      <Card>
        <div className="nc-filters" style={{ alignItems: 'flex-end' }}>
          <Field label="De"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Até"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      {data.data && (
        <div className="grid-4">
          <StatCard label="Receita atribuída" icon={TrendingUp} size="md" value={money(data.data.totals.revenue)} />
          <StatCard label="Custos diretos" size="md" value={money(data.data.totals.costs)} />
          <StatCard label="Resultado operacional" size="md" tone={data.data.totals.operatingResult < 0 ? 'danger' : undefined} value={money(data.data.totals.operatingResult)} />
          <StatCard label="Veículos com dados incompletos" value={int(data.data.incomplete)} tone={data.data.incomplete ? 'warning' : undefined} foot="Clique em um veículo para ver o que falta" />
        </div>
      )}
      {data.data && data.data.incomplete > 0 && (
        <Alert tone="warning" title="Parte da frota não tem todos os dados">
          Sem valor de aquisição, data de compra ou política de depreciação (em Configurações), depreciação e ROI não são calculados. Nada é estimado no lugar.
        </Alert>
      )}
      <Card flush>
        <DataTable columns={columns} rows={rows} loading={data.loading} error={data.error} onRetry={data.reload} onRowClick={setOpen} sort={sort} onSort={setSort}
          empty={{ title: 'Nenhum veículo no período', icon: TrendingUp, description: 'Cadastre veículos e registre contratos e despesas para ver a rentabilidade.' }} />
      </Card>
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open ? plate(open.plate) : ''} description={open?.model} wide>
        {open && (
          <div className="stack-lg">
            {open.missing.length > 0 && <Alert tone="warning" title="Dados faltantes">{open.missing.join(', ')}</Alert>}
            <KeyValue items={[
              { label: 'Receita', value: money(open.revenue) },
              { label: 'Custos', value: money(open.costs) },
              { label: 'Resultado operacional', value: money(open.operatingResult) },
              { label: 'Depreciação no período', value: money(open.depreciation) },
              { label: 'Resultado após depreciação', value: money(open.resultAfterDepreciation) },
              { label: 'Margem', value: pct(open.margin) },
              { label: 'Receita por dia disponível', value: money(open.revenuePerAvailableDay) },
              { label: 'Custo por km', value: money(open.costPerKm) },
              { label: 'ROI', value: pct(open.roi) },
            ]} />
            <KeyValue items={[
              { label: 'Dias na frota', value: int(open.daysInFleet) },
              { label: 'Dias alugado', value: int(open.daysRented) },
              { label: 'Dias indisponível', value: int(open.daysUnavailable) },
              { label: 'Dias parado', value: int(open.idleDays) },
              { label: 'Quilometragem rodada', value: km(open.kmDriven) },
              { label: 'Ocupação', value: pct(open.occupancy) },
            ]} />
            <div>
              <div className="nc-section-title" style={{ marginBottom: 8 }}>Composição dos custos</div>
              <ul className="nc-list nc-card">
                {BREAKDOWN.map(([k, label]) => (
                  <li key={k}><span className="grow">{label}</span><span className="tnum strong">{money(open.breakdown[k])}</span></li>
                ))}
              </ul>
            </div>
            <Link to={`/frota/veiculos/${open.vehicleUnitId}`} className="nc-btn nc-btn--secondary">Abrir ficha do veículo</Link>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
