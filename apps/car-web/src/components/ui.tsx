/* =========================================================
   Primitivos do design system Norty Car.
   ========================================================= */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Inbox, Info, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, block, children, className, disabled, type = 'button', ...rest }, ref,
) {
  const cls = ['nc-btn', `nc-btn--${variant}`, size !== 'md' && `nc-btn--${size}`, block && 'nc-btn--block', !children && 'nc-btn--icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="nc-spinner" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, ...rest }: Omit<ButtonProps, 'children'> & { icon: LucideIcon; label: string }) {
  return <Button variant="ghost" aria-label={label} title={label} icon={Icon} {...rest} />;
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`nc-badge${tone !== 'neutral' ? ` nc-badge--${tone}` : ''}`}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  );
}

export function Card({ title, subtitle, actions, children, footer, flush, className }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; footer?: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`nc-card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="nc-card__header">
          <div className="grow">
            {title && <h2 className="nc-card__title">{title}</h2>}
            {subtitle && <p className="nc-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={`nc-card__body${flush ? ' nc-card__body--flush' : ''}`}>{children}</div>
      {footer && <footer className="nc-card__footer">{footer}</footer>}
    </section>
  );
}

export function StatCard({ label, value, icon: Icon, tone, foot, onClick, size }: {
  label: string; value: ReactNode; icon?: LucideIcon; tone?: 'success' | 'warning' | 'danger'; foot?: ReactNode; onClick?: () => void; size?: 'md';
}) {
  const content = (
    <>
      <div className="row-between">
        <span className="nc-stat__label">{label}</span>
        {Icon && <span className={`nc-stat__icon${tone ? ` nc-stat__icon--${tone}` : ''}`} aria-hidden><Icon size={17} /></span>}
      </div>
      <div className={`nc-stat__value${size ? ` nc-stat__value--${size}` : ''}`}>{value}</div>
      {foot && <div className="nc-stat__foot">{foot}</div>}
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className="nc-card nc-stat nc-stat--link" style={{ textAlign: 'left', font: 'inherit' }}>{content}</button>;
  }
  return <div className="nc-card nc-stat">{content}</div>;
}

export function PageHeader({ title, description, eyebrow, actions, breadcrumb }: {
  title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode;
}) {
  return (
    <header className="nc-page-header">
      <div className="nc-page-header__title">
        {breadcrumb && <nav className="nc-breadcrumb" aria-label="Caminho">{breadcrumb}</nav>}
        {eyebrow && <span className="nc-page-header__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="nc-page-header__desc">{description}</p>}
      </div>
      {actions && <div className="nc-page-header__actions">{actions}</div>}
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="nc-page">{children}</div>;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="nc-empty">
      <div className="nc-empty__icon" aria-hidden><Icon /></div>
      <div className="nc-empty__title">{title}</div>
      {description && <div className="nc-empty__desc">{description}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="nc-empty nc-empty--error" role="alert">
      <div className="nc-empty__icon" aria-hidden><AlertTriangle /></div>
      <div className="nc-empty__title">Não foi possível carregar</div>
      <div className="nc-empty__desc">{message}</div>
      {onRetry && <Button icon={RefreshCw} onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return <span className="nc-spinner" role="status" aria-label={label} />;
}

export function LoadingBlock() {
  return <div className="nc-loading-block"><Spinner /></div>;
}

export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return <span className="nc-skeleton" style={{ display: 'block', width, height, ...style }} aria-hidden />;
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="stack-sm" style={{ padding: 'var(--space-4)' }} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--space-4)' }}>
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} height={16} />)}
        </div>
      ))}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`nc-alert nc-alert--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div className="grow">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode; hidden?: boolean }[] }) {
  return (
    <dl className="nc-kv">
      {items.filter((i) => !i.hidden).map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label = 'Seções' }: {
  tabs: { value: T; label: string; count?: number; hidden?: boolean }[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="nc-tabs" role="tablist" aria-label={label}>
      {tabs.filter((t) => !t.hidden).map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="nc-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'success' | 'warning' | 'danger' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`nc-progress${tone ? ` nc-progress--${tone}` : ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Plate({ value }: { value: string }) {
  const p = value.toUpperCase();
  return <span className="nc-plate">{/^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p}</span>;
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="nc-steps" aria-label="Etapas">
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span className="n">{i < current ? '✓' : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function Timeline({ items }: { items: { id: string; title: ReactNode; meta?: ReactNode; description?: ReactNode; icon?: LucideIcon }[] }) {
  if (!items.length) return <EmptyState title="Sem eventos registrados" />;
  return (
    <ol className="nc-timeline">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <li key={i.id}>
            <span className="nc-timeline__dot" aria-hidden>{Icon ? <Icon /> : null}</span>
            <div className="nc-timeline__title">{i.title}</div>
            {i.meta && <div className="nc-timeline__meta">{i.meta}</div>}
            {i.description && <div className="small muted" style={{ marginTop: 4 }}>{i.description}</div>}
          </li>
        );
      })}
    </ol>
  );
}
