import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  CreditCard,
  Cpu,
  Gauge,
  KeyRound,
  Layers,
  LogOut,
  Pause,
  Play,
  ScrollText,
  ShieldAlert,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { Organization, OrganizationStatus } from '@veyra/core';
import { Avatar, Botao, Cartao, CartaoCabecalho, CartaoCorpo, Modal, Progresso, Segmentado, Selo, useAvisos } from '../components';
import { GraficoArea, GraficoBarras, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { VeyraMark, VeyraWordmark } from '../brand/Logo';
import { Pagina, formatarData, tempoRelativo } from '../modules/Pagina';
import { AUDITORIA, CONSUMO, ORGANIZACOES, PLANOS } from '../data/base';
import './admin.css';

/**
 * VEYRA Admin
 *
 * Área do proprietário da plataforma. Não é uma tela a mais dentro do
 * aplicativo do cliente: é outra casca, outra rota e outro conjunto de
 * permissões, porque quem entra aqui enxerga todas as organizações.
 *
 * Misturar essa visão com o produto do cliente seria a maneira mais
 * fácil de, um dia, vazar dado de uma empresa para outra — bastaria um
 * `where` esquecido. Separar fisicamente torna o erro difícil em vez de
 * apenas improvável.
 *
 * Toda ação daqui é auditada: bloquear uma empresa é uma decisão que
 * derruba a operação de outra gente, e precisa ter nome, hora e IP.
 */

const ROTULO_STATUS: Record<OrganizationStatus, string> = {
  ativa: 'Ativa',
  em_teste: 'Em teste',
  suspensa: 'Suspensa',
  bloqueada: 'Bloqueada',
  inadimplente: 'Inadimplente',
  cancelada: 'Cancelada',
};

function tomDoStatus(status: OrganizationStatus) {
  if (status === 'ativa') return 'sucesso' as const;
  if (status === 'em_teste') return 'info' as const;
  if (status === 'inadimplente') return 'atencao' as const;
  if (status === 'bloqueada' || status === 'cancelada') return 'perigo' as const;
  return 'neutro' as const;
}

const ITENS_ADMIN = [
  { rota: '/admin', rotulo: 'Visão geral', icone: Gauge, exato: true },
  { rota: '/admin/empresas', rotulo: 'Empresas', icone: Building2 },
  { rota: '/admin/planos', rotulo: 'Planos e limites', icone: Layers },
  { rota: '/admin/consumo', rotulo: 'Consumo', icone: Cpu },
  { rota: '/admin/receita', rotulo: 'Receita', icone: Wallet },
  { rota: '/admin/auditoria', rotulo: 'Auditoria', icone: ScrollText },
  { rota: '/admin/chaves', rotulo: 'Chaves e provedores', icone: KeyRound },
];

export function CascaAdmin() {
  return (
    <div className="vy-admin">
      <aside className="vy-admin__lateral">
        <div className="vy-admin__marca">
          <VeyraMark size={26} />
          <span>
            <VeyraWordmark size={15} />
            <span className="vy-admin__tag">Admin</span>
          </span>
        </div>

        <nav className="vy-admin__nav" aria-label="Administração da plataforma">
          {ITENS_ADMIN.map((item) => (
            <NavLink key={item.rota} to={item.rota} end={item.exato} className="vy-item">
              <span className="vy-item__icone">
                <item.icone size={17} strokeWidth={2} />
              </span>
              <span className="vy-item__rotulo">{item.rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <div className="vy-lateral__rodape">
          <Link to="/app" className="vy-item">
            <span className="vy-item__icone">
              <LogOut size={17} strokeWidth={2} />
            </span>
            <span className="vy-item__rotulo">Voltar ao aplicativo</span>
          </Link>
        </div>
      </aside>

      <div className="vy-conteudo">
        <header className="vy-topo">
          <span className="vy-row" style={{ gap: 'var(--space-3)' }}>
            <ShieldAlert size={16} color="var(--warning)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Você está na área do proprietário da plataforma. Toda ação aqui é registrada na auditoria.
            </span>
          </span>
          <span className="vy-row" style={{ marginLeft: 'auto', gap: 'var(--space-2)' }}>
            <Avatar nome="Rafael Yuri" tamanho={30} />
            <span className="vy-only-desktop" style={{ lineHeight: 1.2 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-strong)' }}>
                Rafael Yuri
              </span>
              <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>VEYRA Admin</span>
            </span>
          </span>
        </header>

        <main className="vy-pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ---------- Visão geral ---------- */

export function AdminVisaoGeral() {
  const navegar = useNavigate();

  const metricas = useMemo(() => {
    const mrr = ORGANIZACOES.reduce((s, o) => s + o.mrr, 0);
    const porStatus = (s: OrganizationStatus) => ORGANIZACOES.filter((o) => o.status === s).length;
    return {
      mrr,
      arr: mrr * 12,
      ativas: porStatus('ativa'),
      emTeste: porStatus('em_teste'),
      inadimplentes: porStatus('inadimplente'),
      suspensas: porStatus('suspensa') + porStatus('bloqueada'),
      totalUsuarios: CONSUMO.reduce((s, c) => s + c.usuarios, 0),
      totalLeads: CONSUMO.reduce((s, c) => s + c.leads, 0),
      totalMensagens: CONSUMO.reduce((s, c) => s + c.mensagens, 0),
      totalIa: CONSUMO.reduce((s, c) => s + c.interacoesIa, 0),
    };
  }, []);

  return (
    <Pagina
      titulo="Visão geral da plataforma"
      subtitulo="Todas as organizações, o consumo agregado e a receita recorrente."
      acoes={
        <Botao variante="primario" icone={Building2} onClick={() => navegar('/admin/empresas')}>
          Gerenciar empresas
        </Botao>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="MRR" valor={formatarMoeda(metricas.mrr)} delta={11.4} contexto="receita recorrente mensal" icone={TrendingUp} />
        <Indicador rotulo="ARR" valor={formatarMoeda(metricas.arr, true)} contexto="projeção anualizada" icone={Wallet} />
        <Indicador rotulo="Empresas ativas" valor={formatarNumero(metricas.ativas)} contexto={`${metricas.emTeste} em teste`} icone={Building2} />
        <Indicador rotulo="Churn mensal" valor={formatarPercentual(1.8)} delta={-0.4} contexto="cancelamentos sobre a base" icone={Ban} />
      </div>

      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Usuários na plataforma" valor={formatarNumero(metricas.totalUsuarios)} icone={Users} />
        <Indicador rotulo="Leads processados no mês" valor={formatarNumero(metricas.totalLeads)} icone={TrendingUp} />
        <Indicador rotulo="Mensagens trafegadas" valor={formatarNumero(metricas.totalMensagens)} icone={Cpu} />
        <Indicador rotulo="Interações de IA" valor={formatarNumero(metricas.totalIa)} contexto="84% sem provedor externo" icone={Cpu} />
      </div>

      <div className="vy-grid-2">
        <Cartao>
          <CartaoCabecalho titulo="MRR nos últimos 12 meses" descricao="Soma da assinatura de todas as organizações ativas." />
          <CartaoCorpo>
            <GraficoArea
              rotulos={['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']}
              series={[{ nome: 'MRR (R$)', valores: [1188, 1585, 1982, 2379, 2776, 3173, 3570, 3570, 3967, 4364, 4761, 5088] }]}
              formatar={(v) => formatarMoeda(v)}
              altura={220}
            />
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="Organizações por estado" descricao="O que exige ação está em âmbar e vermelho." />
          <CartaoCorpo>
            <GraficoBarras
              dados={[
                { rotulo: 'Ativas', valor: metricas.ativas, cor: 'var(--chart-3)' },
                { rotulo: 'Em teste', valor: metricas.emTeste, cor: 'var(--chart-1)' },
                { rotulo: 'Inadimplentes', valor: metricas.inadimplentes, cor: 'var(--chart-4)' },
                { rotulo: 'Suspensas', valor: metricas.suspensas, cor: 'var(--danger)' },
              ]}
              altura={220}
            />
          </CartaoCorpo>
        </Cartao>
      </div>
    </Pagina>
  );
}

/* ---------- Empresas ---------- */

export function AdminEmpresas() {
  const { avisar } = useAvisos();
  const [filtro, setFiltro] = useState<'todas' | OrganizationStatus>('todas');
  const [alvo, setAlvo] = useState<{ org: Organization; acao: 'suspender' | 'bloquear' | 'reativar' } | null>(null);

  const filtradas = useMemo(
    () => ORGANIZACOES.filter((o) => filtro === 'todas' || o.status === filtro),
    [filtro],
  );

  function confirmar() {
    if (!alvo) return;
    const verbo = alvo.acao === 'reativar' ? 'reativada' : alvo.acao === 'suspender' ? 'suspensa' : 'bloqueada';
    avisar({
      tom: alvo.acao === 'reativar' ? 'sucesso' : 'atencao',
      titulo: `${alvo.org.nome} ${verbo}`,
      texto: 'Registrado na auditoria com usuário, horário e IP.',
    });
    setAlvo(null);
  }

  return (
    <Pagina
      titulo="Empresas"
      subtitulo="Criar, ativar, suspender e bloquear. Cada uma com o próprio plano, os próprios limites e os próprios módulos."
      acoes={
        <Segmentado
          opcoes={[
            { valor: 'todas' as const, rotulo: 'Todas' },
            { valor: 'ativa' as const, rotulo: 'Ativas' },
            { valor: 'em_teste' as const, rotulo: 'Em teste' },
            { valor: 'inadimplente' as const, rotulo: 'Inadimplentes' },
          ]}
          valor={filtro}
          aoMudar={setFiltro}
        />
      }
    >
      <div className="vy-stack">
        {filtradas.map((org) => {
          const plano = PLANOS.find((p) => p.id === org.planoId);
          const consumo = CONSUMO.find((c) => c.organizationId === org.id);
          const limiteUsuarios = plano?.limites.usuarios;
          const usoUsuarios = limiteUsuarios && consumo ? (consumo.usuarios / limiteUsuarios) * 100 : 0;

          return (
            <Cartao key={org.id}>
              <CartaoCabecalho
                titulo={
                  <span className="vy-row vy-wrap" style={{ gap: 'var(--space-3)' }}>
                    {org.nome}
                    <Selo tom={tomDoStatus(org.status)}>{ROTULO_STATUS[org.status]}</Selo>
                    <Selo tom="marca">{plano?.nome}</Selo>
                  </span>
                }
                descricao={
                  <>
                    {org.documento} · {org.responsavel.nome} · cliente desde {formatarData(org.criadaEm)}
                    {org.trialTerminaEm && ` · teste termina ${tempoRelativo(org.trialTerminaEm)}`}
                  </>
                }
                acao={
                  <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                    {org.status === 'suspensa' || org.status === 'bloqueada' ? (
                      <Botao variante="secundario" tamanho="pequeno" icone={Play} onClick={() => setAlvo({ org, acao: 'reativar' })}>
                        Reativar
                      </Botao>
                    ) : (
                      <>
                        <Botao variante="fantasma" tamanho="pequeno" icone={Pause} onClick={() => setAlvo({ org, acao: 'suspender' })}>
                          Suspender
                        </Botao>
                        <Botao variante="perigo" tamanho="pequeno" icone={Ban} onClick={() => setAlvo({ org, acao: 'bloquear' })}>
                          Bloquear
                        </Botao>
                      </>
                    )}
                  </span>
                }
              />
              <CartaoCorpo>
                <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-4)' }}>
                  {(
                    [
                      ['MRR', formatarMoeda(org.mrr)],
                      ['Usuários', consumo ? `${consumo.usuarios} / ${limiteUsuarios ?? '∞'}` : '—'],
                      ['Leads no mês', consumo ? formatarNumero(consumo.leads) : '—'],
                      ['Mensagens', consumo ? formatarNumero(consumo.mensagens) : '—'],
                      ['Interações de IA', consumo ? formatarNumero(consumo.interacoesIa) : '—'],
                      ['Armazenamento', consumo ? `${consumo.armazenamentoGb} GB` : '—'],
                      ['Módulos liberados', String(org.modulosLiberados.length)],
                    ] as [string, string][]
                  ).map(([rotulo, valor]) => (
                    <div key={rotulo}>
                      <span className="vy-eyebrow" style={{ display: 'block' }}>
                        {rotulo}
                      </span>
                      <strong className="vy-numeric" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                        {valor}
                      </strong>
                    </div>
                  ))}
                </div>

                {limiteUsuarios && (
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <div className="vy-row-between" style={{ marginBottom: 5 }}>
                      <span className="vy-eyebrow">Uso do limite de usuários</span>
                      <span className="vy-mono vy-muted">{formatarPercentual(usoUsuarios, 0)}</span>
                    </div>
                    <Progresso valor={usoUsuarios} cor={usoUsuarios > 85 ? 'var(--warning)' : undefined} />
                  </div>
                )}

                {org.status === 'inadimplente' && (
                  <p
                    style={{
                      marginTop: 'var(--space-4)',
                      padding: 'var(--space-3)',
                      background: 'var(--warning-soft)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: -2, color: 'var(--warning)' }} />
                    Fatura em aberto há 12 dias. A suspensão automática está agendada para o 15º dia.
                  </p>
                )}
              </CartaoCorpo>
            </Cartao>
          );
        })}
      </div>

      <Modal
        aberto={!!alvo}
        aoFechar={() => setAlvo(null)}
        titulo={
          alvo?.acao === 'reativar'
            ? `Reativar ${alvo.org.nome}?`
            : alvo?.acao === 'suspender'
              ? `Suspender ${alvo?.org.nome}?`
              : `Bloquear ${alvo?.org.nome}?`
        }
        descricao="Esta ação afeta o acesso de todos os usuários da organização e fica registrada na auditoria."
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setAlvo(null)}>
              Cancelar
            </Botao>
            <Botao variante={alvo?.acao === 'bloquear' ? 'perigo' : 'primario'} onClick={confirmar}>
              Confirmar
            </Botao>
          </>
        }
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
          {alvo?.acao === 'reativar'
            ? 'Os usuários voltam a acessar imediatamente e as automações pausadas retomam de onde pararam.'
            : alvo?.acao === 'suspender'
              ? 'Os usuários perdem o acesso, mas os dados permanecem intactos e as automações ficam pausadas. É reversível a qualquer momento.'
              : 'Além de derrubar o acesso, o bloqueio interrompe integrações, disparos e webhooks. Use apenas em caso de violação contratual — para inadimplência, prefira suspender.'}
        </p>
      </Modal>
    </Pagina>
  );
}

/* ---------- Planos ---------- */

export function AdminPlanos() {
  return (
    <Pagina
      titulo="Planos e limites"
      subtitulo="O plano define o teto de consumo e quais módulos aparecem. Módulo não contratado não é escondido: é negado no guard."
    >
      <div className="vy-grid-2">
        {PLANOS.map((plano) => (
          <Cartao key={plano.id} destaque={plano.destaque}>
            <CartaoCabecalho
              titulo={
                <span className="vy-row" style={{ gap: 'var(--space-3)' }}>
                  {plano.nome}
                  {plano.destaque && <Selo tom="marca">mais vendido</Selo>}
                </span>
              }
              descricao={`${formatarMoeda(plano.precoMensal)}/mês · ${formatarMoeda(plano.precoAnual)}/ano`}
            />
            <CartaoCorpo>
              <dl className="vy-stack" style={{ gap: 'var(--space-2)' }}>
                {(
                  [
                    ['Usuários', plano.limites.usuarios],
                    ['Leads por mês', plano.limites.leadsPorMes],
                    ['Mensagens por mês', plano.limites.mensagensPorMes],
                    ['Interações de IA', plano.limites.interacoesIaPorMes],
                    ['Armazenamento (GB)', plano.limites.armazenamentoGb],
                    ['Números de WhatsApp', plano.limites.numerosWhatsapp],
                    ['Automações ativas', plano.limites.automacoesAtivas],
                    ['Requisições por minuto', plano.limites.chamadasApiPorMinuto],
                  ] as [string, number | null][]
                ).map(([rotulo, limite]) => (
                  <div key={rotulo} className="vy-row-between" style={{ alignItems: 'baseline' }}>
                    <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{rotulo}</dt>
                    <dd className="vy-numeric" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                      {limite === null ? 'Ilimitado' : formatarNumero(limite)}
                    </dd>
                  </div>
                ))}
              </dl>

              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
                  {plano.modulos.length} módulos incluídos
                </div>
                {plano.addOns.length > 0 && (
                  <div className="vy-row vy-wrap" style={{ gap: 5 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>Add-ons:</span>
                    {plano.addOns.map((a) => (
                      <Selo key={a} tom="atencao">
                        {a}
                      </Selo>
                    ))}
                  </div>
                )}
              </div>
            </CartaoCorpo>
          </Cartao>
        ))}
      </div>
    </Pagina>
  );
}

/* ---------- Consumo ---------- */

export function AdminConsumo() {
  return (
    <Pagina
      titulo="Consumo por organização"
      subtitulo="O que cada empresa realmente usa. É daqui que sai a conversa de upgrade — e o alerta de abuso."
    >
      <Cartao>
        <div className="vy-tabela-wrap">
          <table className="vy-tabela" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Organização</th>
                <th>Plano</th>
                <th className="vy-tabela__numero">Usuários</th>
                <th className="vy-tabela__numero">Leads</th>
                <th className="vy-tabela__numero">Mensagens</th>
                <th className="vy-tabela__numero">IA</th>
                <th className="vy-tabela__numero">Armazenamento</th>
                <th className="vy-tabela__numero">Chamadas de API</th>
              </tr>
            </thead>
            <tbody>
              {CONSUMO.map((linha) => {
                const org = ORGANIZACOES.find((o) => o.id === linha.organizationId);
                const plano = PLANOS.find((p) => p.id === org?.planoId);
                const limite = plano?.limites.leadsPorMes;
                const perto = limite ? linha.leads / limite > 0.8 : false;
                return (
                  <tr key={linha.organizationId}>
                    <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{org?.nome}</td>
                    <td>
                      <Selo tom="neutro">{plano?.nome}</Selo>
                    </td>
                    <td className="vy-tabela__numero vy-numeric">{linha.usuarios}</td>
                    <td className="vy-tabela__numero vy-numeric">
                      <span style={{ color: perto ? 'var(--warning)' : 'inherit' }}>{formatarNumero(linha.leads)}</span>
                      {limite && <span style={{ color: 'var(--text-subtle)' }}> / {formatarNumero(limite)}</span>}
                    </td>
                    <td className="vy-tabela__numero vy-numeric">{formatarNumero(linha.mensagens)}</td>
                    <td className="vy-tabela__numero vy-numeric">{formatarNumero(linha.interacoesIa)}</td>
                    <td className="vy-tabela__numero vy-numeric">{linha.armazenamentoGb} GB</td>
                    <td className="vy-tabela__numero vy-numeric">{formatarNumero(linha.chamadasApi)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>
    </Pagina>
  );
}

/* ---------- Receita ---------- */

export function AdminReceita() {
  const mrr = ORGANIZACOES.reduce((s, o) => s + o.mrr, 0);

  return (
    <Pagina titulo="Receita" subtitulo="Assinaturas, cobrança recorrente e cancelamento.">
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="MRR" valor={formatarMoeda(mrr)} delta={11.4} icone={TrendingUp} />
        <Indicador rotulo="ARR" valor={formatarMoeda(mrr * 12, true)} icone={Wallet} />
        <Indicador rotulo="Ticket médio por conta" valor={formatarMoeda(mrr / ORGANIZACOES.filter((o) => o.mrr > 0).length)} icone={CreditCard} />
        <Indicador rotulo="Churn de receita" valor={formatarPercentual(1.2)} delta={-0.6} icone={Ban} />
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Assinaturas" descricao="Estado da cobrança por organização." />
        <div className="vy-tabela-wrap">
          <table className="vy-tabela">
            <thead>
              <tr>
                <th>Organização</th>
                <th>Plano</th>
                <th>Estado</th>
                <th className="vy-tabela__numero">MRR</th>
                <th>Responsável financeiro</th>
              </tr>
            </thead>
            <tbody>
              {ORGANIZACOES.map((org) => (
                <tr key={org.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{org.nome}</td>
                  <td>{PLANOS.find((p) => p.id === org.planoId)?.nome}</td>
                  <td>
                    <Selo tom={tomDoStatus(org.status)}>{ROTULO_STATUS[org.status]}</Selo>
                  </td>
                  <td className="vy-tabela__numero vy-numeric">{formatarMoeda(org.mrr)}</td>
                  <td>
                    <span style={{ display: 'block' }}>{org.responsavel.nome}</span>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{org.responsavel.email}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </Pagina>
  );
}

/* ---------- Auditoria da plataforma ---------- */

export function AdminAuditoria() {
  return (
    <Pagina
      titulo="Auditoria da plataforma"
      subtitulo="Ações administrativas de todas as organizações, com valor anterior e novo."
      acoes={
        <Link to="/admin">
          <Botao variante="fantasma" icone={ArrowLeft}>
            Visão geral
          </Botao>
        </Link>
      }
    >
      <Cartao>
        <div className="vy-tabela-wrap">
          <table className="vy-tabela" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Antes → depois</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {AUDITORIA.map((log) => (
                <tr key={log.id}>
                  <td>{formatarData(log.em, true)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{log.usuario}</td>
                  <td>{log.acao}</td>
                  <td>
                    <Selo tom="neutro">{log.entidade}</Selo>
                  </td>
                  <td className="vy-mono">
                    <span style={{ color: 'var(--danger)' }}>{JSON.stringify(log.antes ?? {})}</span>
                    <span style={{ color: 'var(--text-subtle)' }}> → </span>
                    <span style={{ color: 'var(--success)' }}>{JSON.stringify(log.depois ?? {})}</span>
                  </td>
                  <td className="vy-mono vy-muted">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </Pagina>
  );
}

/* ---------- Chaves e provedores ---------- */

export function AdminChaves() {
  const provedores = [
    { nome: 'Base interna VEYRA', tipo: 'Próprio', estado: 'ativo', share: 52, custo: 0 },
    { nome: 'Modelo aberto auto-hospedado', tipo: 'Open source', estado: 'ativo', share: 32, custo: 180 },
    { nome: 'Provedor externo — primário', tipo: 'API paga', estado: 'ativo', share: 14, custo: 940 },
    { nome: 'Provedor externo — reserva', tipo: 'API paga', estado: 'em espera', share: 2, custo: 120 },
  ];

  return (
    <Pagina
      titulo="Chaves e provedores de IA"
      subtitulo="O provedor é peça trocável. Nenhum fornecedor único pode virar ponto de falha nem alavanca de preço."
    >
      <div className="vy-grid-2">
        <Cartao>
          <CartaoCabecalho titulo="Provedores configurados" descricao="A ordem de uso é definida aqui e vale para todas as organizações." />
          <CartaoCorpo>
            <ul className="vy-stack" style={{ gap: 'var(--space-4)' }}>
              {provedores.map((p) => (
                <li key={p.nome}>
                  <div className="vy-row-between" style={{ marginBottom: 5 }}>
                    <span>
                      <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{p.nome}</strong>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginLeft: 8 }}>{p.tipo}</span>
                    </span>
                    <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                      <span className="vy-mono vy-muted">{formatarMoeda(p.custo)}/mês</span>
                      <Selo tom={p.estado === 'ativo' ? 'sucesso' : 'neutro'}>{p.estado}</Selo>
                    </span>
                  </div>
                  <Progresso valor={p.share} cor={p.custo === 0 ? 'var(--chart-3)' : undefined} />
                </li>
              ))}
            </ul>
          </CartaoCorpo>
        </Cartao>

        <Cartao>
          <CartaoCabecalho titulo="Chaves de API" descricao="Só o prefixo é exibível. O segredo aparece uma vez, na criação." />
          <div className="vy-tabela-wrap">
            <table className="vy-tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Prefixo</th>
                  <th>Organização</th>
                  <th>Último uso</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { nome: 'Integração ERP', prefixo: 'vy_live_8f2k…', org: 'Nexor', uso: '2026-08-27T08:40:00Z' },
                  { nome: 'Site institucional', prefixo: 'vy_live_31ab…', org: 'Nexor', uso: '2026-08-27T07:12:00Z' },
                  { nome: 'n8n', prefixo: 'vy_live_c04d…', org: 'Atlas', uso: '2026-08-26T19:04:00Z' },
                  { nome: 'Teste', prefixo: 'vy_test_9911…', org: 'Vitta', uso: '2026-08-20T10:00:00Z' },
                ].map((chave) => (
                  <tr key={chave.prefixo}>
                    <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{chave.nome}</td>
                    <td className="vy-mono">{chave.prefixo}</td>
                    <td>{chave.org}</td>
                    <td>{tempoRelativo(chave.uso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      </div>
    </Pagina>
  );
}
