/* Perfil: dados da conta, senha, verificação em duas etapas e sessões abertas. */
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { LogOut, Monitor, ShieldCheck, ShieldOff } from 'lucide-react';
import { Alert, Badge, Button, Card, KeyValue, LoadingBlock, Page, PageHeader } from '../../components/ui';
import { Field, Input } from '../../components/form';
import { useConfirm } from '../../components/overlay';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { dateTime, relative } from '../../lib/format';
import { passwordProblem } from '../auth/PasswordPages';
import { PLATFORM_ROLE_LABEL } from '@nortycar/shared';

interface SessionRow { id: string; current: boolean; ip: string | null; userAgent: string | null; contextKind: string | null; createdAt: string; lastUsedAt: string }

export function ProfilePage() {
  const { session, reload } = useSession();
  if (!session) return <LoadingBlock />;
  return (
    <Page>
      <PageHeader title="Meu perfil e segurança" description="Seus dados de acesso, senha, verificação em duas etapas e dispositivos conectados." />
      <Card title="Conta">
        <KeyValue items={[
          { label: 'Nome', value: session.user.name },
          { label: 'E-mail', value: session.user.email },
          { label: 'Contexto atual', value: session.context.organizationName ?? (session.context.kind === 'PLATFORM' ? 'Master Norty' : '—') },
          { label: 'Perfil', value: session.context.roleName ?? session.context.customerName ?? '—' },
          { label: 'Equipe Norty', value: PLATFORM_ROLE_LABEL[session.user.platformRole], hidden: session.user.platformRole === 'NONE' },
        ]} />
      </Card>
      <div className="grid-2">
        <PasswordCard />
        <MfaCard enabled={session.user.mfaEnabled} onChange={reload} />
      </div>
      <SessionsCard />
    </Page>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = next ? passwordProblem(next) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
      toast.success('Senha alterada', 'As outras sessões foram encerradas.');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Senha" subtitle="Trocar a senha encerra as sessões nos outros dispositivos.">
      <form className="stack" onSubmit={submit}>
        <Field label="Senha atual" required><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="Nova senha" required hint="Ao menos 10 caracteres, com letras e números." error={problem}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <div><Button type="submit" variant="primary" loading={busy} disabled={!current || !next || Boolean(problem)}>Alterar senha</Button></div>
      </form>
    </Card>
  );
}

function MfaCard({ enabled, onChange }: { enabled: boolean; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 196 }).then(setQr).catch(() => setQr(null));
  }, [setup]);
  useEffect(() => { if (window.location.hash === '#mfa') document.getElementById('mfa')?.scrollIntoView(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api.post('/auth/mfa/setup'));
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/mfa/enable', { code });
      toast.success('Verificação em duas etapas ativada');
      setSetup(null);
      setCode('');
      await onChange();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/mfa/disable', { password, code });
      toast.success('Verificação em duas etapas desativada');
      setPassword('');
      setCode('');
      await onChange();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div id="mfa">
      <Card title="Verificação em duas etapas" subtitle="Código de um aplicativo autenticador além da senha." actions={enabled ? <Badge tone="success" dot>Ativa</Badge> : <Badge tone="warning" dot>Inativa</Badge>}>
        {enabled ? (
          <form className="stack" onSubmit={disable}>
            <p className="small muted">Para desativar, confirme sua senha e um código atual.</p>
            <Field label="Senha" required><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Código de 6 dígitos" required><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <div><Button type="submit" variant="danger" icon={ShieldOff} loading={busy} disabled={!password || code.length !== 6}>Desativar</Button></div>
          </form>
        ) : setup ? (
          <form className="stack" onSubmit={confirmCode}>
            <p className="small">1. No aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…), leia o código abaixo ou digite a chave.</p>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {qr && <img src={qr} alt="QR Code para configurar o autenticador" width={196} height={196} style={{ borderRadius: 8, background: '#fff' }} />}
              <div className="stack-sm"><span className="xsmall muted">Chave</span><code className="mono" style={{ wordBreak: 'break-all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></div>
            </div>
            <p className="small">2. Digite o código que o aplicativo mostrar.</p>
            <Field label="Código de 6 dígitos" required><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
            <div className="row"><Button type="submit" variant="primary" icon={ShieldCheck} loading={busy} disabled={code.length !== 6}>Ativar</Button><Button onClick={() => setSetup(null)}>Cancelar</Button></div>
          </form>
        ) : (
          <div className="stack">
            <Alert tone="info">Recomendado para todos e obrigatório para a equipe Norty. Contas administrativas da locadora também devem usar.</Alert>
            <div><Button variant="primary" icon={ShieldCheck} loading={busy} onClick={start}>Configurar</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SessionsCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi(() => api.get<SessionRow[]>('/auth/sessions'), []);
  return (
    <Card title="Sessões abertas" subtitle="Dispositivos conectados à sua conta." flush
      actions={<Button size="sm" icon={LogOut} onClick={async () => {
        const r = await confirm({ title: 'Encerrar outras sessões', message: 'Todos os outros dispositivos precisarão entrar de novo.', confirmLabel: 'Encerrar' });
        if (!r.confirmed) return;
        const res = await api.post<{ revoked: number }>('/auth/sessions/revoke-others').catch((e) => { toast.error(errorMessage(e)); return null; });
        if (res) { toast.success(`${res.revoked} sessão(ões) encerrada(s)`); reload(); }
      }}>Encerrar as outras</Button>}>
      {loading && !data ? <LoadingBlock /> : (
        <ul className="nc-list">
          {(data ?? []).map((s) => (
            <li key={s.id}>
              <Monitor size={18} className="muted" aria-hidden />
              <div className="grow">
                <div className="strong ellipsis">{describeAgent(s.userAgent)}{s.current && <> <Badge tone="brand">Esta sessão</Badge></>}</div>
                <div className="xsmall muted">IP {s.ip ?? 'desconhecido'} · iniciada em {dateTime(s.createdAt)} · última atividade {relative(s.lastUsedAt)}</div>
              </div>
              {!s.current && (
                <Button size="sm" variant="ghost" onClick={() => api.del(`/auth/sessions/${s.id}`).then(() => { toast.success('Sessão encerrada'); reload(); }).catch((e) => toast.error(errorMessage(e)))}>Encerrar</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` em ${os}` : ''}`;
}
