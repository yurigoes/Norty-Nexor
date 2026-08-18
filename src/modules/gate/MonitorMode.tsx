import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, DoorOpen, LogOut, Package, UserCheck, Users } from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { HomeLogo } from '../../brand/HomeLogo';
import { expectedToday, onSite } from '../../services/visitors';
import { accessesToday, gates, recentAccesses } from '../../services/access';
import { pendingDeliveries } from '../../services/deliveries';
import { cameras } from '../../services/security';
import { searchDirectory, unitLabel } from '../../services/directory';
import { CameraFeed } from '../../components/CameraFeed';
import { Button, SearchInput, StatusDot } from '../../components/ui';
import { formatTime, isoDate } from '../../lib/date';
import { number } from '../../lib/format';
import './monitor.css';

/**
 * Modo monitor: layout de tela cheia para o painel da guarita.
 * Tipografia ampliada, alto contraste e informação essencial sempre visível.
 */
export function MonitorMode() {
  const { condominium, dataVersion } = useAuthenticated();
  const navigate = useNavigate();
  const today = isoDate(new Date());
  const [term, setTerm] = useState('');
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const data = useMemo(() => ({
    expected: expectedToday(condominium.id, today).filter((v) => v.status === 'aguardando').slice(0, 7),
    inside: onSite(condominium.id).length,
    accesses: accessesToday(condominium.id, today).length,
    recent: recentAccesses(condominium.id, 9),
    deliveries: pendingDeliveries(condominium.id).length,
    gateList: gates(condominium.id),
    cams: cameras(condominium.id).filter((c) => c.status === 'online').slice(0, 4),
  }), [condominium.id, today, dataVersion]);

  const results = useMemo(() => searchDirectory(condominium.id, term), [condominium.id, term, dataVersion]);
  const hasQuery = term.trim().length >= 2;

  return (
    <div className="nx-monitor theme-dark">
      <header className="nx-monitor__top">
        <HomeLogo size="md" tone="light" />
        <div className="nx-monitor__title">
          <span>PORTARIA PRINCIPAL</span>
          <strong>{condominium.name}</strong>
        </div>
        <div className="nx-monitor__clock">
          <strong>{formatTime(clock.toISOString())}</strong>
          <span>{clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => navigate('/portaria')}>Sair do modo monitor</Button>
      </header>

      <div className="nx-monitor__search">
        <SearchInput value={term} onChange={setTerm} size="lg" placeholder="BUSCAR VISITANTE / PLACA / UNIDADE" autoFocus />
      </div>

      {hasQuery && (
        <div className="nx-monitor__results">
          {[...results.visitors, ...results.residents].slice(0, 3).map((item) => (
            <div key={item.id} className="nx-monitor__result">
              <strong>{item.name}</strong>
              <span>{unitLabel(item.unitId)}</span>
            </div>
          ))}
          {results.vehicles.slice(0, 3).map((v) => (
            <div key={v.id} className="nx-monitor__result">
              <strong className="nx-mono">{v.plate}</strong>
              <span>{v.brand} {v.model} · {unitLabel(v.unitId)}</span>
            </div>
          ))}
          {results.units.slice(0, 3).map((u) => (
            <div key={u.id} className="nx-monitor__result">
              <strong>Torre {u.block} · Apto {u.label}</strong>
              <span>{u.ownerName}</span>
            </div>
          ))}
        </div>
      )}

      <div className="nx-monitor__stats">
        <div className="nx-monitor__stat"><DoorOpen size={20} /><strong>{number(data.accesses)}</strong><span>Acessos hoje</span></div>
        <div className="nx-monitor__stat"><UserCheck size={20} /><strong>{data.expected.length}</strong><span>Aguardando</span></div>
        <div className="nx-monitor__stat"><Users size={20} /><strong>{data.inside}</strong><span>No condomínio</span></div>
        <div className="nx-monitor__stat"><Package size={20} /><strong>{data.deliveries}</strong><span>Encomendas</span></div>
      </div>

      <div className="nx-monitor__panels">
        <section className="nx-monitor__panel">
          <h2>Visitantes esperados</h2>
          <ul>
            {data.expected.length === 0 && <li className="is-empty">Nenhum visitante aguardando</li>}
            {data.expected.map((v) => (
              <li key={v.id}>
                <strong>{v.name}</strong>
                <span>{unitLabel(v.unitId)}</span>
                <em>{v.expectedTime}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="nx-monitor__panel">
          <h2>Acessos recentes</h2>
          <ul>
            {data.recent.map((a) => (
              <li key={a.id}>
                <em className="nx-mono">{formatTime(a.at)}</em>
                <strong>{a.plate ?? a.subjectName}</strong>
                <span>{a.direction === 'entrada' ? 'Entrada' : 'Saída'} · {a.gateName}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="nx-monitor__panel">
          <h2>Perímetro</h2>
          <ul>
            {data.gateList.map((g) => (
              <li key={g.id}>
                <StatusDot tone={g.status === 'online' ? 'success' : g.status === 'manutencao' ? 'warning' : 'danger'} pulse={g.status === 'online'} />
                <strong>{g.name}</strong>
                <span>{g.status === 'online' ? 'Online' : g.status === 'manutencao' ? 'Manutenção' : 'Offline'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="nx-monitor__cams">
        {data.cams.map((camera) => (
          <div key={camera.id} className="nx-cam" style={{ cursor: 'default' }}>
            <CameraFeed camera={camera} />
            <span className="nx-cam__tag">{camera.name}</span>
            <span className="nx-cam__live">● AO VIVO</span>
            <div className="nx-cam__meta">
              <span className="nx-cam__name">{camera.location}</span>
              {camera.hasMotion && <Car size={14} color="#C9A227" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
