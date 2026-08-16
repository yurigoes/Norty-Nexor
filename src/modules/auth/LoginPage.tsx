import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, KeyRound, LayoutDashboard, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { NexorLogo } from '../../brand/NexorLogo';
import { BrandCanvas } from '../../brand/BrandCanvas';
import { useSession } from '../../app/SessionContext';
import { homeRouteFor } from '../../app/navigation';
import { AuthError } from '../../services/auth';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../../services/permissions';
import { Button, Input, Modal } from '../../components/ui';
import './login.css';

const DEMO_ACCOUNTS = [
  { email: 'morador@nexor.test', role: 'morador' as const, icon: User, detail: 'Carlos Almeida · Torre A · Apto 1204' },
  { email: 'portaria@nexor.test', role: 'portaria' as const, icon: ShieldCheck, detail: 'Marcos Vieira · Portaria Principal' },
  { email: 'sindico@nexor.test', role: 'sindico' as const, icon: LayoutDashboard, detail: 'Helena Duarte · Mandato 2025–2027' },
  { email: 'admin@nexor.test', role: 'administrador' as const, icon: KeyRound, detail: 'Ricardo Monteiro · Meridian Administração' },
  { email: 'administradora@nexor.test', role: 'administradora' as const, icon: Building2, detail: 'Beatriz Salgado · 24 condomínios' },
];

export function LoginPage() {
  const { user, login } = useSession();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState<'senha' | 'primeiro' | null>(null);

  if (user) return <Navigate to={homeRouteFor(user)} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Latência simulada: preserva a percepção de autenticação real.
    window.setTimeout(() => {
      try {
        const authenticated = login(email, password);
        navigate(homeRouteFor(authenticated), { replace: true });
      } catch (err) {
        setError(err instanceof AuthError ? err.message : 'Não foi possível entrar. Tente novamente.');
        setLoading(false);
      }
    }, 560);
  };

  const useAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword('123456');
    setError(null);
  };

  return (
    <div className="nx-login">
      <section className="nx-login__hero">
        <BrandCanvas className="nx-login__canvas" />
        <div className="nx-login__hero-content">
          <NexorLogo size="xl" tone="light" />
          <h1 className="nx-login__headline">O sistema operacional do condomínio.</h1>
          <p className="nx-login__lead">
            Moradores, portaria, segurança, financeiro e administração conectados
            em uma única plataforma — com identidade digital para cada pessoa,
            veículo e unidade.
          </p>
          <ul className="nx-login__features">
            <li><span /> Controle de acesso e portaria em tempo real</li>
            <li><span /> Gestão financeira, reservas e chamados</li>
            <li><span /> Governança, assembleias e auditoria completa</li>
            <li><span /> Inteligência aplicada à operação do condomínio</li>
          </ul>
        </div>
        <footer className="nx-login__hero-foot">
          <span>NEXOR · Plataforma de gestão condominial</span>
          <span>by Norty</span>
        </footer>
      </section>

      <section className="nx-login__panel">
        <div className="nx-login__panel-inner">
          <div className="nx-login__mobile-brand">
            <NexorLogo size="lg" />
          </div>

          <header className="nx-login__header">
            <h2>Acessar plataforma</h2>
            <p>Entre com suas credenciais para continuar.</p>
          </header>

          <form onSubmit={submit} className="nx-stack nx-gap-4">
            <Input
              label="E-mail"
              type="email"
              inputSize="lg"
              icon={<Mail size={16} />}
              placeholder="voce@condominio.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              label="Senha"
              type="password"
              inputSize="lg"
              icon={<Lock size={16} />}
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && <p className="nx-login__error">{error}</p>}

            <Button type="submit" variant="brand" size="lg" block loading={loading} iconRight={<ArrowRight size={18} />}>
              Entrar
            </Button>

            <div className="nx-login__links">
              <button type="button" onClick={() => setHelpOpen('senha')}>Esqueci minha senha</button>
              <span>·</span>
              <button type="button" onClick={() => setHelpOpen('primeiro')}>Primeiro acesso</button>
            </div>
          </form>

          <div className="nx-login__divider"><span>Contas de demonstração</span></div>

          <div className="nx-login__accounts">
            {DEMO_ACCOUNTS.map((account) => (
              <button key={account.email} className="nx-login__account" onClick={() => useAccount(account.email)}>
                <span className="nx-login__account-icon"><account.icon size={17} /></span>
                <span className="nx-stack nx-grow">
                  <span className="nx-login__account-role">{ROLE_LABEL[account.role]}</span>
                  <span className="nx-login__account-detail">{account.detail}</span>
                </span>
                <span className="nx-login__account-email">{account.email}</span>
              </button>
            ))}
          </div>
          <p className="nx-login__hint">Todas as contas de demonstração usam a senha <strong>123456</strong>.</p>
        </div>
      </section>

      <Modal
        open={helpOpen !== null}
        onClose={() => setHelpOpen(null)}
        title={helpOpen === 'senha' ? 'Recuperação de senha' : 'Primeiro acesso'}
        size="sm"
        footer={<Button variant="primary" onClick={() => setHelpOpen(null)}>Entendi</Button>}
      >
        {helpOpen === 'senha' ? (
          <p className="nx-text-muted">
            Na versão de produção, o link de redefinição é enviado por e-mail e SMS com
            validade de 30 minutos. Neste ambiente de demonstração, utilize uma das contas
            listadas com a senha <strong>123456</strong>.
          </p>
        ) : (
          <div className="nx-stack nx-gap-3">
            <p className="nx-text-muted">
              O primeiro acesso é liberado pela administradora ou pelo síndico, que cadastra
              a unidade e o e-mail do morador. O convite chega por e-mail com validação em
              duas etapas.
            </p>
            <p className="nx-text-muted">
              Perfis disponíveis: {Object.entries(ROLE_DESCRIPTION).map(([role]) => ROLE_LABEL[role as keyof typeof ROLE_LABEL]).join(', ')}.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
