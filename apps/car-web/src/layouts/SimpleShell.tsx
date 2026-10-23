/* =========================================================
   Casca do Master Norty e do portal do cliente: navegação
   própria, mais enxuta, e excelente no celular (barra de
   abas inferior em telas pequenas).
   ========================================================= */
import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { BrandMark, Wordmark } from '../brand/Logo';
import { NotificationBell } from '../components/notification-bell';
import { ProfileMenu } from './ProfileMenu';

export interface SimpleNavItem { path: string; label: string; icon: LucideIcon; end?: boolean }

export function SimpleShell({ items, subtitle, title, profilePath, notificationsPath }: {
  items: SimpleNavItem[]; subtitle: string; title?: string; profilePath: string; notificationsPath?: string;
}) {
  return (
    <div className="shell">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <aside className="sidebar desktop-only" aria-label="Menu principal">
        <div className="sidebar__brand"><BrandMark /><Wordmark subtitle={subtitle} /></div>
        <nav className="sidebar__nav">
          <div className="sidebar__group">
            {items.map((i) => (
              <NavLink key={i.path} to={i.path} end={i.end} className="sidebar__link"><i.icon aria-hidden /><span>{i.label}</span></NavLink>
            ))}
          </div>
        </nav>
      </aside>
      <div className="main">
        <header className="header">
          <span className="mobile-only"><BrandMark size={28} /></span>
          <div className="header__org"><strong className="ellipsis">{title ?? subtitle}</strong></div>
          <div className="header__actions">
            {notificationsPath && <NotificationBell to={notificationsPath} />}
            <ProfileMenu profilePath={profilePath} />
          </div>
        </header>
        <main id="conteudo" className="content" tabIndex={-1} style={{ paddingBottom: 96 }}>
          <Outlet />
        </main>
        <nav className="tabbar mobile-only" aria-label="Navegação">
          {items.slice(0, 5).map((i) => (
            <NavLink key={i.path} to={i.path} end={i.end}><i.icon aria-hidden /><span>{i.label}</span></NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
