import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  Copy,
  CreditCard,
  FileDown,
  Handshake,
  Link2,
  Percent,
  Plus,
  QrCode,
  Receipt,
  TrendingDown,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { PaymentMethod } from '@veyra/core';
import {
  Abas,
  AreaTexto,
  Botao,
  BotaoIcone,
  Campo,
  Cartao,
  CartaoCabecalho,
  CartaoCorpo,
  Entrada,
  Modal,
  Progresso,
  Segmentado,
  Selo,
  useAvisos,
} from '../components';
import { GraficoArea, GraficoBarras, Indicador, formatarMoeda, formatarNumero, formatarPercentual } from '../components/Charts';
import { Pagina, formatarData, tempoRelativo } from './Pagina';
import { useSessao } from '../app/sessao';
import { ROTULO_METODO } from '../app/rotulos';
import {
  AFILIADOS,
  COMISSOES,
  CONTAS_PAGAR,
  CONTRATOS,
  FATURAS,
  FLUXO_CAIXA,
  REGRAS_COMISSAO,
  clientePorId,
  produtoPorId,
} from '../data/base';
import {
  estornarPagamento,
  pagamentosDaFatura,
  registrarPagamento,
  saldoDaFatura,
  totalRecebido,
} from '../data/acoes';
import { CabecalhoDocumento, DocumentoImpresso, useImpressao } from './Impressao';

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
  const [faturaAberta, setFaturaAberta] = useState<string | null>(null);
  const [contaAberta, setContaAberta] = useState<string | null>(null);

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
      subtitulo="Clique em qualquer linha para ver o detalhe e registrar o recebimento — de uma vez ou em partes, por forma de pagamento."
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
                    const recebido = totalRecebido(fatura.id);
                    const parcial = recebido > 0 && recebido < fatura.valor;
                    return (
                      <tr key={fatura.id} onClick={() => setFaturaAberta(fatura.id)} style={{ cursor: 'pointer' }}>
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
                        <td className="vy-tabela__numero vy-numeric">
                          {formatarMoeda(fatura.valor)}
                          {/* Recebimento parcial precisa aparecer na lista: sem
                              isso, "vencido" some com a informação de que já
                              entrou metade do dinheiro. */}
                          {parcial && (
                            <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--success)' }}>
                              {formatarMoeda(recebido)} recebido
                            </span>
                          )}
                        </td>
                        <td>
                          <Selo tom={fatura.status === 'pago' ? 'sucesso' : fatura.status === 'vencido' ? 'perigo' : 'atencao'}>
                            {fatura.status}
                          </Selo>
                          {parcial && <div style={{ marginTop: 3 }}><Selo tom="info">parcial</Selo></div>}
                        </td>
                        <td>
                          {fatura.linkPagamento && (
                            <Botao
                              variante="fantasma"
                              tamanho="pequeno"
                              icone={Copy}
                              onClick={(e) => {
                                e.stopPropagation();
                                avisar({ tom: 'info', titulo: 'Link copiado', texto: fatura.linkPagamento });
                              }}
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
                    <tr key={conta.id} onClick={() => setContaAberta(conta.id)} style={{ cursor: 'pointer' }}>
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

      <ModalFatura faturaId={faturaAberta} aoFechar={() => setFaturaAberta(null)} />
      <ModalContaPagar contaId={contaAberta} aoFechar={() => setContaAberta(null)} />

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
   Detalhe da fatura e registro de recebimento
   ========================================================= */

/**
 * A fatura fecha quando a soma dos recebimentos alcança o valor — não
 * quando alguém marca "pago". A diferença aparece aqui: dá para receber
 * R$ 900 em PIX hoje e o resto em boleto na semana que vem, e a fatura
 * continua em aberto pelo saldo, com a régua de cobrança trabalhando
 * pelo que falta.
 */
function ModalFatura({ faturaId, aoFechar }: { faturaId: string | null; aoFechar: () => void }) {
  const { usuario, pode, invalidar, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [metodo, setMetodo] = useState<PaymentMethod>('pix');
  const [valor, setValor] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [alvo, setAlvo] = useState<string | null>(null);

  const fatura = FATURAS.find((f) => f.id === faturaId);

  const recebido = fatura ? totalRecebido(fatura.id) : 0;
  const saldo = fatura ? saldoDaFatura(fatura.id) : 0;
  const historico = fatura ? pagamentosDaFatura(fatura.id) : [];

  /* Ao abrir, o campo já vem com o saldo: o caso comum é quitar tudo, e
     quem for receber em partes edita o número. */
  if (faturaId && faturaId !== alvo) {
    setAlvo(faturaId);
    setValor(saldo > 0 ? saldo.toFixed(2).replace('.', ',') : '');
    setReferencia('');
    setObservacao('');
    setErro('');
    setMetodo(fatura?.metodo ?? 'pix');
  }
  if (!faturaId && alvo !== null) setAlvo(null);

  if (!fatura) return null;

  const percentual = (recebido / fatura.valor) * 100;
  const quitada = saldo <= 0;

  function lancar(quantia: number) {
    if (!fatura) return;
    if (!pode('financeiro.editar')) {
      avisar({ tom: 'perigo', titulo: 'Sem permissão', texto: 'Seu papel não permite dar baixa em faturas.' });
      return;
    }
    if (!Number.isFinite(quantia) || quantia <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }
    if (quantia - saldo > 0.009) {
      setErro(`O valor excede o saldo de ${formatarMoeda(saldo)}. Para receber a mais, gere outra cobrança.`);
      return;
    }

    registrarPagamento({
      invoiceId: fatura.id,
      metodo,
      valor: quantia,
      referenciaExterna: referencia || undefined,
      observacao: observacao || undefined,
      registradoPor: usuario.nome,
    });
    invalidar();

    const restante = saldoDaFatura(fatura.id);
    setValor(restante > 0 ? restante.toFixed(2).replace('.', ',') : '');
    setReferencia('');
    setObservacao('');
    setErro('');

    avisar({
      tom: 'sucesso',
      titulo: restante > 0 ? 'Recebimento parcial registrado' : 'Fatura quitada',
      texto:
        restante > 0
          ? `${formatarMoeda(quantia)} por ${ROTULO_METODO[metodo]}. Restam ${formatarMoeda(restante)}.`
          : `${formatarMoeda(quantia)} por ${ROTULO_METODO[metodo]}. Nada mais em aberto.`,
    });
  }

  function estornar(pagamentoId: string) {
    estornarPagamento(pagamentoId);
    invalidar();
    avisar({ tom: 'atencao', titulo: 'Recebimento estornado', texto: 'A fatura voltou a considerar o saldo em aberto.' });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura={620}
      titulo={`Fatura ${fatura.numero}`}
      descricao={`${clientePorId(fatura.clienteId)?.nome} · vence ${formatarData(fatura.vencimento)}`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          {!quitada && pode('financeiro.editar') && (
            <>
              <Botao
                variante="secundario"
                onClick={() => lancar(Number(String(valor).replace(/\./g, '').replace(',', '.')))}
              >
                Registrar valor informado
              </Botao>
              <Botao variante="primario" icone={Check} onClick={() => lancar(saldo)}>
                Quitar {formatarMoeda(saldo)}
              </Botao>
            </>
          )}
        </>
      }
    >
      <div className="vy-stack" style={{ gap: 'var(--space-5)' }} key={versaoDados}>
        <div>
          <div className="vy-row-between" style={{ marginBottom: 6 }}>
            <span className="vy-eyebrow">{fatura.descricao}</span>
            <Selo tom={fatura.status === 'pago' ? 'sucesso' : fatura.status === 'vencido' ? 'perigo' : 'atencao'}>
              {fatura.status}
            </Selo>
          </div>
          <Progresso valor={percentual} cor={quitada ? 'var(--success)' : undefined} />
          <div className="vy-row-between" style={{ marginTop: 8 }}>
            {(
              [
                ['Valor da fatura', formatarMoeda(fatura.valor)],
                ['Já recebido', formatarMoeda(recebido)],
                ['Saldo em aberto', formatarMoeda(saldo)],
              ] as [string, string][]
            ).map(([rotulo, v], i) => (
              <div key={rotulo} style={{ textAlign: i === 2 ? 'right' : i === 1 ? 'center' : 'left' }}>
                <span className="vy-eyebrow" style={{ display: 'block' }}>
                  {rotulo}
                </span>
                <strong
                  className="vy-numeric"
                  style={{
                    fontSize: 'var(--text-md)',
                    color: i === 2 && saldo > 0 ? 'var(--warning)' : i === 1 ? 'var(--success)' : 'var(--text-strong)',
                  }}
                >
                  {v}
                </strong>
              </div>
            ))}
          </div>
        </div>

        {!quitada && pode('financeiro.editar') && (
          <Cartao preenchido style={{ background: 'var(--surface-sunken)' }}>
            <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
              Registrar recebimento
            </div>

            {/* Um botão por forma de pagamento em vez de uma lista suspensa:
                a escolha é sempre entre cinco opções e o alvo maior acerta
                mais rápido em quem lança dezenas por dia. */}
            <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              {(['pix', 'boleto', 'cartao', 'transferencia', 'link'] as PaymentMethod[]).map((m) => {
                const Icone = ICONE_METODO[m];
                const ativo = m === metodo;
                return (
                  <button
                    key={m}
                    onClick={() => setMetodo(m)}
                    aria-pressed={ativo}
                    className="vy-row"
                    style={{
                      gap: 6,
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${ativo ? 'var(--vy-cyan)' : 'var(--border-default)'}`,
                      background: ativo ? 'var(--vy-gradient-soft)' : 'transparent',
                      color: ativo ? 'var(--text-strong)' : 'var(--text-muted)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                    }}
                  >
                    <Icone size={14} />
                    {ROTULO_METODO[m]}
                  </button>
                );
              })}
            </div>

            <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <Campo rotulo="Valor recebido (R$)" erro={erro}>
                <Entrada
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal"
                  invalido={!!erro}
                />
              </Campo>
              <Campo rotulo="Identificador no provedor">
                <Entrada
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="E18236120260827, linha digitável…"
                />
              </Campo>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <Campo rotulo="Observação">
                <AreaTexto
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Cliente pediu para dividir em duas entradas."
                  style={{ minHeight: 64 }}
                />
              </Campo>
            </div>

            <div className="vy-row vy-wrap" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', alignSelf: 'center' }}>
                Atalhos:
              </span>
              {[
                ['Metade', saldo / 2],
                ['Saldo total', saldo],
              ].map(([rotulo, quantia]) => (
                <Botao
                  key={String(rotulo)}
                  variante="fantasma"
                  tamanho="pequeno"
                  onClick={() => setValor((Math.round(Number(quantia) * 100) / 100).toFixed(2).replace('.', ','))}
                >
                  {rotulo} · {formatarMoeda(Number(quantia))}
                </Botao>
              ))}
            </div>
          </Cartao>
        )}

        <div>
          <div className="vy-eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
            Recebimentos lançados ({historico.length})
          </div>
          {historico.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-subtle)' }}>
              Nenhum recebimento ainda. A fatura segue integralmente em aberto.
            </p>
          ) : (
            <ul className="vy-stack" style={{ gap: 'var(--space-2)' }}>
              {historico.map((pagamento) => {
                const Icone = ICONE_METODO[pagamento.metodo];
                return (
                  <li
                    key={pagamento.id}
                    className="vy-row"
                    style={{
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <Icone size={16} color="var(--vy-cyan)" style={{ flexShrink: 0 }} />
                    <div className="vy-grow" style={{ minWidth: 0 }}>
                      <div className="vy-row-between" style={{ gap: 'var(--space-3)' }}>
                        <strong className="vy-numeric" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                          {formatarMoeda(pagamento.valor)}
                        </strong>
                        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                          {tempoRelativo(pagamento.recebidoEm)}
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)', marginTop: 2 }}>
                        {ROTULO_METODO[pagamento.metodo]} · {pagamento.registradoPor}
                        {pagamento.referenciaExterna && ` · ${pagamento.referenciaExterna}`}
                      </div>
                      {pagamento.observacao && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                          {pagamento.observacao}
                        </div>
                      )}
                    </div>
                    {pode('financeiro.cancelar') && (
                      <BotaoIcone icone={Undo2} rotulo="Estornar recebimento" onClick={() => estornar(pagamento.id)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ModalContaPagar({ contaId, aoFechar }: { contaId: string | null; aoFechar: () => void }) {
  const { pode, invalidar } = useSessao();
  const { avisar } = useAvisos();
  const conta = CONTAS_PAGAR.find((c) => c.id === contaId);
  if (!conta) return null;

  function pagar() {
    if (!conta) return;
    conta.status = 'pago';
    conta.pagoEm = new Date().toISOString();
    invalidar();
    aoFechar();
    avisar({ tom: 'sucesso', titulo: 'Conta baixada', texto: `${conta.fornecedor} · ${formatarMoeda(conta.valor)}` });
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura={480}
      titulo={conta.fornecedor}
      descricao={conta.descricao}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          {conta.status !== 'pago' && pode('financeiro.editar') && (
            <Botao variante="primario" icone={Check} onClick={pagar}>
              Marcar como paga
            </Botao>
          )}
        </>
      }
    >
      <dl className="vy-stack" style={{ gap: 'var(--space-3)' }}>
        {(
          [
            ['Categoria', conta.categoria],
            ['Valor', formatarMoeda(conta.valor)],
            ['Vencimento', `${formatarData(conta.vencimento)} · ${tempoRelativo(conta.vencimento)}`],
            ['Situação', conta.status],
            ['Pago em', conta.pagoEm ? formatarData(conta.pagoEm) : '—'],
          ] as [string, string][]
        ).map(([rotulo, v]) => (
          <div key={rotulo} className="vy-row-between" style={{ alignItems: 'baseline', gap: 'var(--space-4)' }}>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{rotulo}</dt>
            <dd style={{ fontSize: 'var(--text-sm)', color: 'var(--text-default)', textAlign: 'right' }}>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/* =========================================================
   Comissões
   ========================================================= */

export function Comissoes() {
  const { pode, versaoDados } = useSessao();
  const { avisar } = useAvisos();
  const [visao, setVisao] = useState<'lancamentos' | 'regras'>('lancamentos');
  const [beneficiario, setBeneficiario] = useState<string | null>(null);

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
      subtitulo="A comissão sai do contrato, não de planilha. Clique no nome para abrir o extrato detalhado e exportá-lo."
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
                    <td>
                      <button
                        onClick={() => setBeneficiario(comissao.beneficiarioNome)}
                        style={{
                          color: 'var(--text-strong)',
                          fontWeight: 600,
                          textAlign: 'left',
                          textDecoration: 'underline',
                          textDecorationColor: 'var(--border-strong)',
                          textUnderlineOffset: 3,
                        }}
                        title="Ver extrato detalhado"
                      >
                        {comissao.beneficiarioNome}
                      </button>
                    </td>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            avisar({
                              tom: 'sucesso',
                              titulo: 'Comissão aprovada',
                              texto: `${comissao.beneficiarioNome} · ${formatarMoeda(comissao.valor)}`,
                            });
                          }}
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

      <ExtratoBeneficiario nome={beneficiario} aoFechar={() => setBeneficiario(null)} />
    </Pagina>
  );
}

/**
 * Extrato do beneficiário
 *
 * Um vendedor que discute a própria comissão precisa ver contrato por
 * contrato: qual venda, qual produto, qual base, qual regra e quanto
 * saiu. Um total agregado não encerra a conversa — o detalhe encerra.
 *
 * O documento sai pela caixa de impressão do navegador, com destino
 * "Salvar como PDF". É o que permite anexar num e-mail sem a plataforma
 * carregar uma biblioteca de PDF só para isso.
 */
function ExtratoBeneficiario({ nome, aoFechar }: { nome: string | null; aoFechar: () => void }) {
  const { usuario } = useSessao();
  const { avisar } = useAvisos();
  const { imprimir, preparando } = useImpressao();

  const linhas = useMemo(
    () => (nome ? COMISSOES.filter((c) => c.beneficiarioNome === nome) : []),
    [nome],
  );

  if (!nome) return null;

  const total = linhas.reduce((s, c) => s + c.valor, 0);
  const paga = linhas.filter((c) => c.status === 'paga').reduce((s, c) => s + c.valor, 0);
  const aberta = linhas
    .filter((c) => c.status === 'pendente' || c.status === 'aprovada')
    .reduce((s, c) => s + c.valor, 0);
  const estornada = linhas.filter((c) => c.status === 'estornada').reduce((s, c) => s + c.valor, 0);
  const baseTotal = linhas.reduce((s, c) => s + c.baseCalculo, 0);

  const detalhe = linhas.map((comissao) => {
    const contrato = CONTRATOS.find((ct) => ct.id === comissao.contratoId);
    return {
      comissao,
      contrato,
      cliente: contrato ? clientePorId(contrato.clienteId)?.nome : undefined,
      produto: contrato ? produtoPorId(contrato.produtoId)?.nome : undefined,
      regra: REGRAS_COMISSAO.find((r) => r.id === comissao.regraId)?.nome,
    };
  });

  async function exportar() {
    const ok = await imprimir();
    if (!ok) {
      avisar({
        tom: 'atencao',
        titulo: 'Exportação bloqueada pelo navegador',
        texto: 'Abra a plataforma em uma aba própria e tente de novo.',
      });
    }
  }

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        largura={760}
        titulo={`Extrato de comissões — ${nome}`}
        descricao={`${linhas.length} lançamentos sobre ${formatarMoeda(baseTotal, true)} em contratos`}
        rodape={
          <>
            <Botao variante="fantasma" onClick={aoFechar}>
              Fechar
            </Botao>
            <Botao variante="primario" icone={FileDown} onClick={exportar} carregando={preparando}>
              Exportar PDF
            </Botao>
          </>
        }
      >
        <div className="vy-stack" style={{ gap: 'var(--space-5)' }}>
          <div className="vy-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {(
              [
                ['Total apurado', formatarMoeda(total), 'var(--text-strong)'],
                ['Já pago', formatarMoeda(paga), 'var(--success)'],
                ['Em aberto', formatarMoeda(aberta), 'var(--warning)'],
                ['Estornado', formatarMoeda(estornada), estornada > 0 ? 'var(--danger)' : 'var(--text-subtle)'],
              ] as [string, string, string][]
            ).map(([rotulo, valor, cor]) => (
              <div key={rotulo}>
                <span className="vy-eyebrow" style={{ display: 'block' }}>
                  {rotulo}
                </span>
                <strong className="vy-numeric" style={{ fontSize: 'var(--text-lg)', color: cor }}>
                  {valor}
                </strong>
              </div>
            ))}
          </div>

          <div className="vy-tabela-wrap">
            <table className="vy-tabela" style={{ minWidth: 660 }}>
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente e produto</th>
                  <th>Regra</th>
                  <th>Competência</th>
                  <th className="vy-tabela__numero">Base</th>
                  <th className="vy-tabela__numero">%</th>
                  <th className="vy-tabela__numero">Comissão</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.map(({ comissao, contrato, cliente, produto, regra }) => (
                  <tr key={comissao.id}>
                    <td className="vy-mono" style={{ whiteSpace: 'nowrap' }}>
                      {contrato?.numero ?? comissao.contratoId}
                    </td>
                    <td>
                      <span style={{ display: 'block', color: 'var(--text-strong)', fontWeight: 600 }}>{cliente ?? '—'}</span>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>{produto ?? '—'}</span>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: 200 }}>{regra ?? '—'}</td>
                    <td>{comissao.competencia}</td>
                    <td className="vy-tabela__numero vy-numeric">{formatarMoeda(comissao.baseCalculo, true)}</td>
                    <td className="vy-tabela__numero vy-numeric">
                      {comissao.percentual ? formatarPercentual(comissao.percentual) : '—'}
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Mesmo dado, formatado para o papel. Fica fora da tela até a
          exportação — não é uma segunda montagem do extrato. */}
      <DocumentoImpresso>
        <CabecalhoDocumento
          titulo="Extrato de comissões"
          subtitulo={nome}
          emitidoPor={usuario.nome}
          referencia={`${linhas.length} lançamentos`}
        />

        <div className="vy-impressao__resumo">
          {(
            [
              ['Total apurado', formatarMoeda(total)],
              ['Já pago', formatarMoeda(paga)],
              ['Em aberto', formatarMoeda(aberta)],
              ['Estornado', formatarMoeda(estornada)],
              ['Base dos contratos', formatarMoeda(baseTotal)],
            ] as [string, string][]
          ).map(([rotulo, valor]) => (
            <div key={rotulo}>
              <span className="vy-impressao__rotulo">{rotulo}</span>
              <span className="vy-impressao__valor">{valor}</span>
            </div>
          ))}
        </div>

        <h2>Lançamentos por contrato</h2>
        <table>
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Regra aplicada</th>
              <th>Comp.</th>
              <th className="num">Base</th>
              <th className="num">%</th>
              <th className="num">Comissão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.map(({ comissao, contrato, cliente, produto, regra }) => (
              <tr key={comissao.id}>
                <td>{contrato?.numero ?? comissao.contratoId}</td>
                <td>{cliente ?? '—'}</td>
                <td>{produto ?? '—'}</td>
                <td>{regra ?? '—'}</td>
                <td>{comissao.competencia}</td>
                <td className="num">{formatarMoeda(comissao.baseCalculo)}</td>
                <td className="num">{comissao.percentual ? formatarPercentual(comissao.percentual) : '—'}</td>
                <td className="num">{formatarMoeda(comissao.valor)}</td>
                <td>{comissao.status}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={7} style={{ fontWeight: 700 }}>
                Total
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {formatarMoeda(total)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>

        <div className="vy-impressao__nota">
          Documento gerado pelo VEYRA a partir dos contratos registrados. Os valores refletem as regras de comissão
          vigentes na data de cada venda; lançamentos estornados correspondem a contratos cancelados dentro do prazo de
          carência da administradora.
        </div>
      </DocumentoImpresso>
    </>
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
