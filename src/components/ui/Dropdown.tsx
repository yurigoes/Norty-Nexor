import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface DropdownItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  onSelect: () => void;
  disabled?: boolean;
}

export function Dropdown({
  trigger,
  items,
  align = 'right',
  header,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="nx-dropdown" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className={`nx-dropdown__menu nx-dropdown__menu--${align}`}>
          {header && <div className="nx-dropdown__header">{header}</div>}
          {items.map((item) => (
            <button
              key={item.id}
              className={`nx-dropdown__item ${item.tone === 'danger' ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { item.onSelect(); setOpen(false); }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
