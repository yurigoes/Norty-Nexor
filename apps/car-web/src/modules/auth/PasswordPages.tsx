import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Alert, Button } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { api, errorMessage } from '../../lib/api';
import { homeFor, useSession } from '../../lib/session';

/** Mesma regra da API: 10+ caracteres com letras e números. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return 'Use ao menos 10 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return 'Combine letras e números.';
  return null;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>('/auth/password/forgot', { email });
      setSent(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Recuperar acesso</h1>
        <p className="muted">Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link válido por 60 minutos.</p>
      </div>
      {sent ? (
        <Alert tone="success" title="Pedido registrado">
          {sent} Se o e-mail não chegar, peça ao administrador da sua empresa um link de acesso pela tela de usuários.
        </Alert>
      ) : (
        <form className="stack" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="E-mail" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <Button type="submit" variant="primary" size="lg" block icon={MailCheck} loading={busy} disabled={!email}>Enviar link</Button>
        </form>
      )}
      <Link to="/entrar" className="row small"><ArrowLeft size={14} aria-hidden /> Voltar para o login</Link>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = password ? passwordProblem(password) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password/reset', { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/entrar'), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Definir nova senha</h1>
        <p className="muted">Ao salvar, todas as sessões abertas da conta são encerradas.</p>
      </div>
      {!token && <Alert tone="danger">Link incompleto. Abra novamente o link recebido.</Alert>}
      {done ? <Alert tone="success" title="Senha definida">Redirecionando para o login…</Alert> : (
        <form className="stack" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Nova senha" required hint="Ao menos 10 caracteres, com letras e números." error={problem}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Field label="Confirme a senha" required error={confirm && confirm !== password ? 'As senhas não conferem.' : null}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block icon={KeyRound} loading={busy} disabled={!token || Boolean(problem) || !password || password !== confirm}>Salvar senha</Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Troca obrigatória no primeiro acesso. */
export function ForcePasswordChange() {
  const { session, reload, logout } = useSession();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = password ? passwordProblem(password) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: password });
      await reload();
      navigate(homeFor(session), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <div className="stack-sm">
        <h1>Crie sua senha</h1>
        <p className="muted">Por segurança, defina uma senha pessoal antes de continuar.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Senha atual" required><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus /></Field>
        <Field label="Nova senha" required hint="Ao menos 10 caracteres, com letras e números." error={problem}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!current || !password || Boolean(problem)}>Salvar e continuar</Button>
        <Button variant="ghost" onClick={() => logout()}>Sair</Button>
      </form>
    </AuthLayout>
  );
}
