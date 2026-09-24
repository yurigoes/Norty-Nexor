import { useEffect, useState } from 'react';
import type { AssetView } from '@norty-desk/shared';
import { ROTULO_ATIVO } from '@norty-desk/shared';

import { buscarAtivos, trocarAtivo } from '../../api/ativos';
import { ErroDaApi } from '../../api/cliente';
import { Assinatura } from '../ordem/Assinatura';

/**
 * Sai um equipamento, entra outro.
 *
 * ## Por que é um gesto só na tela
 *
 * Porque é um gesto só na vida: o técnico chega com a máquina de
 * reserva, pega a antiga e a pessoa assina uma vez. Duas telas — uma de
 * devolução e outra de entrega — obrigariam a lembrar da segunda, e a
 * metade esquecida é a pessoa sem equipamento no inventário.
 *
 * ## Uma assinatura para os dois papéis
 *
 * Quem devolve e quem recebe é a mesma pessoa, no mesmo instante, com o
 * mesmo dedo na tela. Pedir duas seria teatro.
 */
export function TrocaDeEquipamento({
  ticketId,
  sai,
  aoFechar,
  aoTrocar,
}: {
  ticketId: string;
  /** O equipamento que está com a pessoa. */
  sai: AssetView;
  aoFechar: () => void;
  aoTrocar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<AssetView[]>([]);
  const [entra, setEntra] = useState<AssetView | null>(null);
  const [returnedTo, setReturnedTo] = useState<'EM_ESTOQUE' | 'BAIXADO'>('EM_ESTOQUE');
  const [comQuebra, setComQuebra] = useState(false);
  const [notes, setNotes] = useState('');
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const alarme = setTimeout(() => {
      void buscarAtivos({ q: termo || undefined, limit: 8 })
        .then((lista) =>
          // Só o que está livre e não é o próprio que sai: oferecer o
          // que já está na mão de alguém convida ao 409.
          setAchados(lista.filter((a) => a.id !== sai.id && !a.user)),
        )
        .catch(() => setAchados([]));
    }, 250);

    return () => clearTimeout(alarme);
  }, [termo, sai.id]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Trocar equipamento"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Trocar equipamento</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            if (!entra) return;

            setErro(null);
            setOcupado(true);

            void trocarAtivo(ticketId, {
              saiAssetId: sai.id,
              entraAssetId: entra.id,
              returnedTo,
              ...(notes.trim() ? { notes: notes.trim() } : {}),
              ...(comQuebra ? { comQuebra: true } : {}),
              ...(assinatura ? { signature: assinatura } : {}),
              ...(signedByName.trim() ? { signedByName: signedByName.trim() } : {}),
            })
              .then(() => aoTrocar())
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível trocar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro" role="alert">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <span className="campo-rotulo">Sai</span>
              <p>
                <strong>{sai.name}</strong>
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {ROTULO_ATIVO[sai.kind]}
                  {sai.tag ? ` · ${sai.tag}` : ''}
                  {sai.user ? ` · com ${sai.user.name}` : ''}
                </span>
              </p>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="troca-entra">
                Entra
              </label>
              {entra ? (
                <p>
                  <strong>{entra.name}</strong>
                  {entra.tag ? <span className="mono"> · {entra.tag}</span> : null}{' '}
                  <button type="button" className="btn-link" onClick={() => setEntra(null)}>
                    trocar a escolha
                  </button>
                </p>
              ) : (
                <>
                  <input
                    id="troca-entra"
                    className="input"
                    type="search"
                    placeholder="Nome, patrimônio ou série do equipamento de reserva"
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                  />
                  <div className="pilha-sm" style={{ marginTop: 'var(--e-2)' }}>
                    {achados.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="btn -secundario -sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => setEntra(a)}
                      >
                        {a.name}
                        {a.tag ? ` · ${a.tag}` : ''}
                      </button>
                    ))}
                  </div>
                  <span className="campo-ajuda">
                    Só equipamento livre aparece aqui. O que já está com alguém precisa de
                    devolução antes.
                  </span>
                </>
              )}
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="troca-destino">
                O que sai vai para
              </label>
              <select
                id="troca-destino"
                className="select"
                value={returnedTo}
                onChange={(e) => setReturnedTo(e.target.value as 'EM_ESTOQUE' | 'BAIXADO')}
              >
                <option value="EM_ESTOQUE">Guardar — volta ao estoque</option>
                <option value="BAIXADO">Descarte — sai do parque</option>
              </select>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={comQuebra}
                onChange={(e) => setComQuebra(e.target.checked)}
              />
              <span>
                O que sai está quebrado
                <span className="campo-ajuda">
                  Gera o termo de ocorrência. Independe do destino: equipamento velho também vai
                  para descarte sem ter quebrado, e quebra que vai para conserto volta ao estoque.
                </span>
              </span>
            </label>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="troca-notas">
                {comQuebra ? 'O que aconteceu' : 'Observações'}
              </label>
              <textarea
                id="troca-notas"
                className="textarea"
                rows={comQuebra ? 4 : 2}
                required={comQuebra}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {comQuebra ? (
                <span className="campo-ajuda">
                  Este texto entra no termo de quebra, no lugar da descrição da ocorrência.
                </span>
              ) : null}
            </div>

            <div className="campo">
              <span className="campo-rotulo">Assinatura</span>
              <Assinatura aoMudar={setAssinatura} />
              <span className="campo-ajuda">
                Uma só, para os dois termos — o de compromisso do que entra e, se houver, o de
                quebra do que sai. Sem ela a troca vale e fica registrada, sem papel assinado.
              </span>
            </div>

            {assinatura ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="troca-assinante">
                  Quem assinou
                </label>
                <input
                  id="troca-assinante"
                  className="input"
                  placeholder="Em branco, vale o nome de quem está com o equipamento"
                  value={signedByName}
                  onChange={(e) => setSignedByName(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado || !entra}>
              {ocupado ? 'Trocando…' : 'Trocar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
