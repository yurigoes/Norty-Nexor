import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Copy,
  CreditCard,
  Handshake,
  Link2,
  Percent,
  Plus,
  QrCode,
  Receipt,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import type { PaymentMethod } from '@veyra/core';
import { Abas, Botao, Cartao, CartaoCabecalho, CartaoCorpo, Modal, Progresso, Segmentado, Selo, useAvisos } from '../components';
import { GraficoArea, GraficoBarras, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_METODO } from '../app/rotulos';
import {
  AFILIADOS,
  COMISSOES,
  CONTAS_PAGAR,
  FATURAS,
  FLUXO_CAIXA,
  REGRAS_COMISSAO,
  clientePorId,
} from '../data/base';

const ICONE_METODO: Record<PaymentMethod, typeof QrCode> = {
  pix: QrCode,
  boleto: Receipt,
  cartao: CreditCard,
  link: Link2,
  transferencia: Banknote,
  debito_automatico: Wallet,
};

type AbaFinanceiro = 'receber' | 'pagar' | 'fluxo';

/**
 * Financeiro
 *
 * A cobrança é emitida pela plataforma, mas a plataforma não é um
 * gateway. O provedor é uma peça trocável: a fatura, o vencimento e a
 * baixa vivem aqui; PIX, boleto ou cartão é decisão de configuração.
 * Amarrar o produto a um gateway específico seria hipotecar o roadmap à
 * política comercial de terceiro.
 */
export function Financeiro() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [aba, setAba] = useState<AbaFinanceiro>('receber');
  const [cobrancaAberta, setCobrancaAberta] = useState(false);

  const resumo = useMemo(() => {
    /* O recebido do mês vem do fluxo de caixa — a mesma fonte do
       dashboard. A tabela abaixo lista as faturas recentes, não o mês
       inteiro. */
    const recebido = FLUXO_CAIXA.find((p) => p.mes === 'Ago')?.entradas ?? 0;
    const aReceber = FATURAS.filter((f) => f.status === 'pendente').reduce((s, f) => s + f.valor, 0);
    const vencido = FATURAS.filter((f) => f.status === 'vencido').reduce((s, f) => s + f.valor, 0);
    const aPagar = CONTAS_PAGAR.filter((p) => p.status !== 'pago').reduce((s, p) => s + p.valor, 0);
    const inadimplencia = (vencido / (recebido + aReceber + vencido)) * 100;
    return { recebido, aReceber, vencido, aPagar, inadimplencia };
  }, [versaoDados]);

  return (
    <Pagina
      titulo="Financeiro"
      subtitulo="Cobrança, baixa e fluxo de caixa. O provedor de pagamento é configuração — a régua de cobrança é da plataforma."
      acoes={
        pode('financeiro.criar') ? (
          <Botao variante="primario" icone={Plus} onClick={() => setCobrancaAberta(true)}>
            Nova cobrança
          </Botao>
        ) : undefined
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Recebido no mês" valor={formatarMoeda(resumo.recebido, true)} delta={9.4} icone={ArrowDownLeft} />
        <Indicador rotulo="A receber" valor={formatarMoeda(resumo.aReceber, true)} contexto="dentro do prazo" icone={Wallet} />
        <Indicador rotulo="Vencido" valor={formatarMoeda(resumo.vencido, true)} contexto={`${FATURAS.filter((f) => f.status === 'vencido').length} faturas`} icone={TrendingDown} />
        <Indicador rotulo="Inadimplência" valor={formatarPercentual(resumo.inadimplencia)} delta={-1.8} contexto="sobre o faturado" icone={Percent} />
      </div>

      <Abas
        opcoes={[
          { valor: 'receber' as const, rotulo: 'Contas a receber' },
          { valor: 'pagar' as const, rotulo: 'Contas a pagar' },
          { valor: 'fluxo' as const, rotulo: 'Fluxo de caixa' },
        ]}
        valor={aba}
        aoMudar={setAba}
      />

      <div style={{ marginTop: 'var(--space-5)' }}>
        {aba === 'receber' && (
          <Cartao>
            <div className="vy-tabela-wrap">
              <table className="vy-tabela">
                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Cliente</th>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th>Método</th>
                    <th className="vy-tabela__numero">Valor</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {FATURAS.map((fatura) => {
                    const IconeMetodo = fatura.metodo ? ICONE_METODO[fatura.metodo] : Receipt;
                    return (
                      <tr key={fatura.id}>
                        <td className="vy-mono">{fatura.numero}</td>
                        <td style={{ color: 'var(--text-strong)' }}>{clientePorId(fatura.clienteId)?.nome}</td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{fatura.descricao}</td>
                        <td>
                          <span style={{ color: fatura.status === 'vencido' ? 'var(--danger)' : 'inherit' }}>
                            {formatarData(fatura.vencimento)}
                          </span>
                          <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                            {tempoRelativo(fatura.vencimento)}
                          </span>
                        </td>
                        <td>
                          <span className="vy-row" style={{ gap: 5, fontSize: 'var(--text-xs)' }}>
                            <IconeMetodo size={13} color="var(--text-subtle)" />
                            {fatura.metodo ? ROTULO_METODO[fatura.metodo] : '—'}
                          </span>
                        </td>
                        <td className="vy-tabela__numero vy-numeric">{formatarMoeda(fatura.valor)}</td>
                        <td>
                          <Selo tom={fatura.status === 'pago' ? 'sucesso' : fatura.status === 'vencido' ? 'perigo' : 'atencao'}>
                            {fatura.status}
                          </Selo>
                        </td>
                        <td>
                          {fatura.linkPagamento && (
                            <Botao
                              variante="fantasma"
                              tamanho="pequeno"
                              icone={Copy}
                              onClick={() => avisar({ tom: 'info', titulo: 'Link copiado', texto: fatura.linkPagamento })}
                            >
                              Link
                            </Botao>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}

        {aba === 'pagar' && (
          <Cartao>
            <div className="vy-tabela-wrap">
              <table className="vy-tabela">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th className="vy-tabela__numero">Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTAS_PAGAR.map((conta) => (
                    <tr key={conta.id}>
                      <td style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{conta.fornecedor}</td>
                      <td>
                        <Selo tom="neutro">{conta.categoria}</Selo>
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{conta.descricao}</td>
                      <td>{formatarData(conta.vencimento)}</td>
                      <td className="vy-tabela__numero vy-numeric">{formatarMoeda(conta.valor)}</td>
                      <td>
                        <Selo tom={conta.status === 'pago' ? 'sucesso' : 'atencao'}>{conta.status}</Selo>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        )}

        {aba === 'fluxo' && (
          <div className="vy-stack">
            <Cartao>
              <CartaoCabecalho
                titulo="Entradas, saídas e saldo"
                descricao="Os dois últimos meses são previsão — calculada a partir das parcelas já contratadas, não de tendência."
              />
              <CartaoCorpo>
                <GraficoArea
                  rotulos={FLUXO_CAIXA.map((p) => p.mes)}
                  series={[
                    { nome: 'Entradas', valores: FLUXO_CAIXA.map((p) => p.entradas) },
                    { nome: 'Saídas', valores: FLUXO_CAIXA.map((p) => p.saidas) },
                  ]}
                  formatar={(v) => formatarMoeda(v, true)}
                  altura={240}
                />
              </CartaoCorpo>
            </Cartao>

            <Cartao>
              <CartaoCabecalho titulo="Saldo por mês" descricao="Entradas menos saídas, por competência." />
              <CartaoCorpo>
                <GraficoBarras
                  dados={FLUXO_CAIXA.map((p) => ({
                    rotulo: p.mes,
                    valor: p.saldo,
                    cor: p.previsto ? 'var(--chart-5)' : 'var(--chart-3)',
                  }))}
                  formatar={(v) => formatarMoeda(v, true)}
                  altura={200}
                />
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)', marginTop: 'var(--space-3)' }}>
                  As duas últimas colunas, em azul, são previsão.
                </p>
              </CartaoCorpo>
            </Cartao>
          </div>
        )}
      </div>

      <Modal
        aberto={cobrancaAberta}
        aoFechar={() => setCobrancaAberta(false)}
        titulo="Nova cobrança"
        descricao="O meio de pagamento é escolhido aqui; o provedor é resolvido pela integração ativa."
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setCobrancaAberta(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={() => {
                setCobrancaAberta(false);
                avisar({ tom: 'sucesso', titulo: 'Cobrança emitida', texto: 'Link enviado ao cliente por WhatsApp e e-mail.' });
              }}
            >
              Emitir cobrança
            </Botao>
          </>
        }
      >
        <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {(['pix', 'boleto', 'cartao', 'link'] as PaymentMethod[]).map((metodo) => {
            const Icone = ICONE_METODO[metodo];
            return (
              <Cartao key={metodo} preenchido interativo onClick={() => undefined} style={{ textAlign: 'center' }}>
                <Icone size={22} color="var(--vy-cyan)" style={{ margin: '0 auto var(--space-2)' }} />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{ROTULO_METODO[metodo]}</span>
              </Cartao>
            );
          })}
        </div>
      </Modal>
    </Pagina>
  );
}

/* =========================================================
   Comissões
   ========================================================= */

export function Comissoes() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [visao, setVisao] = useState<'lancamentos' | 'regras'>('lancamentos');

  const totais = useMemo(() => {
    const porStatus = (status: string) => COMISSOES.filter((c) => c.status === status).reduce((s, c) => s + c.valor, 0);
    return {
      pendente: porStatus('pendente'),
      aprovada: porStatus('aprovada'),
      paga: porStatus('paga'),
      estornada: porStatus('estornada'),
    };
  }, [versaoDados]);

  return (
    <Pagina
      titulo="Comissões"
      subtitulo="A comissão sai do contrato, não de planilha. Regra por produto, vendedor, afiliado e supervisor, com recorrência e estorno."
      acoes={
        <Segmentado
          opcoes={[
            { valor: 'lancamentos' as const, rotulo: 'Lançamentos' },
            { valor: 'regras' as const, rotulo: 'Regras' },
          ]}
          valor={visao}
          aoMudar={setVisao}
        />
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Pendente de aprovação" valor={formatarMoeda(totais.pendente, true)} icone={Percent} />
        <Indicador rotulo="Aprovada a pagar" valor={formatarMoeda(totais.aprovada, true)} icone={Wallet} />
        <Indicador rotulo="Paga na competência" valor={formatarMoeda(totais.paga, true)} icone={ArrowUpRight} />
        <Indicador rotulo="Estornada" valor={formatarMoeda(totais.estornada, true)} contexto="contrato cancelado" icone={TrendingDown} />
      </div>

      {visao === 'lancamentos' ? (
        <Cartao>
          <div className="vy-tabela-wrap">
            <table className="vy-tabela">
              <thead>
                <tr>
                  <th>Beneficiário</th>
                  <th>Tipo</th>
                  <th>Contrato</th>
                  <th>Competência</th>
                  <th className="vy-tabela__numero">Base</th>
                  <th className="vy-tabela__numero">%</th>
                  <th className="vy-tabela__numero">Comissão</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {COMISSOES.map((comissao) => (
                  <tr key={comissao.id}>
                    <td style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{comissao.beneficiarioNome}</td>
                    <td>
                      <Selo tom={comissao.beneficiarioTipo === 'afiliado' ? 'marca' : 'neutro'}>{comissao.beneficiarioTipo}</Selo>
                    </td>
                    <td className="vy-mono">{comissao.contratoId}</td>
                    <td>{comissao.competencia}</td>
                    <td className="vy-tabela__numero vy-numeric">{formatarMoeda(comissao.baseCalculo, true)}</td>
                    <td className="vy-tabela__numero vy-numeric">{comissao.percentual ? formatarPercentual(comissao.percentual) : '—'}</td>
                    <td className="vy-tabela__numero vy-numeric" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                      {formatarMoeda(comissao.valor)}
                    </td>
                    <td>
                      <Selo
                        tom={
                          comissao.status === 'paga'
                            ? 'sucesso'
                            : comissao.status === 'aprovada'
                              ? 'info'
                              : comissao.status === 'estornada'
                                ? 'perigo'
                                : 'atencao'
                        }
                      >
                        {comissao.status}
                      </Selo>
                    </td>
                    <td>
                      {comissao.status === 'pendente' && pode('comissoes.aprovar') && (
                        <Botao
                          variante="secundario"
                          tamanho="pequeno"
                          onClick={() => avisar({ tom: 'sucesso', titulo: 'Comissão aprovada', texto: `${comissao.beneficiarioNome} · ${formatarMoeda(comissao.valor)}` })}
                        >
                          Aprovar
                        </Botao>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      ) : (
        <div className="vy-grid-2">
          {REGRAS_COMISSAO.map((regra) => (
            <Cartao key={regra.id} preenchido>
              <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div>
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{regra.nome}</strong>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                    Base {regra.base}
                    {regra.recorrenciaMeses > 1 && ` · ${regra.recorrenciaMeses} meses de recorrência`}
                  </div>
                </div>
                <Selo tom={regra.ativa ? 'sucesso' : 'neutro'}>{regra.ativa ? 'ativa' : 'inativa'}</Selo>
              </div>
              <div className="vy-numeric" style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--vy-cyan-300)', marginTop: 'var(--space-3)' }}>
                {regra.base === 'fixo' ? formatarMoeda(regra.valor) : formatarPercentual(regra.valor)}
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </Pagina>
  );
}

/* =========================================================
   Partners
   ========================================================= */

export function Partners() {
  const { avisar } = useAvisos();
  const totalComissao = AFILIADOS.reduce((s, a) => s + a.comissaoAcumulada, 0);
  const totalLeads = AFILIADOS.reduce((s, a) => s + a.leadsGerados, 0);

  return (
    <Pagina
      titulo="VEYRA Partners"
      subtitulo="Afiliados e revendedores com link próprio, extrato e portal externo — sem acesso à carteira dos outros."
      acoes={
        <Botao variante="primario" icone={Plus}>
          Convidar parceiro
        </Botao>
      }
    >
      <div className="vy-grid" style={{ marginBottom: 'var(--space-5)' }}>
        <Indicador rotulo="Parceiros ativos" valor={formatarNumero(AFILIADOS.filter((a) => a.status === 'ativo').length)} icone={Handshake} />
        <Indicador rotulo="Leads indicados" valor={formatarNumero(totalLeads)} delta={18.2} icone={ArrowDownLeft} />
        <Indicador rotulo="Vendas por indicação" valor={formatarNumero(AFILIADOS.reduce((s, a) => s + a.vendas, 0))} icone={Percent} />
        <Indicador rotulo="Comissão acumulada" valor={formatarMoeda(totalComissao, true)} icone={Wallet} />
      </div>

      <div className="vy-grid-2">
        {AFILIADOS.map((afiliado) => {
          const conversao = afiliado.leadsGerados ? (afiliado.vendas / afiliado.leadsGerados) * 100 : 0;
          return (
            <Cartao key={afiliado.id} preenchido>
              <div className="vy-row-between" style={{ alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div>
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>{afiliado.nome}</strong>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{afiliado.email}</div>
                </div>
                <Selo tom={afiliado.status === 'ativo' ? 'sucesso' : afiliado.status === 'pendente' ? 'atencao' : 'perigo'}>
                  {afiliado.status}
                </Selo>
              </div>

              <button
                className="vy-row"
                style={{
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  width: '100%',
                }}
                onClick={() => avisar({ tom: 'info', titulo: 'Link copiado', texto: afiliado.linkExclusivo })}
              >
                <Link2 size={13} color="var(--text-subtle)" />
                <span className="vy-mono vy-grow" style={{ textAlign: 'left' }}>
                  {afiliado.linkExclusivo}
                </span>
                <Copy size={13} color="var(--text-subtle)" />
              </button>

              <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                {(
                  [
                    ['Leads', formatarNumero(afiliado.leadsGerados)],
                    ['Vendas', formatarNumero(afiliado.vendas)],
                    ['Saldo', formatarMoeda(afiliado.saldoDisponivel, true)],
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

              <div style={{ marginTop: 'var(--space-4)' }}>
                <div className="vy-row-between" style={{ marginBottom: 5 }}>
                  <span className="vy-eyebrow">Conversão da indicação</span>
                  <span className="vy-mono vy-muted">{formatarPercentual(conversao)}</span>
                </div>
                <Progresso valor={conversao * 5} />
              </div>
            </Cartao>
          );
        })}
      </div>
    </Pagina>
  );
}
