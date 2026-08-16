import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Building2, CalendarDays, Car, DoorOpen, HardHat, Package,
  Receipt, TrendingUp, UserCheck, Users, Wrench,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { accessByDay, accessByHour, dashboardSnapshot, ticketFlow, ticketsByCategory } from '../../services/analytics';
import { financialSummary, monthlySeries } from '../../services/finance';
import { openTickets } from '../../services/tickets';
import { openIncidents } from '../../services/incidents';
import { recentAccesses } from '../../services/access';
import { reservationsOn, areaName } from '../../services/reservations';
import { units, unitLabel, towers } from '../../services/directory';
import { AreaChart, BarChart, DonutChart, RankBars } from '../../components/charts/Charts';
import {
  Badge, Button, Card, CardHeader, EmptyState, PageHeader, ProgressBar, StatCard,
} from '../../components/ui';
import { currency, currencyCompact, number, percent } from '../../lib/format';
import { formatTime, isoDate } from '../../lib/date';
import './management.css';

export function ManagementDashboard() {
  const { condominium, dataVersion } = useAuthenticated();
  const today = isoDate(new Date());
  const monthPrefix = today.slice(0, 7);

  const data = useMemo(() => {
    const allUnits = units(condominium.id);
    return {
      snapshot: dashboardSnapshot(condominium.id),
      finance: financialSummary(condominium.id, allUnits, monthPrefix),
      series: monthlySeries(condominium.id, 8),
      byHour: accessByHour(condominium.id),
      byDay: accessByDay(condominium.id, 7),
      ticketCats: ticketsByCategory(condominium.id),
      ticketFlowData: ticketFlow(condominium.id, 6),
      tickets: openTickets(condominium.id).slice(0, 6),
      incidents: openIncidents(condominium.id).slice(0, 5),
      accesses: recentAccesses(condominium.id, 8),
      reservations: reservationsOn(condominium.id, today).slice(0, 6),
      towerList: towers(condominium.id),
      allUnits,
    };
  }, [condominium.id, monthPrefix, today, dataVersion]);

  const { snapshot, finance } = data;

  return (
    <>
      <PageHeader
        icon={<Building2 size={22} />}
        title={condominium.name}
        subtitle={`${number(snapshot.units)} unidades · ${number(snapshot.residents)} moradores · ${number(snapshot.vehicles)} veículos · ${number(snapshot.staff)} funcionários`}
        actions={
          <>
            <Button variant="secondary" to="/gestao/acessos" icon={<DoorOpen size={16} />}>Controle de acesso</Button>
            <Button variant="primary" to="/gestao/financeiro" icon={<Receipt size={16} />}>Financeiro</Button>
          </>
        }
      />

      {/* ---------- Indicadores principais ---------- */}
      <div className="nx-dash-stats">
        <StatCard label="Moradores" value={number(snapshot.residents)} icon={<Users size={17} />} tone="brand" hint={`${percent(snapshot.occupancyRate)} de ocupação`} />
        <StatCard label="Acessos hoje" value={number(snapshot.accessesToday)} icon={<DoorOpen size={17} />} tone="cyan" trend={{ value: '+8,2%', direction: 'up' }} />
        <StatCard label="Visitantes esperados" value={number(snapshot.expectedVisitors)} icon={<UserCheck size={17} />} tone="brand" hint={`${snapshot.onSiteVisitors} no condomínio`} />
        <StatCard label="Encomendas" value={number(snapshot.pendingDeliveries)} icon={<Package size={17} />} tone="warning" hint="Aguardando retirada" />
        <StatCard label="Chamados abertos" value={number(snapshot.openTickets)} icon={<Wrench size={17} />} tone="warning" />
        <StatCard label="Inadimplência" value={percent(finance.delinquencyRate)} icon={<Receipt size={17} />} tone={finance.delinquencyRate > 6 ? 'danger' : 'success'} trend={{ value: '-0,4 p.p.', direction: 'down', positive: true }} />
        <StatCard label="Reservas hoje" value={number(snapshot.reservationsToday)} icon={<CalendarDays size={17} />} tone="cyan" />
        <StatCard label="Ocorrências" value={number(snapshot.openIncidents)} icon={<AlertTriangle size={17} />} tone={snapshot.openIncidents > 5 ? 'danger' : 'neutral'} hint="Em aberto" />
      </div>

      {/* ---------- Gráficos ---------- */}
      <div className="nx-dash-charts">
        <Card padding="md">
          <CardHeader
            title="Fluxo de acessos por hora"
            subtitle="Entradas e saídas registradas hoje"
            action={<Button variant="ghost" size="sm" to="/gestao/acessos" iconRight={<ArrowRight size={14} />}>Detalhar</Button>}
          />
          <AreaChart
            height={240}
            series={[
              { name: 'Entradas', color: 'var(--nexor-blue)', points: data.byHour.map((h) => ({ label: h.label, value: h.entradas })) },
              { name: 'Saídas', color: 'var(--nexor-cyan)', points: data.byHour.map((h) => ({ label: h.label, value: h.saidas })) },
            ]}
          />
        </Card>

        <Card padding="md">
          <CardHeader title="Receitas x despesas" subtitle="Últimos 8 meses" />
          <BarChart
            height={240}
            formatValue={(v) => currencyCompact(v)}
            series={[
              { name: 'Receitas', color: 'var(--success)', points: data.series.map((s) => ({ label: s.label, value: s.revenue })) },
              { name: 'Despesas', color: 'var(--nexor-blue)', points: data.series.map((s) => ({ label: s.label, value: s.expenses })) },
            ]}
          />
        </Card>
      </div>

      <div className="nx-dash-charts">
        <Card padding="md">
          <CardHeader title="Volume diário de acessos" subtitle="Últimos dias registrados" />
          <AreaChart
            height={200}
            series={[{ name: 'Acessos', color: 'var(--nexor-blue)', points: data.byDay }]}
          />
        </Card>

        <Card padding="md">
          <CardHeader title="Chamados abertos x resolvidos" subtitle="Evolução semestral" />
          <BarChart
            height={200}
            series={[
              { name: 'Abertos', color: 'var(--warning)', points: data.ticketFlowData.map((t) => ({ label: t.label, value: t.abertos })) },
              { name: 'Resolvidos', color: 'var(--success)', points: data.ticketFlowData.map((t) => ({ label: t.label, value: t.resolvidos })) },
            ]}
          />
        </Card>
      </div>

      <div className="nx-dash-grid">
        {/* ---------- Financeiro ---------- */}
        <Card padding="md">
          <CardHeader
            title="Resumo financeiro"
            subtitle="Competência atual"
            action={<Button variant="ghost" size="sm" to="/gestao/financeiro" iconRight={<ArrowRight size={14} />}>Abrir</Button>}
          />
          <div className="nx-fin-summary">
            <div>
              <span>Receitas</span>
              <strong className="is-positive">{currency(finance.revenue)}</strong>
            </div>
            <div>
              <span>Despesas</span>
              <strong className="is-negative">{currency(finance.expenses)}</strong>
            </div>
            <div>
              <span>Saldo</span>
              <strong>{currency(finance.balance)}</strong>
            </div>
            <div>
              <span>Fundo de reserva</span>
              <strong>{currency(finance.reserveFund)}</strong>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <ProgressBar
              label={`Inadimplência · ${number(finance.delinquentUnits)} unidades`}
              value={finance.delinquencyRate}
              max={15}
              tone={finance.delinquencyRate > 6 ? 'danger' : 'warning'}
              showValue
            />
            <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-2)' }}>
              Valor em aberto: {currency(finance.delinquentAmount)}
            </p>
          </div>
        </Card>

        {/* ---------- Chamados por categoria ---------- */}
        <Card padding="md">
          <CardHeader title="Chamados por categoria" subtitle="Últimos 90 dias" />
          <RankBars data={data.ticketCats} />
        </Card>

        {/* ---------- Ocupação por torre ---------- */}
        <Card padding="md">
          <CardHeader title="Ocupação por torre" />
          <div className="nx-stack nx-gap-4">
            {data.towerList.map((tower) => {
              const towerUnits = data.allUnits.filter((u) => u.towerId === tower.id);
              const occupied = towerUnits.filter((u) => u.status !== 'vaga').length;
              const rate = towerUnits.length ? (occupied / towerUnits.length) * 100 : 0;
              return (
                <ProgressBar
                  key={tower.id}
                  label={`${tower.name} · ${number(occupied)}/${number(towerUnits.length)}`}
                  value={rate}
                  tone="brand"
                  showValue
                />
              );
            })}
          </div>
          <div className="nx-row nx-gap-4 nx-center" style={{ marginTop: 'var(--space-5)' }}>
            <DonutChart
              size={160}
              thickness={20}
              centerValue={percent(snapshot.occupancyRate, 0)}
              centerLabel="ocupação"
              data={[
                { label: 'Ocupadas', value: data.allUnits.filter((u) => u.status === 'ocupada').length, color: 'var(--nexor-blue)' },
                { label: 'Alugadas', value: data.allUnits.filter((u) => u.status === 'alugada').length, color: 'var(--nexor-cyan)' },
                { label: 'Vagas', value: data.allUnits.filter((u) => u.status === 'vaga').length, color: 'var(--border-strong)' },
                { label: 'Reformando', value: data.allUnits.filter((u) => u.status === 'reformando').length, color: 'var(--warning)' },
              ]}
            />
          </div>
        </Card>

        {/* ---------- Chamados ---------- */}
        <Card padding="md">
          <CardHeader
            title="Chamados prioritários"
            action={<Button variant="ghost" size="sm" to="/gestao/chamados" iconRight={<ArrowRight size={14} />}>Ver todos</Button>}
          />
          {data.tickets.length === 0 ? (
            <EmptyState compact title="Nenhum chamado aberto" description="Todos os chamados foram resolvidos." />
          ) : (
            <ul className="nx-list">
              {data.tickets.map((t) => (
                <li key={t.id} className="nx-list__item">
                  <span className={`nx-list__icon ${t.priority === 'urgente' ? 'nx-list__icon--danger' : t.priority === 'alta' ? 'nx-list__icon--warning' : ''}`}>
                    <Wrench size={16} />
                  </span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium nx-truncate">{t.title}</span>
                    <span className="nx-text-xs nx-text-subtle">{t.code} · {t.location}</span>
                  </span>
                  <Badge tone={t.status === 'aberto' ? 'warning' : 'info'} size="sm">
                    {t.status === 'aberto' ? 'Aberto' : 'Em andamento'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Ocorrências ---------- */}
        <Card padding="md">
          <CardHeader
            title="Ocorrências em aberto"
            action={<Button variant="ghost" size="sm" to="/gestao/ocorrencias" iconRight={<ArrowRight size={14} />}>Ver todas</Button>}
          />
          {data.incidents.length === 0 ? (
            <EmptyState compact title="Nenhuma ocorrência aberta" />
          ) : (
            <ul className="nx-list">
              {data.incidents.map((i) => (
                <li key={i.id} className="nx-list__item">
                  <span className={`nx-list__icon ${i.severity === 'critica' || i.severity === 'alta' ? 'nx-list__icon--danger' : 'nx-list__icon--warning'}`}>
                    <AlertTriangle size={16} />
                  </span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium nx-truncate">{i.title}</span>
                    <span className="nx-text-xs nx-text-subtle">{i.code} · {i.location}</span>
                  </span>
                  <Badge tone={i.severity === 'critica' ? 'danger' : i.severity === 'alta' ? 'warning' : 'neutral'} size="sm">
                    {i.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Reservas de hoje ---------- */}
        <Card padding="md">
          <CardHeader
            title="Reservas de hoje"
            action={<Button variant="ghost" size="sm" to="/gestao/reservas" iconRight={<ArrowRight size={14} />}>Gerenciar</Button>}
          />
          {data.reservations.length === 0 ? (
            <EmptyState compact title="Nenhuma reserva hoje" />
          ) : (
            <ul className="nx-list">
              {data.reservations.map((r) => (
                <li key={r.id} className="nx-list__item">
                  <span className="nx-list__icon nx-list__icon--cyan"><CalendarDays size={16} /></span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium nx-truncate">{areaName(r.areaId)}</span>
                    <span className="nx-text-xs nx-text-subtle">{r.slot} · {unitLabel(r.unitId)}</span>
                  </span>
                  <Badge tone={r.status === 'confirmada' ? 'success' : 'warning'} size="sm">{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Acessos recentes ---------- */}
        <Card padding="md">
          <CardHeader
            title="Acessos recentes"
            action={<Button variant="ghost" size="sm" to="/gestao/acessos" iconRight={<ArrowRight size={14} />}>Histórico</Button>}
          />
          <ul className="nx-list">
            {data.accesses.map((a) => (
              <li key={a.id} className="nx-list__item">
                <span className={`nx-list__icon ${a.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}>
                  {a.plate ? <Car size={16} /> : <DoorOpen size={16} />}
                </span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium nx-truncate">{a.plate ?? a.subjectName}</span>
                  <span className="nx-text-xs nx-text-subtle">{a.unitId ? unitLabel(a.unitId) : a.gateName}</span>
                </span>
                <span className="nx-mono nx-text-sm nx-text-muted">{formatTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---------- Atalhos ---------- */}
        <Card padding="md">
          <CardHeader title="Atalhos de gestão" icon={<TrendingUp size={18} />} />
          <div className="nx-shortcuts">
            <Link to="/gestao/moradores"><Users size={18} /> Moradores</Link>
            <Link to="/gestao/unidades"><Building2 size={18} /> Unidades</Link>
            <Link to="/gestao/veiculos"><Car size={18} /> Veículos</Link>
            <Link to="/gestao/funcionarios"><HardHat size={18} /> Funcionários</Link>
            <Link to="/gestao/manutencao"><Wrench size={18} /> Manutenção</Link>
            <Link to="/gestao/seguranca"><AlertTriangle size={18} /> Segurança</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
