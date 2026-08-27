import { ShieldAlert } from 'lucide-react';
import { useSession } from '../../app/SessionContext';
import { homeRouteFor } from '../../app/navigation';
import { ROLE_LABEL } from '../../services/permissions';
import { Button } from '../../components/ui';
import './status-pages.css';

export function ForbiddenPage() {
  const { user } = useSession();
  return (
    <div className="nx-status-page is-inline">
      <span className="nx-status-page__icon is-danger"><ShieldAlert size={28} /></span>
      <h1>Acesso restrito</h1>
      <p>
        O perfil <strong>{user ? ROLE_LABEL[user.role] : 'atual'}</strong> não possui permissão
        para este módulo. Cada papel enxerga apenas os dados e as ações previstas na
        matriz de permissões do condomínio.
      </p>
      {user && <Button variant="primary" to={homeRouteFor(user)}>Ir para minha área</Button>}
    </div>
  );
}
