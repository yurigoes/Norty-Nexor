/* =========================================================
   Seletor com busca no servidor (veículo, cliente, motorista,
   fornecedor...). Combobox acessível: setas, Enter e Esc.
   ========================================================= */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useDebounced } from '../lib/hooks';
import { errorMessage } from '../lib/api';

export interface PickerOption {
  id: string;
  label: string;
  description?: string;
}

export function EntityPicker({ value, onChange, load, placeholder = 'Buscar…', disabled, initialLabel, ...aria }: {
  value: string | null | undefined;
  onChange: (id: string | null, option: PickerOption | null) => void;
  /** Busca no servidor. Recebe o termo digitado. */
  load: (q: string) => Promise<PickerOption[]>;
  placeholder?: string;
  disabled?: boolean;
  initialLabel?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState(initialLabel ?? '');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const term = useDebounced(q, 250);
  const box = useRef<HTMLDivElement>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { if (initialLabel) setLabel(initialLabel); }, [initialLabel]);
  useEffect(() => { if (!value) setLabel(''); }, [value]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    loadRef.current(term)
      .then((list) => { if (alive) { setOptions(list); setActive(0); } })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [term, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (o: PickerOption | null) => {
    onChange(o?.id ?? null, o);
    setLabel(o?.label ?? '');
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div className="nc-input-group">
        <input
          {...aria}
          className="nc-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? q : label}
          placeholder={label || placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, options.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); pick(options[active]!); }
            if (e.key === 'Escape') setOpen(false);
          }}
          style={{ paddingRight: 60 }}
        />
        <span style={{ position: 'absolute', right: 8, display: 'flex', gap: 2 }}>
          {value && !disabled && (
            <button type="button" className="nc-btn nc-btn--ghost nc-btn--sm nc-btn--icon" onClick={() => pick(null)} aria-label="Limpar seleção"><X /></button>
          )}
          <ChevronDown size={16} style={{ color: 'var(--text-subtle)', alignSelf: 'center' }} aria-hidden />
        </span>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="nc-menu" style={{ left: 0, right: 0, maxHeight: 280, overflowY: 'auto', listStyle: 'none', margin: 0 }}>
          {loading && <li className="nc-menu__label">Buscando…</li>}
          {error && <li className="nc-menu__label text-danger">{error}</li>}
          {!loading && !error && !options.length && <li className="nc-menu__label">Nenhum resultado</li>}
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} style={i === active ? { background: 'var(--surface-hover)' } : undefined}>
                <span className="stack-sm" style={{ gap: 0 }}>
                  <span>{o.label}</span>
                  {o.description && <span className="xsmall muted">{o.description}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
