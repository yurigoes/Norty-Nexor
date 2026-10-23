import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider, homeFor, useSession } from './lib/session';
import { ToastProvider } from './components/toast';
import { ConfirmProvider } from './components/overlay';
import { LoadingBlock } from './components/ui';
import { StaffShell } from './layouts/StaffShell';
import { LoginPage } from './modules/auth/LoginPage';
import { ForgotPasswordPage, ForcePasswordChange, ResetPasswordPage } from './modules/auth/PasswordPages';
import { NotFoundPage } from './modules/shared/StatusPages';
import { STAFF_ROUTES, MASTER_ROUTES, PORTAL_ROUTES } from './routes';
import { Guard } from './routes/Guard';
import { MasterLayout, PortalLayout, PublicSiteRoot, isPublicSiteHost } from './routes/surfaces';

export function App() {
  // Host que não é o do aplicativo = site público de uma locadora.
  if (isPublicSiteHost()) return <PublicSiteRoot />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function AppRoutes() {
  const registered = useMemo(() => new Set(STAFF_ROUTES.map((r) => r.path)), []);
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/site/:slug/*" element={<PublicSiteRoot />} />
      <Route path="/master/*" element={<RequireAuth kinds={['PLATFORM']}><MasterLayout /></RequireAuth>}>
        {MASTER_ROUTES.map((r) => <Route key={r.path} path={r.path.replace(/^\/master\/?/, '') || undefined} index={r.path === '/master'} element={<Guard permissions={r.permissions}>{r.element}</Guard>} />)}
      </Route>
      <Route path="/cliente/*" element={<RequireAuth kinds={['CUSTOMER']}><PortalLayout /></RequireAuth>}>
        {PORTAL_ROUTES.map((r) => <Route key={r.path} path={r.path.replace(/^\/cliente\/?/, '') || undefined} index={r.path === '/cliente'} element={r.element} />)}
      </Route>
      <Route element={<RequireAuth kinds={['STAFF', 'SUPPORT']}><StaffShell registered={registered} /></RequireAuth>}>
        {STAFF_ROUTES.map((r) => <Route key={r.path} path={r.path} element={<Guard permissions={r.permissions}>{r.element}</Guard>} />)}
        {!registered.has('/painel') && <Route path="/painel" element={<Navigate to="/perfil" replace />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { status, session } = useSession();
  if (status === 'loading') return <LoadingBlock />;
  return <Navigate to={status === 'authenticated' ? homeFor(session) : '/entrar'} replace />;
}

function RequireAuth({ kinds, children }: { kinds: string[]; children: React.ReactNode }) {
  const { status, session } = useSession();
  const location = useLocation();
  if (status === 'loading') return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><LoadingBlock /></div>;
  if (status !== 'authenticated' || !session) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (session.user.mustChangePassword) return <ForcePasswordChange />;
  if (!kinds.includes(session.context.kind)) return <Navigate to={homeFor(session)} replace />;
  return <>{children}</>;
}
