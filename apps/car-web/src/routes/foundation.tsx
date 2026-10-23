import type { AppRoute } from './types';
import { UsersPage } from '../modules/admin/UsersPage';
import { RolesPage } from '../modules/admin/RolesPage';
import { BranchesPage } from '../modules/admin/BranchesPage';
import { SettingsPage } from '../modules/admin/SettingsPage';
import { AuditPage } from '../modules/admin/AuditPage';
import { SupportPage } from '../modules/admin/SupportPage';
import { ProfilePage } from '../modules/shared/ProfilePage';

export const FOUNDATION_ROUTES: AppRoute[] = [
  { path: '/perfil', element: <ProfilePage /> },
  { path: '/admin/usuarios', element: <UsersPage />, permissions: ['users.manage'] },
  { path: '/admin/perfis', element: <RolesPage />, permissions: ['roles.manage'] },
  { path: '/admin/filiais', element: <BranchesPage />, permissions: ['branches.manage'] },
  { path: '/admin/configuracoes', element: <SettingsPage />, permissions: ['settings.manage'] },
  { path: '/admin/auditoria', element: <AuditPage />, permissions: ['audit.view'] },
  { path: '/admin/suporte', element: <SupportPage />, permissions: ['support.approve', 'settings.manage'] },
];
