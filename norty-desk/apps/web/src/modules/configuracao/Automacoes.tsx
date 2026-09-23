import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACAO_AUTOMATICA, type AutomacaoView } from '@norty-desk/shared';

import { listarAutomacoes } from '../../api/endpoints';

/**
 * O que o sistema resolve sozinho.
 *
 * ## Por que esta tela existe
 *
 * A ação automática é ligada num campo escondido dentro da edição de
 * **um** modelo de chamado. Sem esta tela, "o que este sistema faz sem
 * passar por ninguém?" só se responde abrindo modelo por modelo — e é
 * exatamente a pergunta que um auditor, um gestor novo ou o próprio
 * dono daqui a seis meses vai fazer.
 *
 * Automação que ninguém consegue enumerar é automação que ninguém
 * controla.
 *
 * ## Só leitura, de propósito
 *
 * Ligar e desligar continua na edição do modelo, onde está o aviso de
 * que o chamado vai se resolver sem passar por ninguém. Um segundo
 * lugar para ligar seria um segundo lugar para esquecer o aviso.
 */
export function Automacoes() {
  const [acoes, setAcoes] = useState<AutomacaoView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarAutomacoes()
      .then(setAcoes)
      .catch(() => setErro('Não foi possível carregar as ações automáticas.'));
  }, []);

  if (erro) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  if (!acoes) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 820 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">O que o sistema resolve sozinho</h2>
          <p>
            Chamado que nasce e morre sem fila. A lista é curta de propósito: automação que erra
            no escuro custa mais que o tempo que economiza, e cada ação nova traz o próprio
            conjunto de cercas.
          </p>
        </div>
      </div>

      {acoes.map((a) => (
        <Acao key={a.acao} automacao={a} />
      ))}

      <p className="campo-ajuda">
        Para ligar ou desligar, edite o modelo em{' '}
        <Link to="/config/formularios">Formulários e modelos</Link>. É lá que fica o aviso de que
        o chamado vai se resolver sem passar por ninguém — e ele precisa ser lido na hora de
        ligar, não aqui.
      </p>
    </div>
  );
}

function Acao({ automacao }: { automacao: AutomacaoView }) {
  const texto = ACAO_AUTOMATICA[automacao.acao];
  const ligada = automacao.modelos.length > 0;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">{texto.rotulo}</h3>
          <p className="card-sub">{texto.descricao}</p>
        </div>
        <span className={`selo ${ligada ? '-sucesso' : '-neutro'}`}>
          {ligada ? 'Em uso' : 'Não usada'}
        </span>
      </div>

      <div className="card-corpo pilha-sm">
        {!ligada ? (
          <p className="campo-ajuda">
            Nenhum modelo de chamado dispara esta ação. Tudo que se pareça com isto hoje é
            atendido por uma pessoa.
          </p>
        ) : (
          <ul className="lista-simples">
            {automacao.modelos.map((m) => (
              <li key={m.id} className="pilha-sm">
                <strong>{m.nome}</strong>

                {/* Os três avisos abaixo são os que fazem a pessoa
                    entender por que a automação "não funciona" sem
                    abrir chamado para o suporte do próprio sistema. */}
                {!m.ofereceNaTela ? (
                  <span className="campo-ajuda">
                    Este formulário não está marcado como modelo: ninguém consegue escolhê-lo, e a
                    ação está ligada e morta.
                  </span>
                ) : null}

                {m.tambemSemLogin ? (
                  <span className="campo-ajuda">
                    Também aparece na abertura sem login — e <strong>ali a ação não corre</strong>.
                    Quem abre pelo protocolo não provou quem é, então o chamado espera uma pessoa.
                  </span>
                ) : null}

                {m.categoria?.exigeAprovacao ? (
                  <span className="campo-ajuda">
                    A categoria <strong>{m.categoria.nome}</strong> exige aprovação: a ação só corre
                    depois que alguém aprova. É mais lento, e é o certo.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
