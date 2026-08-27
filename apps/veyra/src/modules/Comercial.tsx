import { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Circle,
  Eye,
  FileSignature,
  FileText,
  Link2,
  Package,
  Plus,
  Send,
  Star,
} from 'lucide-react';
import type { Contract, Proposal, Quote } from '@veyra/core';
import { Botao, Cartao, CartaoCabecalho, CartaoCorpo, EstadoVazio, Progresso, Segmentado, Selo, useAvisos } from '../components';
import { Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { CONTRATOS, COTACOES, PRODUTOS, PROPOSTAS, clientePorId, leadPorId, produtoPorId, usuarioPorId } from '../data/base';

/* =========================================================
   Cotações
   O que faz esta tela valer é a comparação lado a lado e o
   rastro do link: saber que o cliente abriu a cotação três
   vezes muda a hora de ligar.
   ========================================================= */

const TOM_COTACAO: Record<Quote['status'], 'neutro' | 'info' | 'sucesso' | 'atencao' | 'perigo'> = {
  rascunho: 'neutro',
  enviada: 'info',
  visualizada: 'atencao',
  aprovada: 'sucesso',
  recusada: 'perigo',
  expirada: 'neutro',
};

export function Cotacoes() {
  const { pode } = useSessao();
  const { avisar } = useAvisos();
  const [aberta, setAberta] = useState<string | null>(COTACOES[0].id);

  const total = COTACOES.reduce((s, c) => s + Math.min(...c.opcoes.map((o) => o.valor)), 0);

  return (
    <Pagina
      titulo="Cotações"
      subtitulo="Opções comparáveis num link só. O cliente abre, compara e você vê o que ele olhou."
      acoes={
        pode('cotacoes.criar') ? (
          <Botao variante="primario" icone={Plus}>
            Nova cotação
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Cotações abertas" valor={formatarNumero(COTACOES.filter((c) => ['enviada', 'visualizada'].includes(c.status)).length)} icone={Calculator} />
        <Indicador rotulo="Valor em cotação" valor={formatarMoeda(total, true)} icone={FileText} />
        <Indicador rotulo="Taxa de visualização" valor={formatarPercentual(75, 0)} delta={11.2} contexto="link aberto após envio" icone={Eye} />
        <Indicador rotulo="Cotação → proposta" valor={formatarPercentual(42, 0)} delta={5.1} contexto="últimos 30 dias" icone={Send} />
      </div>

      <div className="vy-stack">
        {COTACOES.map((cotacao) => (
          <Cartao key={cotacao.id}>
            <CartaoCabecalho
              titulo={
                <span className="vy-row vy-wrap" style={{ gap: 'var(--space-3)' }}>
                  <span className="vy-mono">{cotacao.numero}</span>
                  <Selo tom={TOM_COTACAO[cotacao.status]}>{cotacao.status}</Selo>
                  <Selo tom="neutro">v{cotacao.versao}</Selo>
                </span>
              }
              descricao={
                <>
                  {leadPorId(cotacao.leadId)?.nome ?? '—'} · {usuarioPorId(cotacao.responsavelId)?.nome} · válida até{' '}
                  {formatarData(cotacao.validaAte)}
                  {cotacao.visualizadaEm && ` · visualizada ${tempoRelativo(cotacao.visualizadaEm)}`}
                </>
              }
              acao={
                <span className="vy-row" style={{ gap: 'var(--space-2)' }}>
                  {cotacao.linkPublico && (
                    <Botao
                      variante="fantasma"
                      tamanho="pequeno"
                      icone={Link2}
                      onClick={() => avisar({ tom: 'info', titulo: 'Link copiado', texto: cotacao.linkPublico })}
                    >
                      Link
                    </Botao>
                  )}
                  <Botao variante="secundario" tamanho="pequeno" onClick={() => setAberta(aberta === cotacao.id ? null : cotacao.id)}>
                    {aberta === cotacao.id ? 'Ocultar' : 'Comparar'}
                  </Botao>
                </span>
              }
            />

            {aberta === cotacao.id && (
              <CartaoCorpo>
                <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  {cotacao.opcoes.map((opcao) => (
                    <Cartao key={opcao.id} preenchido destaque={opcao.recomendada} style={{ background: 'var(--surface-sunken)' }}>
                      {opcao.recomendada && (
                        <Selo tom="marca">
                          <Star size={10} /> recomendada
                        </Selo>
                      )}
                      <div style={{ marginTop: opcao.recomendada ? 'var(--space-3)' : 0 }}>
                        <div className="vy-eyebrow">{opcao.fornecedor}</div>
                        <strong style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-strong)', marginTop: 4 }}>
                          {opcao.rotulo}
                        </strong>
                      </div>
                      <div style={{ marginTop: 'var(--space-4)' }}>
                        <span className="vy-numeric" style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-strong)' }}>
                          {formatarMoeda(opcao.valorParcela)}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}> / mês</span>
                        <div className="vy-numeric" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginTop: 2 }}>
                          {opcao.parcelas}× · total {formatarMoeda(opcao.valor, true)}
                        </div>
                      </div>
                      {opcao.destaques.length > 0 && (
                        <ul className="vy-stack" style={{ gap: 5, marginTop: 'var(--space-4)' }}>
                          {opcao.destaques.map((d) => (
                            <li key={d} className="vy-row" style={{ gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              <CheckCircle2 size={12} color="var(--success)" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Cartao>
                  ))}
                </div>
              </CartaoCorpo>
            )}
          </Cartao>
        ))}
      </div>
    </Pagina>
  );
}

/* =========================================================
   Propostas
   Da cotação ao contrato o que trava é documento. Por isso a
   proposta carrega checklist com obrigatório marcado: a barra
   de progresso responde "falta o quê" sem abrir a pasta.
   ========================================================= */

const TOM_PROPOSTA: Record<Proposal['status'], 'neutro' | 'info' | 'sucesso' | 'atencao' | 'perigo'> = {
  rascunho: 'neutro',
  enviada: 'info',
  em_analise: 'info',
  documentacao: 'atencao',
  aprovada: 'sucesso',
  recusada: 'perigo',
  cancelada: 'neutro',
};

export function Propostas() {
  const { pode } = useSessao();
  const [filtro, setFiltro] = useState<'todas' | 'abertas' | 'decididas'>('abertas');

  const filtradas = useMemo(
    () =>
      PROPOSTAS.filter((p) => {
        if (filtro === 'abertas') return !['aprovada', 'recusada', 'cancelada'].includes(p.status);
        if (filtro === 'decididas') return ['aprovada', 'recusada', 'cancelada'].includes(p.status);
        return true;
      }),
    [filtro],
  );

  return (
    <Pagina
      titulo="Propostas"
      subtitulo="Cotação → proposta → documentação → aprovação → contrato. O checklist mostra exatamente onde parou."
      acoes={
        <>
          <Segmentado
            opcoes={[
              { valor: 'abertas' as const, rotulo: 'Abertas' },
              { valor: 'decididas' as const, rotulo: 'Decididas' },
              { valor: 'todas' as const, rotulo: 'Todas' },
            ]}
            valor={filtro}
            aoMudar={setFiltro}
          />
          {pode('propostas.criar') && (
            <Botao variante="primario" icone={Plus}>
              Nova proposta
            </Botao>
          )}
        </>
      }
    >
      {filtradas.length === 0 ? (
        <Cartao>
          <EstadoVazio icone={FileText} titulo="Nenhuma proposta neste recorte" texto="Troque o filtro para ver as propostas já decididas." />
        </Cartao>
      ) : (
        <div className="vy-grid-2">
          {filtradas.map((proposta) => {
            const obrigatorios = proposta.checklist.filter((c) => c.obrigatorio);
            const concluidos = obrigatorios.filter((c) => c.concluido);
            const percentual = obrigatorios.length ? (concluidos.length / obrigatorios.length) * 100 : 100;
            return (
              <Cartao key={proposta.id}>
                <CartaoCabecalho
                  titulo={
                    <span className="vy-row vy-wrap" style={{ gap: 'var(--space-3)' }}>
                      <span className="vy-mono">{proposta.numero}</span>
                      <Selo tom={TOM_PROPOSTA[proposta.status]}>{proposta.status.replace('_', ' ')}</Selo>
                    </span>
                  }
                  descricao={`${clientePorId(proposta.clienteId)?.nome} · ${produtoPorId(proposta.produtoId)?.nome} · ${formatarMoeda(proposta.valor, true)}`}
                />
                <CartaoCorpo>
                  <div className="vy-row-between" style={{ marginBottom: 'var(--space-2)' }}>
                    <span className="vy-eyebrow">Documentação obrigatória</span>
                    <span className="vy-mono vy-muted">
                      {concluidos.length}/{obrigatorios.length}
                    </span>
                  </div>
                  <Progresso valor={percentual} cor={percentual === 100 ? 'var(--success)' : undefined} />

                  <ul className="vy-stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                    {proposta.checklist.map((item) => (
                      <li key={item.id} className="vy-row" style={{ gap: 'var(--space-2)' }}>
                        {item.concluido ? (
                          <CheckCircle2 size={14} color="var(--success)" style={{ flexShrink: 0 }} />
                        ) : (
                          <Circle size={14} color={item.obrigatorio ? 'var(--warning)' : 'var(--text-subtle)'} style={{ flexShrink: 0 }} />
                        )}
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: item.concluido ? 'var(--text-subtle)' : 'var(--text-default)',
                            textDecoration: item.concluido ? 'line-through' : 'none',
                          }}
                        >
                          {item.descricao}
                        </span>
                        {!item.obrigatorio && <Selo tom="neutro">opcional</Selo>}
                      </li>
                    ))}
                  </ul>

                  {proposta.motivoRecusa && (
                    <p
                      style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-3)',
                        background: 'var(--danger-soft)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <strong style={{ color: 'var(--danger)' }}>Motivo da recusa: </strong>
                      {proposta.motivoRecusa}
                    </p>
                  )}
                </CartaoCorpo>
              </Cartao>
            );
          })}
        </div>
      )}
    </Pagina>
  );
}

/* =========================================================
   Contratos
   Um contrato de consórcio, um de seguro e um de plano de saúde
   não têm os mesmos campos. Cota e carta de crédito não existem
   em apólice; franquia não existe em consórcio. O detalhe muda
   por segmento em vez de virar um formulário genérico com
   metade dos campos vazios.
   ========================================================= */

const TOM_CONTRATO: Record<Contract['status'], 'neutro' | 'info' | 'sucesso' | 'atencao' | 'perigo'> = {
  vigente: 'sucesso',
  pendente: 'atencao',
  suspenso: 'atencao',
  cancelado: 'perigo',
  encerrado: 'neutro',
  renovacao: 'info',
};

export function Contratos() {
  const [segmento, setSegmento] = useState<'todos' | 'consorcio' | 'seguro' | 'saude'>('todos');

  const filtrados = useMemo(
    () => CONTRATOS.filter((c) => segmento === 'todos' || c.segmento === segmento),
    [segmento],
  );

  const carteira = CONTRATOS.reduce((s, c) => s + c.valor, 0);
  const renovando = CONTRATOS.filter((c) => c.status === 'renovacao').length;

  return (
    <Pagina
      titulo="Contratos"
      subtitulo="O que foi vendido continua acompanhado: vigência, renovação, contemplação e reajuste."
      acoes={
        <Segmentado
          opcoes={[
            { valor: 'todos' as const, rotulo: 'Todos' },
            { valor: 'consorcio' as const, rotulo: 'Consórcio' },
            { valor: 'seguro' as const, rotulo: 'Seguro' },
            { valor: 'saude' as const, rotulo: 'Saúde' },
          ]}
          valor={segmento}
          aoMudar={setSegmento}
        />
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Carteira sob gestão" valor={formatarMoeda(carteira, true)} icone={FileSignature} />
        <Indicador rotulo="Contratos vigentes" valor={formatarNumero(CONTRATOS.filter((c) => c.status === 'vigente').length)} icone={CheckCircle2} />
        <Indicador rotulo="Em renovação" valor={formatarNumero(renovando)} contexto="próximos 60 dias" icone={Send} />
        <Indicador rotulo="Cotas contempladas" valor={formatarNumero(CONTRATOS.filter((c) => c.consorcio?.contemplado).length)} icone={Star} />
      </div>

      <div className="vy-stack">
        {filtrados.map((contrato) => (
          <Cartao key={contrato.id}>
            <CartaoCabecalho
              titulo={
                <span className="vy-row vy-wrap" style={{ gap: 'var(--space-3)' }}>
                  <span className="vy-mono">{contrato.numero}</span>
                  <Selo tom={TOM_CONTRATO[contrato.status]}>{contrato.status}</Selo>
                  <Selo tom="neutro">{contrato.segmento}</Selo>
                </span>
              }
              descricao={`${clientePorId(contrato.clienteId)?.nome} · ${produtoPorId(contrato.produtoId)?.nome} · ${formatarMoeda(contrato.valor, true)}`}
              acao={
                contrato.renovaEm ? (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <span className="vy-eyebrow" style={{ display: 'block' }}>
                      Renova
                    </span>
                    {tempoRelativo(contrato.renovaEm)}
                  </span>
                ) : undefined
              }
            />
            <CartaoCorpo>
              {contrato.consorcio && <DetalheConsorcio dados={contrato.consorcio} />}
              {contrato.apolice && <DetalheApolice dados={contrato.apolice} />}
              {contrato.saude && <DetalheSaude dados={contrato.saude} />}
            </CartaoCorpo>
          </Cartao>
        ))}
      </div>
    </Pagina>
  );
}

function GradeCampos({ campos }: { campos: [string, string][] }) {
  return (
    <dl className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
      {campos.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt className="vy-eyebrow">{rotulo}</dt>
          <dd className="vy-numeric" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', marginTop: 3 }}>
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetalheConsorcio({ dados }: { dados: NonNullable<Contract['consorcio']> }) {
  return (
    <>
      <GradeCampos
        campos={[
          ['Administradora', dados.administradora],
          ['Grupo / cota', `${dados.grupo} · ${dados.cota}`],
          ['Carta de crédito', formatarMoeda(dados.cartaCredito, true)],
          ['Prazo', `${dados.prazoMeses} meses`],
          ['Parcela', formatarMoeda(dados.parcela)],
          ['Taxa de administração', formatarPercentual(dados.taxaAdministracao)],
          ['Fundo de reserva', formatarPercentual(dados.fundoReserva)],
          ['Lance ofertado', dados.lanceOfertado ? formatarMoeda(dados.lanceOfertado, true) : '—'],
          ['Lance embutido', dados.lanceEmbutido ? formatarMoeda(dados.lanceEmbutido, true) : '—'],
        ]}
      />
      <div style={{ marginTop: 'var(--space-4)' }}>
        {dados.contemplado ? (
          <Selo tom="sucesso">contemplada em {formatarData(dados.contempladoEm)}</Selo>
        ) : (
          <Selo tom="neutro">aguardando contemplação</Selo>
        )}
      </div>
    </>
  );
}

function DetalheApolice({ dados }: { dados: NonNullable<Contract['apolice']> }) {
  return (
    <>
      <GradeCampos
        campos={[
          ['Seguradora', dados.seguradora],
          ['Apólice', dados.apolice],
          ['Ramo', dados.ramo],
          ['Prêmio', formatarMoeda(dados.premio)],
          ['Parcelas', `${dados.parcelas}×`],
          ['Franquia', formatarMoeda(dados.franquia)],
          ['Vigência', `${formatarData(dados.vigenciaInicio)} a ${formatarData(dados.vigenciaFim)}`],
          ['Renovação automática', dados.renovacaoAutomatica ? 'Sim' : 'Não'],
        ]}
      />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
          Coberturas
        </div>
        <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-2)' }}>
          {dados.coberturas.map((c) => (
            <li key={c.nome}>
              <Selo tom="info">
                {c.nome} · {formatarMoeda(c.capital, true)}
              </Selo>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function DetalheSaude({ dados }: { dados: NonNullable<Contract['saude']> }) {
  return (
    <>
      <GradeCampos
        campos={[
          ['Operadora', dados.operadora],
          ['Plano', dados.plano],
          ['Categoria', dados.categoria],
          ['Acomodação', dados.acomodacao],
          ['Titular', dados.titular],
          ['Dependentes', String(dados.dependentes.length)],
          ['Mensalidade', formatarMoeda(dados.mensalidade)],
          ['Carência', `${dados.carenciaDias} dias`],
          ['Reajuste', formatarData(dados.reajusteAniversario)],
        ]}
      />
      {dados.dependentes.length > 0 && (
        <ul className="vy-row vy-wrap" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          {dados.dependentes.map((d) => (
            <li key={d.nome}>
              <Selo tom="neutro">
                {d.nome} · {d.parentesco}
              </Selo>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* =========================================================
   Produtos
   ========================================================= */

export function Produtos() {
  const { pode } = useSessao();

  return (
    <Pagina
      titulo="Produtos"
      subtitulo="O catálogo alimenta cotação, comissão e o que a IA sabe responder sobre cada oferta."
      acoes={
        pode('produtos.criar') ? (
          <Botao variante="primario" icone={Plus}>
            Novo produto
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid-2">
        {PRODUTOS.map((produto) => (
          <Cartao key={produto.id} preenchido>
            <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <div>
                <div className="vy-row" style={{ gap: 'var(--space-2)' }}>
                  <Package size={15} color="var(--text-subtle)" />
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{produto.nome}</strong>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                  {produto.fornecedor} · {produto.categoria}
                </div>
              </div>
              <Selo tom={produto.ativo ? 'sucesso' : 'neutro'}>{produto.ativo ? 'ativo' : 'inativo'}</Selo>
            </div>

            {produto.descricao && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-3)', lineHeight: 'var(--leading-normal)' }}>
                {produto.descricao}
              </p>
            )}

            <div className="vy-row-between" style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
              <span className="vy-eyebrow">Comissão padrão</span>
              <strong className="vy-numeric" style={{ color: 'var(--vy-cyan-300)' }}>
                {formatarPercentual(produto.comissaoPadraoPercentual)}
              </strong>
            </div>
          </Cartao>
        ))}
      </div>
    </Pagina>
  );
}
