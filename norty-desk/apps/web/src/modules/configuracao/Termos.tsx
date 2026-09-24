import { useEffect, useState } from 'react';
import type { ModeloDeTermoView } from '@norty-desk/shared';
import { CAMPOS_DO_TERMO, ROTULO_TERMO, marcadoresInvalidosDoTermo } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  listarModelosDeTermo,
  restaurarModeloDeTermo,
  salvarModeloDeTermo,
} from '../../api/termos';

/**
 * O texto que a pessoa assina.
 *
 * ## Por que é editável, e por que isso é seguro
 *
 * A redação é política da casa: o jurídico pede uma cláusula, a
 * operação tira outra. O que impede a edição de virar reescrita do
 * passado é o congelamento — o termo assinado guarda o próprio texto, e
 * mudar aqui vale só para o próximo.
 *
 * ## O aviso de que não é peça jurídica
 *
 * O texto de fábrica é ponto de partida. Quem responde por contrato na
 * casa tem de ler antes do primeiro uso, e o aviso fica na tela porque
 * é aqui que a decisão de usar assim mesmo é tomada.
 */
export function Termos() {
  const [modelos, setModelos] = useState<ModeloDeTermoView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarModelosDeTermo()
      .then(setModelos)
      .catch(() => setErro('Não foi possível carregar os termos.'));
  }, []);

  if (erro) {
    return (
      <div className="alerta-bloco -erro" role="alert">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  if (!modelos) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 900 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Termos de equipamento</h2>
          <p>
            O que a pessoa assina ao receber um equipamento, e ao devolvê-lo quebrado. O texto
            aqui vale para o <strong>próximo</strong> termo: o que já foi assinado guarda a
            própria redação, e nada do que se edite nesta tela o alcança.
          </p>
        </div>
      </div>

      <div className="alerta-bloco" role="note">
        <span aria-hidden="true">!</span>
        <span>
          O texto que vem de fábrica é ponto de partida, não peça jurídica. Peça a quem responde
          por contrato na casa que leia e ajuste antes do primeiro uso.
        </span>
      </div>

      {modelos.map((m) => (
        <Modelo key={m.kind} modelo={m} aoMudar={setModelos} />
      ))}

      <section className="card">
        <div className="card-topo">
          <h3 className="card-titulo">Marcadores</h3>
        </div>
        <div className="card-corpo pilha-sm">
          <p className="campo-ajuda">
            O que estiver entre chaves vira o dado na hora de assinar. Marcador que não está nesta
            lista é recusado ao salvar — no papel impresso ele sairia do jeito que está, com a
            pessoa esperando para assinar.
          </p>
          <ul className="lista-simples">
            {CAMPOS_DO_TERMO.map((campo) => (
              <li key={campo}>
                <span className="mono">{`{{${campo}}}`}</span>
              </li>
            ))}
          </ul>
          <p className="campo-ajuda">
            Não há marcador para o documento de quem assina: o cadastro de pessoa não guarda CPF.
          </p>
        </div>
      </section>
    </div>
  );
}

function Modelo({
  modelo,
  aoMudar,
}: {
  modelo: ModeloDeTermoView;
  aoMudar: (modelos: ModeloDeTermoView[]) => void;
}) {
  const [texto, setTexto] = useState(modelo.body);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Conferido enquanto se digita, com a mesma função que a API usa para
  // recusar: descobrir o marcador errado ao salvar já é tarde demais
  // para quem escreveu três parágrafos.
  const inventados = marcadoresInvalidosDoTermo(texto);
  const mudou = texto !== modelo.body;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">{ROTULO_TERMO[modelo.kind]}</h3>
          <p className="card-sub">
            {modelo.kind === 'COMPROMISSO'
              ? 'Assinado na entrega do equipamento.'
              : 'Assinado na devolução, quando o equipamento volta danificado.'}
          </p>
        </div>
        <span className={`selo ${modelo.padrao ? '-neutro' : '-sucesso'}`}>
          {modelo.padrao ? 'Texto de fábrica' : 'Editado pela casa'}
        </span>
      </div>

      <div className="card-corpo pilha-sm">
        {erro ? (
          <div className="alerta-bloco -erro" role="alert">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        <textarea
          className="textarea mono"
          rows={20}
          aria-label={`Texto do ${ROTULO_TERMO[modelo.kind].toLowerCase()}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />

        {inventados.length > 0 ? (
          <span className="campo-ajuda">
            Estes marcadores não existem e sairiam crus no papel:{' '}
            <span className="mono">{inventados.join(', ')}</span>
          </span>
        ) : null}

        <div style={{ display: 'flex', gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn -primario"
            disabled={ocupado || !mudou || inventados.length > 0}
            onClick={() => {
              setErro(null);
              setOcupado(true);
              void salvarModeloDeTermo(modelo.kind, { body: texto })
                .then(aoMudar)
                .catch((e: unknown) =>
                  setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.'),
                )
                .finally(() => setOcupado(false));
            }}
          >
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>

          {mudou ? (
            <button type="button" className="btn -fantasma" onClick={() => setTexto(modelo.body)}>
              Desfazer
            </button>
          ) : null}

          {!modelo.padrao ? (
            <button
              type="button"
              className="btn -fantasma"
              disabled={ocupado}
              onClick={() => {
                setErro(null);
                setOcupado(true);
                void restaurarModeloDeTermo(modelo.kind)
                  .then((novos) => {
                    setTexto(novos.find((n) => n.kind === modelo.kind)!.body);
                    aoMudar(novos);
                  })
                  .catch((e: unknown) =>
                    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível restaurar.'),
                  )
                  .finally(() => setOcupado(false));
              }}
            >
              Voltar ao texto de fábrica
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
