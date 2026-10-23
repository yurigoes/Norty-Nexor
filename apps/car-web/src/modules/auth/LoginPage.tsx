import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn, ShieldCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Alert, Button } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { ContextList } from '../../components/context-switcher';
import { homeFor, useSession } from '../../lib/session';
import { errorMessage } from '../../lib/api';

export function LoginPage() {
  const { login, verifyMfa, pending, status, session, logout } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session && !pending) navigate(homeFor(session), { replace: true });
  }, [status, session, pending, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyMfa(code);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (pending?.step === 'mfa') {
    return (
      <AuthLayout>
        <div className="stack-sm">
          <span className="context-item__icon" aria-hidden><ShieldCheck size={20} /></span>
          <h1>Verificação em duas etapas</h1>
          <p className="muted">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <form className="stack" onSubmit={submitMfa}>
          <Field label="Código" required>
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={code.length !== 6}>Confirmar</Button>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => logout()}>Voltar</Button>
        </form>
      </AuthLayout>
    );
  }

  if (pending?.step === 'context') {
    return (
      <AuthLayout>
        <div className="stack-sm">
          <h1>Onde você quer entrar?</h1>
          <p className="muted">Sua conta tem acesso a mais de um lugar. Você pode trocar depois, sem sair.</p>
        </div>
        <ContextList contexts={pending.contexts ?? []} />
        <Button variant="ghost" icon={ArrowLeft} onClick={() => logout()}>Entrar com outra conta</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Entrar</h1>
        <p className="muted">Acesse o Norty Car com seu e-mail e senha.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="E-mail" required>
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Senha" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="row-between">
          <span />
          <Link to="/esqueci-senha" className="small">Esqueci minha senha</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" block icon={LogIn} loading={busy} disabled={!email || !password}>Entrar</Button>
      </form>
    </AuthLayout>
  );
}
