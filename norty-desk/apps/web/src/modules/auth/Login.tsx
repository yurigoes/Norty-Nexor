import { useState, type FormEvent } from 'react';

import { ErroDaApi } from '../../api/cliente';
import { useAutenticacao } from '../../auth/Autenticacao';

export function Login() {
  const { entrar } = useAutenticacao();
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
      // senha errada. Não a especializamos aqui: isso desfaria a
      // proteção do lado do servidor.
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível entrar.');
      setEnviando(false);
    }
  }

  return (
    <div className="tela-publica" style={{ display: 'grid', placeItems: 'center' }}>
      <form
        className="card"
        onSubmit={enviar}
        style={{ width: 'min(400px, 92vw)', padding: 'var(--e-8)' }}
      >
        <div style={{ marginBottom: 'var(--e-6)' }}>
          <h1 style={{ fontSize: 'var(--t-h2)' }}>Norty Desk</h1>
          <p className="suave" style={{ fontSize: 'var(--t-corpo-sm)', marginTop: 'var(--e-1)' }}>
            Entre para acompanhar e atender chamados.
          </p>
        </div>

        {erro ? (
          <div className="alerta-bloco -erro" style={{ marginBottom: 'var(--e-4)' }}>
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        <div className="pilha">
          <div className="campo">
            <label className="campo-rotulo" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            className={`btn -primario -cheio ${enviando ? '-carregando' : ''}`}
            disabled={enviando}
          >
            Entrar
          </button>
        </div>
      </form>
    </div>
  );
}
