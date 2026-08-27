import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  CircleDot,
  Code2,
  Copy,
  Globe,
  KeyRound,
  Link2,
  LifeBuoy,
  Lock,
  Play,
  Plug,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
  Webhook,
  X,
} from 'lucide-react';
import {
  ACTION_LABELS,
  ENDPOINTS,
  MODULOS,
  RATE_LIMITS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  TODAS_ACOES,
  type ModuleKey,
  type PermissionKey,
  type RoleKey,
} from '@veyra/core';
import { Abas, Avatar, Botao, Cartao, CartaoCabecalho, CartaoCorpo, Segmentado, Selo, useAvisos } from '../components';
import { GraficoArea, GraficoBarras, GraficoRosca, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import {
  AUDITORIA,
  CSAT,
  DESEMPENHO_EQUIPE,
  EQUIPES,
  FLUXO_CAIXA,
  INTEGRACOES,
  ORIGEM_LEADS,
  SERIE_CONVERSAO,
  SERIE_LEADS,
  SERIE_MESES,
  SERIE_RECEITA,
  SERIE_VENDAS,
  USUARIOS,
} from '../data/base';

/* =========================================================
   Relatórios
   ========================================================= */

type Familia = 'comercial' | 'marketing' | 'equipe' | 'financeiro' | 'suporte';

export function Relatorios() {
  const [familia, setFamilia] = useState<Familia>('comercial');

  return (
    <Pagina
      titulo="Relatórios"
      subtitulo="Cinco famílias, todas lendo a mesma base. Se o número diverge entre dois relatórios, é bug — não interpretação."
      acoes={
        <Segmentado
          opcoes={[
            { valor: 'comercial' as const, rotulo: 'Comercial' },
            { valor: 'marketing' as const, rotulo: 'Marketing' },
            { valor: 'equipe' as const, rotulo: 'Equipe' },
            { valor: 'financeiro' as const, rotulo: 'Financeiro' },
            { valor: 'suporte' as const, rotulo: 'Suporte' },
          ]}
          valor={familia}
          aoMudar={setFamilia}
        />
      }
    >
      {familia === 'comercial' && (
        <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
          <div className="vy-grid">
            <Indicador rotulo="Leads no período" valor={formatarNumero(SERIE_LEADS.at(-1)!)} delta={9.1} icone={Users} />
            <Indicador rotulo="Vendas" valor={formatarNumero(SERIE_VENDAS.at(-1)!)} delta={12.8} icone={Check} />
            <Indicador rotulo="Conversão" valor={formatarPercentual(SERIE_CONVERSAO.at(-1)!)} delta={3.6} icone={BarChart3} />
            <Indicador rotulo="Receita" valor={formatarMoeda(SERIE_RECEITA.at(-1)!, true)} delta={8.6} icone={BarChart3} />
          </div>
          <Cartao>
            <CartaoCabecalho titulo="Leads, vendas e conversão" descricao="Doze meses. Cada série tem sua própria escala de leitura no cursor." />
            <CartaoCorpo>
              <GraficoArea
                rotulos={SERIE_MESES}
                series={[
                  { nome: 'Leads', valores: SERIE_LEADS },
                  { nome: 'Vendas', valores: SERIE_VENDAS },
                ]}
                altura={260}
              />
            </CartaoCorpo>
          </Cartao>
        </div>
      )}

      {familia === 'marketing' && (
        <div className="vy-grid-2">
          <Cartao>
            <CartaoCabecalho titulo="Origem dos leads" descricao="Mês corrente." />
            <CartaoCorpo>
              <GraficoRosca dados={ORIGEM_LEADS} centroValor={formatarNumero(ORIGEM_LEADS.reduce((s, o) => s + o.valor, 0))} centroRotulo="leads" />
            </CartaoCorpo>
          </Cartao>
          <Cartao>
            <CartaoCabecalho titulo="Custo por lead por canal" descricao="Investimento dividido pelos leads atribuídos ao canal." />
            <CartaoCorpo>
              <GraficoBarras
                dados={[
                  { rotulo: 'Meta Ads', valor: 30 },
                  { rotulo: 'Google Ads', valor: 41 },
                  { rotulo: 'Afiliados', valor: 18 },
                  { rotulo: 'Indicação', valor: 4 },
                  { rotulo: 'Orgânico', valor: 2 },
                ]}
                formatar={(v) => formatarMoeda(v)}
                altura={220}
              />
            </CartaoCorpo>
          </Cartao>
        </div>
      )}

      {familia === 'equipe' && (
        <Cartao>
          <CartaoCabecalho titulo="Ranking do período" descricao="Ordenado por receita gerada." />
          <div className="vy-tabela-wrap">
            <table className="vy-tabela">
              <thead>
                <tr>
                  <th>Posição</th>
                  <th>Vendedor</th>
                  <th className="vy-tabela__numero">Leads</th>
                  <th className="vy-tabela__numero">Vendas</th>
                  <th className="vy-tabela__numero">Conversão</th>
                  <th>Tempo de resposta</th>
                  <th className="vy-tabela__numero">Receita</th>
                </tr>
              </thead>
              <tbody>
                {[...DESEMPENHO_EQUIPE]
                  .sort((a, b) => b.receita - a.receita)
                  .map((pessoa, i) => (
                    <tr key={pessoa.nome}>
                      <td>
                        <Selo tom={i === 0 ? 'sucesso' : 'neutro'}>{i + 1}º</Selo>
                      </td>
                      <td>
                        <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                          <Avatar nome={pessoa.nome} tamanho={26} />
                          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{pessoa.nome}</span>
                        </span>
                      </td>
                      <td className="vy-tabela__numero vy-numeric">{formatarNumero(pessoa.leads)}</td>
                      <td className="vy-tabela__numero vy-numeric">{pessoa.vendas}</td>
                      <td className="vy-tabela__numero vy-numeric">{formatarPercentual(pessoa.conversao)}</td>
                      <td>{pessoa.tempoResposta}</td>
                      <td className="vy-tabela__numero vy-numeric" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                        {formatarMoeda(pessoa.receita, true)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {familia === 'financeiro' && (
        <Cartao>
          <CartaoCabecalho titulo="Entradas e saídas" descricao="Os dois últimos meses são previsão a partir de parcelas já contratadas." />
          <CartaoCorpo>
            <GraficoArea
              rotulos={FLUXO_CAIXA.map((p) => p.mes)}
              series={[
                { nome: 'Entradas', valores: FLUXO_CAIXA.map((p) => p.entradas) },
                { nome: 'Saídas', valores: FLUXO_CAIXA.map((p) => p.saidas) },
              ]}
              formatar={(v) => formatarMoeda(v, true)}
              altura={260}
            />
          </CartaoCorpo>
        </Cartao>
      )}

      {familia === 'suporte' && (
        <div className="vy-grid-2">
          <Cartao>
            <CartaoCabecalho titulo="CSAT por nota" />
            <CartaoCorpo>
              <GraficoBarras
                dados={[5, 4, 3, 2, 1].map((n) => ({
                  rotulo: `${n} ★`,
                  valor: CSAT.filter((c) => c.nota === n).length,
                  cor: n >= 4 ? 'var(--chart-3)' : n === 3 ? 'var(--chart-4)' : 'var(--danger)',
                }))}
                altura={220}
              />
            </CartaoCorpo>
          </Cartao>
          <Cartao>
            <CartaoCabecalho titulo="Cumprimento de SLA" descricao="Percentual dentro do prazo, por mês." />
            <CartaoCorpo>
              <GraficoArea
                rotulos={['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']}
                series={[{ nome: 'SLA cumprido (%)', valores: [88, 91, 89, 93, 95, 92] }]}
                formatar={(v) => formatarPercentual(v, 0)}
                altura={220}
              />
            </CartaoCorpo>
          </Cartao>
        </div>
      )}
    </Pagina>
  );
}

/* =========================================================
   Integrações
   ========================================================= */

export function Integracoes() {
  const { avisar } = useAvisos();
  const [aba, setAba] = useState<'conectores' | 'api' | 'webhooks'>('conectores');

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, typeof INTEGRACOES>();
    for (const integracao of INTEGRACOES) {
      const atual = mapa.get(integracao.categoria) ?? [];
      atual.push(integracao);
      mapa.set(integracao.categoria, atual);
    }
    return [...mapa.entries()];
  }, []);

  return (
    <Pagina
      titulo="Central de Integrações"
      subtitulo="Cada conexão mostra estado, última sincronização e o erro exato quando falha — não um 'algo deu errado'."
      acoes={
        <Abas
          opcoes={[
            { valor: 'conectores' as const, rotulo: 'Conectores' },
            { valor: 'api' as const, rotulo: 'API' },
            { valor: 'webhooks' as const, rotulo: 'Webhooks' },
          ]}
          valor={aba}
          aoMudar={setAba}
        />
      }
    >
      {aba === 'conectores' && (
        <>
          <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
            <Indicador rotulo="Conectadas" valor={formatarNumero(INTEGRACOES.filter((i) => i.status === 'conectado').length)} icone={Plug} />
            <Indicador rotulo="Com erro" valor={formatarNumero(INTEGRACOES.filter((i) => i.status === 'erro').length)} icone={AlertTriangle} />
            <Indicador rotulo="Desconectadas" valor={formatarNumero(INTEGRACOES.filter((i) => i.status === 'desconectado').length)} icone={X} />
            <Indicador rotulo="Chamadas de API no mês" valor={formatarNumero(214880)} icone={Code2} />
          </div>

          <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
            {porCategoria.map(([categoria, itens]) => (
              <div key={categoria}>
                <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
                  {categoria}
                </div>
                <div className="vy-grid">
                  {itens.map((integracao) => {
                    const tom =
                      integracao.status === 'conectado'
                        ? 'sucesso'
                        : integracao.status === 'erro'
                          ? 'perigo'
                          : integracao.status === 'configurando'
                            ? 'atencao'
                            : 'neutro';
                    return (
                      <Cartao key={integracao.id} preenchido>
                        <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                          <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{integracao.nome}</strong>
                          <Selo tom={tom} ponto={integracao.status === 'conectado'}>
                            {integracao.status}
                          </Selo>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginTop: 6 }}>
                          {integracao.ultimaSincronizacao
                            ? `Sincronizado ${tempoRelativo(integracao.ultimaSincronizacao)}`
                            : 'Nunca sincronizado'}
                        </div>
                        {integracao.mensagemErro && (
                          <p
                            style={{
                              marginTop: 'var(--space-3)',
                              padding: 'var(--space-2) var(--space-3)',
                              background: 'var(--danger-soft)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--text-xs)',
                              color: 'var(--danger)',
                            }}
                          >
                            {integracao.mensagemErro}
                          </p>
                        )}
                        <div className="vy-row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                          <Botao
                            variante="secundario"
                            tamanho="pequeno"
                            icone={integracao.status === 'erro' ? RefreshCw : Plug}
                            onClick={() => avisar({ tom: 'info', titulo: `${integracao.nome}`, texto: 'Abrindo configuração da integração.' })}
                          >
                            {integracao.status === 'erro' ? 'Reconectar' : 'Configurar'}
                          </Botao>
                          <Botao variante="fantasma" tamanho="pequeno" icone={ScrollText}>
                            Logs
                          </Botao>
                        </div>
                      </Cartao>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === 'api' && <PainelApi />}
      {aba === 'webhooks' && <PainelWebhooks />}
    </Pagina>
  );
}

function PainelApi() {
  const { avisar } = useAvisos();

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <Cartao preenchido>
        <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <Globe size={18} color="var(--vy-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
            <strong style={{ color: 'var(--text-strong)' }}>A interface é o primeiro consumidor da API, não um caso especial dela.</strong>{' '}
            Tudo que a tela faz, um sistema de fora também faz — com a mesma autenticação, as mesmas permissões e o mesmo
            limite de requisição. É isso que permite plugar ERP, site próprio ou automação sem esperar uma "integração
            especial".
          </p>
        </div>
      </Cartao>

      <div className="vy-grid">
        {Object.entries(RATE_LIMITS).map(([nome, limite]) => (
          <Cartao key={nome} preenchido style={{ background: 'var(--surface-sunken)' }}>
            <div className="vy-eyebrow">{nome.replace(/([A-Z])/g, ' $1')}</div>
            <div className="vy-numeric" style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-strong)', marginTop: 4 }}>
              {formatarNumero(limite)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>requisições por minuto</div>
          </Cartao>
        ))}
      </div>

      <Cartao>
        <CartaoCabecalho
          titulo="Rotas publicadas"
          descricao="Toda rota nasce com a permissão declarada. Rota sem permissão é rota pública — e isso precisa ser decisão visível, não esquecimento."
          acao={
            <Botao variante="secundario" tamanho="pequeno" icone={Copy} onClick={() => avisar({ tom: 'info', titulo: 'OpenAPI copiado', texto: 'Especificação disponível em /api/v1/openapi.json' })}>
              OpenAPI
            </Botao>
          }
        />
        <div className="vy-tabela-wrap">
          <table className="vy-tabela">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Método</th>
                <th>Rota</th>
                <th>Resumo</th>
                <th>Permissão</th>
                <th>Fase</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((rota) => (
                <tr key={`${rota.metodo}-${rota.caminho}`}>
                  <td>
                    <Selo
                      tom={rota.metodo === 'GET' ? 'info' : rota.metodo === 'POST' ? 'sucesso' : rota.metodo === 'DELETE' ? 'perigo' : 'atencao'}
                    >
                      {rota.metodo}
                    </Selo>
                  </td>
                  <td className="vy-mono" style={{ color: 'var(--text-strong)' }}>
                    {rota.caminho}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{rota.resumo}</td>
                  <td>
                    {rota.permissao ? (
                      <span className="vy-mono vy-muted">{rota.permissao}</span>
                    ) : (
                      <Selo tom="atencao">pública</Selo>
                    )}
                  </td>
                  <td>
                    <Selo tom="neutro">{rota.fase}</Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}

function PainelWebhooks() {
  const eventos = [
    'lead.criado',
    'lead.status_alterado',
    'cotacao.enviada',
    'proposta.aprovada',
    'contrato.assinado',
    'pagamento.confirmado',
    'pagamento.vencido',
    'comissao.aprovada',
    'chamado.criado',
    'chamado.encerrado',
    'csat.respondido',
    'mensagem.recebida',
  ];

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
      <Cartao preenchido>
        <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <Lock size={18} color="var(--vy-violet-400)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>
            Toda entrega vai assinada com HMAC-SHA256 sobre o corpo cru. O segredo nunca sai da API — quem recebe valida a
            assinatura antes de confiar no conteúdo. Sem isso, qualquer um que descobrisse a URL poderia forjar um evento de
            "pagamento confirmado".
          </p>
        </div>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Eventos disponíveis" descricao="Assine só o que o seu sistema realmente processa." />
        <CartaoCorpo>
          <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
            {eventos.map((evento) => (
              <li key={evento}>
                <span
                  className="vy-mono"
                  style={{
                    display: 'inline-block',
                    padding: '4px var(--space-3)',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    color: 'var(--text-default)',
                  }}
                >
                  {evento}
                </span>
              </li>
            ))}
          </ul>
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Endpoints registrados" acao={<Botao variante="primario" tamanho="pequeno" icone={Webhook}>Novo endpoint</Botao>} />
        <div className="vy-tabela-wrap">
          <table className="vy-tabela">
            <thead>
              <tr>
                <th>URL</th>
                <th>Eventos</th>
                <th>Assinatura</th>
                <th>Última entrega</th>
                <th>Falhas</th>
              </tr>
            </thead>
            <tbody>
              {[
                { url: 'https://erp.nexor.com.br/hooks/veyra', eventos: 4, falhas: 0, ultima: '2026-08-27T08:58:00Z' },
                { url: 'https://n8n.nexor.com.br/webhook/lead', eventos: 2, falhas: 0, ultima: '2026-08-27T08:40:00Z' },
                { url: 'https://site.nexor.com.br/api/contemplacao', eventos: 1, falhas: 3, ultima: '2026-08-25T14:20:00Z' },
              ].map((endpoint) => (
                <tr key={endpoint.url}>
                  <td className="vy-mono" style={{ color: 'var(--text-strong)' }}>
                    {endpoint.url}
                  </td>
                  <td>{endpoint.eventos} eventos</td>
                  <td>
                    <Selo tom="sucesso">
                      <ShieldCheck size={10} /> HMAC
                    </Selo>
                  </td>
                  <td>{tempoRelativo(endpoint.ultima)}</td>
                  <td>{endpoint.falhas > 0 ? <Selo tom="perigo">{endpoint.falhas} seguidas</Selo> : <Selo tom="neutro">0</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}

/* =========================================================
   Configurações — papéis, permissões e equipes
   ========================================================= */

export function Configuracoes() {
  const [aba, setAba] = useState<'permissoes' | 'usuarios' | 'equipes' | 'seguranca'>('permissoes');

  return (
    <Pagina
      titulo="Configurações"
      subtitulo="A matriz aqui é a mesma que protege a rota na API. Esconder o botão é conveniência; o guard é a proteção."
      acoes={
        <Abas
          opcoes={[
            { valor: 'permissoes' as const, rotulo: 'Permissões' },
            { valor: 'usuarios' as const, rotulo: 'Usuários' },
            { valor: 'equipes' as const, rotulo: 'Equipes' },
            { valor: 'seguranca' as const, rotulo: 'Segurança' },
          ]}
          valor={aba}
          aoMudar={setAba}
        />
      }
    >
      {aba === 'permissoes' && <MatrizPermissoes />}
      {aba === 'usuarios' && <ListaUsuarios />}
      {aba === 'equipes' && <ListaEquipes />}
      {aba === 'seguranca' && <PainelSeguranca />}
    </Pagina>
  );
}

function MatrizPermissoes() {
  const [papel, setPapel] = useState<RoleKey>('vendedor');
  const permissoes = ROLE_PERMISSIONS[papel];
  const modulos = MODULOS.filter((m) => m.chave !== 'email');

  const temPermissao = (modulo: ModuleKey, acao: string) => permissoes.includes(`${modulo}.${acao}` as PermissionKey);

  return (
    <div className="vy-stack" style={{ gap: 'var(--space-4)' }}>
      <Cartao preenchido>
        <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
          {(Object.keys(ROLE_PERMISSIONS) as RoleKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPapel(p)}
              className="vy-segmentado__item"
              aria-selected={p === papel}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                border: `1px solid ${p === papel ? 'var(--vy-cyan)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-full)',
                background: p === papel ? 'var(--vy-gradient-soft)' : 'transparent',
              }}
            >
              {ROLE_LABELS[p]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>
          {ROLE_DESCRIPTIONS[papel]} <strong style={{ color: 'var(--text-strong)' }}>{permissoes.length} permissões</strong> concedidas.
        </p>
      </Cartao>

      <Cartao>
        <div className="vy-tabela-wrap">
          <table className="vy-tabela" style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th>Módulo</th>
                {TODAS_ACOES.map((acao) => (
                  <th key={acao} style={{ textAlign: 'center' }}>
                    {ACTION_LABELS[acao]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulos.map((modulo) => (
                <tr key={modulo.chave}>
                  <td style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{modulo.nome}</td>
                  {TODAS_ACOES.map((acao) => (
                    <td key={acao} style={{ textAlign: 'center' }}>
                      {temPermissao(modulo.chave, acao) ? (
                        <Check size={15} color="var(--success)" style={{ margin: '0 auto' }} />
                      ) : (
                        <span style={{ color: 'var(--border-strong)' }}>·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}

function ListaUsuarios() {
  return (
    <Cartao>
      <CartaoCabecalho titulo="Usuários" descricao={`${USUARIOS.length} pessoas com acesso a esta organização.`} />
      <div className="vy-tabela-wrap">
        <table className="vy-tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Papel</th>
              <th>Equipe</th>
              <th>2FA</th>
              <th>Último acesso</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {USUARIOS.map((usuario) => (
              <tr key={usuario.id}>
                <td>
                  <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                    <Avatar nome={usuario.nome} tamanho={28} cor={usuario.avatarCor} />
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)' }}>{usuario.nome}</span>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{usuario.email}</span>
                    </span>
                  </span>
                </td>
                <td>
                  <Selo tom="info">{ROLE_LABELS[usuario.papel]}</Selo>
                </td>
                <td>{EQUIPES.find((e) => e.id === usuario.equipeId)?.nome ?? '—'}</td>
                <td>
                  {usuario.doisFatoresAtivo ? (
                    <Selo tom="sucesso">
                      <ShieldCheck size={10} /> ativo
                    </Selo>
                  ) : (
                    <Selo tom="atencao">inativo</Selo>
                  )}
                </td>
                <td>{tempoRelativo(usuario.ultimoAcesso)}</td>
                <td>
                  <Selo tom={usuario.ativo ? 'sucesso' : 'neutro'}>{usuario.ativo ? 'ativo' : 'inativo'}</Selo>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

function ListaEquipes() {
  return (
    <div className="vy-grid">
      {EQUIPES.map((equipe) => (
        <Cartao key={equipe.id} preenchido>
          <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{equipe.nome}</strong>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            {equipe.membros.length} membros
          </div>
          <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            {equipe.membros.map((id) => {
              const pessoa = USUARIOS.find((u) => u.id === id);
              return (
                <li key={id}>
                  <Avatar nome={pessoa?.nome ?? '—'} tamanho={30} cor={pessoa?.avatarCor} />
                </li>
              );
            })}
          </ul>
        </Cartao>
      ))}
    </div>
  );
}

function PainelSeguranca() {
  const decisoes: [string, string][] = [
    ['Senha em Argon2id', 'A API nunca devolve o hash. O tipo do usuário autenticado sequer tem esse campo.'],
    ['Access token de 15 minutos', 'Guardado em memória no cliente. Nunca em localStorage, onde qualquer script da página o leria.'],
    ['Refresh token em cookie httpOnly', 'Com rotação a cada uso e hash no banco. Um token roubado vale por um uso só.'],
    ['Mensagem de login idêntica', 'E-mail inexistente e senha errada respondem igual — a diferença revelaria quem tem conta.'],
    ['Campo desconhecido é erro', 'Corpo com campo não previsto é rejeitado, não ignorado em silêncio.'],
    ['Erro genérico em produção', 'Stack trace e texto do Postgres ficam no log, com código de rastreio para o suporte.'],
    ['Isolamento por organização', 'O guard resolve a organização uma vez; todo `where` começa por ela. Nenhum service confia em id vindo do corpo.'],
    ['2FA por TOTP', 'Obrigatório para administrador e financeiro; opcional para os demais papéis.'],
    ['Trilha de auditoria', 'Ação crítica registra usuário, IP, horário e o antes/depois do valor alterado.'],
  ];

  return (
    <div className="vy-grid-2">
      {decisoes.map(([titulo, detalhe]) => (
        <Cartao key={titulo} preenchido>
          <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <Lock size={15} color="var(--vy-cyan)" style={{ flexShrink: 0, marginTop: 3 }} />
            <div>
              <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{titulo}</strong>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 'var(--leading-normal)' }}>
                {detalhe}
              </p>
            </div>
          </div>
        </Cartao>
      ))}
    </div>
  );
}

/* =========================================================
   Auditoria
   ========================================================= */

export function Auditoria() {
  return (
    <Pagina
      titulo="Auditoria"
      subtitulo="Quem alterou o quê, quando e de onde — com o valor anterior e o novo. É o que transforma 'alguém mudou' em fato verificável."
    >
      <Cartao>
        <div className="vy-tabela-wrap">
          <table className="vy-tabela" style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Antes</th>
                <th>Depois</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {AUDITORIA.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span style={{ display: 'block' }}>{formatarData(log.em, true)}</span>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{tempoRelativo(log.em)}</span>
                  </td>
                  <td>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-strong)' }}>{log.usuario}</span>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{log.papel}</span>
                  </td>
                  <td>{log.acao}</td>
                  <td>
                    <Selo tom="neutro">{log.entidade}</Selo>
                    {log.entidadeId && <div className="vy-mono vy-muted" style={{ marginTop: 3 }}>{log.entidadeId}</div>}
                  </td>
                  <td className="vy-mono" style={{ color: 'var(--danger)', maxWidth: 180 }}>
                    {log.antes && Object.keys(log.antes).length ? JSON.stringify(log.antes) : '—'}
                  </td>
                  <td className="vy-mono" style={{ color: 'var(--success)', maxWidth: 180 }}>
                    {log.depois && Object.keys(log.depois).length ? JSON.stringify(log.depois) : '—'}
                  </td>
                  <td>
                    <span className="vy-mono vy-muted">{log.ip}</span>
                    {log.userAgent && (
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{log.userAgent}</div>
                    )}
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

/* =========================================================
   Ajuda
   ========================================================= */

export function Ajuda() {
  return (
    <Pagina titulo="Ajuda" subtitulo="Como a plataforma foi pensada, e o que fazer quando algo não sai como esperado.">
      <div className="vy-grid-2">
        {(
          [
            [BookOpen, 'Documentação', 'Guias por módulo, do primeiro lead ao fechamento de comissão.'],
            [Code2, 'Referência da API', 'OpenAPI completo, autenticação, limites e exemplos de webhook.'],
            [LifeBuoy, 'Abrir chamado', 'Suporte com SLA. Prioridade crítica responde em 15 minutos.'],
            [Play, 'Treinamentos', 'Vídeos curtos por papel: vendedor, supervisor, financeiro e suporte.'],
            [KeyRound, 'Recuperar acesso', 'Redefinição de senha, 2FA e desbloqueio de conta.'],
            [Link2, 'Status da plataforma', 'Disponibilidade dos serviços e histórico de incidentes.'],
          ] as [typeof BookOpen, string, string][]
        ).map(([Icone, titulo, detalhe]) => (
          <Cartao key={titulo} preenchido interativo onClick={() => undefined}>
            <div className="vy-row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--vy-gradient-soft)',
                  color: 'var(--vy-cyan-300)',
                  flexShrink: 0,
                }}
              >
                <Icone size={17} />
              </span>
              <div>
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{titulo}</strong>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{detalhe}</p>
              </div>
              <CircleDot size={13} color="var(--text-subtle)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          </Cartao>
        ))}
      </div>
    </Pagina>
  );
}
