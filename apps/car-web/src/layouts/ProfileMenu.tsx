import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Check, LogOut, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/toast';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { initials } from '../lib/format';
import { Modal } from '../components/overlay';
import { ContextSwitcher } from '../components/context-switcher';

export function ProfileMenu({ profilePath = '/perfil' }: { profilePath?: string }) {
  const { session, logout } = useSession();
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  if (!session) return null;
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" className="profile-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="nc-avatar" aria-hidden>{initials(session.user.name)}</span>
        <span className="desktop-only stack-sm" style={{ gap: 0, textAlign: 'left' }}>
          <span className="small strong">{session.user.name}</span>
          <span className="xsmall muted">{session.context.roleName ?? session.context.customerName ?? ''}</span>
        </span>
      </button>
      {open && (
        <div className="nc-menu" role="menu">
          <div className="nc-menu__label">{session.user.email}</div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate(profilePath); }}><UserRound />Meu perfil e segurança</button>
          {session.availableContexts > 1 && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setSwitching(true); }}><ArrowLeftRight />Trocar empresa ou contexto</button>
          )}
          {session.demo && (
            <>
              <hr />
              <div className="nc-menu__label">Modo apresentação — ver como</div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {session.demo.roles.map((r) => (
                  <button key={r.id} type="button" role="menuitemradio" aria-checked={r.id === session.demo!.currentRoleId}
                    onClick={() => api.post('/auth/demo/role', { roleId: r.id })
                      // Recarrega tudo: menu, permissões e telas passam a refletir o novo perfil.
                      .then(() => window.location.assign('/'))
                      .catch((e) => toast.error(errorMessage(e)))}>
                    {r.id === session.demo!.currentRoleId ? <Check /> : <span style={{ width: 16 }} />}{r.name}
                  </button>
                ))}
              </div>
              <hr />
            </>
          )}
          <button type="button" role="menuitem" onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
          {!session.user.mfaEnabled && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate(`${profilePath}#mfa`); }}><ShieldCheck />Ativar verificação em duas etapas</button>
          )}
          <hr />
          <button type="button" role="menuitem" onClick={() => logout().then(() => navigate('/entrar'))}><LogOut />Sair</button>
        </div>
      )}
      <Modal open={switching} onClose={() => setSwitching(false)} title="Trocar de contexto" description="As permissões e os dados mudam conforme o contexto escolhido.">
        <ContextSwitcher onChosen={() => setSwitching(false)} />
      </Modal>
    </div>
  );
}
