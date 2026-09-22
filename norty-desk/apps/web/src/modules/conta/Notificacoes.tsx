import { useCallback, useEffect, useState } from 'react';
import {
  NOTIFICACOES,
  ROTULO_DA_NOTIFICACAO,
  type EstadoDasNotificacoes,
  type TipoDeNotificacao,
} from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { dataCurta } from '../../lib/formato';
import {
  desligarNesteAparelho,
  endpointDesteAparelho,
  ligarNesteAparelho,
  permissaoAtual,
  pushSuportado,
} from '../../lib/push';

/**
 * Onde quero ser avisado.
 *
 * A permissão do navegador só é pedida no clique, nunca ao abrir a
 * tela: site que pergunta na chegada é bloqueado para sempre por quem
 * ainda nem sabia o que ele faz — e, uma vez bloqueado, não há como
 * perguntar de novo do lado de cá.
 *
 * A lista é de aparelhos, não de pessoas: quem usa o computador do
 * escritório e o celular na rua quer o aviso nos dois, e desligar um
 * não desliga o outro.
 */
export function Notificacoes() {
  const [estado, setEstado] = useState<EstadoDasNotificacoes | null>(null);
  const [endpoint, setEndpoint] = useState<string | undefined>();
  const [permissao, setPermissao] = useState<NotificationPermission | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const suportado = pushSuportado();

  const carregar = useCallback(async () => {
    const meu = await endpointDesteAparelho();
    setEndpoint(meu);
    setPermissao(permissaoAtual());
    setEstado(await api.estadoDasNotificacoes(meu));
  }, []);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar os avisos.'));
  }, [carregar]);

  if (!estado) return null;

  // Sem par VAPID a instalação não tem como assinar o aviso. Oferecer o
  // botão seria oferecer o que não funciona.
  if (!estado.chavePublica) return null;

  const esteLigado = estado.aparelhos.some((a) => a.esteAparelho);
  const bloqueado = permissao === 'denied';

  async function ligar() {
    if (!estado?.chavePublica) return;
    setOcupado(true);
    setErro(null);
    try {
      const inscricao = await ligarNesteAparelho(estado.chavePublica);
      setPermissao(permissaoAtual());

      if (!inscricao) {
        setErro(
          'O navegador não deu permissão. Você pode liberar em seguida, pelo cadeado ao lado do endereço.',
        );
        return;
      }

      setEstado(await api.inscreverAparelho(inscricao));
      setEndpoint(inscricao.endpoint);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível ligar o aviso.');
    } finally {
      setOcupado(false);
    }
  }

  async function desligar(id: string, este: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      // A inscrição do navegador sai primeiro: se só a linha do banco
      // fosse apagada, o navegador seguiria inscrito e "ligar" de novo
      // devolveria o mesmo endpoint sem pedir nada — o que parece que o
      // botão não fez efeito.
      if (este) await desligarNesteAparelho();
      setEstado(await api.desinscreverAparelho(id, endpoint));
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível desligar.');
    } finally {
      setOcupado(false);
    }
  }

  async function alternar(tipo: TipoDeNotificacao, quer: boolean) {
    const atual = estado?.silenciados ?? [];
    const silenciados = quer ? atual.filter((t) => t !== tipo) : [...new Set([...atual, tipo])];

    setOcupado(true);
    setErro(null);
    try {
      setEstado(await api.silenciarNotificacoes({ silenciados }));
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a preferência.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="pilha-sm">
      <h3>Avisos fora da aba</h3>
      <p className="suave">
        O Desk avisa no Windows quando um chamado precisa de você, mesmo com o aplicativo em outra
        aba ou fechado. O aviso mostra o número e o assunto do chamado.
      </p>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!suportado ? (
        <div className="alerta-bloco -info">
          <span aria-hidden="true">i</span>
          <span>
            Este navegador não sabe receber avisos. No iPhone, é preciso adicionar o Desk à tela de
            início primeiro.
          </span>
        </div>
      ) : bloqueado ? (
        <div className="alerta-bloco -aviso">
          <span aria-hidden="true">!</span>
          <span>
            Os avisos estão bloqueados para este site. Libere no cadeado ao lado do endereço e
            recarregue a página.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${esteLigado ? '-secundario' : '-primario'} ${ocupado ? '-carregando' : ''}`}
            disabled={ocupado}
            onClick={() => {
              const meu = estado.aparelhos.find((a) => a.esteAparelho);
              void (meu ? desligar(meu.id, true) : ligar());
            }}
          >
            {esteLigado ? 'Desligar neste aparelho' : 'Ligar neste aparelho'}
          </button>
          {esteLigado ? <span className="selo -sucesso">Ligado aqui</span> : null}
        </div>
      )}

      {estado.aparelhos.length > 0 ? (
        <>
          <h4 style={{ marginTop: 'var(--e-4)' }}>Aparelhos ligados</h4>
          <div className="pilha-sm">
            {estado.aparelhos.map((a) => (
              <div key={a.id} className="linha-aparelho">
                <div>
                  <strong>{a.descricao ?? 'Aparelho'}</strong>
                  {a.esteAparelho ? <span className="selo -info">Este</span> : null}
                  <span className="campo-ajuda" style={{ display: 'block' }}>
                    Ligado em {dataCurta(a.createdAt)}
                    {a.lastSentAt ? ` · último aviso em ${dataCurta(a.lastSentAt)}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn -fantasma -sm"
                  disabled={ocupado}
                  onClick={() => void desligar(a.id, a.esteAparelho)}
                >
                  Desligar
                </button>
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 'var(--e-4)' }}>Quando avisar</h4>
          <p className="campo-ajuda">
            Vale para todos os seus aparelhos: o que você desligar aqui não chega em nenhum deles.
          </p>
          <div className="pilha-sm">
            {NOTIFICACOES.map((tipo) => {
              const quer = !estado.silenciados.includes(tipo);
              return (
                <label key={tipo} className="switch">
                  <input
                    type="checkbox"
                    checked={quer}
                    disabled={ocupado}
                    onChange={(e) => void alternar(tipo, e.target.checked)}
                  />
                  <span className="switch-trilho" aria-hidden="true">
                    <span className="switch-bolinha" />
                  </span>
                  <span>{ROTULO_DA_NOTIFICACAO[tipo]}</span>
                </label>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
