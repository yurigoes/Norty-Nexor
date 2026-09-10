import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CONSUMABLE_KINDS,
  ROTULO_CONSUMIVEL,
  type ConsumableKind,
  type ConsumivelView,
  type FabricanteView,
} from '@norty-desk/shared';

import { listarFabricantes } from '../../api/catalogoAtivo';
import { ErroDaApi } from '../../api/cliente';
import { criarConsumivel, listarConsumiveis } from '../../api/consumiveis';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

type Novo = { name: string; kind: ConsumableKind; reference: string; manufacturerId: string; minStock: string; unit: string };

/**
 * Consumíveis e cartuchos: quanto tem de cada um, e o que já chegou no
 * mínimo. O estoque vem das movimentações — ninguém digita o saldo.
 */
export function Consumiveis() {
  const { can } = useAutenticacao();
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [lista, setLista] = useState<ConsumivelView[] | null>(null);
  const [novo, setNovo] = useState<Novo | null>(null);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async () => {
    setLista(await listarConsumiveis({ q: busca || undefined, kind: tipo || undefined, abaixoDoMinimo: soAbaixo }));
  }, [busca, tipo, soAbaixo]);

  useEffect(() => {
    setLista(null);
    void recarregar().catch(() => setErro('Não foi possível carregar os consumíveis.'));
  }, [recarregar]);

  async function abrirNovo() {
    setErro(null);
    setNovo({ name: '', kind: 'TONER', reference: '', manufacturerId: '', minStock: '1', unit: 'un' });
    if (fabricantes.length === 0) setFabricantes(await listarFabricantes().catch(() => []));
  }

  async function salvarNovo(evento: FormEvent) {
    evento.preventDefault();
    if (!novo) return;
    setEnviando(true);
    setErro(null);
    try {
      const criado = await criarConsumivel({
        name: novo.name.trim(),
        kind: novo.kind,
        reference: novo.reference.trim() || null,
        manufacturerId: novo.manufacturerId || null,
        minStock: Number(novo.minStock) || 0,
        unit: novo.unit.trim() || 'un',
      });
      navegar(`/consumiveis/${criado.id}`);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  const abaixo = (lista ?? []).filter((c) => c.belowMin).length;

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Consumíveis</h2>
          <p>Toner, papel, cabos: quanto tem, onde fica, para quem foi — e o que já está no mínimo.</p>
        </div>
        {can('ativo:gerenciar') ? (
          <button type="button" className="btn -primario" onClick={() => void abrirNovo()}>Novo consumível</button>
        ) : null}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>
      ) : null}

      {!soAbaixo && abaixo > 0 ? (
        <div className="alerta-bloco -aviso" role="status">
          <span aria-hidden="true">!</span>
          <span>
            {abaixo} consumível(is) no estoque mínimo ou abaixo.{' '}
            <button type="button" className="btn -fantasma -sm" onClick={() => setSoAbaixo(true)}>Ver só esses</button>
          </span>
        </div>
      ) : null}

      {novo ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarNovo} noValidate>
          <h3>Novo consumível</h3>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-nome">Nome</label>
              <input id="c-nome" className="input" value={novo.name} placeholder="Toner HP 58A"
                onChange={(e) => setNovo({ ...novo, name: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-tipo">Tipo</label>
              <select id="c-tipo" className="input" value={novo.kind} onChange={(e) => setNovo({ ...novo, kind: e.target.value as ConsumableKind })}>
                {CONSUMABLE_KINDS.map((k) => <option key={k} value={k}>{ROTULO_CONSUMIVEL[k]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-ref">Referência</label>
              <input id="c-ref" className="input mono" value={novo.reference} placeholder="CF258A"
                onChange={(e) => setNovo({ ...novo, reference: e.target.value })} />
            </div>
          </div>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-fab">Fabricante</label>
              <select id="c-fab" className="input" value={novo.manufacturerId} onChange={(e) => setNovo({ ...novo, manufacturerId: e.target.value })}>
                <option value="">—</option>
                {fabricantes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-min">Estoque mínimo</label>
              <input id="c-min" className="input" inputMode="numeric" value={novo.minStock} onChange={(e) => setNovo({ ...novo, minStock: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="c-un">Unidade</label>
              <input id="c-un" className="input" value={novo.unit} placeholder="un, cx, resma" onChange={(e) => setNovo({ ...novo, unit: e.target.value })} />
            </div>
          </div>
          <p className="campo-ajuda">Impressoras compatíveis e local do estoque se ajustam na tela do consumível, depois de criado.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={enviando || novo.name.trim().length < 2}>
              {enviando ? 'Salvando…' : 'Criar e abrir'}
            </button>
            <button type="button" className="btn -fantasma" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <form style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
        onSubmit={(e) => { e.preventDefault(); setBusca(termo.trim()); }}>
        <input className="input" type="search" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por nome, referência ou fabricante"
          value={termo} onChange={(e) => setTermo(e.target.value)} />
        <select className="input" style={{ maxWidth: 200 }} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {CONSUMABLE_KINDS.map((k) => <option key={k} value={k}>{ROTULO_CONSUMIVEL[k]}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} />
          Só no mínimo
        </label>
      </form>

      {!lista ? (
        <div className="sk sk-bloco" />
      ) : lista.length === 0 ? (
        <div className="vazio">
          <h3>{soAbaixo ? 'Nada no mínimo' : 'Nenhum consumível'}</h3>
          <p>{soAbaixo ? 'Todo o estoque está acima do mínimo.' : 'Cadastre o primeiro — o toner mais usado costuma ser um bom começo.'}</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Consumível</th><th>Referência</th><th className="-num">Estoque</th><th className="-num">Mínimo</th><th>Local</th><th>Último movimento</th></tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td className="tabela-titulo-celula">
                      <Link to={`/consumiveis/${c.id}`}>{c.name}</Link>
                      <span className="suave"> · {ROTULO_CONSUMIVEL[c.kind]}</span>
                    </td>
                    <td className="mono">{c.reference ?? <span className="suave">—</span>}</td>
                    <td className="-num">
                      {c.belowMin ? <span className="selo -erro">{c.stock} {c.unit}</span> : `${c.stock} ${c.unit}`}
                    </td>
                    <td className="-num">{c.minStock}</td>
                    <td>{c.location?.name ?? <span className="suave">—</span>}</td>
                    <td>{c.lastMovementAt ? dataCurta(c.lastMovementAt) : <span className="suave">nunca</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
