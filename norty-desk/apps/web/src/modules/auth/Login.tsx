import { useState, type FormEvent } from 'react';

import { ErroDaApi } from '../../api/cliente';
import { useMarca } from '../../api/marca';
import { useAutenticacao } from '../../auth/Autenticacao';
import { Check, MarcaCompleta } from '../../components/Marca';

const PONTOS = [
  'Portal, e-mail e WhatsApp na mesma fila',
  'Prazo contado em expediente, com feriado e pausa',
  'A conversa inteira do chamado num lugar só',
  'Nota interna que nunca sai para o cliente',
];

export function Login() {
  const { entrar } = useAutenticacao();
  const marca = useMarca();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      await entrar(email, senha);
    } catch (e) {
      // A mensagem vem da API e é idêntica para e-mail inexistente e
      // senha errada. Especializá-la aqui desfaria a proteção do lado do
      // servidor, que é onde ela vale.
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível entrar agora.');
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-arte">
        <div className="login-geo-3" aria-hidden="true" />
        <div className="login-geo-1" aria-hidden="true" />
        <div className="login-geo-2" aria-hidden="true" />

        <div className="login-topo">
          <MarcaCompleta
            logoUrl={marca.logoUrl}
            nome={marca.productName}
            tamanho={38}
            inversa
          />
        </div>

        <div className="login-corpo">
          <h2>{marca.tagline ?? 'A central de serviços da Norty.'}</h2>
          <p>
            Abrir, acompanhar e resolver — com o prazo à vista e a conversa inteira
            registrada, venha ela do portal, do e-mail ou do WhatsApp.
          </p>

          <div className="login-lista" style={{ marginTop: 'var(--e-8)' }}>
            {PONTOS.map((ponto) => (
              <span key={ponto} className="login-lista-item">
                <Check />
                {ponto}
              </span>
            ))}
          </div>
        </div>

        <div className="login-rodape">{marca.productName} · Norty</div>
      </aside>

      <main className="login-form">
        <form className="login-caixa" onSubmit={enviar}>
          <div className="login-marca-mobile">
            <MarcaCompleta logoUrl={marca.logoUrl} nome={marca.productName} tamanho={40} />
          </div>

          <h1>Entrar</h1>
          <p>Use o e-mail da sua conta {marca.productName}.</p>

          {erro ? (
            <div className="alerta-bloco -erro" style={{ marginTop: 'var(--e-5)' }}>
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="login-campos">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="senha">
                Senha
              </label>
              <input
                id="senha"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className={`btn -gradiente -lg -cheio ${enviando ? '-carregando' : ''}`}
              disabled={enviando}
            >
              Entrar
            </button>
          </div>

          <p className="login-ajuda">
            Esqueceu a senha ou não tem acesso? Fale com quem administra o{' '}
            {marca.productName} na sua organização.
          </p>
        </form>
      </main>
    </div>
  );
}
