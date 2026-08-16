import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Fingerprint, KeyRound, LogOut, Mail, MonitorSmartphone, Phone, ScanFace, Shield,
  Smartphone, UserCog,
} from 'lucide-react';
import { useAuthenticated } from '../../app/SessionContext';
import { ROLE_DESCRIPTION, ROLE_LABEL, permissionsFor } from '../../services/permissions';
import { unitLabel } from '../../services/directory';
import { where } from '../../data/repositories';
import {
  Avatar, Badge, Button, Card, CardHeader, DetailList, Input, Modal, PageHeader, Switch,
  Tabs, useToast,
} from '../../components/ui';
import { formatDateTime, timeAgo } from '../../lib/date';
import './shared.css';

export function ProfilePage() {
  const { user, condominium, logout, dataVersion } = useAuthenticated();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState('perfil');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [prefs, setPrefs] = useState({
    visitantes: true, encomendas: true, financeiro: true, comunicados: true,
    reservas: false, acessos: true, email: true, push: true,
  });

  const sessions = useMemo(
    () => where('sessions', (s) => s.userId === user.id),
    [user.id, dataVersion],
  );

  const permissions = useMemo(() => [...permissionsFor(user)].sort(), [user]);

  return (
    <>
      <PageHeader
        icon={<UserCog size={22} />}
        title="Perfil e segurança"
        subtitle="Seus dados, dispositivos e preferências"
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'perfil', label: 'Perfil' },
              { id: 'seguranca', label: 'Segurança' },
              { id: 'notificacoes', label: 'Notificações' },
              { id: 'permissoes', label: 'Permissões', count: permissions.length },
            ]}
          />
        }
      />

      <div className="nx-profile-hero nx-mb-4">
        <Avatar name={user.name} size="xl" ring />
        <div className="nx-profile-hero__info nx-grow">
          <h1>{user.name}</h1>
          <p>{user.jobTitle ?? ROLE_LABEL[user.role]}</p>
          <div className="nx-row nx-gap-2 nx-wrap" style={{ marginTop: 'var(--space-3)' }}>
            <Badge tone="cyan">{ROLE_LABEL[user.role]}</Badge>
            {user.unitId && <Badge tone="brand">{unitLabel(user.unitId)}</Badge>}
            <Badge tone="neutral">{condominium.shortName}</Badge>
          </div>
        </div>
      </div>

      {tab === 'perfil' && (
        <div className="nx-grid-auto-lg">
          <Card padding="md">
            <CardHeader title="Dados pessoais" subtitle="Informações do cadastro" />
            <DetailList
              columns={1}
              items={[
                { label: 'Nome completo', value: user.name },
                { label: 'E-mail', value: <span className="nx-row nx-gap-2"><Mail size={14} /> {user.email}</span> },
                { label: 'Telefone', value: <span className="nx-row nx-gap-2"><Phone size={14} /> {user.phone}</span> },
                { label: 'Unidade', value: user.unitId ? unitLabel(user.unitId) : 'Não vinculada' },
                { label: 'Condomínio', value: condominium.name },
                { label: 'Último acesso', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—' },
              ]}
            />
            <Button variant="secondary" block style={{ marginTop: 'var(--space-5)' }} onClick={() => toast.info('Edição de perfil', 'Na Fase 2 a alteração de dados passa pela validação da administradora.')}>
              Editar dados
            </Button>
          </Card>

          <Card padding="md">
            <CardHeader title="Perfil de acesso" subtitle={ROLE_LABEL[user.role]} icon={<Shield size={18} />} />
            <p className="nx-text-sm nx-text-muted">{ROLE_DESCRIPTION[user.role]}</p>
            <div className="nx-callout" style={{ marginTop: 'var(--space-4)' }}>
              <p className="nx-medium">Isolamento por condomínio</p>
              <p className="nx-text-sm nx-text-muted">
                Seu acesso está restrito aos dados de {condominium.name}. Nenhuma informação
                de outros condomínios da administradora é visível neste perfil.
              </p>
            </div>
          </Card>
        </div>
      )}

      {tab === 'seguranca' && (
        <div className="nx-grid-auto-lg">
          <Card padding="md">
            <CardHeader title="Senha e autenticação" icon={<KeyRound size={18} />} />
            <div className="nx-stack nx-gap-3">
              <Button variant="secondary" block onClick={() => setPasswordOpen(true)}>Alterar senha</Button>
              <div className="nx-security-item">
                <span className="nx-row nx-gap-3"><Fingerprint size={18} /> Biometria (digital)</span>
                <Badge tone="neutral" size="sm">Fase 2</Badge>
              </div>
              <div className="nx-security-item">
                <span className="nx-row nx-gap-3"><ScanFace size={18} /> Reconhecimento facial</span>
                <Badge tone="neutral" size="sm">Fase 2</Badge>
              </div>
              <div className="nx-security-item">
                <span className="nx-row nx-gap-3"><Smartphone size={18} /> Autenticação em duas etapas</span>
                <Badge tone="neutral" size="sm">Fase 2</Badge>
              </div>
            </div>
            <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-4)' }}>
              Os métodos avançados de autenticação estão previstos na arquitetura e serão
              habilitados junto com a autenticação real.
            </p>
          </Card>

          <Card padding="md">
            <CardHeader title="Dispositivos conectados" subtitle={`${sessions.length} sessões`} icon={<MonitorSmartphone size={18} />} />
            {sessions.map((s) => (
              <div key={s.id} className="nx-session-item">
                <span className="nx-list__icon"><MonitorSmartphone size={16} /></span>
                <div className="nx-stack nx-grow">
                  <span className="nx-medium">{s.device}</span>
                  <span className="nx-text-xs nx-text-subtle">{s.browser} · {s.location} · {timeAgo(s.lastActiveAt)}</span>
                </div>
                {s.current
                  ? <Badge tone="success" size="sm" dot>Atual</Badge>
                  : <Button variant="ghost" size="sm" onClick={() => toast.info('Sessão encerrada', `${s.device} foi desconectado.`)}>Encerrar</Button>}
              </div>
            ))}
            <Button
              variant="danger"
              block
              icon={<LogOut size={16} />}
              style={{ marginTop: 'var(--space-5)' }}
              onClick={() => { logout(); navigate('/login'); }}
            >
              Sair da conta
            </Button>
          </Card>
        </div>
      )}

      {tab === 'notificacoes' && (
        <Card padding="md">
          <CardHeader title="Preferências de notificação" subtitle="Escolha o que você quer receber" icon={<Bell size={18} />} />
          <div className="nx-stack nx-gap-4">
            {[
              ['visitantes', 'Chegada de visitantes', 'Avisa quando um visitante autorizado chega à portaria.'],
              ['encomendas', 'Encomendas', 'Notifica quando uma encomenda é recebida ou retirada.'],
              ['acessos', 'Acessos da unidade', 'Entradas e saídas de moradores, veículos e prestadores.'],
              ['financeiro', 'Financeiro', 'Boletos disponíveis, vencimentos e confirmações de pagamento.'],
              ['comunicados', 'Comunicados', 'Avisos publicados pela administração e pelo síndico.'],
              ['reservas', 'Reservas', 'Confirmações, lembretes e alterações de reservas.'],
            ].map(([key, label, description]) => (
              <Switch
                key={key}
                checked={prefs[key as keyof typeof prefs]}
                onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                label={label}
                description={description}
              />
            ))}
            <hr className="nx-divider" />
            <Switch checked={prefs.push} onChange={(v) => setPrefs((p) => ({ ...p, push: v }))} label="Notificações push" description="No aplicativo instalado no celular (PWA)." />
            <Switch checked={prefs.email} onChange={(v) => setPrefs((p) => ({ ...p, email: v }))} label="Resumo por e-mail" description="Um resumo diário das novidades do condomínio." />
          </div>
        </Card>
      )}

      {tab === 'permissoes' && (
        <Card padding="md">
          <CardHeader
            title="Permissões efetivas"
            subtitle={`Concedidas pelo papel ${ROLE_LABEL[user.role]}`}
            icon={<Shield size={18} />}
          />
          <div className="nx-perm-grid">
            {permissions.map((p) => (
              <span key={p} className="nx-perm">{p}</span>
            ))}
          </div>
          <p className="nx-text-xs nx-text-subtle" style={{ marginTop: 'var(--space-4)' }}>
            A matriz de permissões é avaliada em cada rota e em cada ação. Módulos sem
            permissão não são exibidos na navegação nem acessíveis por URL direta.
          </p>
        </Card>
      )}

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Alterar senha"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => { setPasswordOpen(false); toast.success('Senha alterada', 'Neste ambiente a alteração é simulada.'); }}>Salvar</Button>
          </>
        }
      >
        <div className="nx-stack nx-gap-4">
          <Input label="Senha atual" type="password" placeholder="••••••" />
          <Input label="Nova senha" type="password" placeholder="••••••" hint="Mínimo de 8 caracteres com letras e números." />
          <Input label="Confirmar nova senha" type="password" placeholder="••••••" />
        </div>
      </Modal>
    </>
  );
}
