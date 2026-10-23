/* Catálogo de relatórios e visualização com filtros, exportação CSV e impressão. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileBarChart, Lock, Play, Printer } from 'lucide-react';
import type { ReportMeta, ReportPage as ReportData } from '@nortycar/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Field, Input, Select } from '../../components/form';
import { DataTable, Pagination, type Column } from '../../components/table';
import { useToast } from '../../components/toast';
import { api, errorMessage, saveBlob } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, dateTime, int, money, pct, todayIso } from '../../lib/format';
import { useSession } from '../../lib/session';
import { useBranchFilter } from '../../app/branch-filter';
import './insights.css';

const GROUP_ORDER = ['Frota', 'Locações', 'Financeiro', 'Rentabilidade', 'Operação', 'Regularização'];

export function ReportsCatalogPage() {
  const list = useApi((signal) => api.get<ReportMeta[]>('/reports', undefined, signal), []);
  const groups = useMemo(() => {
    const map = new Map<string, ReportMeta[]>();
    for (const r of list.data ?? []) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, reports: map.get(g)! }));
  }, [list.data]);
  return (
    <Page>
      <PageHeader title="Relatórios" description="Os mesmos dados e as mesmas permissões das telas. Exporte em CSV para planilhas ou imprima/salve em PDF." />
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <LoadingBlock /> : !groups.length ? (
        <EmptyState icon={Lock} title="Nenhum relatório disponível" description="Seu perfil não inclui relatórios." />
      ) : (
        <div className="report-groups">
          {groups.map((g) => (
            <Card key={g.group} title={g.group} flush>
              <div style={{ padding: 'var(--space-2)' }}>
                {g.reports.map((r) => (
                  <Link key={r.key} to={`/relatorios/${r.key}`} className="report-link">
                    <FileBarChart size={18} className="muted" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <span className="strong" style={{ display: 'block' }}>{r.title}{r.financial && <> <Badge tone="info">Financeiro</Badge></>}</span>
                      <span className="small muted">{r.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

function defaultFrom(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

export function ReportViewPage() {
  const { reportKey = '' } = useParams();
  const toast = useToast();
  const { can } = useSession();
  const { branchId } = useBranchFilter();
  const catalog = useApi((signal) => api.get<ReportMeta[]>('/reports', undefined, signal), []);
  const meta = catalog.data?.find((r) => r.key === reportKey);
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(todayIso());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string> | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<'csv' | 'print' | null>(null);

  // Relatório sem filtro obrigatório roda direto ao abrir.
  useEffect(() => {
    if (meta && !meta.filters.some((f) => f.required)) setApplied({});
  }, [meta]);

  const query = useMemo(() => {
    if (!applied || !meta) return null;
    const q: Record<string, string> = { ...applied };
    if (meta.period) {
      q.from = new Date(`${from}T00:00:00-03:00`).toISOString();
      q.to = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
    }
    if (branchId) q.branchId = branchId;
    return q;
  }, [applied, meta, from, to, branchId]);

  const data = useApi((signal) => api.get<ReportData>(`/reports/${reportKey}`, { ...query, page, pageSize: 50 }, signal), [reportKey, JSON.stringify(query), page], Boolean(query));

  const columns: Column<Record<string, string | number | null> & { id: string }>[] = (meta?.columns ?? []).map((c) => ({
    key: c.key, header: c.label, align: ['money', 'number', 'percent'].includes(c.type) ? 'right' : undefined,
    render: (row) => format(c.type, row[c.key]),
  }));

  const download = async () => {
    if (!query) return;
    setBusy('csv');
    try {
      const { blob, filename } = await api.download(`/reports/${reportKey}/export`, { ...query, format: 'csv' });
      saveBlob(blob, filename);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  const print = async () => {
    if (!query) return;
    setBusy('print');
    // A versão para impressão exige o token; abre como documento local.
    const win = window.open('', '_blank');
    try {
      const html = await api.get<string>(`/reports/${reportKey}/print`, query);
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
      }
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e));
    } finally { setBusy(null); }
  };

  if (catalog.loading && !catalog.data) return <LoadingBlock />;
  if (catalog.error) return <ErrorState message={catalog.error} onRetry={catalog.reload} />;
  if (!meta) return <EmptyState icon={Lock} title="Relatório indisponível" description="O relatório não existe ou seu perfil não tem acesso." action={<Link to="/relatorios" className="nc-btn nc-btn--secondary">Voltar</Link>} />;

  const rows = data.data?.items.map((r, i) => ({ ...r, id: String(i) }));
  const ready = meta.filters.every((f) => !f.required || filters[f.key]);

  return (
    <Page>
      <PageHeader breadcrumb={<Link to="/relatorios" className="row" style={{ gap: 4 }}><ArrowLeft size={14} aria-hidden />Relatórios</Link>}
        eyebrow={meta.group} title={meta.title} description={meta.description}
        actions={<>
          <Button icon={Printer} onClick={print} loading={busy === 'print'} disabled={!query}>Imprimir / PDF</Button>
          {can('reports.export') && <Button icon={Download} onClick={download} loading={busy === 'csv'} disabled={!query}>Exportar CSV</Button>}
        </>} />
      <Card>
        <form className="nc-filters" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied({ ...filters }); }}>
          {meta.period && (
            <>
              <Field label="De"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Até"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
            </>
          )}
          {meta.filters.map((f) => (
            <Field key={f.key} label={f.label} required={f.required}>
              {f.type === 'select'
                ? <Select value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} placeholder="Todos" options={f.options ?? []} />
                : <Input type={f.type === 'number' ? 'number' : 'text'} value={filters[f.key] ?? ''} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} />}
            </Field>
          ))}
          <Button type="submit" variant="primary" icon={Play} disabled={!ready}>Gerar</Button>
        </form>
      </Card>
      {!query ? <Alert tone="info">Preencha os filtros obrigatórios e clique em Gerar.</Alert> : (
        <Card flush>
          <DataTable columns={columns} rows={rows} loading={data.loading} error={data.error} onRetry={data.reload}
            empty={{ title: 'Nenhum registro com estes filtros', icon: FileBarChart }}
            footer={data.data && (
              <>
                {Object.keys(data.data.totals).length > 0 && data.data.total > 0 && (
                  <div className="nc-table-footer">
                    <span className="strong">Totais ({int(data.data.total)} registros)</span>
                    <span className="row">{Object.entries(data.data.totals).map(([k, v]) => <span key={k} className="small"><span className="muted">{meta.columns.find((c) => c.key === k)?.label}:</span> <span className="strong tnum">{money(v)}</span></span>)}</span>
                  </div>
                )}
                <Pagination page={data.data.page} pageSize={data.data.pageSize} total={data.data.total} onPage={setPage} />
              </>
            )} />
        </Card>
      )}
    </Page>
  );
}

function format(type: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  switch (type) {
    case 'money': return <span className={Number(value) < 0 ? 'text-danger' : undefined}>{money(Number(value))}</span>;
    case 'percent': return pct(Number(value));
    case 'number': return int(Number(value));
    case 'date': return date(String(value));
    case 'datetime': return dateTime(String(value));
    default: return String(value);
  }
}
