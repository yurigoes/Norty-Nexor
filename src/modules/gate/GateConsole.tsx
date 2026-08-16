import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Car, CheckCircle2, DoorOpen, KeyRound, Package, ScanLine, Search,
  ShieldCheck, UserCheck, Users, Video, XCircle, Clock,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { checkIn, denyVisitor, expectedToday, onSite } from '../../services/visitors';
import { accessesToday, gates, recentAccesses } from '../../services/access';
import { pendingDeliveries } from '../../services/deliveries';
import { searchDirectory, unitLabel } from '../../services/directory';
import { cameras } from '../../services/security';
import type { Visitor } from '../../data/types';
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, SearchInput, StatCard, StatusDot,
  useToast,
} from '../../components/ui';
import { GateScene } from '../../brand/scenes/GateScene';
import { formatTime, isoDate } from '../../lib/date';
import { number } from '../../lib/format';
import './gate.css';
import '../../brand/scenes/scenes.css';

const QUICK_ACTIONS = [
  { to: '/portaria/visitantes', label: 'Visitante', icon: UserCheck },
  { to: '/portaria/placas', label: 'Veículo', icon: Car },
  { to: '/portaria/encomendas', label: 'Encomenda', icon: Package },
  { to: '/portaria/moradores', label: 'Morador', icon: Users },
  { to: '/portaria/ocorrencias', label: 'Ocorrência', icon: AlertTriangle },
  { to: '/portaria/cameras', label: 'Câmeras', icon: Video },
  { to: '/portaria/portoes', label: 'Portões', icon: KeyRound },
  { to: '/portaria/acessos', label: 'Acessos', icon: DoorOpen },
];

export function GateConsole() {
  const { user, condominium, dataVersion } = useAuthenticated();
  const toast = useToast();
  const navigate = useNavigate();
  const today = isoDate(new Date());
  const [term, setTerm] = useState('');

  const data = useMemo(() => ({
    expected: expectedToday(condominium.id, today),
    inside: onSite(condominium.id),
    accesses: accessesToday(condominium.id, today),
    recent: recentAccesses(condominium.id, 8),
    deliveries: pendingDeliveries(condominium.id),
    gateList: gates(condominium.id),
    cams: cameras(condominium.id),
  }), [condominium.id, today, dataVersion]);

  const results = useMemo(() => searchDirectory(condominium.id, term), [condominium.id, term, dataVersion]);

  /** O posto já é o título da faixa: o crachá mostra quem está e em qual turno. */
  const shift = (user.jobTitle ?? '')
    .split(' · ')
    .filter((part) => part !== 'Portaria Principal')
    .join(' · ');
  const hasQuery = term.trim().length >= 2;

  const release = (visitor: Visitor) => {
    checkIn(visitor.id, 'gate-principal', user.name, 'manual');
    toast.success('Entrada registrada', `${visitor.name} liberado para ${unitLabel(visitor.unitId)}.`);
  };

  const deny = (visitor: Visitor) => {
    denyVisitor(visitor.id, user.name);
    toast.warning('Entrada recusada', `${visitor.name} não foi liberado.`);
  };

  const nextArrivals = data.expected
    .filter((v) => v.status === 'aguardando' || v.status === 'liberado')
    .slice(0, 8);

  return (
    <div className="nx-stack nx-gap-5">
      <header className="nx-gate-hero">
        <GateScene />
        <div className="nx-gate-hero__content">
          <div>
            <span className="nx-gate-hero__eyebrow">
              <ShieldCheck size={13} /> Posto em operação
            </span>
            <h1 className="nx-gate-hero__title">Portaria Principal</h1>
            <p className="nx-gate-hero__meta">{condominium.name} · {condominium.city}/{condominium.state}</p>
            <span className="nx-gate-hero__shift">
              <StatusDot tone="success" pulse />
              {user.name} · {shift}
            </span>
          </div>
          <div className="nx-gate-hero__clock">
            <strong>{formatTime(new Date().toISOString())}</strong>
            <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
          </div>
        </div>
      </header>

      {/* ---------- Busca central ---------- */}
      <Card padding="md" className="nx-gate-search">
        <div className="nx-row nx-gap-3">
          <span className="nx-gate-search__icon"><Search size={22} /></span>
          <SearchInput
            value={term}
            onChange={setTerm}
            size="lg"
            autoFocus
            placeholder="Buscar visitante, morador, unidade ou placa..."
            className="nx-grow"
          />
        </div>

        {hasQuery && (
          <div className="nx-gate-results">
            {results.visitors.length === 0 && results.residents.length === 0
              && results.units.length === 0 && results.vehicles.length === 0 && results.staff.length === 0 ? (
              <EmptyState compact title="Nenhum resultado" description={`Nada encontrado para “${term}”.`} />
            ) : (
              <>
                {results.visitors.map((v) => (
                  <div key={v.id} className="nx-gate-result">
                    <Avatar name={v.name} size="md" />
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium">{v.name}</span>
                      <span className="nx-text-xs nx-text-subtle">Visitante · {unitLabel(v.unitId)} · código {v.code}</span>
                    </div>
                    {v.status === 'aguardando' ? (
                      <div className="nx-row nx-gap-2">
                        <Button variant="danger" size="sm" icon={<XCircle size={15} />} onClick={() => deny(v)}>Recusar</Button>
                        <Button variant="success" size="sm" icon={<CheckCircle2 size={15} />} onClick={() => release(v)}>Liberar</Button>
                      </div>
                    ) : (
                      <Badge tone={v.status === 'no_local' ? 'success' : 'neutral'} size="sm">{v.status === 'no_local' ? 'No local' : v.status}</Badge>
                    )}
                  </div>
                ))}
                {results.vehicles.map((v) => (
                  <div key={v.id} className="nx-gate-result">
                    <span className="nx-list__icon"><Car size={17} /></span>
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium nx-mono">{v.plate}</span>
                      <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model} · {v.ownerName} · {unitLabel(v.unitId)}</span>
                    </div>
                    <Badge tone={v.authorized ? 'success' : 'danger'} size="sm">{v.authorized ? 'Autorizado' : 'Suspenso'}</Badge>
                  </div>
                ))}
                {results.residents.map((r) => (
                  <div key={r.id} className="nx-gate-result">
                    <Avatar name={r.name} size="md" />
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium">{r.name}</span>
                      <span className="nx-text-xs nx-text-subtle">Morador · {unitLabel(r.unitId)} · {r.phone}</span>
                    </div>
                    <Badge tone={r.active ? 'success' : 'neutral'} size="sm">{r.active ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                ))}
                {results.units.map((u) => (
                  <div key={u.id} className="nx-gate-result">
                    <span className="nx-list__icon"><Users size={17} /></span>
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium">Torre {u.block} · Apto {u.label}</span>
                      <span className="nx-text-xs nx-text-subtle">{u.ownerName} · vagas {u.parkingSpots.join(', ')}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/portaria/moradores')}>Ver unidade</Button>
                  </div>
                ))}
                {results.staff.map((s) => (
                  <div key={s.id} className="nx-gate-result">
                    <Avatar name={s.name} size="md" />
                    <div className="nx-stack nx-grow">
                      <span className="nx-medium">{s.name}</span>
                      <span className="nx-text-xs nx-text-subtle">{s.role}{s.company ? ` · ${s.company}` : ''}{s.unitId ? ` · ${unitLabel(s.unitId)}` : ''}</span>
                    </div>
                    <Badge tone={s.active ? 'success' : 'neutral'} size="sm">{s.active ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>

      {/* ---------- Ações rápidas ---------- */}
      <div className="nx-gate-actions">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.to} className="nx-gate-action" onClick={() => navigate(a.to)}>
            <a.icon size={24} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      {/* ---------- Indicadores ---------- */}
      <div className="nx-grid-auto">
        <StatCard label="Acessos hoje" value={number(data.accesses.length)} icon={<DoorOpen size={17} />} tone="brand" hint="Entradas e saídas" />
        <StatCard label="Visitantes esperados" value={data.expected.length} icon={<UserCheck size={17} />} tone="cyan" onClick={() => navigate('/portaria/visitantes')} />
        <StatCard label="Visitantes no local" value={data.inside.length} icon={<Users size={17} />} tone="success" />
        <StatCard label="Encomendas na portaria" value={data.deliveries.length} icon={<Package size={17} />} tone="warning" onClick={() => navigate('/portaria/encomendas')} />
      </div>

      <div className="nx-gate-grid">
        {/* ---------- Próximas chegadas ---------- */}
        <Card padding="md">
          <CardHeader
            title="Visitantes esperados"
            subtitle={`${nextArrivals.length} aguardando chegada`}
            action={<Button variant="ghost" size="sm" to="/portaria/visitantes">Ver todos</Button>}
          />
          {nextArrivals.length === 0 ? (
            <EmptyState compact icon={<UserCheck size={20} />} title="Nenhum visitante aguardando" description="As autorizações criadas pelos moradores aparecem aqui." />
          ) : (
            <ul className="nx-list">
              {nextArrivals.map((v) => (
                <li key={v.id} className="nx-gate-arrival">
                  <Avatar name={v.name} size="md" />
                  <div className="nx-stack nx-grow">
                    <span className="nx-medium">{v.name}</span>
                    <span className="nx-text-xs nx-text-subtle">
                      {unitLabel(v.unitId)} · {v.category === 'prestador' ? v.companyName ?? 'Prestador' : 'Visita'}
                    </span>
                  </div>
                  <span className="nx-gate-arrival__time"><Clock size={13} /> {v.expectedTime}</span>
                  <div className="nx-row nx-gap-2 nx-shrink-0">
                    <Button variant="ghost" size="sm" icon={<XCircle size={16} />} onClick={() => deny(v)} aria-label="Recusar" />
                    <Button variant="success" size="sm" icon={<CheckCircle2 size={16} />} onClick={() => release(v)}>
                      {v.status === 'liberado' ? 'Registrar entrada' : 'Liberar'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------- Acessos recentes ---------- */}
        <Card padding="md">
          <CardHeader
            title="Acessos recentes"
            action={<Button variant="ghost" size="sm" to="/portaria/acessos">Histórico</Button>}
          />
          <ul className="nx-list">
            {data.recent.map((a) => (
              <li key={a.id} className="nx-list__item">
                <span className={`nx-list__icon ${a.direction === 'entrada' ? 'nx-list__icon--success' : ''}`}>
                  {a.plate ? <Car size={16} /> : <DoorOpen size={16} />}
                </span>
                <span className="nx-stack nx-grow">
                  <span className="nx-medium nx-truncate">{a.plate ?? a.subjectName}</span>
                  <span className="nx-text-xs nx-text-subtle">{a.unitId ? unitLabel(a.unitId) : a.gateName}</span>
                </span>
                <span className="nx-stack" style={{ alignItems: 'flex-end' }}>
                  <span className="nx-mono nx-text-sm">{formatTime(a.at)}</span>
                  <span className="nx-text-2xs nx-text-subtle">{a.direction === 'entrada' ? 'Entrada' : 'Saída'}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---------- Perímetro ---------- */}
        <Card padding="md">
          <CardHeader title="Perímetro" subtitle="Portões e câmeras" action={<Button variant="ghost" size="sm" to="/portaria/portoes">Operar</Button>} />
          <div className="nx-stack nx-gap-3">
            {data.gateList.map((g) => (
              <div key={g.id} className="nx-gate-status">
                <StatusDot tone={g.status === 'online' ? 'success' : g.status === 'manutencao' ? 'warning' : 'danger'} pulse={g.status === 'online'} />
                <span className="nx-grow nx-medium">{g.name}</span>
                <Badge tone={g.status === 'online' ? 'success' : g.status === 'manutencao' ? 'warning' : 'danger'} size="sm">
                  {g.status === 'online' ? 'Online' : g.status === 'manutencao' ? 'Manutenção' : 'Offline'}
                </Badge>
              </div>
            ))}
            <hr className="nx-divider" />
            <div className="nx-row nx-between">
              <span className="nx-text-sm nx-text-muted">Câmeras online</span>
              <strong>{data.cams.filter((c) => c.status === 'online').length}/{data.cams.length}</strong>
            </div>
            <Button variant="secondary" block icon={<ScanLine size={16} />} to="/portaria/placas">Leitura de placa</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
