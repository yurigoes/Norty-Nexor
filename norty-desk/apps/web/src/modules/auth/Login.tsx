import { useState, type FormEvent } from 'react';

import { ErroDaApi } from '../../api/cliente';
import { useMarca } from '../../api/marca';
import { useAutenticacao } from '../../auth/Autenticacao';
import { Marca } from '../../components/Marca';

const PONTOS = [
  {
    icone: '⌁',
    titulo: 'Um chamado, todos os canais',
    texto: 'Portal, e-mail e WhatsApp entram na mesma fila — e a resposta sai por onde a pessoa falou.',
  },
  {
    icone: '◷',
    titulo: 'Prazo que conta expediente',
    texto: 'SLA sobre calendário, com feriado e pausa. Sexta às 17h não consome o fim de semana.',
  },
  {
    icone: '☰',
    titulo: 'A conversa inteira num lugar',
    texto: 'Mensagem, tarefa, anexo e mudança de status na mesma linha do tempo.',
  },
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
    <div className="entrada">
      <aside className="entrada-marca">
        <div className="entrada-geo" aria-hidden="true" />

        <div className="entrada-topo">
          <div className="entrada-logo">
            <Marca logoUrl={marca.logoUrl} nome={marca.productName} tamanho={40} />
            {!marca.logoUrl ? (
              <span className="entrada-logo-texto">{marca.productName}</span>
            ) : null}
          </div>
        </div>

        <div className="entrada-corpo">
          <h2 className="entrada-titulo">
            {marca.tagline ?? 'A central de serviços da Norty.'}
          </h2>
          <p className="entrada-sub">
            Abrir, acompanhar e resolver — com o prazo à vista e a conversa inteira registrada.
          </p>

          <div className="entrada-pontos">
            {PONTOS.map((ponto) => (
              <div key={ponto.titulo} className="entrada-ponto">
                <span className="entrada-ponto-marca" aria-hidden="true">
                  <span>{ponto.icone}</span>
                </span>
                <span>
                  <b>{ponto.titulo}</b>
                  {ponto.texto}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="entrada-rodape">
          {marca.productName} · Norty
        </div>
      </aside>

      <main className="entrada-form">
        <form className="entrada-cartao" onSubmit={enviar}>
          <div className="entrada-logo-mobile">
            <Marca logoUrl={marca.logoUrl} nome={marca.productName} tamanho={44} tom="escuro" />
          </div>

          <h1>Entrar</h1>
          <p>Use o e-mail da sua conta {marca.productName}.</p>

          {erro ? (
            <div className="alerta-bloco -erro" style={{ marginTop: 'var(--e-5)' }}>
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="entrada-campos">
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

          <p className="entrada-ajuda">
            Esqueceu a senha ou não tem acesso? Fale com quem administra o{' '}
            {marca.productName} na sua organização.
          </p>
        </form>
      </main>
    </div>
  );
}
