import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, CornerDownLeft, Home, Search, UserCheck, Users, HardHat } from 'lucide-react';
import { useAuthenticated } from '../app/SessionContext';
import { searchDirectory, unitLabel } from '../services/directory';
import { Modal } from './ui';
import './global-search.css';

/**
 * Busca global (⌘K). Um único campo resolve morador, unidade,
 * placa, visitante e funcionário — o mesmo motor usado pela portaria.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { condominium, dataVersion } = useAuthenticated();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  useEffect(() => { if (open) setTerm(''); }, [open]);

  const results = useMemo(
    () => searchDirectory(condominium.id, term),
    [condominium.id, term, dataVersion],
  );

  const total = results.residents.length + results.units.length + results.vehicles.length
    + results.visitors.length + results.staff.length;

  const go = (to: string) => { onClose(); navigate(to); };

  return (
    <Modal open={open} onClose={onClose} size="lg" hideClose className="nx-gsearch-modal">
      <div className="nx-gsearch">
        <div className="nx-gsearch__field">
          <Search size={18} />
          <input
            autoFocus
            value={term}
            placeholder="Buscar morador, unidade, placa, visitante ou funcionário..."
            onChange={(e) => setTerm(e.target.value)}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="nx-gsearch__body">
          {term.trim().length < 2 ? (
            <div className="nx-gsearch__hint">
              <p className="nx-uppercase nx-text-subtle">Sugestões de busca</p>
              <ul>
                <li><Users size={15} /> Nome do morador ou CPF</li>
                <li><Home size={15} /> Unidade: <strong>1204</strong> ou <strong>A-1204</strong></li>
                <li><Car size={15} /> Placa do veículo: <strong>ABC1D23</strong></li>
                <li><UserCheck size={15} /> Visitante ou código de autorização</li>
              </ul>
            </div>
          ) : total === 0 ? (
            <div className="nx-gsearch__hint">
              <p className="nx-text-muted">Nenhum resultado para “{term}”.</p>
            </div>
          ) : (
            <>
              {results.units.length > 0 && (
                <section className="nx-gsearch__group">
                  <p className="nx-gsearch__group-label">Unidades</p>
                  {results.units.map((u) => (
                    <button key={u.id} className="nx-gsearch__item" onClick={() => go(`/gestao/unidades?u=${u.id}`)}>
                      <span className="nx-gsearch__icon"><Home size={16} /></span>
                      <span className="nx-stack nx-grow">
                        <span className="nx-medium">Torre {u.block} · Apto {u.label}</span>
                        <span className="nx-text-xs nx-text-subtle">{u.ownerName} · {u.bedrooms} dorm · {u.area} m²</span>
                      </span>
                      <CornerDownLeft size={14} className="nx-text-subtle" />
                    </button>
                  ))}
                </section>
              )}

              {results.residents.length > 0 && (
                <section className="nx-gsearch__group">
                  <p className="nx-gsearch__group-label">Moradores</p>
                  {results.residents.map((r) => (
                    <button key={r.id} className="nx-gsearch__item" onClick={() => go(`/gestao/moradores?r=${r.id}`)}>
                      <span className="nx-gsearch__icon"><Users size={16} /></span>
                      <span className="nx-stack nx-grow">
                        <span className="nx-medium">{r.name}</span>
                        <span className="nx-text-xs nx-text-subtle">{unitLabel(r.unitId)} · {r.phone}</span>
                      </span>
                      <CornerDownLeft size={14} className="nx-text-subtle" />
                    </button>
                  ))}
                </section>
              )}

              {results.vehicles.length > 0 && (
                <section className="nx-gsearch__group">
                  <p className="nx-gsearch__group-label">Veículos</p>
                  {results.vehicles.map((v) => (
                    <button key={v.id} className="nx-gsearch__item" onClick={() => go(`/gestao/veiculos?p=${v.plate}`)}>
                      <span className="nx-gsearch__icon"><Car size={16} /></span>
                      <span className="nx-stack nx-grow">
                        <span className="nx-medium nx-mono">{v.plate}</span>
                        <span className="nx-text-xs nx-text-subtle">{v.brand} {v.model} · {v.ownerName}</span>
                      </span>
                      <CornerDownLeft size={14} className="nx-text-subtle" />
                    </button>
                  ))}
                </section>
              )}

              {results.visitors.length > 0 && (
                <section className="nx-gsearch__group">
                  <p className="nx-gsearch__group-label">Visitantes</p>
                  {results.visitors.map((v) => (
                    <button key={v.id} className="nx-gsearch__item" onClick={() => go(`/gestao/visitantes?v=${v.id}`)}>
                      <span className="nx-gsearch__icon"><UserCheck size={16} /></span>
                      <span className="nx-stack nx-grow">
                        <span className="nx-medium">{v.name}</span>
                        <span className="nx-text-xs nx-text-subtle">{unitLabel(v.unitId)} · código {v.code}</span>
                      </span>
                      <CornerDownLeft size={14} className="nx-text-subtle" />
                    </button>
                  ))}
                </section>
              )}

              {results.staff.length > 0 && (
                <section className="nx-gsearch__group">
                  <p className="nx-gsearch__group-label">Funcionários e prestadores</p>
                  {results.staff.map((s) => (
                    <button key={s.id} className="nx-gsearch__item" onClick={() => go(`/gestao/funcionarios?s=${s.id}`)}>
                      <span className="nx-gsearch__icon"><HardHat size={16} /></span>
                      <span className="nx-stack nx-grow">
                        <span className="nx-medium">{s.name}</span>
                        <span className="nx-text-xs nx-text-subtle">{s.role}{s.company ? ` · ${s.company}` : ''}</span>
                      </span>
                      <CornerDownLeft size={14} className="nx-text-subtle" />
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
