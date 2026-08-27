import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  tabs,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  tabs?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="nx-page-header">
      {breadcrumb && <div className="nx-page-header__breadcrumb">{breadcrumb}</div>}
      <div className="nx-page-header__main">
        {icon && <span className="nx-page-header__icon">{icon}</span>}
        <div className="nx-grow">
          <h1 className="nx-page-header__title">{title}</h1>
          {subtitle && <p className="nx-page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="nx-page-header__actions">{actions}</div>}
      </div>
      {tabs && <div className="nx-page-header__tabs">{tabs}</div>}
    </header>
  );
}
