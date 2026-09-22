import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { conviteDeSenha, definirSenha } from '../../api/protocolo';
import { useMarca } from '../../api/marca';
import { MarcaCompleta } from '../../components/Marca';

/** O mesmo mínimo da troca pela tela de conta. */
const MINIMO = 8;

/**
 * Escolher a senha pelo link que chegou por e-mail e WhatsApp.
 *
 * Quarta tela sem login do produto, e a mais valiosa: quem a atravessa
 * passa a entrar como a pessoa. O que a protege não está aqui — está no
 * link, que vale quinze minutos e uma vez só.
 *
 * O que esta tela faz de diferente de um formulário qualquer é
 * **perguntar antes**: confere o convite ao abrir, e só então pede a
 * senha. Digitar duas vezes uma senha e só aí descobrir que o link
 * expirou é a forma mais irritante possível de dar essa notícia.
 */
export function DefinirSenha() {
  const { token = '' } = useParams();
  const marca = useMarca();

  const [estado, setEstado] = useState<'conferindo' | 'valido' | 'invalido' | 'pronto'>(
    'conferindo',
  );
  const [nome, setNome] = useState<string | null>(null);
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void conviteDeSenha(token).then((c) => {
      setNome(c.nome);
      setEstado(c.valido ? 'valido' : 'invalido');
    });
  }, [token]);

  const curta = nova.length > 0 && nova.length < MINIMO;
  const diferente = repetida.length > 0 && nova !== repetida;
  const podeEnviar = nova.length >= MINIMO && nova === repetida;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!podeEnviar) return;

    setErro(null);
    setEnviando(true);
    try {
      await definirSenha(token, nova);
      setEstado('pronto');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível trocar a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-publica" style={{ minHeight: '100vh', padding: 'var(--e-5)' }}>
      <main className="pilha" style={{ width: 'min(520px, 100%)', margin: '0 auto' }}>
        <MarcaCompleta logoUrl={marca.logoUrl} nome={marca.productName} frase="Escolher senha" />

        {estado === 'conferindo' ? <div className="sk sk-bloco" /> : null}

        {estado === 'invalido' ? (
          <section className="card">
            <div className="card-topo">
              <div>
                <h1 className="card-titulo">Este link não vale mais</h1>
                {/* Não se diz qual dos três motivos foi — expirado, já
                    usado ou inexistente. Quem tem o link pode não ser o
                    dono, e a pessoa certa só precisa saber que tem de
                    pedir outro. */}
                <p className="card-sub">
                  Links de troca de senha valem por poucos minutos e abrem uma vez só. Abra um
                  chamado de troca de senha para receber outro.
                </p>
              </div>
            </div>
            <div className="card-corpo">
              <Link to="/entrar" className="btn -secundario">
                Ir para a entrada
              </Link>
            </div>
          </section>
        ) : null}

        {estado === 'pronto' ? (
          <section className="card">
            <div className="card-topo">
              <div>
                <h1 className="card-titulo">Senha trocada</h1>
                <p className="card-sub">
                  Já pode entrar com a senha nova. As sessões que estavam abertas em outros
                  aparelhos foram encerradas.
                </p>
              </div>
            </div>
            <div className="card-corpo">
              <Link to="/entrar" className="btn -primario">
                Entrar
              </Link>
            </div>
          </section>
        ) : null}

        {estado === 'valido' ? (
          <form className="card" onSubmit={enviar} noValidate>
            <div className="card-topo">
              <div>
                <h1 className="card-titulo">{nome ? `Olá, ${nome}` : 'Escolha sua senha'}</h1>
                <p className="card-sub">
                  Escolha a senha que você vai usar no Norty Desk. Ninguém do atendimento a
                  conhece — nem o sistema.
                </p>
              </div>
            </div>

            <div className="card-corpo pilha-sm">
              {erro ? (
                <div className="alerta-bloco -erro" role="alert">
                  <span aria-hidden="true">!</span>
                  <span>{erro}</span>
                </div>
              ) : null}

              <div className="campo">
                <label className="campo-rotulo" htmlFor="senha-nova">
                  Nova senha
                </label>
                <input
                  id="senha-nova"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                />
                <span className="campo-ajuda">Pelo menos {MINIMO} caracteres.</span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="senha-repetida">
                  Repita a nova senha
                </label>
                <input
                  id="senha-repetida"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={repetida}
                  onChange={(e) => setRepetida(e.target.value)}
                />
                {/* O aviso aparece enquanto se digita, e não depois de
                    enviar: descobrir no envio que as duas não batem
                    custa a viagem inteira de volta. */}
                {curta ? (
                  <span className="campo-ajuda">Faltam caracteres.</span>
                ) : diferente ? (
                  <span className="campo-ajuda">As duas não são iguais.</span>
                ) : null}
              </div>

              <button
                type="submit"
                className={`btn -primario ${enviando ? '-carregando' : ''}`}
                disabled={!podeEnviar || enviando}
              >
                Trocar senha
              </button>
            </div>
          </form>
        ) : null}
      </main>
    </div>
  );
}
