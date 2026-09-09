import { useCallback, useEffect, useState } from 'react';
import type {
  ContratoView,
  EscreverContratoRequest,
  FornecedorView,
  OrcamentoView,
  RelatorioDeCusto,
} from '@norty-desk/shared';
import {
  BILLING_PERIODS,
  CONTRACT_KINDS,
  ROTULO_COBRANCA,
  ROTULO_CONTRATO,
  ROTULO_CUSTO,
  custoMensal,
  diasParaVencer,
  emReais,
  precisaAvisar,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarContrato,
  criarFornecedor,
  criarOrcamento,
  editarContrato,
  listarContratos,
  listarFornecedores,
  listarOrcamentos,
  relatorioDeCusto,
} from '../../api/contratos';
import { dataCurta, dataSimples } from '../../lib/formato';

type Aba = 'CONTRATOS' | 'FORNECEDORES' | 'ORCAMENTO';

/**
 * Contratos, fornecedores e orçamento.
 *
 * A coluna que justifica a tela é "vence em": no GLPI a antecedência é
 * coluna e nada a lê — o contrato vence e alguém descobre pela fatura.
 * Aqui o que está dentro da janela de aviso aparece marcado, e a
 * renovação automática **não** tira o aviso: ali ele é a última chance
 * de não renovar.
 */
export function Contratos() {
  const [aba, setAba] = useState<Aba>('CONTRATOS');

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Contratos e custo</h2>
          <p>
            O que a organização paga, com quem, até quando — e quanto custa atender.
          </p>
        </div>
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        {(
          [
            ['CONTRATOS', 'Contratos'],
            ['FORNECEDORES', 'Fornecedores'],
            ['ORCAMENTO', 'Orçamento e custo'],
          ] as [Aba, string][]
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            className={`btn -sm ${aba === chave ? '-primario' : '-secundario'}`}
            onClick={() => setAba(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'CONTRATOS' ? <ListaDeContratos /> : null}
      {aba === 'FORNECEDORES' ? <ListaDeFornecedores /> : null}
      {aba === 'ORCAMENTO' ? <OrcamentoECusto /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------

function ListaDeContratos() {
  const [contratos, setContratos] = useState<ContratoView[] | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorView[]>([]);
  const [emEdicao, setEmEdicao] = useState<ContratoView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setContratos(await listarContratos({ incluirInativos: true }));
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os contratos.'));
    void listarFornecedores()
      .then(setFornecedores)
      .catch(() => undefined);
  }, [recarregar]);

  if (!contratos) return <div className="sk sk-bloco" />;

  const avisando = contratos.filter((c) => precisaAvisar(c)).length;

  return (
    <div className="pilha">
      <div className="linha-entre">
        <span className="campo-ajuda">
          {avisando > 0
            ? `${avisando} contrato(s) dentro da janela de aviso.`
            : 'Nenhum contrato perto do vencimento.'}
        </span>
        <button type="button" className="btn -primario -sm" onClick={() => setEmEdicao('novo')}>
          Novo contrato
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {contratos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum contrato</h3>
          <p>
            Suporte, licença, locação: o que se paga todo mês e vence sem avisar cabe aqui — com
            a antecedência de aviso que o GLPI guarda e não lê.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Fornecedor</th>
                  <th>Cobrança</th>
                  <th className="-num">Por mês</th>
                  <th>Vence</th>
                  <th className="-num">Ativos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => {
                  const mensal = custoMensal(c);
                  const dias = diasParaVencer(c.endsAt);
                  return (
                    <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.55 }}>
                      <td className="tabela-titulo-celula">
                        {c.name}
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          <span className="mono">{c.number}</span> · {ROTULO_CONTRATO[c.kind]}
                          {c.autoRenew ? ' · renova sozinho' : ''}
                        </span>
                      </td>
                      <td>{c.supplier?.name ?? '—'}</td>
                      <td>
                        {ROTULO_COBRANCA[c.billingPeriod]}
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          {emReais(c.value)}
                        </span>
                      </td>
                      <td className="-num">{mensal === null ? '—' : emReais(mensal)}</td>
                      <td>
                        {dias === null ? (
                          <span className="campo-ajuda">indeterminado</span>
                        ) : (
                          <span className={`selo ${seloDoVencimento(c)}`}>
                            {dias < 0 ? `venceu há ${-dias}d` : `em ${dias}d`}
                          </span>
                        )}
                        {c.endsAt ? (
                          <span className="campo-ajuda" style={{ display: 'block' }}>
                            {dataSimples(c.endsAt)}
                          </span>
                        ) : null}
                      </td>
                      <td className="-num">{c.assetCount}</td>
                      <td className="-num">
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          onClick={() => setEmEdicao(c)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {emEdicao ? (
        <FormularioDeContrato
          contrato={emEdicao === 'novo' ? null : emEdicao}
          fornecedores={fornecedores}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') await criarContrato(dados);
            else await editarContrato(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function seloDoVencimento(c: ContratoView): string {
  const dias = diasParaVencer(c.endsAt);
  if (dias === null) return '-neutro';
  if (dias < 0) return '-erro';
  return precisaAvisar(c) ? '-aviso' : '-sucesso';
}

function FormularioDeContrato({
  contrato,
  fornecedores,
  aoFechar,
  aoSalvar,
}: {
  contrato: ContratoView | null;
  fornecedores: FornecedorView[];
  aoFechar: () => void;
  aoSalvar: (dados: EscreverContratoRequest) => Promise<void>;
}) {
  const [campos, setCampos] = useState({
    number: contrato?.number ?? '',
    name: contrato?.name ?? '',
    kind: contrato?.kind ?? 'SERVICO',
    supplierId: contrato?.supplier?.id ?? '',
    startsAt: (contrato?.startsAt ?? new Date().toISOString()).slice(0, 10),
    endsAt: contrato?.endsAt?.slice(0, 10) ?? '',
    noticeDays: contrato?.noticeDays ?? 30,
    autoRenew: contrato?.autoRenew ?? false,
    billingPeriod: contrato?.billingPeriod ?? 'MENSAL',
    value: contrato?.value ?? 0,
    isActive: contrato?.isActive ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const definir = (mudanca: Partial<typeof campos>) =>
    setCampos((atual) => ({ ...atual, ...mudanca }));

  const mensal = custoMensal({ billingPeriod: campos.billingPeriod, value: campos.value });

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={contrato ? 'Editar contrato' : 'Novo contrato'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{contrato ? 'Editar contrato' : 'Novo contrato'}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              ...campos,
              supplierId: campos.supplierId || null,
              endsAt: campos.endsAt ? new Date(campos.endsAt).toISOString() : null,
              startsAt: new Date(campos.startsAt).toISOString(),
              value: Number(campos.value),
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="numero-contrato">
                  Número
                </label>
                <input
                  id="numero-contrato"
                  className="input mono"
                  required
                  value={campos.number}
                  onChange={(e) => definir({ number: e.target.value })}
                />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="nome-contrato">
                  Nome
                </label>
                <input
                  id="nome-contrato"
                  className="input"
                  required
                  minLength={2}
                  value={campos.name}
                  onChange={(e) => definir({ name: e.target.value })}
                />
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-contrato">
                  Tipo
                </label>
                <select
                  id="tipo-contrato"
                  className="select"
                  value={campos.kind}
                  onChange={(e) => definir({ kind: e.target.value as ContratoView['kind'] })}
                >
                  {CONTRACT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_CONTRATO[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fornecedor-contrato">
                  Fornecedor
                </label>
                <select
                  id="fornecedor-contrato"
                  className="select"
                  value={campos.supplierId}
                  onChange={(e) => definir({ supplierId: e.target.value })}
                >
                  <option value="">Sem fornecedor</option>
                  {fornecedores.map((fo) => (
                    <option key={fo.id} value={fo.id}>
                      {fo.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="inicio-contrato">
                  Início
                </label>
                <input
                  id="inicio-contrato"
                  className="input"
                  type="date"
                  required
                  value={campos.startsAt}
                  onChange={(e) => definir({ startsAt: e.target.value })}
                />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fim-contrato">
                  Fim
                </label>
                <input
                  id="fim-contrato"
                  className="input"
                  type="date"
                  value={campos.endsAt}
                  onChange={(e) => definir({ endsAt: e.target.value })}
                />
                <span className="campo-ajuda">Em branco é prazo indeterminado.</span>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="cobranca-contrato">
                  Cobrança
                </label>
                <select
                  id="cobranca-contrato"
                  className="select"
                  value={campos.billingPeriod}
                  onChange={(e) =>
                    definir({ billingPeriod: e.target.value as ContratoView['billingPeriod'] })
                  }
                >
                  {BILLING_PERIODS.map((b) => (
                    <option key={b} value={b}>
                      {ROTULO_COBRANCA[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="valor-contrato">
                  Valor de cada cobrança
                </label>
                <input
                  id="valor-contrato"
                  className="input"
                  type="number"
                  step="any"
                  min={0}
                  value={campos.value}
                  onChange={(e) => definir({ value: Number(e.target.value) })}
                />
                <span className="campo-ajuda">
                  {mensal === null
                    ? 'Pagamento único não tem custo mensal.'
                    : `Equivale a ${emReais(mensal)} por mês.`}
                </span>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="aviso-contrato">
                  Avisar com (dias)
                </label>
                <input
                  id="aviso-contrato"
                  className="input"
                  type="number"
                  min={0}
                  max={365}
                  value={campos.noticeDays}
                  onChange={(e) => definir({ noticeDays: Number(e.target.value) })}
                />
              </div>
              <div className="campo pilha-sm">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={campos.autoRenew}
                    onChange={(e) => definir({ autoRenew: e.target.checked })}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>Renova sozinho</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={campos.isActive}
                    onChange={(e) => definir({ isActive: e.target.checked })}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>Ativo</span>
                </label>
              </div>
            </div>

            {campos.autoRenew ? (
              <div className="alerta-bloco -info">
                <span aria-hidden="true">↻</span>
                <span>
                  Renovação automática não dispensa o aviso — ali ele é a última chance de
                  <strong> não</strong> renovar.
                </span>
              </div>
            ) : null}
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function ListaDeFornecedores() {
  const [fornecedores, setFornecedores] = useState<FornecedorView[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setFornecedores(await listarFornecedores());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setFornecedores([]));
  }, [recarregar]);

  return (
    <div className="pilha">
      <form
        className="linha"
        style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          void criarFornecedor({ name, email: email || null, phone: phone || null })
            .then(() => {
              setName('');
              setEmail('');
              setPhone('');
              return recarregar();
            })
            .catch((e2: unknown) =>
              setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
            );
        }}
      >
        <label className="so-leitor" htmlFor="nome-fornecedor">
          Nome do fornecedor
        </label>
        <input
          id="nome-fornecedor"
          className="input"
          style={{ flex: '1 1 220px' }}
          required
          minLength={2}
          placeholder="Nome do fornecedor"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="so-leitor" htmlFor="email-fornecedor">
          E-mail
        </label>
        <input
          id="email-fornecedor"
          className="input"
          style={{ flex: '1 1 200px' }}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="so-leitor" htmlFor="telefone-fornecedor">
          Telefone
        </label>
        <input
          id="telefone-fornecedor"
          className="input"
          style={{ width: 160 }}
          placeholder="Telefone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" className="btn -primario -sm">
          Adicionar
        </button>
      </form>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!fornecedores ? (
        <div className="sk sk-bloco" />
      ) : fornecedores.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum fornecedor</h3>
          <p>Quem vende o suporte, a licença e a peça.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th className="-num">Contratos</th>
              </tr>
            </thead>
            <tbody>
              {fornecedores.map((f) => (
                <tr key={f.id}>
                  <td className="tabela-titulo-celula">{f.name}</td>
                  <td>{f.email ?? '—'}</td>
                  <td>{f.phone ?? '—'}</td>
                  <td className="-num">{f.contractCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function OrcamentoECusto() {
  const [orcamentos, setOrcamentos] = useState<OrcamentoView[] | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDeCusto | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [o, r] = await Promise.all([listarOrcamentos(), relatorioDeCusto()]);
    setOrcamentos(o);
    setRelatorio(r);
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar.'));
  }, [recarregar]);

  return (
    <div className="pilha">
      <div className="linha-entre">
        <span className="campo-ajuda">
          {relatorio
            ? `${emReais(relatorio.total)} lançados desde ${dataCurta(relatorio.de)}.`
            : ' '}
        </span>
        <button type="button" className="btn -primario -sm" onClick={() => setNovo(true)}>
          Novo orçamento
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!orcamentos ? (
        <div className="sk sk-bloco" />
      ) : orcamentos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum orçamento</h3>
          <p>Sem orçamento, o custo do chamado existe mas não é comparado com nada.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela">
            <thead>
              <tr>
                <th>Orçamento</th>
                <th>Vigência</th>
                <th className="-num">Valor</th>
                <th className="-num">Gasto</th>
                <th className="-num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {orcamentos.map((o) => (
                <tr key={o.id}>
                  <td className="tabela-titulo-celula">{o.name}</td>
                  <td className="num">
                    {dataSimples(o.startsAt)} → {dataSimples(o.endsAt)}
                  </td>
                  <td className="-num">{emReais(o.value)}</td>
                  <td className="-num">{emReais(o.spent)}</td>
                  <td className="-num">
                    <span className={o.spent > o.value ? 'selo -erro' : ''}>
                      {emReais(o.value - o.spent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {relatorio && relatorio.porCategoria.length > 0 ? (
        <section className="card">
          <div className="card-topo">
            <div>
              <h3 className="card-titulo">Quanto custou atender</h3>
              <p className="card-sub">
                {dataCurta(relatorio.de)} a {dataCurta(relatorio.ate)} · {emReais(relatorio.total)}
              </p>
            </div>
          </div>
          <div className="card-corpo pilha-sm">
            {relatorio.porCategoria.map((linha) => (
              <div key={linha.chave} className="linha-entre">
                <span>
                  {linha.rotulo}
                  <span className="campo-ajuda" style={{ display: 'block' }}>
                    {linha.chamados} chamado(s)
                  </span>
                </span>
                <span className="num">{emReais(linha.total)}</span>
              </div>
            ))}

            <div className="divisor-texto">
              <span>Por tipo</span>
            </div>
            {relatorio.porTipo.map((linha) => (
              <div key={linha.chave} className="linha-entre">
                <span>{ROTULO_CUSTO[linha.chave as keyof typeof ROTULO_CUSTO] ?? linha.rotulo}</span>
                <span className="num">{emReais(linha.total)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {novo ? (
        <NovoOrcamento
          aoFechar={() => setNovo(false)}
          aoSalvar={async (dados) => {
            await criarOrcamento(dados);
            setNovo(false);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function NovoOrcamento({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    startsAt: string;
    endsAt: string;
    value?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState('');
  const [value, setValue] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Novo orçamento"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Novo orçamento</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              name,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              value: Number(value),
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <label className="campo-rotulo" htmlFor="nome-orcamento">
                Nome
              </label>
              <input
                id="nome-orcamento"
                className="input"
                required
                minLength={2}
                placeholder="TI 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="inicio-orcamento">
                  Início
                </label>
                <input
                  id="inicio-orcamento"
                  className="input"
                  type="date"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fim-orcamento">
                  Fim
                </label>
                <input
                  id="fim-orcamento"
                  className="input"
                  type="date"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="valor-orcamento">
                Valor
              </label>
              <input
                id="valor-orcamento"
                className="input"
                type="number"
                step="any"
                min={0}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
