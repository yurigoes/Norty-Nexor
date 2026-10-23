import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Car, CreditCard, Globe, LifeBuoy, ShieldQuestion, Users } from 'lucide-react';
import type { PlatformDashboard } from '@nortycar/shared';
import { Card, ErrorState, LoadingBlock, Page, PageHeader, StatCard } from '../../components/ui';
import { Donut } from '../../components/charts';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { int, money } from '../../lib/format';

export function MasterDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.get<PlatformDashboard>('/platform/dashboard'), []);
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? 'Sem dados'} onRetry={reload} />;
  const o = data.organizations;
  return (
    <Page>
      <PageHeader eyebrow="Master Norty" title="Visão geral da plataforma" description="Números agregados da operação do SaaS. Dados das locadoras só por acesso de suporte autorizado." />
      <div className="grid-4">
        <StatCard label="Empresas ativas" value={int(o.active)} icon={Building2} foot={`${int(o.trial)} em avaliação · ${int(o.total)} no total`} onClick={() => navigate('/master/empresas?status=ACTIVE')} />
        <StatCard label="Receita recorrente (MRR)" value={money(data.mrr)} icon={CreditCard} tone="success" foot={`${int(data.payingSubscriptions)} assinaturas cobráveis`} onClick={() => navigate('/master/assinaturas')} />
        <StatCard label="Faturas SaaS vencidas" value={int(data.overdueInvoices.count)} icon={AlertTriangle} tone={data.overdueInvoices.count ? 'danger' : undefined} foot={money(data.overdueInvoices.amount)} onClick={() => navigate('/master/assinaturas?status=OVERDUE')} />
        <StatCard label="Empresas suspensas" value={int(o.suspended)} icon={Building2} tone={o.suspended ? 'warning' : undefined} onClick={() => navigate('/master/empresas?status=SUSPENDED')} />
        <StatCard label="Veículos na plataforma" value={int(data.vehicles)} icon={Car} foot="Unidades não vendidas, todas as empresas" />
        <StatCard label="Usuários ativos" value={int(data.users)} icon={Users} foot="Vínculos ativos de equipe" />
        <StatCard label="Chamados abertos" value={int(data.openTickets)} icon={LifeBuoy} tone={data.openTickets ? 'warning' : undefined} onClick={() => navigate('/master/suporte')} />
        <StatCard label="Domínios com problema" value={int(data.misconfiguredDomains)} icon={Globe} tone={data.misconfiguredDomains ? 'danger' : undefined} foot={`${int(data.pendingGrants)} pedidos de acesso aguardando empresas`} onClick={() => navigate('/master/dominios?status=MISCONFIGURED')} />
      </div>
      <Card title="Empresas por situação">
        {o.total ? (
          <Donut data={[
            { label: 'Ativas', value: o.active, color: 'var(--chart-2)' },
            { label: 'Em avaliação', value: o.trial, color: 'var(--chart-1)' },
            { label: 'Suspensas', value: o.suspended, color: 'var(--chart-4)' },
            { label: 'Encerradas', value: o.closed, color: 'var(--chart-6)' },
          ]} center={<div><div className="nc-stat__value">{o.total}</div><div className="xsmall muted">empresas</div></div>} />
        ) : (
          <div className="row muted"><ShieldQuestion size={18} aria-hidden /> Nenhuma empresa cadastrada ainda. Cadastre a primeira em Empresas.</div>
        )}
      </Card>
    </Page>
  );
}
