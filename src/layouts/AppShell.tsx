import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeft, Search, Settings, Sparkles,
  UserCog, X, Building2, RotateCcw,
} from 'lucide-react';
import { NexorLogo } from '../brand/NexorLogo';
import { useAuthenticated } from '../app/SessionContext';
import { bottomNavFor, navigationFor, type NavItem } from '../app/navigation';
import { ROLE_LABEL } from '../services/permissions';
import { unreadCount } from '../services/notifications';
import { pendingDeliveries } from '../services/deliveries';
import { openTickets } from '../services/tickets';
import { expectedToday } from '../services/visitors';
import { Avatar, Badge, ConfirmDialog } from '../components/ui';
import { GlobalSearch } from '../components/GlobalSearch';
import { NotificationPanel } from '../components/NotificationPanel';
import { TrialBanner } from '../components/TrialBanner';
import { resetDemo } from '../data/db';
import { isoDate } from '../lib/date';
import { firstName } from '../lib/format';
import './shell.css';

export function AppShell() {
  const { user, condominium, condominiums, switchCondominium, logout, dataVersion } = useAuthenticated();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nexor.sidebar') === 'collapsed');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [condoMenuOpen, setCondoMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const groups = useMemo(() => navigationFor(user), [user]);
  const bottomNav = useMemo(() => bottomNavFor(user), [user]);

  const badges = useMemo(() => ({
    notifications: unreadCount(user, condominium.id),
    deliveries: user.role === 'morador' && user.unitId
      ? pendingDeliveries(condominium.id).filter((d) => d.unitId === user.unitId).length
      : pendingDeliveries(condominium.id).length,
    tickets: openTickets(condominium.id).length,
    visitors: expectedToday(condominium.id, isoDate(new Date())).length,
  }), [user, condominium.id, dataVersion]);

  useEffect(() => {
    setMobileNavOpen(false);
    setCondoMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('nexor.sidebar', prev ? 'expanded' : 'collapsed');
      return !prev;
    });
  };

  const badgeValue = (item: NavItem) => (item.badge ? badges[item.badge] : 0);

  return (
    <div className={`nx-shell ${collapsed ? 'is-collapsed' : ''}`}>
      {/* ---------------- Sidebar ---------------- */}
      <aside className={`nx-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="nx-sidebar__head">
          <NavLink to="/" className="nx-sidebar__brand">
            {collapsed ? <NexorLogo variant="mark" size="sm" tone="light" /> : <NexorLogo size="sm" tone="light" />}
          </NavLink>
          <button className="nx-sidebar__collapse nx-hide-mobile" onClick={toggleCollapsed} aria-label="Recolher menu">
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button className="nx-sidebar__collapse nx-only-mobile" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="nx-sidebar__nav">
          {groups.map((group) => (
            <div key={group.label} className="nx-sidebar__group">
              {!collapsed && <p className="nx-sidebar__group-label">{group.label}</p>}
              {group.items.map((item) => {
                const count = badgeValue(item);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nx-sidebar__link ${isActive ? 'is-active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} className="nx-sidebar__icon" />
                    {!collapsed && <span className="nx-grow nx-truncate">{item.label}</span>}
                    {!collapsed && count > 0 && <span className="nx-sidebar__badge">{count > 99 ? '99+' : count}</span>}
                    {collapsed && count > 0 && <span className="nx-sidebar__dot" />}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="nx-sidebar__foot">
          {!collapsed && <TrialBanner />}
          <button className="nx-sidebar__link" onClick={() => setConfirmReset(true)} title="Reiniciar demonstração">
            <RotateCcw size={18} className="nx-sidebar__icon" />
            {!collapsed && <span>Reiniciar demonstração</span>}
          </button>
        </div>
      </aside>

      {mobileNavOpen && <div className="nx-sidebar__scrim" onClick={() => setMobileNavOpen(false)} />}

      {/* ---------------- Conteúdo ---------------- */}
      <div className="nx-shell__main">
        <header className="nx-topbar">
          <button className="nx-icon-btn nx-only-mobile" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>

          <div className="nx-topbar__condo">
            {condominiums.length > 1 ? (
              <div className="nx-dropdown">
                <button className="nx-topbar__condo-btn" onClick={() => setCondoMenuOpen((v) => !v)}>
                  <span className="nx-topbar__condo-icon"><Building2 size={16} /></span>
                  <span className="nx-stack nx-hide-mobile">
                    <span className="nx-topbar__condo-name nx-truncate">{condominium.name}</span>
                    <span className="nx-topbar__condo-meta">{condominium.city} · {condominium.unitsCount.toLocaleString('pt-BR')} unidades</span>
                  </span>
                  <ChevronDown size={15} />
                </button>
                {condoMenuOpen && (
                  <>
                    <div className="nx-dropdown__scrim" onClick={() => setCondoMenuOpen(false)} />
                    <div className="nx-dropdown__menu nx-dropdown__menu--left nx-condo-menu">
                      <div className="nx-dropdown__header">
                        <p className="nx-uppercase nx-text-subtle">Trocar de condomínio</p>
                      </div>
                      <div className="nx-condo-menu__list">
                        {condominiums.map((c) => (
                          <button
                            key={c.id}
                            className={`nx-dropdown__item ${c.id === condominium.id ? 'is-active' : ''}`}
                            onClick={() => { switchCondominium(c.id); setCondoMenuOpen(false); }}
                          >
                            <span className="nx-stack nx-grow">
                              <span className="nx-medium nx-truncate">{c.name}</span>
                              <span className="nx-text-xs nx-text-subtle">{c.city} · {c.unitsCount.toLocaleString('pt-BR')} un.</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="nx-topbar__condo-btn is-static">
                <span className="nx-topbar__condo-icon"><Building2 size={16} /></span>
                <span className="nx-stack nx-hide-mobile">
                  <span className="nx-topbar__condo-name nx-truncate">{condominium.name}</span>
                  <span className="nx-topbar__condo-meta">{condominium.city} · {condominium.unitsCount.toLocaleString('pt-BR')} unidades</span>
                </span>
              </div>
            )}
          </div>

          <button className="nx-topbar__search" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span className="nx-hide-mobile">Buscar morador, unidade, placa ou visitante</span>
            <kbd className="nx-hide-mobile">⌘K</kbd>
          </button>

          <div className="nx-row nx-gap-1 nx-shrink-0">
            <button
              className={`nx-icon-btn nx-topbar__bell ${badges.notifications ? 'has-unread' : ''}`}
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notificações"
            >
              <Bell size={19} />
              {badges.notifications > 0 && <span className="nx-topbar__bell-count">{badges.notifications > 9 ? '9+' : badges.notifications}</span>}
            </button>

            <div className="nx-dropdown">
              <button className="nx-topbar__user" onClick={() => setUserMenuOpen((v) => !v)}>
                <Avatar name={user.name} size="sm" />
                <span className="nx-stack nx-hide-mobile">
                  <span className="nx-topbar__user-name">{firstName(user.name)}</span>
                  <span className="nx-topbar__user-role">{ROLE_LABEL[user.role]}</span>
                </span>
                <ChevronDown size={14} className="nx-hide-mobile" />
              </button>
              {userMenuOpen && (
                <>
                  <div className="nx-dropdown__scrim" onClick={() => setUserMenuOpen(false)} />
                  <div className="nx-dropdown__menu nx-dropdown__menu--right">
                    <div className="nx-dropdown__header">
                      <p className="nx-semibold">{user.name}</p>
                      <p className="nx-text-xs nx-text-muted">{user.jobTitle ?? ROLE_LABEL[user.role]}</p>
                      <Badge tone="brand" size="sm" className="nx-mt-2">{ROLE_LABEL[user.role]}</Badge>
                    </div>
                    <button className="nx-dropdown__item" onClick={() => navigate('/app/perfil')}>
                      <UserCog size={16} /><span>Meu perfil</span>
                    </button>
                    <button className="nx-dropdown__item" onClick={() => navigate('/app/concierge')}>
                      <Sparkles size={16} /><span>NEXOR AI</span>
                    </button>
                    <button className="nx-dropdown__item" onClick={() => navigate('/gestao/configuracoes')}>
                      <Settings size={16} /><span>Configurações</span>
                    </button>
                    <button className="nx-dropdown__item is-danger" onClick={() => { logout(); navigate('/login'); }}>
                      <LogOut size={16} /><span>Sair da conta</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="nx-content">
          <div className="nx-content__inner">
            <Outlet />
          </div>
        </main>

        <nav className="nx-bottomnav">
          {bottomNav.map((item) => {
            const count = badgeValue(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nx-bottomnav__item ${isActive ? 'is-active' : ''}`}
              >
                <span className="nx-bottomnav__icon">
                  <item.icon size={21} />
                  {count > 0 && <span className="nx-bottomnav__badge">{count > 9 ? '9+' : count}</span>}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { resetDemo(); window.location.reload(); }}
        title="Reiniciar demonstração"
        message="Todas as alterações feitas durante a demonstração serão descartadas e o condomínio voltará ao estado original. Deseja continuar?"
        confirmLabel="Reiniciar"
      />
    </div>
  );
}
