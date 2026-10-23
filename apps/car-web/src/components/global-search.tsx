/* Busca global por placa, cliente, contrato e OS. Só volta o que o usuário pode ver. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, FileText, Search, User, Wrench, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/hooks';

interface Hit { type: 'vehicle' | 'customer' | 'contract' | 'work_order' | 'reservation'; id: string; title: string; subtitle?: string; link: string }
const ICON = { vehicle: Car, customer: User, contract: FileText, work_order: Wrench, reservation: CalendarClock };

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const term = useDebounced(q.trim(), 250);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); }
    };
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc); };
  }, []);

  useEffect(() => {
    if (term.length < 2) { setHits([]); return; }
    let alive = true;
    setLoading(true);
    api.get<Hit[]>('/search', { q: term })
      .then((r) => { if (alive) { setHits(r); setActive(0); setUnavailable(false); } })
      .catch(() => alive && setUnavailable(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [term]);

  const go = (h: Hit) => { setOpen(false); setQ(''); navigate(h.link); };

  return (
    <div className="header__search" ref={box}>
      <div className="nc-input-group">
        <Search aria-hidden />
        <input
          ref={input}
          className="nc-input"
          type="search"
          placeholder="Buscar placa, cliente, contrato ou OS (Ctrl+K)"
          aria-label="Busca global"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && hits[active]) go(hits[active]!);
            if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          }}
        />
      </div>
      {open && term.length >= 2 && (
        <div className="search-results" role="listbox" aria-label="Resultados da busca">
          {loading && <div className="nc-menu__label">Buscando…</div>}
          {!loading && unavailable && <div className="nc-menu__label">Busca indisponível no momento.</div>}
          {!loading && !unavailable && !hits.length && <div className="nc-menu__label">Nada encontrado para “{term}”.</div>}
          {hits.map((h, i) => {
            const Icon = ICON[h.type];
            return (
              <a key={`${h.type}-${h.id}`} href={h.link} data-active={i === active} role="option" aria-selected={i === active}
                onClick={(e) => { e.preventDefault(); go(h); }}>
                <Icon aria-hidden />
                <span className="grow">
                  <span className="strong">{h.title}</span>
                  {h.subtitle && <span className="xsmall muted" style={{ display: 'block' }}>{h.subtitle}</span>}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
