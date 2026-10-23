/* Campos de formulário acessíveis: rótulo ligado ao input, erro anunciado. */
import { cloneElement, isValidElement, useEffect, useId, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export function Field({ label, hint, error, required, children, className }: {
  label: string; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactElement; className?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        required: (children.props as { required?: boolean }).required ?? required,
      })
    : children;
  return (
    <div className={`nc-field${className ? ` ${className}` : ''}`}>
      <label className="nc-label" htmlFor={id}>{label}{required && <span className="req" aria-hidden>*</span>}</label>
      {control}
      {hint && !error && <span className="nc-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="nc-error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="nc-input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="nc-textarea" {...props} />;
}

export function Select({ options, placeholder, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string;
}) {
  return (
    <select className="nc-select" {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="nc-check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className="nc-switch">
      <input type="checkbox" role="switch" {...props} />
      <span className="track" aria-hidden />
      <span className="stack-sm" style={{ gap: 0 }}>
        <span>{label}</span>
        {description && <span className="xsmall muted">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Valor monetário em reais. O texto digitado fica em estado local (para
 * aceitar "10," no meio da digitação); o número só sobe quando é válido.
 */
export function MoneyInput({ value, onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '' | null | undefined; onChange: (v: number | '') => void;
}) {
  const external = value === '' || value === null || value === undefined ? '' : String(value).replace('.', ',');
  const [text, setText] = useState(external);
  useEffect(() => {
    const parsed = parseMoney(text);
    if (parsed !== value && !(parsed === '' && (value === null || value === undefined))) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);
  return (
    <div className="nc-input-group">
      <span style={{ position: 'absolute', left: 11, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }} aria-hidden>R$</span>
      <input
        className="nc-input tnum"
        style={{ paddingLeft: 36 }}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d,]/g, '');
          if (!/^\d*(,\d{0,2})?$/.test(next)) return;
          setText(next);
          onChange(parseMoney(next));
        }}
        {...props}
      />
    </div>
  );
}

function parseMoney(text: string): number | '' {
  if (!text) return '';
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : '';
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="nc-form-grid">{children}</div>;
}

/** Converte o objeto de erros por campo da API no erro de cada Field. */
export function fieldError(fields: Record<string, string> | undefined, name: string): string | undefined {
  return fields?.[name];
}
