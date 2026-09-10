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

const CHAVE_EMPRESA = 'norty-desk:empresa';

/** A empresa digitada da última vez. O navegador pode recusar o armazenamento. */
function lerEmpresaLembrada(): string {
  try {
    return localStorage.getItem(CHAVE_EMPRESA) ?? '';
  } catch {
    return '';
  }
}

function lembrarEmpresa(slug: string): void {
  try {
    localStorage.setItem(CHAVE_EMPRESA, slug);
  } catch {
    // Sem armazenamento, só não lembra.
  }
}

export function Login() {
  const { entrar } = useAutenticacao();
  const marca = useMarca();

  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [empresa, setEmpresa] = useState(lerEmpresaLembrada);
  // E-mail é global; nome de usuário só é único dentro da empresa.
  const porUsuario = login.trim() !== '' && !login.includes('@');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const slug = empresa.trim().toLowerCase();
      await entrar(login, senha, porUsuario ? slug : undefined);
      if (porUsuario) lembrarEmpresa(slug);
    } catch (e) {
      // A mensagem vem da API e é idêntica para login inexistente e
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
          <p>Use o e-mail ou o usuário da sua conta {marca.productName}.</p>

          {erro ? (
            <div className="alerta-bloco -erro" style={{ marginTop: 'var(--e-5)' }}>
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="login-campos">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="login">
                E-mail ou usuário
              </label>
              <input
                id="login"
                className="input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="voce@empresa.com.br ou nome.sobrenome"
              />
            </div>

            {porUsuario ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="empresa">
                  Empresa
                </label>
                <input
                  id="empresa"
                  className="input"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="identificador da empresa (ex.: norty)"
                />
              </div>
            ) : null}

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
