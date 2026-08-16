import { useMemo, useState } from 'react';
import { Download, ScrollText, ShieldCheck } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { auditTrail } from '../../services/audit';
import { ROLE_LABEL } from '../../services/permissions';
import type { AuditEntry } from '../../data/types';
import {
  Avatar, Badge, Button, Card, DataTable, EmptyState, PageHeader, Pagination, SearchInput,
  Select, StatCard, useToast, type Column,
} from '../../components/ui';
import { CellStack, FilterBar } from '../../components/PageBits';
import { formatDateTime, isoDate, timeAgo } from '../../lib/date';
import { number } from '../../lib/format';
import './management.css';

const PAGE_SIZE = 25;

export function ManagementAudit() {
  const { condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const today = isoDate(new Date());

  const [term, setTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const all = useMemo(() => auditTrail(condominium.id), [condominium.id, dataVersion]);

  const modules = useMemo(
    () => [...new Set(all.map((a) => a.module))].sort().map((m) => ({ value: m, label: m })),
    [all],
  );

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return all.filter((a) =>
      (!q || [a.actorName, a.action, a.target, a.detail ?? '', a.ip].some((f) => f.toLowerCase().includes(q)))
      && (!moduleFilter || a.module === moduleFilter)
      && (!role || a.actorRole === role));
  }, [all, term, moduleFilter, role]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: 'Data e hora', width: '160px', render: (a) => <CellStack title={formatDateTime(a.at)} meta={timeAgo(a.at)} /> },
    {
      key: 'actor',
      header: 'Autor',
      render: (a) => (
        <span className="nx-row nx-gap-3">
          <Avatar name={a.actorName} size="sm" />
          <CellStack title={a.actorName} meta={ROLE_LABEL[a.actorRole]} />
        </span>
      ),
    },
    { key: 'action', header: 'Ação', render: (a) => <CellStack title={a.action} meta={a.target} /> },
    { key: 'detail', header: 'Detalhe', hideOnMobile: true, render: (a) => <span className="nx-text-sm nx-text-muted">{a.detail ?? '—'}</span> },
    { key: 'module', header: 'Módulo', hideOnMobile: true, render: (a) => <Badge tone="neutral" size="sm">{a.module}</Badge> },
    { key: 'ip', header: 'Origem', hideOnMobile: true, align: 'right', render: (a) => <span className="nx-audit-badge">{a.ip}</span> },
  ];

  return (
    <>
      <PageHeader
        icon={<ScrollText size={22} />}
        title="Auditoria"
        subtitle="Rastreabilidade de todas as ações críticas da plataforma"
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => toast.info('Exportação simulada', 'A trilha completa é exportável em CSV na versão de produção.')}
          >
            Exportar trilha
          </Button>
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Registros na trilha" value={number(all.length)} icon={<ScrollText size={17} />} tone="brand" />
        <StatCard label="Ações hoje" value={number(all.filter((a) => a.at.slice(0, 10) === today).length)} icon={<ShieldCheck size={17} />} tone="cyan" />
        <StatCard label="Módulos monitorados" value={modules.length} icon={<ScrollText size={17} />} tone="neutral" />
        <StatCard label="Autores distintos" value={number(new Set(all.map((a) => a.actorName)).size)} icon={<ShieldCheck size={17} />} tone="success" />
      </div>

      <Card padding="none">
        <FilterBar>
          <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(1); }} placeholder="Buscar por autor, ação, alvo ou IP..." />
          <Select options={modules} placeholder="Todos os módulos" value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }} selectSize="sm" />
          <Select
            options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))}
            placeholder="Todos os perfis"
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            selectSize="sm"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={paged}
          keyOf={(a) => a.id}
          dense
          empty={<EmptyState icon={<ScrollText size={24} />} title="Nenhum registro encontrado" description="Ajuste os filtros para ampliar a consulta." />}
          mobileCard={(a) => (
            <div className="nx-row nx-gap-3">
              <Avatar name={a.actorName} size="sm" />
              <div className="nx-stack nx-grow nx-gap-1">
                <span className="nx-medium">{a.action}</span>
                <span className="nx-text-xs nx-text-subtle">{a.actorName} · {a.target}</span>
              </div>
              <span className="nx-text-xs nx-text-subtle">{timeAgo(a.at)}</span>
            </div>
          )}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </>
  );
}
