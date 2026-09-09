import { useCallback, useEffect, useState } from 'react';
import type { CostKind, CustoDoChamado, OrcamentoView, TicketDetail } from '@norty-desk/shared';
import { COST_KINDS, ROTULO_CUSTO, emReais } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  custosDoChamado,
  lancarCusto,
  listarOrcamentos,
  removerCusto,
} from '../../api/contratos';
import { useAutenticacao } from '../../auth/Autenticacao';

/**
 * Quanto custou atender.
 *
 * O total é a soma das linhas, calculada na leitura — não há coluna de
 * total no chamado, porque um total gravado diverge da primeira linha
 * corrigida.
 *
 * O lançamento de tempo pede horas **e** valor-hora: sem os dois, "2
 * horas" entraria como zero, que é o que o GLPI aceita.
 */
export function CustosDoChamado({ chamado }: { chamado: TicketDetail }) {
  const { can } = useAutenticacao();
  const [custos, setCustos] = useState<CustoDoChamado | null>(null);
  const [orcamentos, setOrcamentos] = useState<OrcamentoView[]>([]);
  const [lancando, setLancando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCustos(await custosDoChamado(chamado.id));
  }, [chamado.id]);

  useEffect(() => {
    if (!can('custo:ler')) return;
    void recarregar().catch(() => setCustos({ linhas: [], total: 0 }));
  }, [recarregar, can]);

  useEffect(() => {
    if (!can('custo:lancar')) return;
    void listarOrcamentos()
      .then(setOrcamentos)
      // Orçamento é `custo:ler`; quem só lança pode não alcançar a lista.
      .catch(() => setOrcamentos([]));
  }, [can]);

  if (!custos || !can('custo:ler')) return null;

  const podeLancar = can('custo:lancar') && chamado.status !== 'FECHADO';
  if (custos.linhas.length === 0 && !podeLancar) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Custo</h3>
          <p className="card-sub">
            {custos.linhas.length === 0
              ? 'Peça, hora de quem atendeu, deslocamento.'
              : `${custos.linhas.length} lançamento(s) · ${emReais(custos.total)}`}
          </p>
        </div>
        {podeLancar && !lancando ? (
          <button type="button" className="btn -secundario -sm" onClick={() => setLancando(true)}>
            Lançar custo
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {custos.linhas.length > 0 ? (
        <div className="card-corpo pilha-sm">
          {custos.linhas.map((linha) => (
            <div
              key={linha.id}
              className="linha-entre"
              style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}
            >
              <span style={{ minWidth: 0 }}>
                {linha.label}
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {ROTULO_CUSTO[linha.kind]}
                  {linha.hours !== null && linha.hourlyRate !== null
                    ? ` · ${linha.hours}h × ${emReais(linha.hourlyRate)}`
                    : ''}
                  {linha.budget ? ` · ${linha.budget.name}` : ''}
                  {linha.author ? ` · ${linha.author.name}` : ''}
                </span>
              </span>
              <span className="linha" style={{ gap: 'var(--e-2)', flex: 'none' }}>
                <span className="num">{emReais(linha.amount)}</span>
                {podeLancar ? (
                  <button
                    type="button"
                    className="btn-icone"
                    aria-label={`Apagar ${linha.label}`}
                    onClick={() => {
                      setErro(null);
                      void removerCusto(chamado.id, linha.id)
                        .then(setCustos)
                        .catch((e: unknown) =>
                          setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.'),
                        );
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            </div>
          ))}

          <div className="linha-entre" style={{ borderTop: '1px solid var(--borda)', paddingTop: 'var(--e-3)' }}>
            <span className="campo-rotulo">Total</span>
            <span className="num" style={{ fontWeight: 'var(--p-semi)' }}>
              {emReais(custos.total)}
            </span>
          </div>
        </div>
      ) : null}

      {lancando ? (
        <Lancar
          orcamentos={orcamentos}
          aoCancelar={() => setLancando(false)}
          aoLancar={async (dados) => {
            setErro(null);
            try {
              setCustos(await lancarCusto(chamado.id, dados));
              setLancando(false);
            } catch (e) {
              setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível lançar.');
            }
          }}
        />
      ) : null}
    </section>
  );
}

function Lancar({
  orcamentos,
  aoCancelar,
  aoLancar,
}: {
  orcamentos: OrcamentoView[];
  aoCancelar: () => void;
  aoLancar: (dados: {
    kind: CostKind;
    label: string;
    hours?: number;
    hourlyRate?: number;
    amount?: number;
    budgetId?: string | null;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<CostKind>('MATERIAL');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const ehTempo = kind === 'TEMPO';
  const previa = ehTempo && hours && hourlyRate ? Number(hours) * Number(hourlyRate) : null;
  const completo = label.trim() && (ehTempo ? hours && hourlyRate : amount);

  return (
    <form
      className="card-rodape pilha-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setOcupado(true);
        void aoLancar({
          kind,
          label: label.trim(),
          ...(ehTempo
            ? { hours: Number(hours), hourlyRate: Number(hourlyRate) }
            : { amount: Number(amount) }),
          budgetId: budgetId || null,
        }).finally(() => setOcupado(false));
      }}
    >
      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <label className="so-leitor" htmlFor="tipo-custo">
          Tipo
        </label>
        <select
          id="tipo-custo"
          className="select -auto"
          value={kind}
          onChange={(e) => setKind(e.target.value as CostKind)}
        >
          {COST_KINDS.map((k) => (
            <option key={k} value={k}>
              {ROTULO_CUSTO[k]}
            </option>
          ))}
        </select>

        <label className="so-leitor" htmlFor="descricao-custo">
          Descrição
        </label>
        <input
          id="descricao-custo"
          className="input"
          style={{ flex: '1 1 200px' }}
          required
          placeholder={ehTempo ? 'Atendimento no local' : 'Fonte 500W'}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        {ehTempo ? (
          <>
            <label className="so-leitor" htmlFor="horas-custo">
              Horas
            </label>
            <input
              id="horas-custo"
              className="input"
              style={{ width: 110 }}
              type="number"
              step="any"
              min={0}
              placeholder="horas"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <label className="so-leitor" htmlFor="valor-hora-custo">
              Valor da hora
            </label>
            <input
              id="valor-hora-custo"
              className="input"
              style={{ width: 130 }}
              type="number"
              step="any"
              min={0}
              placeholder="R$/hora"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
            {previa !== null ? (
              <span className="selo -neutro">{emReais(previa)}</span>
            ) : null}
          </>
        ) : (
          <>
            <label className="so-leitor" htmlFor="valor-custo">
              Valor
            </label>
            <input
              id="valor-custo"
              className="input"
              style={{ width: 140 }}
              type="number"
              step="any"
              min={0}
              placeholder="R$"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </>
        )}

        {orcamentos.length > 0 ? (
          <>
            <label className="so-leitor" htmlFor="orcamento-custo">
              Orçamento
            </label>
            <select
              id="orcamento-custo"
              className="select -auto"
              value={budgetId}
              onChange={(e) => setBudgetId(e.target.value)}
            >
              <option value="">Sem orçamento</option>
              {orcamentos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <span style={{ marginLeft: 'auto' }} className="linha">
          <button type="button" className="btn -fantasma -sm" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" className="btn -primario -sm" disabled={ocupado || !completo}>
            Lançar
          </button>
        </span>
      </div>
    </form>
  );
}
