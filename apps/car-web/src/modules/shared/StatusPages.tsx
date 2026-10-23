import { Link } from 'react-router-dom';
import { Compass, Lock } from 'lucide-react';
import { EmptyState } from '../../components/ui';

export function ForbiddenPage() {
  return (
    <EmptyState icon={Lock} title="Sem permissão para esta área"
      description="Seu perfil não inclui esta funcionalidade. Se precisar dela, fale com o administrador da empresa."
      action={<Link to="/" className="nc-btn nc-btn--secondary">Voltar ao início</Link>} />
  );
}

export function NotFoundPage() {
  return (
    <EmptyState icon={Compass} title="Página não encontrada" description="O endereço pode ter mudado ou o registro não existe mais."
      action={<Link to="/" className="nc-btn nc-btn--secondary">Voltar ao início</Link>} />
  );
}
