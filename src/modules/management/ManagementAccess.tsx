import { useMemo } from 'react';
import { DoorOpen, Download, LogIn, LogOut, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { AccessLogTable } from '../../components/AccessLogTable';
import { accessByHour, accessByType, dashboardSnapshot } from '../../services/analytics';
import { SUBJECT_LABEL } from '../../services/access';
import { AreaChart, DonutChart } from '../../components/charts/Charts';
import { Button, Card, CardHeader, PageHeader, StatCard, useToast } from '../../components/ui';
import { number } from '../../lib/format';
import './management.css';

const TYPE_COLORS: Record<string, string> = {
  morador: 'var(--nexor-blue)',
  veiculo: 'var(--nexor-cyan)',
  visitante: '#7C5CFF',
  funcionario: 'var(--success)',
  prestador: 'var(--warning)',
  entrega: 'var(--text-subtle)',
};

export function ManagementAccess() {
  const { condominium, dataVersion } = useAuthenticated();
  const toast = useToast();

  const data = useMemo(() => {
    const byType = accessByType(condominium.id);
    return {
      snapshot: dashboardSnapshot(condominium.id),
      byHour: accessByHour(condominium.id),
      donut: [...byType.entries()].map(([type, value]) => ({
        label: SUBJECT_LABEL[type as keyof typeof SUBJECT_LABEL] ?? type,
        value,
        color: TYPE_COLORS[type] ?? 'var(--border-strong)',
      })),
    };
  }, [condominium.id, dataVersion]);

  const entries = data.byHour.reduce((s, h) => s + h.entradas, 0);
  const exits = data.byHour.reduce((s, h) => s + h.saidas, 0);

  return (
    <>
      <PageHeader
        icon={<DoorOpen size={22} />}
        title="Controle de acesso"
        subtitle="Todo o movimento do condomínio, com filtros por pessoa, veículo, unidade e portaria"
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => toast.info('Exportação simulada', 'Na versão de produção o relatório é gerado em CSV e PDF.')}
          >
            Exportar relatório
          </Button>
        }
      />

      <div className="nx-grid-auto nx-mb-4">
        <StatCard label="Acessos hoje" value={number(data.snapshot.accessesToday)} icon={<DoorOpen size={17} />} tone="brand" />
        <StatCard label="Entradas" value={number(entries)} icon={<LogIn size={17} />} tone="success" />
        <StatCard label="Saídas" value={number(exits)} icon={<LogOut size={17} />} tone="cyan" />
        <StatCard label="Visitantes no local" value={number(data.snapshot.onSiteVisitors)} icon={<Users size={17} />} tone="warning" />
      </div>

      <div className="nx-dash-charts">
        <Card padding="md">
          <CardHeader title="Movimento por hora" subtitle="Entradas e saídas de hoje" />
          <AreaChart
            height={230}
            series={[
              { name: 'Entradas', color: 'var(--nexor-blue)', points: data.byHour.map((h) => ({ label: h.label, value: h.entradas })) },
              { name: 'Saídas', color: 'var(--nexor-cyan)', points: data.byHour.map((h) => ({ label: h.label, value: h.saidas })) },
            ]}
          />
        </Card>

        <Card padding="md">
          <CardHeader title="Composição dos acessos" subtitle="Por tipo de pessoa ou veículo" />
          <div className="nx-row nx-gap-5 nx-wrap nx-center">
            <DonutChart
              size={180}
              thickness={22}
              data={data.donut}
              centerValue={number(data.snapshot.accessesToday)}
              centerLabel="acessos hoje"
            />
            <div className="nx-stack nx-gap-2 nx-grow">
              {data.donut.map((d) => (
                <div key={d.label} className="nx-row nx-between nx-gap-3">
                  <span className="nx-row nx-gap-2 nx-text-sm">
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'block' }} />
                    {d.label}
                  </span>
                  <strong className="nx-nums nx-text-sm">{number(d.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <AccessLogTable condominiumId={condominium.id} dataVersion={dataVersion} />
    </>
  );
}
