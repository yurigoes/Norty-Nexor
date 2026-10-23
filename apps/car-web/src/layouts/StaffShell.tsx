/* =========================================================
   Casca da equipe da locadora: menu lateral recolhível,
   cabeçalho com filial, busca global, notificações e perfil.
   ========================================================= */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LifeBuoy, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { STAFF_NAV } from '../app/navigation';
import { useSession } from '../lib/session';
import { usePreference } from '../lib/theme';
import { BranchFilterProvider, useBranchFilter } from '../app/branch-filter';
import { BrandMark, Wordmark } from '../brand/Logo';
import { GlobalSearch } from '../components/global-search';
import { NotificationBell } from '../components/notification-bell';
import { ProfileMenu } from './ProfileMenu';
import { dateTime } from '../lib/format';

export function StaffShell({ registered }: { registered: Set<string> }) {
  return (
    <BranchFilterProvider>
      <ShellInner registered={registered} />
    </BranchFilterProvider>
  );
}

function ShellInner({ registered }: { registered: Set<string> }) {
  const { session, can, hasModule } = useSession();
  const [collapsed, setCollapsed] = usePreference('sidebar-collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const groups = useMemo(() => STAFF_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => registered.has(i.path) && i.permissions.some((p) => can(p)) && (!i.module || hasModule(i.module))),
  })).filter((g) => g.items.length), [registered, can, hasModule]);

  if (!session) return null;
  const isSupport = session.context.kind === 'SUPPORT';

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
      <aside className="sidebar" aria-label="Menu principal">
        <div className="sidebar__brand">
          <BrandMark />
          <Wordmark />
        </div>
        <nav className="sidebar__nav">
          {groups.map((g) => (
            <div className="sidebar__group" key={g.label}>
              <div className="sidebar__group-label">{g.label}</div>
              {g.items.map((i) => (
                <NavLink key={i.path} to={i.path} end={i.path === '/financeiro' || i.path === '/relatorios'} className="sidebar__link" title={collapsed ? i.label : undefined}>
                  <i.icon aria-hidden />
                  <span>{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__foot desktop-only">
          <button type="button" className="sidebar__link" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer' }}
            onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="main">
        {isSupport && (
          <div className="support-banner" role="status">
            <LifeBuoy size={16} aria-hidden />
            <span>Acesso de suporte autorizado — somente leitura{session.context.supportExpiresAt ? `, válido até ${dateTime(session.context.supportExpiresAt)}` : ''}. Todas as ações ficam registradas na auditoria da empresa.</span>
          </div>
        )}
        <header className="header">
          <button type="button" className="nc-btn nc-btn--ghost nc-btn--icon mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <div className="header__org desktop-only" style={{ maxWidth: 220 }}>
            <strong className="ellipsis">{session.context.organizationName}</strong>
            <BranchSelect />
          </div>
          <GlobalSearch />
          <div className="header__actions">
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>
        <main id="conteudo" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function BranchSelect() {
  const { session } = useSession();
  const { branchId, setBranchId } = useBranchFilter();
  const branches = session?.context.branches ?? [];
  if (branches.length <= 1) return <span>{branches[0]?.name ?? 'Sem filial atribuída'}</span>;
  return (
    <select aria-label="Filial em exibição" value={branchId} onChange={(e) => setBranchId(e.target.value)}
      style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: 0, cursor: 'pointer' }}>
      <option value="">{session?.context.allBranches ? 'Todas as filiais' : 'Minhas filiais'}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}
