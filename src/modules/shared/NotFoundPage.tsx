import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { NexorLogo } from '../../brand/NexorLogo';
import { Button } from '../../components/ui';
import './status-pages.css';

export function NotFoundPage() {
  return (
    <div className="nx-status-page">
      <NexorLogo size="lg" />
      <span className="nx-status-page__icon"><Compass size={28} /></span>
      <h1>Página não encontrada</h1>
      <p>O endereço acessado não existe nesta plataforma ou foi movido.</p>
      <Button variant="primary" size="lg" to="/">Voltar ao início</Button>
      <Link to="/login" className="nx-status-page__link">Entrar com outra conta</Link>
    </div>
  );
}
