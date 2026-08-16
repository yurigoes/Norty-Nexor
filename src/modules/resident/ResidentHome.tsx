import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CalendarPlus, Car, ChevronRight, DoorOpen, Package,
  Sparkles, UserPlus, Wallet, Wrench, HardHat, UserCheck, Megaphone,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { Badge, Button, Card, CardHeader, EmptyState, StatusDot } from '../../components/ui';
import { activeAuthorizations } from '../../services/visitors';
import { deliveriesOfUnit } from '../../services/deliveries';
import { nextInvoice } from '../../services/finance';
import { reservationsOfUnit, areaName } from '../../services/reservations';
import { ticketsOfUnit } from '../../services/tickets';
import { accessLogsOfUnit } from '../../services/access';
import { vehiclesOfUnit } from '../../services/vehicles';
import { staffOfUnit, unitLabel } from '../../services/directory';
import { announcements } from '../../services/communication';
import { currency, firstName } from '../../lib/format';
import { daysUntil, formatDate, isoDate, timeAgo } from '../../lib/date';
import './resident.css';

const QUICK_ACTIONS = [
  { to: '/app/visitantes?novo=1', label: 'Autorizar visitante', icon: UserPlus, tone: 'brand' },
  { to: '/app/reservas', label: 'Reservar área', icon: CalendarPlus, tone: 'cyan' },
  { to: '/app/encomendas', label: 'Encomendas', icon: Package, tone: 'brand' },
  { to: '/app/financeiro', label: 'Boletos', icon: Wallet, tone: 'success' },
  { to: '/app/chamados?novo=1', label: 'Abrir chamado', icon: Wrench, tone: 'warning' },
  { to: '/app/ocorrencias?novo=1', label: 'Ocorrência', icon: AlertTriangle, tone: 'danger' },
];

export function ResidentHome() {
  const { user, condominium, unit, dataVersion } = useAuthenticated();
  const unitId = user.unitId;
  const today = isoDate(new Date());

  const data = useMemo(() => {
    if (!unitId) return null;
    return {
      visitors: activeAuthorizations(unitId).slice(0, 4),
      deliveries: deliveriesOfUnit(unitId).filter((d) => d.status !== 'retirada' && d.status !== 'devolvida'),
      invoice: nextInvoice(unitId),
      reservations: reservationsOfUnit(unitId)
        .filter((r) => r.date >= today && r.status !== 'cancelada')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3),
      tickets: ticketsOfUnit(unitId).filter((t) => t.status === 'aberto' || t.status === 'em_andamento'),
      accesses: accessLogsOfUnit(unitId).slice(0, 5),
      vehicles: vehiclesOfUnit(unitId),
      staff: staffOfUnit(unitId).filter((s) => s.active),
      news: announcements(condominium.id).slice(0, 3),
    };
  }, [unitId, condominium.id, today, dataVersion]);

  if (!unitId || !unit || !data) {
    return (
      <EmptyState
        title="Nenhuma unidade vinculada"
        description="Esta conta não está associada a uma unidade. Entre com a conta de morador para ver a experiência completa."
        action={<Button variant="primary" to="/login">Trocar de conta</Button>}
      />
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dueIn = data.invoice ? daysUntil(data.invoice.dueDate) : null;

  return (
    <div className="nx-stack nx-gap-6">
      {/* ---------- Identidade condominial digital ---------- */}
      <section className="nx-identity">
        <div className="nx-identity__main">
          <p className="nx-identity__greeting">{greeting}, {firstName(user.name)} 👋</p>
          <h1 className="nx-identity__unit">{unitLabel(unitId)}</h1>
          <p className="nx-identity__condo">{condominium.name} · {condominium.city}/{condominium.state}</p>
          <div className="nx-identity__status">
            <StatusDot tone="success" pulse />
            <span>Morador ativo</span>
            <span className="nx-identity__sep" />
            <span>{unit.bedrooms} dormitórios · {unit.area} m²</span>
            <span className="nx-identity__sep" />
            <span>Vagas {unit.parkingSpots.join(' · ')}</span>
          </div>
        </div>

        <div className="nx-identity__stats">
          <Link to="/app/veiculos" className="nx-identity__stat">
            <Car size={17} />
            <strong>{data.vehicles.length}</strong>
            <span>Veículos</span>
          </Link>
          <Link to="/app/visitantes" className="nx-identity__stat">
            <UserCheck size={17} />
            <strong>{data.visitors.length}</strong>
            <span>Autorizados</span>
          </Link>
          <Link to="/app/funcionarios" className="nx-identity__stat">
            <HardHat size={17} />
            <strong>{data.staff.length}</strong>
            <span>Funcionários</span>
          </Link>
          <Link to="/app/encomendas" className="nx-identity__stat">
            <Package size={17} />
            <strong>{data.deliveries.length}</strong>
            <span>Encomendas</span>
          </Link>
          <Link to="/app/acessos" className="nx-identity__stat">
            <DoorOpen size={17} />
            <strong>{data.accesses.length}</strong>
            <span>Acessos</span>
          </Link>
        </div>
      </section>

      {/* ---------- Ações rápidas ---------- */}
      <section className="nx-quick">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.to} to={action.to} className={`nx-quick__item nx-quick__item--${action.tone}`}>
            <span className="nx-quick__icon"><action.icon size={20} /></span>
            <span>{action.label}</span>
          </Link>
        ))}
      </section>

      <div className="nx-home-grid">
        {/* ---------- Próximos visitantes ---------- */}
        <Card padding="md">
          <CardHeader
            title="Próximos visitantes"
            subtitle={`${data.visitors.length} autorização(ões) ativa(s)`}
            action={<Button variant="ghost" size="sm" to="/app/visitantes" iconRight={<ChevronRight size={15} />}>Ver todos</Button>}
          />
          {data.visitors.length === 0 ? (
            <EmptyState
              compact
              icon={<UserCheck size={20} />}
              title="Nenhum visitante autorizado"
              description="Autorize com antecedência para agilizar a liberação na portaria."
              action={<Button variant="primary" size="sm" to="/app/visitantes?novo=1">Cadastrar visitante</Button>}
            />
          ) : (
            <ul className="nx-list">
              {data.visitors.map((v) => (
                <li key={v.id} className="nx-list__item">
                  <span className="nx-list__avatar">{v.name.charAt(0)}</span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium">{v.name}</span>
                    <span className="nx-text-xs nx-text-subtle">
                      {v.expectedDate === today ? 'Hoje' : formatDate(v.expectedDate)} às {v.expectedTime}
                      {v.companyName ? ` · ${v.companyName}` : ''}
                    </span>
                  </span>
                  <Badge tone={v.status === 'no_local' ? 'success' : 'warning'} size="sm">
                    {v.status === 'no_local' ? 'No local' : 'Aguardando'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Encomendas ---------- */}
        <Card padding="md">
          <CardHeader
            title="Encomendas na portaria"
            subtitle={data.deliveries.length ? 'Aguardando retirada' : 'Nada pendente'}
            action={<Button variant="ghost" size="sm" to="/app/encomendas" iconRight={<ChevronRight size={15} />}>Ver todas</Button>}
          />
          {data.deliveries.length === 0 ? (
            <EmptyState compact icon={<Package size={20} />} title="Nenhuma encomenda aguardando" description="Você será notificado assim que algo chegar." />
          ) : (
            <ul className="nx-list">
              {data.deliveries.slice(0, 4).map((d) => (
                <li key={d.id} className="nx-list__item">
                  <span className="nx-list__icon nx-list__icon--cyan"><Package size={16} /></span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium">{d.carrier}</span>
                    <span className="nx-text-xs nx-text-subtle">Prateleira {d.shelf} · {timeAgo(d.receivedAt)}</span>
                  </span>
                  <Badge tone="warning" size="sm">Retirar</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Financeiro ---------- */}
        <Card padding="md" className="nx-home-finance">
          <CardHeader
            title="Meu financeiro"
            subtitle="Próximo vencimento"
            action={<Button variant="ghost" size="sm" to="/app/financeiro" iconRight={<ChevronRight size={15} />}>Detalhes</Button>}
          />
          {data.invoice ? (
            <div className="nx-stack nx-gap-4">
              <div>
                <p className="nx-finance-amount">{currency(data.invoice.amount)}</p>
                <p className="nx-text-sm nx-text-muted">
                  Referência {data.invoice.reference} · vence em {formatDate(data.invoice.dueDate)}
                  {dueIn !== null && dueIn >= 0 && ` (${dueIn === 0 ? 'hoje' : `em ${dueIn} dias`})`}
                </p>
              </div>
              <Button variant="brand" block to="/app/financeiro" icon={<Wallet size={17} />}>Pagar boleto</Button>
            </div>
          ) : (
            <EmptyState compact icon={<Wallet size={20} />} title="Nenhum boleto em aberto" description="Todos os pagamentos estão em dia." />
          )}
        </Card>

        {/* ---------- Reservas ---------- */}
        <Card padding="md">
          <CardHeader
            title="Minhas reservas"
            subtitle="Próximos compromissos"
            action={<Button variant="ghost" size="sm" to="/app/reservas" iconRight={<ChevronRight size={15} />}>Reservar</Button>}
          />
          {data.reservations.length === 0 ? (
            <EmptyState compact icon={<CalendarPlus size={20} />} title="Nenhuma reserva futura" description="São 10 áreas comuns disponíveis." action={<Button size="sm" variant="primary" to="/app/reservas">Ver áreas</Button>} />
          ) : (
            <ul className="nx-list">
              {data.reservations.map((r) => (
                <li key={r.id} className="nx-list__item">
                  <span className="nx-list__date">
                    <strong>{r.date.slice(8, 10)}</strong>
                    <span>{['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(r.date.slice(5, 7)) - 1]}</span>
                  </span>
                  <span className="nx-stack nx-grow">
                    <span className="nx-medium">{areaName(r.areaId)}</span>
                    <span className="nx-text-xs nx-text-subtle">{r.slot} · {r.guests} pessoas</span>
                  </span>
                  <Badge tone={r.status === 'confirmada' ? 'success' : 'warning'} size="sm">
                    {r.status === 'confirmada' ? 'Confirmada' : 'Pendente'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Últimos acessos ---------- */}
        <Card padding="md">
          <CardHeader
            title="Últimos acessos da unidade"
            action={<Button variant="ghost" size="sm" to="/app/acessos" iconRight={<ChevronRight size={15} />}>Histórico</Button>}
          />
          <ul className="nx-list">
            {data.accesses.map((a) => (
              <li key={a.id} className="nx-list__item">
                <span className={`nx-list__icon ${a.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}>
                  <DoorOpen size={16} />
                </span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium">{a.subjectName}</span>
                  <span className="nx-text-xs nx-text-subtle">{a.gateName} · {a.plate ?? a.subjectType}</span>
                </span>
                <span className="nx-stack" style={{ alignItems: 'flex-end' }}>
                  <span className="nx-text-xs nx-mono nx-text-muted">{a.at.slice(11, 16)}</span>
                  <span className="nx-text-2xs nx-text-subtle">{a.direction === 'entrada' ? 'Entrada' : 'Saída'}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---------- Comunicados ---------- */}
        <Card padding="md">
          <CardHeader
            title="Comunicados"
            action={<Button variant="ghost" size="sm" to="/app/comunicados" iconRight={<ChevronRight size={15} />}>Ver todos</Button>}
          />
          <ul className="nx-list">
            {data.news.map((n) => (
              <li key={n.id} className="nx-list__item">
                <span className={`nx-list__icon ${n.priority === 'urgente' ? 'nx-list__icon--danger' : n.priority === 'importante' ? 'nx-list__icon--warning' : ''}`}>
                  <Megaphone size={16} />
                </span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium nx-truncate">{n.title}</span>
                  <span className="nx-text-xs nx-text-subtle">{timeAgo(n.publishedAt)} · {n.author}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ---------- Concierge ---------- */}
      <Link to="/app/concierge" className="nx-concierge-cta">
        <span className="nx-concierge-cta__icon"><Sparkles size={22} /></span>
        <span className="nx-stack nx-grow">
          <strong>NEXOR AI · Concierge</strong>
          <span>Pergunte sobre boletos, encomendas, reservas e regras do condomínio.</span>
        </span>
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
