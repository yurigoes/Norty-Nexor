import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Id do controle — mantém o rótulo associado ao campo para leitores de tela. */
  htmlFor?: string;
}) {
  return (
    <div className={`nx-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="nx-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="nx-field__required">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="nx-field__error">{error}</span> : hint ? <span className="nx-field__hint">{hint}</span> : null}
    </div>
  );
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
  suffix?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

export function Input({ label, hint, error, icon, suffix, inputSize = 'md', className = '', required, id: idProp, ...rest }: InputProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <div className={`nx-input nx-input--${inputSize} ${icon ? 'has-icon' : ''} ${className}`}>
        {icon && <span className="nx-input__icon">{icon}</span>}
        <input id={id} required={required} {...rest} />
        {suffix && <span className="nx-input__suffix">{suffix}</span>}
      </div>
    </Field>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
  selectSize?: 'sm' | 'md' | 'lg';
}

export function Select({ label, hint, error, options, placeholder, selectSize = 'md', className = '', required, id: idProp, ...rest }: SelectProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <div className={`nx-select nx-select--${selectSize} ${className}`}>
        <select id={id} required={required} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Field>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export function Textarea({ label, hint, error, className = '', required, rows = 4, id: idProp, ...rest }: TextareaProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <textarea id={id} className={`nx-textarea ${className}`} rows={rows} required={required} {...rest} />
    </Field>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`nx-switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="nx-switch__track"><span className="nx-switch__thumb" /></span>
      {(label || description) && (
        <span className="nx-switch__text">
          {label && <span className="nx-switch__label">{label}</span>}
          {description && <span className="nx-switch__description">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`nx-checkbox ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="nx-checkbox__box">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
          <path d="m4 12 5.5 5.5L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="nx-checkbox__label">{label}</span>}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  size = 'md',
  autoFocus,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`nx-input nx-input--${size} has-icon nx-search ${className}`}>
      <span className="nx-input__icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="nx-input__clear" onClick={() => onChange('')} aria-label="Limpar busca">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}
